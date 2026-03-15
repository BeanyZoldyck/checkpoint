#!/bin/bash

# Deployment Script for Board Reset Functionality
# This script updates AWS AppSync configuration in both web and mobile apps

echo "🚀 Checkpoint Board Reset Deployment Script"
echo "=========================================="

# Check if required parameters are provided
if [ $# -lt 4 ]; then
	echo "❌ Usage: $0 <APPSYNC_ENDPOINT> <REGION> <API_KEY> <AUTH_TYPE>"
	echo ""
	echo "Example:"
	echo "  $0 https://abc123.appsync-api.us-east-1.amazonaws.com/graphql us-east-1 da2-abcd1234efgh5678ijkl API_KEY"
	echo ""
	exit 1
fi

APPSYNC_ENDPOINT=$1
REGION=$2
API_KEY=$3
AUTH_TYPE=${4:-API_KEY}

echo "📡 AppSync Endpoint: $APPSYNC_ENDPOINT"
echo "🌍 Region: $REGION"
echo "🔑 Auth Type: $AUTH_TYPE"
echo "🔐 API Key: ${API_KEY:0:10}... (truncated)"
echo ""

# Update Web Application Configuration
echo "🌐 Updating Web Application Configuration..."
WEB_CONFIG_FILE="web/lib/config.ts"

if [ -f "$WEB_CONFIG_FILE" ]; then
	# Create backup
	cp "$WEB_CONFIG_FILE" "$WEB_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"

	# Update configuration
	sed -i "s|https://your-appsync-endpoint.appsync-api.region.amazonaws.com/graphql|$APPSYNC_ENDPOINT|g" "$WEB_CONFIG_FILE"
	sed -i "s|us-east-1|$REGION|g" "$WEB_CONFIG_FILE"
	sed -i "s|your-api-key-here|$API_KEY|g" "$WEB_CONFIG_FILE"
	sed -i "s|API_KEY|$AUTH_TYPE|g" "$WEB_CONFIG_FILE"

	echo "✅ Web app configuration updated: $WEB_CONFIG_FILE"
else
	echo "❌ Web app configuration file not found: $WEB_CONFIG_FILE"
fi

# Update Mobile Application Configuration
echo "📱 Updating Mobile Application Configuration..."
MOBILE_CONFIG_FILE="checkpoint/services/config.ts"

if [ -f "$MOBILE_CONFIG_FILE" ]; then
	# Create backup
	cp "$MOBILE_CONFIG_FILE" "$MOBILE_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"

	# Update configuration
	sed -i "s|https://your-appsync-endpoint.appsync-api.region.amazonaws.com/graphql|$APPSYNC_ENDPOINT|g" "$MOBILE_CONFIG_FILE"
	sed -i "s|us-east-1|$REGION|g" "$MOBILE_CONFIG_FILE"
	sed -i "s|your-api-key-here|$API_KEY|g" "$MOBILE_CONFIG_FILE"
	sed -i "s|API_KEY|$AUTH_TYPE|g" "$MOBILE_CONFIG_FILE"

	echo "✅ Mobile app configuration updated: $MOBILE_CONFIG_FILE"
else
	echo "❌ Mobile app configuration file not found: $MOBILE_CONFIG_FILE"
fi

echo ""
echo "🎉 Configuration update complete!"
echo ""
echo "Next steps:"
echo "1. 🔧 Deploy your AWS AppSync API with the provided schema.graphql"
echo "2. 🗄️  Set up DynamoDB tables as described in RESET_BOARD_SETUP.md"
echo "3. ⚙️  Configure AppSync resolvers for the resetBoard mutation"
echo "4. 🧪 Test the applications:"
echo "   Web:    cd web && npm run dev"
echo "   Mobile: cd checkpoint && npm start"
echo ""
echo "📖 For detailed setup instructions, see RESET_BOARD_SETUP.md"
echo ""

# Validate configuration files
echo "🔍 Validating configuration files..."

if grep -q "$APPSYNC_ENDPOINT" "$WEB_CONFIG_FILE" 2>/dev/null; then
	echo "✅ Web app endpoint configured correctly"
else
	echo "⚠️  Warning: Could not verify web app endpoint configuration"
fi

if grep -q "$APPSYNC_ENDPOINT" "$MOBILE_CONFIG_FILE" 2>/dev/null; then
	echo "✅ Mobile app endpoint configured correctly"
else
	echo "⚠️  Warning: Could not verify mobile app endpoint configuration"
fi

echo ""
echo "🏁 Deployment script finished!"
