// ============================================================================
// Checkpoint AWS Configuration
//
// This file will be updated automatically during deployment
// ============================================================================

export interface AppSyncConfig {
  aws_appsync_graphqlEndpoint: string;
  aws_appsync_region: string;
  aws_appsync_authenticationType: string;
  aws_appsync_apiKey: string;
}

// This will be populated by the deployment script
export const DEFAULT_CONFIG: AppSyncConfig = {
  aws_appsync_graphqlEndpoint: 'https://your-appsync-endpoint.appsync-api.region.amazonaws.com/graphql',
  aws_appsync_region: 'us-east-1',
  aws_appsync_authenticationType: 'API_KEY',
  aws_appsync_apiKey: 'your-api-key-here'
};

// Function to load config from environment or use defaults
export function getAppSyncConfig(): AppSyncConfig {
  // In production, these could come from environment variables or secure storage
  return DEFAULT_CONFIG;
}