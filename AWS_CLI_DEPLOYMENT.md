# AWS CLI Deployment Guide for Checkpoint Board Reset

This guide provides complete automation for deploying the Checkpoint board reset functionality using AWS CLI commands.

## 🚀 Quick Start

```bash
# 1. Configure AWS CLI (if not already done)
aws configure

# 2. Deploy all AWS infrastructure
./deploy-aws.sh

# 3. Test the deployment
./test-aws.sh

# 4. Test applications
cd web && npm run dev        # Terminal 1
cd checkpoint && npm start   # Terminal 2
```

## 📋 Prerequisites

### AWS Requirements
- **AWS CLI v2.0+** installed and configured
- **AWS Account** with appropriate permissions
- **jq** installed for JSON parsing (`sudo apt install jq` or `brew install jq`)

### AWS Permissions Required
Your AWS user/role needs the following permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:*",
                "appsync:*",
                "iam:CreateRole",
                "iam:DeleteRole",
                "iam:PutRolePolicy",
                "iam:DeleteRolePolicy",
                "sts:GetCallerIdentity"
            ],
            "Resource": "*"
        }
    ]
}
```

## 🛠️ Scripts Overview

### 1. `deploy-aws.sh` - Main Deployment Script

**What it does:**
- Creates DynamoDB tables (`CheckpointGames`, `CheckpointPlayers`)
- Creates AppSync GraphQL API with schema
- Sets up data sources and resolvers
- Creates API key for authentication
- Configures IAM service role
- Updates application configuration files

**Usage:**
```bash
./deploy-aws.sh

# With custom AWS profile
AWS_PROFILE=my-profile ./deploy-aws.sh

