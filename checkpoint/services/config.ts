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
  /** API Gateway endpoint for the Lambda board-detection function */
  lambdaEndpoint: string;
}

// Configuration populated by deployment script
export const DEFAULT_CONFIG: AppSyncConfig = {
  aws_appsync_graphqlEndpoint: 'https://wltticbi65fl5kmnpsenbj26ky.appsync-api.us-east-2.amazonaws.com/graphql',
  aws_appsync_region: 'us-east-2',
  aws_appsync_authenticationType: 'API_KEY',
  aws_appsync_apiKey: 'da2-idf5umd5m5hu3cui4hyi526dee',
  // Replace with your API Gateway URL once the Lambda is deployed
  lambdaEndpoint: 'https://REPLACE_ME.execute-api.us-east-2.amazonaws.com/prod/detect',
};

// Function to load config from environment or use defaults
export function getAppSyncConfig(): AppSyncConfig {
  // In production, these could come from environment variables or secure storage
  return DEFAULT_CONFIG;
}
