#!/bin/bash

# 🚀 Checkpoint Board Reset - Complete AWS Infrastructure Deployment
# This script creates all AWS resources using AWS CLI

set -e # Exit on any error

echo "🚀 Checkpoint AWS Infrastructure Deployment"
echo "==========================================="

# Configuration
PROJECT_NAME="checkpoint"
STACK_NAME="${PROJECT_NAME}-board-reset"
REGION=${AWS_DEFAULT_REGION:-us-east-1}
PROFILE=${AWS_PROFILE:-default}

echo "📋 Configuration:"
echo "   Project: $PROJECT_NAME"
echo "   Stack: $STACK_NAME"
echo "   Region: $REGION"
echo "   Profile: $PROFILE"
echo ""

# Check AWS CLI is installed and configured
if ! command -v aws &>/dev/null; then
	echo "❌ AWS CLI not found. Please install it first:"
	echo "   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
	exit 1
fi

# Test AWS credentials
echo "🔐 Testing AWS credentials..."
if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
	echo "❌ AWS credentials not configured properly for profile: $PROFILE"
	echo "   Run: aws configure --profile $PROFILE"
	exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
echo "✅ Connected to AWS Account: $ACCOUNT_ID"
echo ""

# Create directories
mkdir -p aws/output
mkdir -p aws/logs

# Step 1: Create DynamoDB Tables
echo "📊 Step 1: Creating DynamoDB Tables..."

echo "   Creating CheckpointGames table..."
aws dynamodb create-table \
	--profile "$PROFILE" \
	--region "$REGION" \
	--table-name CheckpointGames \
	--attribute-definitions \
	AttributeName=gameId,AttributeType=S \
	AttributeName=joinCode,AttributeType=S \
	AttributeName=status,AttributeType=S \
	--key-schema \
	AttributeName=gameId,KeyType=HASH \
	--billing-mode PAY_PER_REQUEST \
	--global-secondary-indexes \
	'IndexName=JoinCodeIndex,KeySchema=[{AttributeName=joinCode,KeyType=HASH}],Projection={ProjectionType=ALL}' \
	'IndexName=StatusIndex,KeySchema=[{AttributeName=status,KeyType=HASH}],Projection={ProjectionType=ALL}' \
	--stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
	--tags \
	Key=Application,Value=Checkpoint \
	Key=Purpose,Value=GameState \
	>aws/logs/dynamodb-games.log 2>&1 && echo "✅ CheckpointGames table created" || echo "⚠️  CheckpointGames table might already exist"

echo "   Creating CheckpointPlayers table..."
aws dynamodb create-table \
	--profile "$PROFILE" \
	--region "$REGION" \
	--table-name CheckpointPlayers \
	--attribute-definitions \
	AttributeName=playerId,AttributeType=S \
	AttributeName=gameId,AttributeType=S \
	--key-schema \
	AttributeName=playerId,KeyType=HASH \
	AttributeName=gameId,KeyType=RANGE \
	--billing-mode PAY_PER_REQUEST \
	--global-secondary-indexes \
	'IndexName=GamePlayersIndex,KeySchema=[{AttributeName=gameId,KeyType=HASH}],Projection={ProjectionType=ALL}' \
	--tags \
	Key=Application,Value=Checkpoint \
	Key=Purpose,Value=PlayerManagement \
	>aws/logs/dynamodb-players.log 2>&1 && echo "✅ CheckpointPlayers table created" || echo "⚠️  CheckpointPlayers table might already exist"

# Wait for tables to be active
echo "   Waiting for tables to become active..."
aws dynamodb wait table-exists --profile "$PROFILE" --region "$REGION" --table-name CheckpointGames
aws dynamodb wait table-exists --profile "$PROFILE" --region "$REGION" --table-name CheckpointPlayers
echo "✅ DynamoDB tables are ready"
echo ""

# Step 2: Create AppSync API
echo "🔄 Step 2: Creating AppSync GraphQL API..."

API_RESULT=$(aws appsync create-graphql-api \
	--profile "$PROFILE" \
	--region "$REGION" \
	--name "${PROJECT_NAME}-api" \
	--authentication-type API_KEY \
	--additional-authentication-providers authenticationType=AWS_IAM \
	--tags Application=Checkpoint,Purpose=GraphQLAPI \
	--output json)

