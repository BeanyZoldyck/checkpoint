// AppSync GraphQL client for Checkpoint
class CheckpointAppSync {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.subscription = null;
        this.gameId = null;
        this.reconnectAttempts = 0;
        this.lastMoveCount = undefined;
        this.callbacks = {
            onMove: null,
            onGameStateChange: null,
            onError: null,
            onConnectionChange: null
        };
        
        this.initializeClient();
    }
    
    initializeClient() {
        // Simple GraphQL client configuration for AppSync
        this.client = {
            endpoint: this.config.graphqlEndpoint,
            apiKey: this.config.graphqlApiKey,
            region: this.config.region
        };
        
        console.log('AppSync GraphQL client initialized');
    }
    
    // Subscribe to game events (using polling for simplicity)
    subscribe() {
        console.log('Setting up game state polling...');
        
        // Poll for game state changes every 2 seconds
        this.subscription = setInterval(async () => {
            try {
                const gameData = await this.getCurrentGame();
                if (gameData && gameData.getCurrentGame) {
                    this.handleGameStateChange(gameData.getCurrentGame);
                }
            } catch (error) {
                console.error('Error polling game state:', error);
                // Don't spam error callbacks on polling failures
            }
        }, 2000);
        
        console.log('Game state polling started');
    }
    
    // Handle game state changes from polling
    handleGameStateChange(gameState) {
        if (this.config.debug) {
            console.log('Game state changed:', gameState);
        }
        
        if (this.callbacks.onGameStateChange) {
            this.callbacks.onGameStateChange(gameState);
        }
        
        // Check for new moves by comparing move history
        if (gameState.moveHistory && this.lastMoveCount !== undefined) {
            if (gameState.moveHistory.length > this.lastMoveCount) {
                const newMoves = gameState.moveHistory.slice(this.lastMoveCount);
                for (const moveStr of newMoves) {
                    // Parse move string and trigger move callback
                    if (this.callbacks.onMove) {
                        // Simple move parsing - in real implementation you'd parse the move properly
                        console.log('New move detected:', moveStr);
                    }
                }
            }
        }
        
        this.lastMoveCount = gameState.moveHistory ? gameState.moveHistory.length : 0;
    }
    
    // Connect to single game session
    async connectDigitalPlayer() {
        const mutation = `
            mutation ConnectDigitalPlayer {
                connectDigitalPlayer {
                    id
                    status
                    digitalPlayerColor
                    physicalPlayerColor
                    currentFEN
                    currentTurn
                    physicalPlayerConnected
                    digitalPlayerConnected
                }
            }
        `;
        
        return this.executeMutation(mutation, {});
    }
    
    // Make a move (single game session)
    async makeMove(from, to, promotion = null) {
        const mutation = `
            mutation MakeDigitalMove($from: String!, $to: String!, $promotion: String) {
                makeDigitalMove(from: $from, to: $to, promotion: $promotion) {
                    id
                    from
                    to
                    san
                    fen
                    playerColor
                    moveNumber
                    timestamp
                }
            }
        `;
        
        return this.executeMutation(mutation, { 
            from, 
            to, 
            promotion 
        });
    }
    
    // Update connection status (single game session)
    async updateConnection(connected) {
        const mutation = `
            mutation UpdatePlayerConnection($playerType: String!, $connected: Boolean!) {
                updatePlayerConnection(playerType: $playerType, connected: $connected) {
                    id
                    digitalPlayerConnected
                    physicalPlayerConnected
                }
            }
        `;
        
        return this.executeMutation(mutation, { 
            playerType: 'digital', 
            connected 
        });
    }
    
    // Get current game state (single game session)
    async getCurrentGame() {
        const query = `
            query GetCurrentGame {
                getCurrentGame {
                    id
                    status
                    currentFEN
                    currentTurn
                    digitalPlayerColor
                    physicalPlayerColor
                    moveHistory
                    physicalPlayerConnected
                    digitalPlayerConnected
                }
            }
        `;
        
        return this.executeQuery(query, {});
    }
    
    // Execute GraphQL mutation
    async executeMutation(mutation, variables) {
        try {
            const response = await fetch(this.config.graphqlEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.graphqlApiKey
                },
                body: JSON.stringify({
                    query: mutation,
                    variables: variables
                })
            });
            
            const data = await response.json();
            
            if (data.errors) {
                throw new Error(data.errors[0].message);
            }
            
            return data.data;
        } catch (error) {
            console.error('GraphQL mutation error:', error);
            throw error;
        }
    }
    
    // Execute GraphQL query
    async executeQuery(query, variables) {
        try {
            const response = await fetch(this.config.graphqlEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.graphqlApiKey
                },
                body: JSON.stringify({
                    query: query,
                    variables: variables
                })
            });
            
            const data = await response.json();
            
            if (data.errors) {
                throw new Error(data.errors[0].message);
            }
            
            return data.data;
        } catch (error) {
            console.error('GraphQL query error:', error);
            throw error;
        }
    }
    
    // Handle incoming subscription events (legacy method for compatibility)
    handleSubscriptionEvent(event) {
        if (this.config.debug) {
            console.log('Received subscription event:', event);
        }
        
        switch(event.type) {
            case 'MOVE_MADE':
                if (this.callbacks.onMove && event.move) {
                    this.callbacks.onMove(event.move);
                }
                break;
                
            case 'PLAYER_CONNECTED':
            case 'PLAYER_DISCONNECTED':
            case 'GAME_STATE_UPDATED':
            case 'CALIBRATION_COMPLETE':
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
        if (this.subscription) {
            clearInterval(this.subscription);
            this.subscription = null;
        }
        
        console.log('Disconnected from AppSync');
    }
    
    // Attempt to reconnect
    reconnect() {
        if (this.reconnectAttempts < this.config.reconnectAttempts) {
            this.reconnectAttempts++;
            
            setTimeout(() => {
                console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
                if (this.gameId) {
                    this.subscribe(this.gameId);
                }
            }, this.config.reconnectDelay * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error('Unable to reconnect to game'));
            }
        }
    }
}