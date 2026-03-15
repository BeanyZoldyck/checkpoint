#!/bin/bash

# Checkpoint Deployment Script
set -e

echo "♟️ Deploying Checkpoint..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
	echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
	echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
	echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
	echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
print_step "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &>/dev/null; then
	print_error "AWS CLI not found. Please install and configure AWS CLI."
	exit 1
fi

# Check CDK
if ! command -v cdk &>/dev/null; then
	print_error "AWS CDK not found. Please install: npm install -g aws-cdk"
	exit 1
fi

# Check Python
if ! command -v python3 &>/dev/null; then
	print_error "Python 3 not found. Please install Python 3.9 or later."
	exit 1
fi

# Check Node.js
if ! command -v node &>/dev/null; then
	print_error "Node.js not found. Please install Node.js 16 or later."
	exit 1
fi

print_success "Prerequisites check passed"

# Set up virtual environment for CDK
print_step "Setting up Python virtual environment..."
cd infrastructure

if [ ! -d "venv" ]; then
	python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

print_success "Virtual environment ready"

# Install Lambda dependencies
print_step "Installing Lambda dependencies..."
cd ../lambda
pip install -r requirements.txt -t .

# Remove unnecessary files to reduce package size
find . -name "__pycache__" -type d -exec rm -rf {} +
find . -name "*.pyc" -delete
find . -name "*.pyo" -delete

cd ../infrastructure
source venv/bin/activate

print_success "Lambda dependencies installed"

# Bootstrap CDK (if needed)
print_step "Checking CDK bootstrap..."
if ! aws sts get-caller-identity &>/dev/null; then
	print_error "AWS credentials not configured. Run: aws configure"
	exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

if [ -z "$REGION" ]; then
	REGION="us-east-1"
	print_warning "No default region set, using us-east-1"
fi

print_step "Bootstrapping CDK in $ACCOUNT/$REGION..."
cdk bootstrap aws://$ACCOUNT/$REGION

print_success "CDK bootstrapped"

# Deploy infrastructure
print_step "Deploying Checkpoint infrastructure..."
cdk deploy --require-approval never

if [ $? -ne 0 ]; then
	print_error "CDK deployment failed"
	exit 1
fi

print_success "Infrastructure deployed successfully"

# Get outputs
print_step "Getting deployment outputs..."
STACK_NAME="CheckpointStack"

GRAPHQL_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`GraphQLAPIURL`].OutputValue' --output text)
API_KEY=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`GraphQLAPIKey`].OutputValue' --output text)
WEB_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`WebHostingBucket`].OutputValue' --output text)
WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text)

# Update web client configurations
print_step "Updating web client configurations..."

# Update digital player config
cat >../web-clients/digital-player/config.js <<EOF
// Configuration for Checkpoint Digital Player
window.CheckpointConfig = {
    graphqlEndpoint: '$GRAPHQL_URL',
    graphqlApiKey: '$API_KEY',
    region: '$REGION',
    reconnectAttempts: 5,
    reconnectDelay: 2000,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    debug: false
};

window.CheckpointConfig.isConfigured = function() {
    return this.graphqlEndpoint !== 'YOUR_APPSYNC_GRAPHQL_ENDPOINT' &&
           this.graphqlApiKey !== 'YOUR_APPSYNC_API_KEY';
};
EOF

# Copy config to physical player (it uses the same config)
cp ../web-clients/digital-player/config.js ../web-clients/physical-player/

# Update mobile app config
print_step "Updating mobile app configuration..."

cat >../../checkpoint/services/config.ts <<EOF
// ============================================================================
// Checkpoint AWS Configuration
//
// This file is updated automatically during deployment
// ============================================================================

export interface AppSyncConfig {
  aws_appsync_graphqlEndpoint: string;
  aws_appsync_region: string;
  aws_appsync_authenticationType: string;
  aws_appsync_apiKey: string;
}

// Configuration populated by deployment script
export const DEFAULT_CONFIG: AppSyncConfig = {
  aws_appsync_graphqlEndpoint: '$GRAPHQL_URL',
  aws_appsync_region: '$REGION',
  aws_appsync_authenticationType: 'API_KEY',
  aws_appsync_apiKey: '$API_KEY'
};

// Function to load config from environment or use defaults
export function getAppSyncConfig(): AppSyncConfig {
  // In production, these could come from environment variables or secure storage
  return DEFAULT_CONFIG;
}
EOF

print_success "Web client and mobile app configurations updated"

