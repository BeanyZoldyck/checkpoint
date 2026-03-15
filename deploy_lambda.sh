#!/usr/bin/env bash
#
# Deploy the ChessLink Lambda function to AWS.
#
# Usage:
#   ./deploy_lambda.sh              # Deploy/update the Lambda function
#   ./deploy_lambda.sh --with-api   # Also create an API Gateway endpoint
#   ./deploy_lambda.sh --with-s3    # Also add S3 trigger for auto-processing
#   ./deploy_lambda.sh --teardown   # Remove everything
#
# Prerequisites:
#   - AWS CLI configured with appropriate permissions
#   - jq installed (sudo apt install jq)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
FUNCTION_NAME="chesslink-detect-position"
ROLE_NAME="chesslink-lambda-role"
REGION="us-east-2"
S3_BUCKET="checkpoint-rh"
RUNTIME="python3.12"
TIMEOUT=60
MEMORY=256
API_NAME="chesslink-api"

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
WITH_API=false
WITH_S3=false
TEARDOWN=false

for arg in "$@"; do
    case $arg in
        --with-api) WITH_API=true ;;
        --with-s3)  WITH_S3=true ;;
        --teardown) TEARDOWN=true ;;
    esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo -e "\033[1;34m==>\033[0m $1"; }
err() { echo -e "\033[1;31mERR:\033[0m $1" >&2; }

get_account_id() {
    aws sts get-caller-identity --query Account --output text
}

# ---------------------------------------------------------------------------
# Teardown
# ---------------------------------------------------------------------------
if $TEARDOWN; then
    log "Tearing down ChessLink Lambda resources..."
    ACCOUNT_ID=$(get_account_id)

    # Delete API Gateway
    API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId" --output text 2>/dev/null || true)
    if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
        log "Deleting API Gateway: $API_ID"
        aws apigatewayv2 delete-api --api-id "$API_ID"
    fi

    # Remove S3 notification
    log "Clearing S3 bucket notification..."
    aws s3api put-bucket-notification-configuration --bucket "$S3_BUCKET" \
        --notification-configuration '{}' 2>/dev/null || true

    # Delete Lambda
    log "Deleting Lambda function..."
    aws lambda delete-function --function-name "$FUNCTION_NAME" 2>/dev/null || true

    # Delete IAM role (must detach policies first)
    log "Cleaning up IAM role..."
    for policy_arn in $(aws iam list-attached-role-policies --role-name "$ROLE_NAME" --query "AttachedPolicies[].PolicyArn" --output text 2>/dev/null || true); do
        aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "$policy_arn"
    done
    for policy_name in $(aws iam list-role-policies --role-name "$ROLE_NAME" --query "PolicyNames[]" --output text 2>/dev/null || true); do
        aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$policy_name"
    done
    aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || true

    log "Teardown complete."
    exit 0
fi

# ---------------------------------------------------------------------------
# Step 1: Create IAM Role
# ---------------------------------------------------------------------------
ACCOUNT_ID=$(get_account_id)
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
    log "IAM role '$ROLE_NAME' already exists."
    ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query "Role.Arn" --output text)
else
    log "Creating IAM role: $ROLE_NAME"
    TRUST_POLICY='{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }'
    ROLE_ARN=$(aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --query "Role.Arn" --output text)

    # Attach basic Lambda execution
    aws iam attach-role-policy --role-name "$ROLE_NAME" \
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

    # Inline policy for S3 read + Bedrock invoke
    INLINE_POLICY='{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["s3:GetObject", "s3:ListBucket"],
                "Resource": [
                    "arn:aws:s3:::'"$S3_BUCKET"'",
                    "arn:aws:s3:::'"$S3_BUCKET"'/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": ["bedrock:InvokeModel"],
                "Resource": "*"
            }
        ]
    }'
    aws iam put-role-policy --role-name "$ROLE_NAME" \
        --policy-name "chesslink-s3-bedrock" \
        --policy-document "$INLINE_POLICY"

    log "Waiting for IAM role to propagate..."
    sleep 10
fi

log "Role ARN: $ROLE_ARN"

# ---------------------------------------------------------------------------
# Step 2: Package Lambda
# ---------------------------------------------------------------------------
log "Packaging Lambda function..."
PACKAGE_DIR=$(mktemp -d)
cp lambda/handler.py "$PACKAGE_DIR/"
(cd "$PACKAGE_DIR" && zip -q function.zip handler.py)
ZIP_PATH="$PACKAGE_DIR/function.zip"

