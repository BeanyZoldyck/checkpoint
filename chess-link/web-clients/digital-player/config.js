// Configuration for Checkpoint Digital Player
// These values will be updated after CDK deployment

window.CheckpointConfig = {
    // AppSync GraphQL API Configuration
    graphqlEndpoint: 'YOUR_APPSYNC_GRAPHQL_ENDPOINT',
    graphqlApiKey: 'YOUR_APPSYNC_API_KEY',
    
    // AWS Region
    region: 'us-east-1',
    
    // Application settings
    reconnectAttempts: 5,
    reconnectDelay: 2000, // milliseconds
    
    // Chessboard configuration
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    
    // Debug mode
    debug: true
};

// Helper function to check if config is properly set
window.CheckpointConfig.isConfigured = function() {
    return this.graphqlEndpoint !== 'YOUR_APPSYNC_GRAPHQL_ENDPOINT' &&
           this.graphqlApiKey !== 'YOUR_APPSYNC_API_KEY';
};