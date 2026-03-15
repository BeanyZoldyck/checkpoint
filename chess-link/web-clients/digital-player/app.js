// Main application logic for Digital Player
class CheckpointDigitalPlayer {
    constructor() {
        this.appSync = null;
        this.chess = new Chess();
        this.board = null;
        this.gameId = null;
        this.playerColor = null;
        this.currentSection = 'joinSection';
        
        this.initializeApp();
    }
    
    initializeApp() {
        // Check if configuration is set
        if (!window.CheckpointConfig.isConfigured()) {
            this.showError('Configuration not set. Please deploy the infrastructure first.');
            return;
        }
        
        // Initialize AppSync client
        this.appSync = new CheckpointAppSync(window.CheckpointConfig);
        
        // Set up AppSync callbacks
        this.setupAppSyncCallbacks();
        
        // Set up UI event handlers
        this.setupEventHandlers();
        
        // Initialize chessboard
        this.initializeChessboard();
        
        console.log('Checkpoint Digital Player initialized');
    }
    
    setupAppSyncCallbacks() {
        this.appSync.onMove((move) => {
            this.handleIncomingMove(move);
        });
        
        this.appSync.onGameStateChange((gameState) => {
            this.handleGameStateChange(gameState);
        });
        
        this.appSync.onError((error) => {
            this.showError(error.message);
        });
        
        this.appSync.onConnectionChange((connected) => {
            this.updateConnectionStatus(connected);
        });
    }
    
    setupEventHandlers() {
        // Join form
        document.getElementById('joinForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleJoinGame();
        });
        
        // Join code input formatting
        const joinCodeInput = document.getElementById('joinCode');
        joinCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        
        // Board controls
        document.getElementById('flipBoard').addEventListener('click', () => {
            this.board.flip();
        });
        
        // New game button
        document.getElementById('newGameBtn').addEventListener('click', () => {
            this.startNewGame();
        });
        