# ---------------------------------------------------------------------------
# Step 3: Create or Update Lambda function
# ---------------------------------------------------------------------------
if aws lambda get-function --function-name "$FUNCTION_NAME" &>/dev/null; then
    log "Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://$ZIP_PATH" \
        --query "FunctionArn" --output text

    # Wait for update to complete before modifying config
    aws lambda wait function-updated --function-name "$FUNCTION_NAME"

    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --timeout "$TIMEOUT" \
        --memory-size "$MEMORY" \
        --environment "Variables={BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID:-us.anthropic.claude-sonnet-4-20250514-v1:0},BEDROCK_REGION=$REGION}" \
        --query "FunctionArn" --output text
else
    log "Creating Lambda function: $FUNCTION_NAME"
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime "$RUNTIME" \
        --role "$ROLE_ARN" \
        --handler "handler.lambda_handler" \
        --zip-file "fileb://$ZIP_PATH" \
        --timeout "$TIMEOUT" \
        --memory-size "$MEMORY" \
        --environment "Variables={BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID:-us.anthropic.claude-sonnet-4-20250514-v1:0},BEDROCK_REGION=$REGION}" \
        --query "FunctionArn" --output text
fi

aws lambda wait function-active --function-name "$FUNCTION_NAME"
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --query "Configuration.FunctionArn" --output text)
log "Lambda ARN: $FUNCTION_ARN"

# ---------------------------------------------------------------------------
# Step 4 (optional): API Gateway
# ---------------------------------------------------------------------------
if $WITH_API; then
    log "Setting up API Gateway..."

    API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId" --output text 2>/dev/null || true)

    if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
        API_ID=$(aws apigatewayv2 create-api \
            --name "$API_NAME" \
            --protocol-type HTTP \
            --target "$FUNCTION_ARN" \
            --query "ApiId" --output text)

        # Grant API Gateway permission to invoke Lambda
        aws lambda add-permission \
            --function-name "$FUNCTION_NAME" \
            --statement-id "apigateway-invoke" \
            --action "lambda:InvokeFunction" \
            --principal "apigateway.amazonaws.com" \
            --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
            2>/dev/null || true

        log "API Gateway created: $API_ID"
    else
        log "API Gateway already exists: $API_ID"
    fi

    API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"
    log "API endpoint: $API_URL"
    echo ""
    echo "Test with:"
    echo "  curl \"${API_URL}?bucket=${S3_BUCKET}&key=YOUR_IMAGE.jpg\""
fi

# ---------------------------------------------------------------------------
# Step 5 (optional): S3 Trigger
# ---------------------------------------------------------------------------
if $WITH_S3; then
    log "Setting up S3 trigger..."

    # Grant S3 permission to invoke Lambda
    aws lambda add-permission \
        --function-name "$FUNCTION_NAME" \
        --statement-id "s3-invoke" \
        --action "lambda:InvokeFunction" \
        --principal "s3.amazonaws.com" \
        --source-arn "arn:aws:s3:::${S3_BUCKET}" \
        --source-account "$ACCOUNT_ID" \
        2>/dev/null || true

    # Configure S3 bucket notification
    NOTIFICATION='{
        "LambdaFunctionConfigurations": [{
            "LambdaFunctionArn": "'"$FUNCTION_ARN"'",
            "Events": ["s3:ObjectCreated:*"],
            "Filter": {
                "Key": {
                    "FilterRules": [
                        {"Name": "prefix", "Value": "boards/"},
                        {"Name": "suffix", "Value": ".jpg"}
                    ]
                }
            }
        }]
    }'
    aws s3api put-bucket-notification-configuration \
        --bucket "$S3_BUCKET" \
        --notification-configuration "$NOTIFICATION"

    log "S3 trigger configured: uploads to s3://${S3_BUCKET}/boards/*.jpg will auto-process"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
rm -rf "$PACKAGE_DIR"

echo ""
log "Deployment complete!"
echo ""
echo "Test the Lambda directly:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME \\"
echo "    --payload '{\"bucket\": \"$S3_BUCKET\", \"key\": \"YOUR_IMAGE.jpg\"}' \\"
echo "    --cli-binary-format raw-in-base64-out \\"
echo "    /dev/stdout"
echo ""
echo "Upload a test image:"
echo "  aws s3 cp board.jpg s3://$S3_BUCKET/board.jpg"
echo "  python detect_position.py --bucket $S3_BUCKET --key board.jpg"
