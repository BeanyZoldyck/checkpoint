// AppSync GraphQL client for Checkpoint
class CheckpointAppSync {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.subscription = null;
        this.gameId = null;
        this.reconnectAttempts = 0;
        this.callbacks = {
            onMove: null,
            onGameStateChange: null,
            onError: null,
            onConnectionChange: null
        };
        
        this.initializeClient();
    }
    
    initializeClient() {
        // Configure AWS SDK
        AWS.config.update({
            region: this.config.region,
            accessKeyId: 'dummy',  // Using API Key auth
            secretAccessKey: 'dummy'
        });
        
        this.client = new AWS.AppSync({
            graphqlEndpoint: this.config.graphqlEndpoint,
            region: this.config.region,
            auth: {
                type: 'API_KEY',
                apiKey: this.config.graphqlApiKey
            }
        });
        
        console.log('AppSync client initialized');
    }
    
    // Subscribe to game events
    subscribe(gameId) {
        this.gameId = gameId;
        
        const subscription = `
            subscription OnGameEvent($gameId: ID!) {
                onGameEvent(gameId: $gameId) {
                    type
                    gameId
                    move {
                        id
                        from
                        to
                        san
                        fen
                        playerColor
                        moveNumber
                        timestamp
                    }
                    gameState {
                        id
                        status
                        currentTurn
                        currentFEN
                        physicalPlayerConnected
                        digitalPlayerConnected
                        moveHistory
                    }
                    message
                    timestamp
                }
            }
        `;
        
        try {
            // Using WebSocket for AppSync subscriptions
            const wsUrl = this.config.graphqlEndpoint
                .replace('https://', 'wss://')
                .replace('/graphql', '/realtime');
            
            // This is a simplified version - in production you'd use AWS AppSync SDK
            this.subscription = this.subscribeToAppSync(subscription, { gameId });
            
            console.log('Subscribed to game events for game:', gameId);
        } catch (error) {
            console.error('Failed to subscribe:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        }
    }
    
    // Simplified AppSync subscription (in real implementation, use AWS AppSync SDK)
    subscribeToAppSync(subscription, variables) {
        // This is a placeholder for the actual AppSync WebSocket implementation
        // In a real app, you'd use @aws-amplify/api or aws-appsync
        console.log('Setting up AppSync subscription with variables:', variables);
        
        // Simulate subscription for development
        return {
            unsubscribe: () => {
                console.log('Unsubscribing from AppSync');
            }
        };
    }
    
    // Join a game
    async joinGame(joinCode) {
        const mutation = `
            mutation JoinGame($joinCode: String!) {
                joinGame(joinCode: $joinCode) {
                    id
                    joinCode
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
        
        return this.executeMutation(mutation, { joinCode });
    }
    
    // Make a move
    async makeMove(gameId, from, to, promotion = null) {
        const mutation = `
            mutation MakeDigitalMove($gameId: ID!, $from: String!, $to: String!, $promotion: String) {
                makeDigitalMove(gameId: $gameId, from: $from, to: $to, promotion: $promotion) {
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
            gameId, 
            from, 
            to, 
            promotion 
        });
    }
    
    // Update connection status
    async updateConnection(gameId, connected) {
        const mutation = `
            mutation UpdatePlayerConnection($gameId: ID!, $playerType: String!, $connected: Boolean!) {
                updatePlayerConnection(gameId: $gameId, playerType: $playerType, connected: $connected) {
                    id
                    digitalPlayerConnected
                    physicalPlayerConnected
                }
            }
        `;
        
        return this.executeMutation(mutation, { 
            gameId, 
            playerType: 'digital', 
            connected 
        });
    }
    
    // Get game state
    async getGame(gameId) {
        const query = `
            query GetGame($id: ID!) {
                getGame(id: $id) {
                    id
                    joinCode
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
        
        return this.executeQuery(query, { id: gameId });
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
    
    // Handle incoming subscription events
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
            this.subscription.unsubscribe();
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