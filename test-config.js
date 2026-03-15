// Test configuration for local development
window.CheckpointConfig = {
    // Local test server configuration
    testMode: true,
    serverUrl: 'http://localhost:3000',
    socketUrl: 'http://localhost:3000',
    
    // API endpoints
    apiEndpoints: {
        createGame: '/api/createGame',
        joinGame: '/api/joinGame', 
        makeMove: '/api/makeMove'
    },
    
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
    return this.testMode === true;
};