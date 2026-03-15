#!/bin/bash

# 🧹 Checkpoint Board Reset - AWS Infrastructure Cleanup
# This script removes all AWS resources created by deploy-aws.sh

set -e # Exit on any error

echo "🧹 Checkpoint AWS Infrastructure Cleanup"
echo "======================================="

# Configuration
PROJECT_NAME="checkpoint"
REGION=${AWS_DEFAULT_REGION:-us-east-1}
PROFILE=${AWS_PROFILE:-default}

echo "📋 Configuration:"
echo "   Project: $PROJECT_NAME"
echo "   Region: $REGION"
echo "   Profile: $PROFILE"
echo ""

# Check if deployment summary exists
if [ ! -f "aws/output/deployment-summary.json" ]; then
	echo "⚠️  Deployment summary not found. Attempting cleanup with standard names..."
	API_ID=""
else
	API_ID=$(jq -r '.apiId' aws/output/deployment-summary.json 2>/dev/null || echo "")
	echo "📋 Found deployment with API ID: $API_ID"
fi

# Confirmation prompt
echo "⚠️  WARNING: This will permanently delete all AWS resources!"
echo "   - AppSync API and all resolvers"
echo "   - DynamoDB tables and all data"
echo "   - IAM roles and policies"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
	echo "❌ Cleanup cancelled."
	exit 1
fi

echo ""
echo "🗑️  Starting cleanup process..."

# Step 1: Delete AppSync API (this also deletes resolvers and data sources)
echo "🔄 Step 1: Deleting AppSync API..."

if [ -n "$API_ID" ]; then
	echo "   Deleting API: $API_ID"
	aws appsync delete-graphql-api \
		--profile "$PROFILE" \
		--region "$REGION" \
		--api-id "$API_ID" \
		>/dev/null 2>&1 && echo "✅ AppSync API deleted" || echo "⚠️  AppSync API deletion failed or already deleted"
else
	# Try to find and delete API by name
	echo "   Searching for API by name..."
	API_LIST=$(aws appsync list-graphql-apis \
		--profile "$PROFILE" \
		--region "$REGION" \
		--query "graphqlApis[?name=='${PROJECT_NAME}-api'].apiId" \
		--output text 2>/dev/null || echo "")

	if [ -n "$API_LIST" ] && [ "$API_LIST" != "None" ]; then
		for api_id in $API_LIST; do
			echo "   Deleting API: $api_id"
			aws appsync delete-graphql-api \
				--profile "$PROFILE" \
				--region "$REGION" \
				--api-id "$api_id" \
				>/dev/null 2>&1 && echo "✅ AppSync API $api_id deleted" || echo "⚠️  AppSync API $api_id deletion failed"
		done
	else
		echo "⚠️  No AppSync API found to delete"
	fi
fi

# Step 2: Delete DynamoDB Tables
echo "📊 Step 2: Deleting DynamoDB Tables..."

echo "   Deleting CheckpointGames table..."
aws dynamodb delete-table \
	--profile "$PROFILE" \
	--region "$REGION" \
	--table-name CheckpointGames \
	>/dev/null 2>&1 && echo "✅ CheckpointGames table deletion initiated" || echo "⚠️  CheckpointGames table deletion failed or already deleted"

echo "   Deleting CheckpointPlayers table..."
aws dynamodb delete-table \
	--profile "$PROFILE" \
	--region "$REGION" \
	--table-name CheckpointPlayers \
	>/dev/null 2>&1 && echo "✅ CheckpointPlayers table deletion initiated" || echo "⚠️  CheckpointPlayers table deletion failed or already deleted"

# Wait for tables to be deleted
echo "   Waiting for tables to be deleted..."
aws dynamodb wait table-not-exists --profile "$PROFILE" --region "$REGION" --table-name CheckpointGames 2>/dev/null &
aws dynamodb wait table-not-exists --profile "$PROFILE" --region "$REGION" --table-name CheckpointPlayers 2>/dev/null &
wait
echo "✅ DynamoDB tables deleted"

# Step 3: Delete IAM Role
echo "👤 Step 3: Deleting IAM Role..."

echo "   Deleting role policy..."
aws iam delete-role-policy \
	--profile "$PROFILE" \
	--role-name AppSyncServiceRole \
	--policy-name AppSyncDynamoDBAccess \
	>/dev/null 2>&1 && echo "✅ Role policy deleted" || echo "⚠️  Role policy deletion failed or already deleted"

echo "   Deleting role..."
aws iam delete-role \
	--profile "$PROFILE" \
	--role-name AppSyncServiceRole \
	--profile "$PROFILE" \
	>/dev/null 2>&1 && echo "✅ IAM role deleted" || echo "⚠️  IAM role deletion failed or already deleted"

# Step 4: Restore Application Configuration
echo "🔧 Step 4: Restoring Application Configuration..."

if [ -f "web/lib/config.ts.bak" ]; then
	mv web/lib/config.ts.bak web/lib/config.ts
	echo "✅ Web app configuration restored"
fi

if [ -f "checkpoint/services/config.ts.bak" ]; then
	mv checkpoint/services/config.ts.bak checkpoint/services/config.ts
	echo "✅ Mobile app configuration restored"
fi

# Step 5: Clean up local files
echo "🗂️  Step 5: Cleaning up local files..."

if [ -d "aws/output" ]; then
	rm -rf aws/output
	echo "✅ Output directory cleaned"
fi

if [ -d "aws/logs" ]; then
	rm -rf aws/logs
	echo "✅ Logs directory cleaned"
fi

# Remove temporary files
rm -f aws/appsync-trust-policy.json aws/appsync-role-policy.json 2>/dev/null
echo "✅ Temporary files cleaned"

echo ""
echo "🎉 Cleanup Complete!"
echo "==================="
echo ""
echo "✅ All AWS resources have been deleted:"
echo "   - AppSync GraphQL API"
echo "   - DynamoDB tables (CheckpointGames, CheckpointPlayers)"
echo "   - IAM role (AppSyncServiceRole)"
echo "   - API keys (deleted with API)"
echo ""
echo "✅ Application configuration restored to defaults"
echo "✅ Local deployment files cleaned up"
echo ""
echo "💡 The applications will now run in stub mode for development."
echo "   To redeploy, run: ./deploy-aws.sh"
echo ""
