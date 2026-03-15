// Socket.IO client for local testing (replaces AppSync)
class CheckpointTestClient {
    constructor(config) {
        this.config = config;
        this.socket = null;
        this.gameId = null;
        this.playerType = null;
        this.callbacks = {
            onMove: null,
            onGameStateChange: null,
            onError: null,
            onConnectionChange: null
        };
        
        this.initializeSocket();
    }
    
    initializeSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io(this.config.socketUrl);
            
            this.socket.on('connect', () => {
                console.log('🔌 Connected to test server');
                if (this.callbacks.onConnectionChange) {
                    this.callbacks.onConnectionChange(true);
                }
            });
            
            this.socket.on('disconnect', () => {
                console.log('🔌 Disconnected from test server');
                if (this.callbacks.onConnectionChange) {
                    this.callbacks.onConnectionChange(false);
                }
            });
            
            this.socket.on('gameEvent', (event) => {
                this.handleGameEvent(event);
            });
            
            this.socket.on('testResponse', (data) => {
                console.log('📨 Test response:', data);
            });
            
            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                if (this.callbacks.onError) {
                    this.callbacks.onError(error);
                }
            });
        } else {
            console.error('Socket.IO not loaded');
        }
    }
    
    // Join a game room for real-time updates
    joinGameRoom(gameId, playerType) {
        this.gameId = gameId;
        this.playerType = playerType;
        
        if (this.socket) {
            this.socket.emit('joinGameRoom', { gameId, playerType });
            console.log(`🎮 Joined game room: ${gameId} as ${playerType}`);
        }
    }
    
    // Create a new game
    async createGame(physicalPlayerColor) {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/createGame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ physicalPlayerColor })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('🎲 Game created:', data);
            return { createGame: data };
        } catch (error) {
            console.error('Failed to create game:', error);
            throw error;
        }
    }
    
    // Join an existing game
    async joinGame(joinCode) {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/joinGame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('🎯 Joined game:', data);
            return { joinGame: data };
        } catch (error) {
            console.error('Failed to join game:', error);
            throw error;
        }
    }
    
    // Make a move
    async makeMove(gameId, from, to, promotion = null) {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/makeMove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    gameId, 
                    from, 
                    to, 
                    playerType: this.playerType,
                    promotion 
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`♟️ Move made: ${from} → ${to}`);
            return { makeDigitalMove: data };
        } catch (error) {
            console.error('Failed to make move:', error);
            throw error;
        }
    }
    
    // Send test message
    sendTestMessage(message) {
        if (this.socket) {
            this.socket.emit('testMessage', {
                message,
                sender: this.playerType,
                gameId: this.gameId,
                timestamp: new Date().toISOString()
            });
            console.log('📤 Test message sent:', message);
        }
    }
    
    // Handle incoming game events
    handleGameEvent(event) {
        console.log('📬 Game event received:', event);
        
        switch (event.type) {
            case 'MOVE_MADE':
                if (this.callbacks.onMove && event.move) {
                    this.callbacks.onMove(event.move);
                }
                break;
                
            case 'PLAYER_CONNECTED':
            case 'PLAYER_DISCONNECTED':
            case 'GAME_STATE_UPDATED':
                if (this.callbacks.onGameStateChange && event.gameState) {
                    this.callbacks.onGameStateChange(event.gameState);
                }
                break;
                
            case 'ERROR_OCCURRED':
                if (this.callbacks.onError) {
                    this.callbacks.onError(new Error(event.message));
                }
                break;
                
            default:
                console.log('Unknown event type:', event.type);
        }
    }
    
    // Set callback functions  
    onMove(callback) {
        this.callbacks.onMove = callback;
    }
    
    onGameStateChange(callback) {
        this.callbacks.onGameStateChange = callback;
    }
    
    onError(callback) {
        this.callbacks.onError = callback;
    }
    
    onConnectionChange(callback) {
        this.callbacks.onConnectionChange = callback;
    }
    
    // Cleanup
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            console.log('🔌 Disconnected from test server');
        }
    }
}

// Replace the AppSync client with our test client
window.CheckpointAppSync = CheckpointTestClient;