# With custom region
AWS_DEFAULT_REGION=us-west-2 ./deploy-aws.sh
```

### 2. `test-aws.sh` - Infrastructure Testing

**What it tests:**
- DynamoDB table status
- AppSync API accessibility
- GraphQL schema validation
- Data sources configuration
- Resolver setup
- API endpoint connectivity
- Application configuration

**Usage:**
```bash
./test-aws.sh
```

### 3. `cleanup-aws.sh` - Complete Teardown

**What it cleans up:**
- Deletes AppSync API (includes resolvers, data sources)
- Deletes DynamoDB tables and all data
- Removes IAM roles and policies
- Restores application configuration to defaults
- Cleans up local deployment files

**Usage:**
```bash
./cleanup-aws.sh
# Type 'yes' to confirm deletion
```

## 📁 File Structure

After deployment, the following structure is created:

```
checkpoint/
├── aws/
│   ├── output/
│   │   ├── deployment-summary.json    # Deployment details
│   │   ├── appsync-api.json          # API information
│   │   ├── api-key.json              # API key details
│   │   └── *-resolver.json           # Resolver configurations
│   ├── logs/
│   │   ├── dynamodb-*.log            # DynamoDB creation logs
│   │   └── schema-upload.log         # Schema upload logs
│   ├── resolvers/
│   │   ├── resetBoard-request.vtl    # Reset board mutation
│   │   ├── resetBoard-response.vtl
│   │   ├── getGame-request.vtl       # Get game query
│   │   ├── getGame-response.vtl
│   │   ├── createGame-request.vtl    # Create game mutation
│   │   └── createGame-response.vtl
│   └── dynamodb-tables.json          # Table definitions
├── deploy-aws.sh                     # Main deployment script
├── test-aws.sh                       # Testing script  
├── cleanup-aws.sh                    # Cleanup script
└── schema.graphql                    # GraphQL schema
```

## 🔧 Configuration

### Environment Variables

Set these before running scripts (optional):

```bash
export AWS_PROFILE=your-profile        # AWS CLI profile
export AWS_DEFAULT_REGION=us-east-1   # AWS region
```

### Customization

To customize the deployment, edit these files before running:

1. **`schema.graphql`** - Modify GraphQL schema
2. **`aws/resolvers/*.vtl`** - Update resolver logic
3. **Script variables** - Change table names, API names in deploy-aws.sh

## 📊 AWS Resources Created

### DynamoDB Tables

#### CheckpointGames
- **Purpose**: Store game state and board data
- **Key**: `gameId` (String)
- **Indexes**: 
  - `JoinCodeIndex` - Find games by join code
  - `StatusIndex` - List games by status
- **Billing**: Pay-per-request
- **Streams**: Enabled for real-time updates

#### CheckpointPlayers
- **Purpose**: Store player information and associations
- **Keys**: `playerId` (Hash), `gameId` (Range)
- **Indexes**: 
  - `GamePlayersIndex` - List players in a game
- **Billing**: Pay-per-request

### AppSync GraphQL API

#### Schema Features
- **Mutations**: `resetBoard`, `createGame`, `joinGame`, `uploadImage`
- **Queries**: `getGame`, `listActiveGames`
- **Subscriptions**: `onBoardReset`, `onGameUpdated`
- **Types**: Full type definitions for chess game data

#### Resolvers
- **resetBoard**: Updates game state in DynamoDB
- **getGame**: Retrieves game by ID
- **createGame**: Creates new game with join code

### IAM Resources

#### AppSyncServiceRole
- **Purpose**: Allow AppSync to access DynamoDB
- **Permissions**: Read/write access to game tables
- **Trust Policy**: AppSync service principal

## 🧪 Testing

### Automated Testing

Run the test script to validate deployment:
```bash
./test-aws.sh
```

**Test Coverage:**
- ✅ DynamoDB table status
- ✅ AppSync API accessibility  
- ✅ GraphQL schema validity
- ✅ Data source configuration
- ✅ Resolver setup
- ✅ API endpoint connectivity
- ✅ Application configuration

### Manual Testing

1. **Web Application:**
```bash
cd web
npm run dev
# Open http://localhost:3000
# Click "Reset Board" button
```

2. **Mobile Application:**
```bash
cd checkpoint  
npm start
# Scan QR code with Expo Go
# Watch for reset notifications
```

3. **Direct API Testing:**
```bash
# Get deployment info
API_URI=$(jq -r '.graphqlEndpoint' aws/output/deployment-summary.json)
API_KEY=$(jq -r '.apiKey' aws/output/deployment-summary.json)

# Test createGame mutation
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"query":"mutation { createGame(playerId: \"test-player\") { gameId joinCode } }"}' \
  "$API_URI"
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Permission Denied
```
Error: User: arn:aws:iam::123:user/name is not authorized to perform: dynamodb:CreateTable
```
**Solution:** Add required IAM permissions to your AWS user/role

#### 2. Region Mismatch
```
Error: The security token included in the request is invalid
```
**Solution:** Set consistent region in all configurations
```bash
export AWS_DEFAULT_REGION=us-east-1
aws configure set region us-east-1
```

#### 3. AppSync Service Role Creation Failed
```
Error: AccessDenied when calling CreateRole
```
**Solution:** Ensure IAM role creation permissions, or create role manually:
```bash
# Create role manually
aws iam create-role \
  --role-name AppSyncServiceRole \
  --assume-role-policy-document file://aws/appsync-trust-policy.json
```

#### 4. Table Already Exists
```
Error: Table already exists: CheckpointGames
```
**Solution:** Delete existing tables or use different names:
```bash
aws dynamodb delete-table --table-name CheckpointGames
```

### Debug Steps

1. **Check AWS CLI Configuration:**
```bash
aws configure list
aws sts get-caller-identity
```

2. **Verify Resource Creation:**
```bash
# List DynamoDB tables
aws dynamodb list-tables

# List AppSync APIs
aws appsync list-graphql-apis

# Check IAM roles
aws iam list-roles --query 'Roles[?RoleName==`AppSyncServiceRole`]'
```

3. **Check Application Logs:**
```bash
# Web app console (browser dev tools)
# Mobile app debug console
# AWS CloudWatch logs (AppSync)
```

## 💰 Cost Estimation

### DynamoDB
- **Pay-per-request**: $1.25 per million write requests, $0.25 per million read requests
- **Storage**: $0.25 per GB per month
- **Estimated monthly cost for development**: < $1

### AppSync
- **Query/mutation requests**: $4.00 per million requests
- **Real-time subscriptions**: $2.00 per million minutes
- **Estimated monthly cost for development**: < $5

### Total Estimated Monthly Cost: < $10

## 🔐 Security Best Practices

### API Key Rotation
```bash
# Create new API key
aws appsync create-api-key --api-id $API_ID --expires $(date -d '+30 days' +%s)

# Update applications with new key
./deploy-aws.sh  # Will update configurations
```

### Enhanced Authentication
For production, consider upgrading to Cognito User Pools:
1. Replace API_KEY authentication with USER_POOL
2. Add user registration/login flows
3. Implement fine-grained access controls

### Network Security
- Use VPC endpoints for DynamoDB access
- Enable AWS WAF for AppSync API
- Implement request rate limiting

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy Checkpoint AWS Infrastructure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Deploy Infrastructure
        run: ./deploy-aws.sh
      
      - name: Test Deployment
        run: ./test-aws.sh
```

## 📚 Additional Resources

- [AWS AppSync Developer Guide](https://docs.aws.amazon.com/appsync/latest/devguide/)
- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/latest/developerguide/)
- [AWS CLI Reference](https://docs.aws.amazon.com/cli/latest/reference/)
- [GraphQL Schema Language](https://graphql.org/learn/schema/)

## 🆘 Support

For issues with the deployment:

1. **Check deployment logs**: `aws/logs/`
2. **Run test script**: `./test-aws.sh`
3. **Verify AWS permissions**: Ensure all required IAM permissions
4. **Check AWS service limits**: Verify account limits for DynamoDB/AppSync
5. **Try cleanup and redeploy**: `./cleanup-aws.sh && ./deploy-aws.sh`