API_ID=$(echo "$API_RESULT" | jq -r '.graphqlApi.apiId')
API_URI=$(echo "$API_RESULT" | jq -r '.graphqlApi.uris.GRAPHQL')

echo "✅ AppSync API created:"
echo "   API ID: $API_ID"
echo "   GraphQL URI: $API_URI"
echo ""

# Save API details
echo "$API_RESULT" >aws/output/appsync-api.json

# Step 3: Create API Key
echo "🔑 Step 3: Creating API Key..."

API_KEY_RESULT=$(aws appsync create-api-key \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--description "Checkpoint Board Reset API Key" \
	--expires $(date -d '+365 days' +%s) \
	--output json)

API_KEY=$(echo "$API_KEY_RESULT" | jq -r '.apiKey.id')

echo "✅ API Key created: $API_KEY"
echo "$API_KEY_RESULT" >aws/output/api-key.json
echo ""

# Step 4: Upload GraphQL Schema
echo "📝 Step 4: Uploading GraphQL Schema..."

aws appsync start-schema-creation \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--definition file://schema.graphql \
	>aws/logs/schema-upload.log 2>&1

# Wait for schema to be processed
echo "   Waiting for schema to be processed..."
sleep 10

SCHEMA_STATUS=$(aws appsync get-schema-creation-status \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--query 'status' \
	--output text)

while [ "$SCHEMA_STATUS" = "PROCESSING" ]; do
	echo "   Schema still processing..."
	sleep 5
	SCHEMA_STATUS=$(aws appsync get-schema-creation-status \
		--profile "$PROFILE" \
		--region "$REGION" \
		--api-id "$API_ID" \
		--query 'status' \
		--output text)
done

if [ "$SCHEMA_STATUS" = "SUCCESS" ]; then
	echo "✅ GraphQL schema uploaded successfully"
else
	echo "❌ Schema upload failed with status: $SCHEMA_STATUS"
	aws appsync get-schema-creation-status \
		--profile "$PROFILE" \
		--region "$REGION" \
		--api-id "$API_ID"
	exit 1
fi
echo ""

# Step 5: Create Data Sources
echo "🔗 Step 5: Creating Data Sources..."

echo "   Creating Games table data source..."
GAMES_DATASOURCE_RESULT=$(aws appsync create-data-source \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--name "GamesTable" \
	--type "AMAZON_DYNAMODB" \
	--dynamodb-config "tableName=CheckpointGames,awsRegion=$REGION" \
	--service-role-arn "arn:aws:iam::$ACCOUNT_ID:role/service-role/AppSyncServiceRole" \
	--output json) || {

	echo "   Creating AppSync service role..."

	# Create AppSync service role
	cat >aws/appsync-trust-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "appsync.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

	cat >aws/appsync-role-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan"
            ],
            "Resource": [
                "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/CheckpointGames",
                "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/CheckpointGames/*",
                "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/CheckpointPlayers",
                "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/CheckpointPlayers/*"
            ]
        }
    ]
}
EOF

	aws iam create-role \
		--profile "$PROFILE" \
		--role-name AppSyncServiceRole \
		--assume-role-policy-document file://aws/appsync-trust-policy.json \
		>/dev/null 2>&1 || echo "   AppSync role might already exist"

	aws iam put-role-policy \
		--profile "$PROFILE" \
		--role-name AppSyncServiceRole \
		--policy-name AppSyncDynamoDBAccess \
		--policy-document file://aws/appsync-role-policy.json \
		>/dev/null 2>&1

	echo "   Waiting for role to be available..."
	sleep 10

	# Retry creating data source
	GAMES_DATASOURCE_RESULT=$(aws appsync create-data-source \
		--profile "$PROFILE" \
		--region "$REGION" \
		--api-id "$API_ID" \
		--name "GamesTable" \
		--type "AMAZON_DYNAMODB" \
		--dynamodb-config "tableName=CheckpointGames,awsRegion=$REGION" \
		--service-role-arn "arn:aws:iam::$ACCOUNT_ID:role/AppSyncServiceRole" \
		--output json)
}

echo "✅ Games table data source created"
echo "$GAMES_DATASOURCE_RESULT" >aws/output/games-datasource.json

