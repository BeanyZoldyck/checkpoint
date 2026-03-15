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
  aws_appsync_graphqlEndpoint: 'https://wltticbi65fl5kmnpsenbj26ky.appsync-api.us-east-2.amazonaws.com/graphql',
  aws_appsync_region: 'us-east-2',
  aws_appsync_authenticationType: 'API_KEY',
  aws_appsync_apiKey: 'da2-idf5umd5m5hu3cui4hyi526dee',
};

// Function to load config from environment or use defaults
export function getAppSyncConfig(): AppSyncConfig {
  // In production, these could come from environment variables or secure storage
  return DEFAULT_CONFIG;
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS configuration
// ---------------------------------------------------------------------------

export const ELEVENLABS_CONFIG = {
  apiKey: 'sk_529eacd5b31a0aadcd2ca71f338852fd6f9dfad6ecfbd144',
  // Rachel — clear, calm voice
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  model: 'eleven_turbo_v2',
} as const;
