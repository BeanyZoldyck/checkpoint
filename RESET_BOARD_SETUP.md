# Board Reset Functionality Setup Guide

This guide explains how to set up and use the board reset functionality that connects both the web application and mobile application through AWS AppSync.

## Overview

The board reset functionality allows:
1. **Web Application**: Send a "Reset Board" command via AWS AppSync
2. **Mobile Application**: Receive the reset command in real-time and clear the board state
3. **DynamoDB**: Store board reset events and maintain game state
4. **Real-time Sync**: Both applications stay synchronized through AppSync subscriptions

## Architecture

```
Web App (Reset Button) 
    ↓ (GraphQL Mutation)
AWS AppSync 
    ↓ (DynamoDB Resolver)
DynamoDB Table
    ↓ (GraphQL Subscription)
Mobile App (Reset Handler)
```

## Files Modified/Created

### New Files
- `schema.graphql` - AWS AppSync GraphQL schema with reset functionality
- `web/lib/config.ts` - Web app AWS configuration
- `web/lib/api.ts` - Web app AppSync client and API functions
- `RESET_BOARD_SETUP.md` - This documentation file

### Modified Files
- `web/main.jac` - Added reset button and subscription handler
- `checkpoint/services/api.ts` - Added reset functions and subscription
- `checkpoint/app/(tabs)/index.tsx` - Added reset event listener and UI
- `web/package.json` - Added AWS Amplify dependencies

## Prerequisites

1. **AWS Account** with AppSync service enabled
2. **DynamoDB Table** for storing game data
3. **AWS AppSync GraphQL API** configured
4. **API Key** for authentication

## AWS Infrastructure Setup

### 1. Create DynamoDB Tables

Create the following DynamoDB tables in your AWS account:

#### GameTable
```
Partition Key: gameId (String)
Attributes:
- status (String) - "waiting", "active", "finished"
- currentTurn (String) - "WHITE", "BLACK"  
- state (String) - FEN notation
- lastMove (Map) - { from: String, to: String, san: String }
- winner (String) - "WHITE", "BLACK", or null
- joinCode (String) - Game join code
- createdAt (String) - ISO timestamp
- updatedAt (String) - ISO timestamp
- players (Map) - { white: String, black: String } (player IDs)
```

#### PlayersTable
```
Partition Key: playerId (String)
Sort Key: gameId (String)
Attributes:
- playerColor (String) - "WHITE", "BLACK"
- pushToken (String) - Optional push notification token
- joinedAt (String) - ISO timestamp
```

### 2. Create AppSync API

1. Go to AWS AppSync console
2. Create a new GraphQL API
3. Upload the provided `schema.graphql` file
4. Configure data sources for your DynamoDB tables
5. Create resolvers for mutations and subscriptions

### 3. Configure API Key Authentication

1. In AppSync console, go to Settings
2. Enable API Key authentication
3. Generate an API key
4. Note down the API key and GraphQL endpoint URL

### 4. Create Resolvers

You'll need to create VTL (Velocity Template Language) resolvers for:

#### resetBoard Mutation
**Request Mapping:**
```vtl
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "gameId": $util.dynamodb.toDynamoDBJson($ctx.args.input.gameId)
  },
  "update": {
    "expression": "SET #updatedAt = :updatedAt, #state = :state",
    "expressionNames": {
      "#updatedAt": "updatedAt",
      "#state": "state"
    },
    "expressionValues": {
      ":updatedAt": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601()),
      ":state": $util.dynamodb.toDynamoDBJson("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    }
  }
}
```

**Response Mapping:**
```vtl
{
  "success": true,
  "gameId": "$ctx.result.gameId",
  "message": "Board reset to starting position"
}
```

## Application Configuration

### Web Application

