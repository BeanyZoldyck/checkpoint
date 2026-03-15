#!/bin/bash

# 🧪 Checkpoint Board Reset - AWS Infrastructure Testing
# This script tests the deployed AWS infrastructure

set -e

echo "🧪 Checkpoint AWS Infrastructure Testing"
echo "======================================="

REGION=${AWS_DEFAULT_REGION:-us-east-1}
PROFILE=${AWS_PROFILE:-default}

# Check if deployment summary exists
if [ ! -f "aws/output/deployment-summary.json" ]; then
	echo "❌ No deployment found. Run ./deploy-aws.sh first."
	exit 1
fi

# Read deployment details
API_ID=$(jq -r '.apiId' aws/output/deployment-summary.json)
API_URI=$(jq -r '.graphqlEndpoint' aws/output/deployment-summary.json)
API_KEY=$(jq -r '.apiKey' aws/output/deployment-summary.json)

echo "📋 Testing deployment:"
echo "   API ID: $API_ID"
echo "   GraphQL URI: $API_URI"
echo "   API Key: ${API_KEY:0:10}..."
echo ""

# Test 1: Check DynamoDB tables
echo "📊 Test 1: Checking DynamoDB Tables..."

echo "   Checking CheckpointGames table..."
GAMES_STATUS=$(aws dynamodb describe-table \
	--profile "$PROFILE" \
	--region "$REGION" \
	--table-name CheckpointGames \
	--query 'Table.TableStatus' \
	--output text 2>/dev/null || echo "NOT_FOUND")

if [ "$GAMES_STATUS" = "ACTIVE" ]; then
	echo "✅ CheckpointGames table is active"
else
	echo "❌ CheckpointGames table status: $GAMES_STATUS"
fi

echo "   Checking CheckpointPlayers table..."
PLAYERS_STATUS=$(aws dynamodb describe-table \
	--profile "$PROFILE" \
	--region "$REGION" \
	--table-name CheckpointPlayers \
	--query 'Table.TableStatus' \
	--output text 2>/dev/null || echo "NOT_FOUND")

if [ "$PLAYERS_STATUS" = "ACTIVE" ]; then
	echo "✅ CheckpointPlayers table is active"
else
	echo "❌ CheckpointPlayers table status: $PLAYERS_STATUS"
fi

# Test 2: Check AppSync API
echo "🔄 Test 2: Checking AppSync API..."

API_STATUS=$(aws appsync get-graphql-api \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--query 'graphqlApi.name' \
	--output text 2>/dev/null || echo "NOT_FOUND")

if [ "$API_STATUS" = "checkpoint-api" ]; then
	echo "✅ AppSync API is accessible"
else
	echo "❌ AppSync API status: $API_STATUS"
fi

# Test 3: Test GraphQL Schema
echo "📝 Test 3: Testing GraphQL Schema..."

SCHEMA_STATUS=$(aws appsync get-schema-creation-status \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--query 'status' \
	--output text 2>/dev/null || echo "UNKNOWN")

if [ "$SCHEMA_STATUS" = "SUCCESS" ]; then
	echo "✅ GraphQL schema is valid"
else
	echo "❌ GraphQL schema status: $SCHEMA_STATUS"
fi

# Test 4: Test Data Sources
echo "🔗 Test 4: Testing Data Sources..."

DATASOURCES=$(aws appsync list-data-sources \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--query 'dataSources[].name' \
	--output text 2>/dev/null || echo "")

if echo "$DATASOURCES" | grep -q "GamesTable" && echo "$DATASOURCES" | grep -q "PlayersTable"; then
	echo "✅ Data sources are configured correctly"
	echo "   Found: $DATASOURCES"
else
	echo "❌ Data sources missing or misconfigured"
	echo "   Found: $DATASOURCES"
fi

# Test 5: Test Resolvers
echo "⚙️  Test 5: Testing Resolvers..."

RESOLVERS=$(aws appsync list-resolvers \
	--profile "$PROFILE" \
	--region "$REGION" \
	--api-id "$API_ID" \
	--type-name "Mutation" \
	--query 'resolvers[].fieldName' \
	--output text 2>/dev/null || echo "")

if echo "$RESOLVERS" | grep -q "resetBoard" && echo "$RESOLVERS" | grep -q "createGame"; then
	echo "✅ Mutation resolvers are configured"
	echo "   Found: $RESOLVERS"
else
	echo "❌ Mutation resolvers missing or misconfigured"
	echo "   Found: $RESOLVERS"
fi

# Test 6: Test GraphQL API with sample query (if curl is available)
if command -v curl &>/dev/null; then
	echo "🌐 Test 6: Testing GraphQL API endpoint..."

	# Test introspection query
	INTROSPECTION_QUERY='{"query":"query IntrospectionQuery { __schema { types { name } } }"}'

	HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
		-X POST \
		-H "Content-Type: application/json" \
		-H "x-api-key: $API_KEY" \
		-d "$INTROSPECTION_QUERY" \
		"$API_URI" 2>/dev/null || echo "000")

	if [ "$HTTP_STATUS" = "200" ]; then
		echo "✅ GraphQL API endpoint is accessible"
	else
		echo "❌ GraphQL API endpoint test failed (HTTP $HTTP_STATUS)"
	fi
else
	echo "⚠️  Test 6: Skipped (curl not available)"
fi

# Test 7: Validate application configuration
echo "🔧 Test 7: Validating Application Configuration..."

WEB_CONFIG_VALID=false
MOBILE_CONFIG_VALID=false

if [ -f "web/lib/config.ts" ] && grep -q "$API_URI" web/lib/config.ts; then
	echo "✅ Web application configuration is valid"
	WEB_CONFIG_VALID=true
else
	echo "❌ Web application configuration is invalid"
fi

if [ -f "checkpoint/services/config.ts" ] && grep -q "$API_URI" checkpoint/services/config.ts; then
	echo "✅ Mobile application configuration is valid"
	MOBILE_CONFIG_VALID=true
else
	echo "❌ Mobile application configuration is invalid"
fi

# Summary
echo ""
echo "📋 Test Summary"
echo "==============="
echo ""

if [ "$GAMES_STATUS" = "ACTIVE" ] && [ "$PLAYERS_STATUS" = "ACTIVE" ] &&
	[ "$API_STATUS" = "checkpoint-api" ] && [ "$SCHEMA_STATUS" = "SUCCESS" ] &&
	echo "$DATASOURCES" | grep -q "GamesTable" && echo "$RESOLVERS" | grep -q "resetBoard" &&
	[ "$WEB_CONFIG_VALID" = true ] && [ "$MOBILE_CONFIG_VALID" = true ]; then

	echo "🎉 All tests passed! Infrastructure is ready."
	echo ""
	echo "🚀 Ready to test applications:"
	echo "   Web: cd web && npm run dev"
	echo "   Mobile: cd checkpoint && npm start"
	echo ""
	echo "💡 Test the reset functionality:"
	echo "   1. Open both applications"
	echo "   2. Click 'Reset Board' in web app"
	echo "   3. Check mobile app for reset notification"
	echo ""
else
	echo "❌ Some tests failed. Check the output above for details."
	echo ""
	echo "🔧 Common fixes:"
	echo "   - Wait a few minutes for resources to fully initialize"
	echo "   - Check AWS credentials and permissions"
	echo "   - Verify region settings match your AWS configuration"
	echo "   - Re-run deployment: ./deploy-aws.sh"
	echo ""
fi

echo "📁 For detailed information, check: aws/output/deployment-summary.json"
echo ""