        // Error modal
        document.getElementById('closeErrorBtn').addEventListener('click', () => {
            this.hideError();
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (this.gameId && this.appSync) {
                this.appSync.updateConnection(this.gameId, !document.hidden);
            }
        });
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            if (this.gameId && this.appSync) {
                this.appSync.updateConnection(this.gameId, false);
            }
        });
    }
    
    initializeChessboard() {
        const config = {
            draggable: true,
            position: 'start',
            onDragStart: this.onDragStart.bind(this),
            onDrop: this.onDrop.bind(this),
            onSnapEnd: this.onSnapEnd.bind(this),
            pieceTheme: window.CheckpointConfig.pieceTheme
        };
        
        this.board = Chessboard('board', config);
    }
    
    // Join game flow
    async handleJoinGame() {
        const joinCode = document.getElementById('joinCode').value.trim();
        
        if (!joinCode || joinCode.length !== 6) {
            this.showJoinError('Please enter a valid 6-character game code');
            return;
        }
        
        try {
            this.setLoading(true);
            this.hideJoinError();
            
            // Join the game
            const result = await this.appSync.joinGame(joinCode);
            const game = result.joinGame;
            
            this.gameId = game.id;
            this.playerColor = game.digitalPlayerColor.toLowerCase();
            
            // Subscribe to game events
            this.appSync.subscribe(this.gameId);
            
            // Update connection status
            await this.appSync.updateConnection(this.gameId, true);
            
            // Update UI based on game status
            this.handleGameStateChange(game);
            
        } catch (error) {
            console.error('Failed to join game:', error);
            this.showJoinError(error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    // Handle incoming moves from physical player
    handleIncomingMove(move) {
        console.log('Received move:', move);
        
        // Update chess.js state
        const moveObj = {
            from: move.from,
            to: move.to
        };
        
        try {
            const chessMove = this.chess.move(moveObj);
            if (chessMove) {
                // Update board position
                this.board.position(this.chess.fen());
                
                // Highlight the move
                this.highlightMove(move.from, move.to);
                
                // Add to move history
                this.addMoveToHistory(move.moveNumber, move.san, move.playerColor);
                
                // Update turn indicator
                this.updateTurnIndicator();
                
                // Check for game over
                this.checkGameOver();
            }
        } catch (error) {
            console.error('Invalid move received:', error);
            this.showError('Invalid move received from opponent');
        }
    }
    
    // Handle game state changes
    handleGameStateChange(gameState) {
        console.log('Game state changed:', gameState);
        
        // Update connection status indicators
        this.updatePlayerConnectionStatus(gameState);
        
        // Handle different game statuses
        switch (gameState.status) {
            case 'WAITING_FOR_DIGITAL_PLAYER':
                // This shouldn't happen since we just joined
                break;
                
            case 'CALIBRATING':
                this.showSection('setupSection');
                this.updateSetupStatus('Connected! Waiting for physical player to calibrate camera...');
                break;
                
            case 'ACTIVE':
                this.showSection('gameSection');
                this.setupActiveGame(gameState);
                break;
                
            case 'COMPLETED':
                this.showSection('gameOverSection');
                this.handleGameOver(gameState);
                break;
                
            case 'ERROR':
                this.showError('Game error occurred. Please try again.');
                break;
        }
    }
    
    setupActiveGame(gameState) {
        // Update chess.js with current position
        this.chess.load(gameState.currentFEN);
        
        // Update board
        this.board.position(gameState.currentFEN);
        
        // Set board orientation
        this.board.orientation(this.playerColor);
        
        // Update player info
        this.updatePlayerInfo(gameState);
        
        // Load move history
        this.loadMoveHistory(gameState.moveHistory);
        
        // Update turn indicator
        this.updateTurnIndicator();
    }
    
    updatePlayerInfo(gameState) {
        const yourColorElement = document.getElementById('yourColor');
        const opponentColorElement = document.getElementById('opponentColor');
        
        if (this.playerColor === 'white') {
            yourColorElement.textContent = '⚪';
            opponentColorElement.textContent = '⚫';
        } else {
            yourColorElement.textContent = '⚫';
            opponentColorElement.textContent = '⚪';
        }
    }
    
    updatePlayerConnectionStatus(gameState) {
        const opponentStatus = document.getElementById('opponentStatus');
        if (gameState.physicalPlayerConnected) {
            opponentStatus.textContent = '🟢';
            opponentStatus.title = 'Physical player connected';
        } else {
            opponentStatus.textContent = '🔴';
            opponentStatus.title = 'Physical player disconnected';
        }
    }
    
    updateTurnIndicator() {
        const turnStatus = document.getElementById('turnStatus');
        const currentTurn = this.chess.turn();
        const isMyTurn = (currentTurn === 'w' && this.playerColor === 'white') || 
                        (currentTurn === 'b' && this.playerColor === 'black');
        
        if (isMyTurn) {
            turnStatus.textContent = 'Your turn!';
            turnStatus.className = 'turn-status';
        } else {
            turnStatus.textContent = 'Opponent\'s turn';
            turnStatus.className = 'turn-status opponent';
        }
    }
    
    loadMoveHistory(moveHistory) {
        const movesList = document.getElementById('movesList');
        movesList.innerHTML = '';
        
        for (let i = 0; i < moveHistory.length; i += 2) {
            const moveNumber = Math.floor(i / 2) + 1;
            const whiteMove = moveHistory[i];
            const blackMove = moveHistory[i + 1];
            
            const moveItem = document.createElement('div');
            moveItem.className = 'move-item';
            
            moveItem.innerHTML = `
                <span class="move-number">${moveNumber}.</span>
                <span class="move-san">${whiteMove || ''}</span>
                <span class="move-san">${blackMove || ''}</span>
            `;
            
            movesList.appendChild(moveItem);
        }
        
        movesList.scrollTop = movesList.scrollHeight;
    }
    
    addMoveToHistory(moveNumber, san, playerColor) {
        const movesList = document.getElementById('movesList');
        
        // For simplicity, rebuild the entire history
        // In a more sophisticated app, you'd append efficiently
        const game = this.chess.pgn().split(' ');
        const moves = game.filter(move => !move.includes('.') && move !== '');
        
        this.rebuildMoveHistory(moves);
    }
    
    rebuildMoveHistory(moves) {
        const movesList = document.getElementById('movesList');
        movesList.innerHTML = '';
        
        for (let i = 0; i < moves.length; i += 2) {
            const moveNumber = Math.floor(i / 2) + 1;
            const whiteMove = moves[i];
            const blackMove = moves[i + 1];
            
            const moveItem = document.createElement('div');
            moveItem.className = 'move-item';
            
            moveItem.innerHTML = `
                <span class="move-number">${moveNumber}.</span>
                <span class="move-san">${whiteMove || ''}</span>
                <span class="move-san">${blackMove || ''}</span>
            `;
            
            movesList.appendChild(moveItem);
        }
        
        movesList.scrollTop = movesList.scrollHeight;
    }
    
    // Chessboard event handlers
    onDragStart(source, piece, position, orientation) {
        // Only allow dragging if it's the player's turn and their pieces
        const currentTurn = this.chess.turn();
        const isMyTurn = (currentTurn === 'w' && this.playerColor === 'white') || 
                        (currentTurn === 'b' && this.playerColor === 'black');
        
        if (!isMyTurn) return false;
        
        // Only allow dragging pieces of the current player's color
        const pieceColor = piece.charAt(0);
        if ((currentTurn === 'w' && pieceColor !== 'w') || 
            (currentTurn === 'b' && pieceColor !== 'b')) {
            return false;
        }
        
        return true;
    }
    
    async onDrop(source, target) {
        // Check if the move is legal
        const move = this.chess.move({
            from: source,
            to: target,
            promotion: 'q' // Always promote to queen for simplicity
        });
        
        if (move === null) {
            return 'snapback';
        }
        
        try {
            // Send move to server
            await this.appSync.makeMove(this.gameId, source, target, 'q');
            
            // Add to move history
            this.rebuildMoveHistory(this.chess.history());
            
            // Update turn indicator
            this.updateTurnIndicator();
            
            // Check for game over
            this.checkGameOver();
            
        } catch (error) {
            console.error('Failed to send move:', error);
            
            // Undo the move on error
            this.chess.undo();
            this.showError('Failed to send move: ' + error.message);
            return 'snapback';
        }
    }
    
    onSnapEnd() {
        // Update board position after piece snap
        this.board.position(this.chess.fen());
    }
    
    highlightMove(from, to) {
        // Remove previous highlights
        this.removeHighlights();
        
        // Add new highlights
        document.querySelector(`.square-${from}`).classList.add('highlight-square');
        document.querySelector(`.square-${to}`).classList.add('highlight-square');
    }
    
    removeHighlights() {
        const squares = document.querySelectorAll('.highlight-square');
        squares.forEach(square => {
            square.classList.remove('highlight-square');
        });
    }
    
    checkGameOver() {
        if (this.chess.game_over()) {
            let message = '';
            
            if (this.chess.in_checkmate()) {
                const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
                message = `Checkmate! ${winner} wins!`;
            } else if (this.chess.in_stalemate()) {
                message = 'Stalemate! Game is a draw.';
            } else if (this.chess.insufficient_material()) {
                message = 'Insufficient material! Game is a draw.';
            } else {
                message = 'Game over!';
            }
            
            this.showGameOver(message);
        }
    }
    
    showGameOver(message) {
        document.getElementById('gameOverTitle').textContent = 'Game Over!';
        document.getElementById('gameOverMessage').textContent = message;
        this.showSection('gameOverSection');
    }
    
    // UI Helper methods
    showSection(sectionId) {
        // Hide all sections
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            section.classList.remove('active');
        });
        
        // Show target section
        document.getElementById(sectionId).classList.add('active');
        this.currentSection = sectionId;
    }
    
    updateSetupStatus(message) {
        document.getElementById('setupMessage').textContent = message;
        
        // Update status icons
        document.getElementById('connectedIcon').textContent = '✅';
        document.getElementById('connectedIcon').classList.add('complete');
    }
    
    showJoinError(message) {
        const errorElement = document.getElementById('joinError');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
    
    hideJoinError() {
        const errorElement = document.getElementById('joinError');
        errorElement.classList.add('hidden');
    }
    
    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.remove('hidden');
    }
    
    hideError() {
        document.getElementById('errorModal').classList.add('hidden');
    }
    
    setLoading(loading) {
        const form = document.getElementById('joinForm');
        const button = form.querySelector('button');
        
        if (loading) {
            button.disabled = true;
            button.textContent = 'Joining...';
        } else {
            button.disabled = false;
            button.textContent = 'Join Game';
        }
    }
    
    startNewGame() {
        // Reset everything and go back to join screen
        if (this.appSync) {
            this.appSync.disconnect();
        }
        
        this.gameId = null;
        this.playerColor = null;
        this.chess = new Chess();
        
        if (this.board) {
            this.board.position('start');
        }
        
        document.getElementById('joinCode').value = '';
        this.hideJoinError();
        this.showSection('joinSection');
    }
    
    updateConnectionStatus(connected) {
        console.log('Connection status:', connected);
        // Update UI to show connection status
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new CheckpointDigitalPlayer();
    window.chessApp = app; // For debugging
});