echo "   Creating Players table data source..."
PLAYERS_DATASOURCE_RESULT=$(aws appsync create-data-source \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--name "PlayersTable" \
	--type "AMAZON_DYNAMODB" \
	--dynamodb-config "tableName=CheckpointPlayers,awsRegion=$REGION" \
	--service-role-arn "arn:aws:iam::$ACCOUNT_ID:role/AppSyncServiceRole" \
	--output json)

echo "✅ Players table data source created"
echo "$PLAYERS_DATASOURCE_RESULT" >aws/output/players-datasource.json
echo ""

# Step 6: Create Resolvers
echo "⚙️  Step 6: Creating GraphQL Resolvers..."

echo "   Creating resetBoard mutation resolver..."
aws appsync create-resolver \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--type-name "Mutation" \
	--field-name "resetBoard" \
	--data-source-name "GamesTable" \
	--request-mapping-template file://aws/resolvers/resetBoard-request.vtl \
	--response-mapping-template file://aws/resolvers/resetBoard-response.vtl \
	>aws/output/resetBoard-resolver.json

echo "   Creating getGame query resolver..."
aws appsync create-resolver \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--type-name "Query" \
	--field-name "getGame" \
	--data-source-name "GamesTable" \
	--request-mapping-template file://aws/resolvers/getGame-request.vtl \
	--response-mapping-template file://aws/resolvers/getGame-response.vtl \
	>aws/output/getGame-resolver.json

echo "   Creating createGame mutation resolver..."
aws appsync create-resolver \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--type-name "Mutation" \
	--field-name "createGame" \
	--data-source-name "GamesTable" \
	--request-mapping-template file://aws/resolvers/createGame-request.vtl \
	--response-mapping-template file://aws/resolvers/createGame-response.vtl \
	>aws/output/createGame-resolver.json

echo "✅ GraphQL resolvers created"
echo ""

# Step 7: Update Application Configuration
echo "🔧 Step 7: Updating Application Configuration..."

# Update web app configuration
if [ -f "web/lib/config.ts" ]; then
	sed -i.bak "s|https://your-appsync-endpoint.appsync-api.region.amazonaws.com/graphql|$API_URI|g" web/lib/config.ts
	sed -i.bak "s|us-east-1|$REGION|g" web/lib/config.ts
	sed -i.bak "s|your-api-key-here|$API_KEY|g" web/lib/config.ts
	echo "✅ Web app configuration updated"
fi

# Update mobile app configuration
if [ -f "checkpoint/services/config.ts" ]; then
	sed -i.bak "s|https://your-appsync-endpoint.appsync-api.region.amazonaws.com/graphql|$API_URI|g" checkpoint/services/config.ts
	sed -i.bak "s|us-east-1|$REGION|g" checkpoint/services/config.ts
	sed -i.bak "s|your-api-key-here|$API_KEY|g" checkpoint/services/config.ts
	echo "✅ Mobile app configuration updated"
fi

# Create deployment summary
cat >aws/output/deployment-summary.json <<EOF
{
    "deploymentTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "region": "$REGION",
    "accountId": "$ACCOUNT_ID",
    "apiId": "$API_ID",
    "graphqlEndpoint": "$API_URI",
    "apiKey": "$API_KEY",
    "tables": {
        "games": "CheckpointGames",
        "players": "CheckpointPlayers"
    },
    "status": "completed"
}
EOF

echo ""
echo "🎉 Deployment Complete!"
echo "======================"
echo ""
echo "📋 Infrastructure Summary:"
echo "   AWS Region: $REGION"
echo "   AppSync API ID: $API_ID"
echo "   GraphQL Endpoint: $API_URI"
echo "   API Key: $API_KEY"
echo "   DynamoDB Tables: CheckpointGames, CheckpointPlayers"
echo ""
echo "📱 Application Configuration:"
echo "   ✅ Web app: web/lib/config.ts updated"
echo "   ✅ Mobile app: checkpoint/services/config.ts updated"
echo ""
echo "🚀 Next Steps:"
echo "   1. Test web app: cd web && npm run dev"
echo "   2. Test mobile app: cd checkpoint && npm start"
echo "   3. Click 'Reset Board' in web app to test functionality"
echo ""
echo "📁 Output files saved in: aws/output/"
echo "📝 Logs saved in: aws/logs/"
echo ""
echo "🧹 To clean up resources later, run: ./cleanup-aws.sh"
echo ""