1. **Update Configuration** in `web/lib/config.ts`:
```typescript
export const DEFAULT_CONFIG: AppSyncConfig = {
  aws_appsync_graphqlEndpoint: 'https://YOUR-APPSYNC-ID.appsync-api.YOUR-REGION.amazonaws.com/graphql',
  aws_appsync_region: 'YOUR-REGION',
  aws_appsync_authenticationType: 'API_KEY',
  aws_appsync_apiKey: 'YOUR-API-KEY'
};
```

2. **Install Dependencies** (already done):
```bash
cd web
npm install aws-amplify @aws-amplify/api-graphql
```

### Mobile Application

1. **Update Configuration** in `checkpoint/services/config.ts`:
```typescript
export const DEFAULT_CONFIG: AppSyncConfig = {
  aws_appsync_graphqlEndpoint: 'https://YOUR-APPSYNC-ID.appsync-api.YOUR-REGION.amazonaws.com/graphql',
  aws_appsync_region: 'YOUR-REGION',
  aws_appsync_authenticationType: 'API_KEY',
  aws_appsync_apiKey: 'YOUR-API-KEY'
};
```

2. **Dependencies** (already included):
- `@aws-amplify/api-graphql`
- `aws-amplify`

## Usage

### Web Application

1. **Start the web app**:
```bash
cd web
npm run dev
```

2. **Use Reset Button**:
   - Open the web application in your browser
   - Click the "Reset Board" button in the top navigation
   - The button will show "Resetting..." while processing
   - A blue status banner will appear showing the reset status
   - The board will reset to the starting position

### Mobile Application

1. **Start the mobile app**:
```bash
cd checkpoint
npm start
```

2. **Monitor Reset Events**:
   - The mobile app automatically subscribes to reset events
   - When a reset is triggered from the web app, a blue banner will appear
   - The current move arrows and detected moves will be cleared
   - The app will show "🔄 Board was reset" message for 3 seconds

## Testing

### In Stub Mode (Default)

Both applications work in "stub mode" when no real AWS configuration is provided:

1. **Web App**: Reset button works but uses mock data
2. **Mobile App**: Shows reset notifications from mock events
3. **Console Logs**: Check browser/mobile console for "[STUB]" messages

### With Real AWS Setup

1. **Configure both apps** with real AWS credentials
2. **Test flow**:
   - Open both web and mobile apps
   - Click "Reset Board" in web app
   - Verify mobile app receives reset notification
   - Check DynamoDB table for updated game state

## Troubleshooting

### Common Issues

1. **"Not connected" Status**:
   - Check AWS credentials in config files
   - Verify AppSync API is deployed and accessible
   - Check API key permissions

2. **Reset Not Working**:
   - Check browser/mobile console for errors
   - Verify GraphQL schema matches the code
   - Test API endpoints directly using AWS AppSync console

3. **Subscription Issues**:
   - Ensure WebSocket connections are allowed
   - Check network connectivity
   - Verify subscription resolvers are configured

### Debug Steps

1. **Enable Debug Logs**:
   - Check browser Developer Tools console
   - Check React Native debug console
   - Look for network errors in Network tab

2. **Test API Directly**:
   - Use AWS AppSync console to test mutations
   - Verify DynamoDB table updates
   - Test subscriptions manually

3. **Check Configuration**:
   - Verify AWS region matches
   - Ensure API key is valid and not expired
   - Check GraphQL endpoint URL

## Next Steps

1. **Enhanced Reset Types**:
   - Implement `CLEAR_BOARD` and `UNDO_LAST_MOVE` options
   - Add confirmation dialogs for destructive actions

2. **Push Notifications**:
   - Add push notifications for mobile app when board is reset
   - Implement background sync for offline scenarios

3. **Real-time Game State**:
   - Sync complete game state (not just resets)
   - Add multiplayer move synchronization

4. **Security**:
   - Implement user authentication (Cognito)
   - Add player-specific permissions
   - Validate reset permissions

## Support

For issues or questions:
1. Check AWS CloudWatch logs for AppSync errors
2. Review DynamoDB item updates in AWS Console  
3. Test GraphQL operations in AppSync console
4. Check application console logs for client-side errors