# Deploy web clients to S3
print_step "Deploying web clients to S3..."

# Digital player
aws s3 sync ../web-clients/digital-player/ s3://$WEB_BUCKET/digital/ --delete
aws s3 cp ../web-clients/digital-player/index.html s3://$WEB_BUCKET/ # Copy as main index

# Physical player
aws s3 sync ../web-clients/physical-player/ s3://$WEB_BUCKET/physical/ --delete

# Create a simple landing page
cat >../landing.html <<EOF
<!DOCTYPE html>
<html>
<head>
    <title>Checkpoint</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: #ecf0f1;
            color: #2c3e50;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 12px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        h1 { font-size: 3em; margin-bottom: 20px; }
        .buttons { margin: 30px 0; }
        .btn { 
            display: inline-block; 
            padding: 15px 25px; 
            margin: 10px; 
            background: #3498db; 
            color: white; 
            text-decoration: none; 
            border-radius: 8px; 
            font-weight: 600;
            transition: background 0.3s;
        }
        .btn:hover { background: #2980b9; }
        .btn.secondary { background: #27ae60; }
        .btn.secondary:hover { background: #229954; }
    </style>
</head>
<body>
    <div class="container">
        <h1>♟️ Checkpoint</h1>
        <p>Play chess remotely using a physical board and computer vision!</p>
        
        <div class="buttons">
            <a href="/digital/" class="btn">🖥️ Digital Player</a>
            <a href="/physical/" class="btn secondary">📱 Physical Board</a>
        </div>
        
        <p><small>Choose "Digital Player" to play on computer, or "Physical Board" to use your phone camera with a real chess set.</small></p>
    </div>
</body>
</html>
EOF

aws s3 cp ../landing.html s3://$WEB_BUCKET/index.html
rm ../landing.html

print_success "Web clients deployed to S3"

# Display deployment info
echo ""
echo "🎉 Checkpoint deployed successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 DEPLOYMENT INFORMATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Website URL:       $WEBSITE_URL"
echo "🖥️  Digital Player:    $WEBSITE_URL/digital/"
echo "📱 Physical Player:    $WEBSITE_URL/physical/"
echo ""
echo "🔗 GraphQL Endpoint:  $GRAPHQL_URL"
echo "🔑 API Key:           $API_KEY"
echo "📦 S3 Bucket:         $WEB_BUCKET"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 NEXT STEPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Web App:"
echo "1. 📱 Open $WEBSITE_URL/physical/ on your phone"
echo "2. 🎯 Create a game and get a join code"
echo "3. 🖥️  Open $WEBSITE_URL/digital/ on a computer"
echo "4. 🔗 Enter the join code to connect"
echo "5. ♟️  Start playing chess!"
echo ""
echo "Mobile App (React Native/Expo):"
echo "1. 📱 Run 'cd ../checkpoint && npm start' to start Expo"
echo "2. 📲 Install Expo Go app and scan QR code"
echo "3. 🔔 Grant camera and notification permissions"
echo "4. ♟️  App will auto-create game and connect to AppSync"
echo "5. 🎮 Use web app to play against mobile app"
echo ""

# Save deployment info
cat >../deployment-info.txt <<EOF
Checkpoint Deployment Information
Generated: $(date)

WEB APPLICATIONS:
Website URL: $WEBSITE_URL
Digital Player: $WEBSITE_URL/digital/
Physical Player: $WEBSITE_URL/physical/

MOBILE APPLICATION:
React Native/Expo app with push notifications
Location: ../checkpoint/
Configuration automatically updated in services/config.ts

AWS CONFIGURATION:
GraphQL Endpoint: $GRAPHQL_URL
API Key: $API_KEY
Region: $REGION
S3 Bucket: $WEB_BUCKET

FEATURES:
✅ Real-time chess gameplay via AppSync
✅ Computer vision for physical board moves  
✅ Push notifications for mobile app
✅ Progressive Web App support
✅ Cross-platform compatibility

To update the web clients:
1. Make changes to files in web-clients/
2. Run: aws s3 sync web-clients/digital-player/ s3://$WEB_BUCKET/digital/ --delete
3. Run: aws s3 sync web-clients/physical-player/ s3://$WEB_BUCKET/physical/ --delete

To run the mobile app:
1. cd ../checkpoint
2. npm start
3. Use Expo Go app to test

To destroy the stack:
cdk destroy
EOF

print_success "Deployment complete! Check deployment-info.txt for details."
echo ""
