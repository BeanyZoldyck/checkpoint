// Configuration for Checkpoint Digital Player
window.CheckpointConfig = {
    graphqlEndpoint: 'https://wltticbi65fl5kmnpsenbj26ky.appsync-api.us-east-2.amazonaws.com/graphql',
    graphqlApiKey: 'da2-idf5umd5m5hu3cui4hyi526dee',
    region: 'us-east-2',
    reconnectAttempts: 5,
    reconnectDelay: 2000,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    debug: false
};

window.CheckpointConfig.isConfigured = function() {
    return this.graphqlEndpoint !== 'YOUR_APPSYNC_GRAPHQL_ENDPOINT' &&
           this.graphqlApiKey !== 'YOUR_APPSYNC_API_KEY';
};
