// Main application logic for Physical Player PWA
class CheckpointPhysicalPlayer {
    constructor() {
        this.appSync = null;
        this.camera = null;
        this.calibration = null;
        this.gameId = null;
        this.playerColor = null;
        this.currentSection = 'createSection';
        this.gameActive = false;
        
        this.initializeApp();
    }
    
    initializeApp() {
        // Check if configuration is set
        if (!window.CheckpointConfig.isConfigured()) {
            this.showError('Configuration not set. Please deploy the infrastructure first.');
            return;
        }
        
        // Check camera support
        if (!CameraManager.isCameraSupported()) {
            this.showError('Camera not supported on this device. Please use a device with camera support.');
            return;
        }
        
        // Initialize components
        this.appSync = new CheckpointAppSync(window.CheckpointConfig);
        this.camera = new CameraManager();
        this.calibration = new BoardCalibration();
        
        // Set up callbacks
        this.setupAppSyncCallbacks();
        this.setupCameraCallbacks();
        this.setupCalibrationCallbacks();
        
        // Set up UI event handlers
        this.setupEventHandlers();
        
        console.log('Checkpoint Physical Player initialized');
    }
    
    setupAppSyncCallbacks() {
        this.appSync.onMove((move) => {
            this.handleOpponentMove(move);
        });
        
        this.appSync.onGameStateChange((gameState) => {
            this.handleGameStateChange(gameState);
        });
        
        this.appSync.onError((error) => {
            this.showError(error.message);
        });
    }
    
    setupCameraCallbacks() {
        this.camera.onFrame((result) => {
            this.handleFrameCaptured(result);
        });
        
        this.camera.onError((error) => {
            this.showCameraError('Camera error: ' + error.message);
        });
        
        this.camera.onPermissionDenied((error) => {
            this.showCameraPermissionError();
        });
    }
    
    setupCalibrationCallbacks() {
        this.calibration.onComplete((calibrationData) => {
            this.handleCalibrationComplete(calibrationData);
        });
        
        this.calibration.onError((error) => {
            this.showError('Calibration error: ' + error.message);
        });
    }
    
    setupEventHandlers() {
        // Create game
        document.getElementById('createGameBtn').addEventListener('click', () => {
            this.handleCreateGame();
        });
        
        // Remove join code related event listeners - not needed for single game session
        
        // Camera setup
        document.getElementById('calibrateBtn').addEventListener('click', () => {
            this.startCameraSetup();
        });
        
        document.getElementById('retryPermissionBtn').addEventListener('click', () => {
            this.retryCamera();
        });
        
        // Calibration
        document.getElementById('resetCalibrationBtn').addEventListener('click', () => {
            this.calibration.reset();
        });
        
        document.getElementById('completeCalibrationBtn').addEventListener('click', () => {
            this.completeCalibration();
        });
        
        // Game controls
        document.getElementById('pauseGameBtn').addEventListener('click', () => {
            this.pauseGame();
        });
        
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });
        
        // Settings modal
        document.getElementById('closeSettingsBtn').addEventListener('click', () => {
            this.hideSettings();
        });
        
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    // Game connection flow (auto-connect to single game session)
    async handleCreateGame() {
        try {
            const selectedColor = document.querySelector('input[name="playerColor"]:checked').value;
            this.playerColor = selectedColor.toLowerCase();
            
            this.setLoading(true);
            
            // Connect as physical player via AppSync
            const result = await this.appSync.executeMutation(`
                mutation ConnectPhysicalPlayer($playerColor: PlayerColor!) {
                    connectPhysicalPlayer(playerColor: $playerColor) {
                        id
                        status
                        physicalPlayerColor
                        digitalPlayerColor
                        currentFEN
                        physicalPlayerConnected
                        digitalPlayerConnected
                    }
                }
            `, {
                playerColor: selectedColor
            });
            
            const game = result.connectPhysicalPlayer;
            this.gameId = game.id;
            
            // Subscribe to game events
            this.appSync.subscribe();
            
            // Update connection status
            await this.appSync.updateConnection(true);
            
            // Check if digital player is already connected
            if (game.digitalPlayerConnected) {
                // Both players connected - start calibration
                this.startCalibration();
            } else {
                // Show waiting screen
                this.showWaitingForOpponent();
            }
            
        } catch (error) {
            console.error('Failed to connect to game:', error);
            this.showCreateError(error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    showWaitingForOpponent() {
        this.showSection('waitingSection');
        document.getElementById('waitingMessage').textContent = 
            'Waiting for digital player to connect...';
    }
    
    // Camera setup flow
    async startCameraSetup() {
        try {
            this.showSection('cameraSection');
            
            const videoElement = document.getElementById('cameraPreview');
            this.camera.setupVideoErrorHandling(videoElement);
            
            await this.camera.startCamera(videoElement);
            
            console.log('Camera setup completed');
            
        } catch (error) {
            console.error('Camera setup failed:', error);
            this.showCameraError('Failed to access camera: ' + error.message);
        }
    }
    
    async retryCamera() {
        this.hideCameraError();
        await this.startCameraSetup();
    }
    
    // Calibration flow
    startCalibration() {
        this.showSection('calibrationSection');
        
        const videoElement = document.getElementById('calibrationPreview');
        const canvasElement = document.getElementById('calibrationCanvas');
        
        // Transfer camera stream to calibration view
        if (this.camera.stream) {
            videoElement.srcObject = this.camera.stream;
            videoElement.play();
        }
        
        // Start calibration process
        this.calibration.start(videoElement, canvasElement);
    }
    
    async completeCalibration() {
        try {
            const calibrationData = this.calibration.getCalibrationData();
            
            // Send calibration data to server
            const result = await this.appSync.executeMutation(`
                mutation CompleteCalibration($calibrationData: String!) {
                    completeCalibration(calibrationData: $calibrationData) {
                        id
                        status
                        currentFEN
                        currentTurn
                    }
                }
            `, {
                calibrationData: JSON.stringify(calibrationData)
            });
            
            console.log('Calibration completed:', result);
            
            // Start active game
            this.startActiveGame(result.completeCalibration);
            
        } catch (error) {
            console.error('Failed to complete calibration:', error);
            this.showError('Failed to complete calibration: ' + error.message);
        }
    }
    
    handleCalibrationComplete(calibrationData) {
        // Enable the complete button when calibration is done
        document.getElementById('completeCalibrationBtn').disabled = false;
        console.log('Calibration ready:', calibrationData);
    }
    
    // Active game flow
    startActiveGame(gameState) {
        this.gameActive = true;
        this.showSection('gameSection');
        
        // Set up game UI
        this.updateGameUI(gameState);
        
        // Transfer camera stream to game view
        const gameVideo = document.getElementById('gamePreview');
        if (this.camera.stream) {
            gameVideo.srcObject = this.camera.stream;
            gameVideo.play();
            this.camera.setupVideoErrorHandling(gameVideo);
        }
        
        // Start periodic capture for move detection
        this.camera.startPeriodicCapture(this.appSync);
        
        console.log('Active game started');
    }
    
    updateGameUI(gameState) {
        // Update color indicators
        const yourColorIndicator = document.getElementById('yourColorIndicator');
        const opponentColorIndicator = document.getElementById('opponentColorIndicator');
        
        if (this.playerColor === 'white') {
            yourColorIndicator.textContent = '♔';
            opponentColorIndicator.textContent = '♚';
        } else {
            yourColorIndicator.textContent = '♚';
            opponentColorIndicator.textContent = '♔';
        }
        
        // Update turn indicator
        this.updateTurnIndicator(gameState);
        
        // Update opponent connection status
        this.updateOpponentConnectionStatus(gameState);
    }
    
    updateTurnIndicator(gameState) {
        const turnIndicator = document.getElementById('turnIndicator');
        const isMyTurn = gameState.currentTurn.toLowerCase() === this.playerColor;
        
        if (isMyTurn) {
            turnIndicator.textContent = 'Your turn';
            turnIndicator.className = 'turn-text';
        } else {
            turnIndicator.textContent = 'Opponent\'s turn';
            turnIndicator.className = 'turn-text waiting';
        }
    }
    
    updateOpponentConnectionStatus(gameState) {
        const statusElement = document.getElementById('opponentConnectionStatus');
        
        if (gameState.digitalPlayerConnected) {
            statusElement.textContent = '🟢';
        } else {
            statusElement.textContent = '🔴';
        }
    }
    
    // Handle incoming events
    handleOpponentMove(move) {
        console.log('Opponent made move:', move);
        
        // Show the move to the user
        this.displayOpponentMove(move);
        
        // Update turn indicator (will be updated by game state change)
    }
    
    displayOpponentMove(move) {
        const moveCard = document.getElementById('opponentMoveCard');
        const moveSan = document.getElementById('opponentMoveSan');
        const moveFrom = document.getElementById('opponentMoveFrom');
        const moveTo = document.getElementById('opponentMoveTo');
        
        moveSan.textContent = move.san;
        moveFrom.textContent = move.from;
        moveTo.textContent = move.to;
        
        moveCard.classList.remove('hidden');
        
        // Hide after a delay
        setTimeout(() => {
            moveCard.classList.add('hidden');
        }, 10000); // 10 seconds
    }
    
    handleGameStateChange(gameState) {
        console.log('Game state changed:', gameState);
        
        switch (gameState.status) {
            case 'WAITING_FOR_PLAYERS':
                // Show waiting for opponent if digital player not connected
                if (!gameState.digitalPlayerConnected) {
                    this.showWaitingForOpponent();
                } else {
                    this.startCalibration();
                }
                break;
                
            case 'CALIBRATING':
                this.startCalibration();
                break;
                
            case 'ACTIVE':
                if (!this.gameActive) {
                    this.startActiveGame(gameState);
                } else {
                    this.updateGameUI(gameState);
                }
                break;
                
            case 'COMPLETED':
                this.handleGameEnd(gameState);
                break;
                
            case 'ERROR':
                this.showError('Game error occurred');
                break;
        }
    }
    
    handleFrameCaptured(result) {
        // Visual feedback for frame capture
        const indicator = document.getElementById('captureIndicator');
        if (indicator) {
            indicator.style.opacity = '0.5';
            setTimeout(() => {
                indicator.style.opacity = '1';
            }, 200);
        }
    }
    
    // Game controls
    pauseGame() {
        if (this.gameActive) {
            this.camera.stopPeriodicCapture();
            this.showToast('Game paused');
        }
    }
    
    showSettings() {
        // Load current settings
        const intervalSelect = document.getElementById('captureInterval');
        intervalSelect.value = this.camera.captureInterval.toString();
        
        const debugCheckbox = document.getElementById('debugMode');
        debugCheckbox.checked = window.CheckpointConfig.debug;
        
        document.getElementById('settingsModal').classList.remove('hidden');
    }
    
    hideSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }
    
    saveSettings() {
        const newInterval = parseInt(document.getElementById('captureInterval').value);
        this.camera.setCaptureInterval(newInterval);
        
        const debugMode = document.getElementById('debugMode').checked;
        window.CheckpointConfig.debug = debugMode;
        
        this.hideSettings();
        this.showToast('Settings saved');
    }
    
    // Utility methods
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
    
    setLoading(loading) {
        const button = document.getElementById('createGameBtn');
        if (loading) {
            button.disabled = true;
            button.textContent = 'Creating Game...';
        } else {
            button.disabled = false;
            button.textContent = 'Create Game';
        }
    }
    
    showCreateError(message) {
        const errorElement = document.getElementById('createError');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
    
    showCameraError(message) {
        const errorElement = document.getElementById('cameraError');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        document.getElementById('retryPermissionBtn').classList.remove('hidden');
    }
    
    hideCameraError() {
        document.getElementById('cameraError').classList.add('hidden');
        document.getElementById('retryPermissionBtn').classList.add('hidden');
    }
    
    showCameraPermissionError() {
        this.showCameraError('Camera permission denied. Please enable camera access and try again.');
    }
    
    showError(message) {
        // Simple error display for now
        alert('Error: ' + message);
        console.error('App Error:', message);
    }
    
    showToast(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #2c3e50;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 3000);
    }
    
    handleVisibilityChange() {
        if (this.appSync) {
            this.appSync.updateConnection(!document.hidden);
        }
        
        if (document.hidden && this.gameActive) {
            this.camera.stopPeriodicCapture();
        } else if (!document.hidden && this.gameActive) {
            this.camera.startPeriodicCapture(this.appSync);
        }
    }
    
    handleGameEnd(gameState) {
        this.gameActive = false;
        this.camera.stopPeriodicCapture();
        
        // Show game end notification
        this.showToast('Game completed!');
    }
    
    cleanup() {
        if (this.camera) {
            this.camera.stopCamera();
        }
        
        if (this.appSync) {
            this.appSync.updateConnection(false);
            this.appSync.disconnect();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new CheckpointPhysicalPlayer();
    window.physicalApp = app; // For debugging
});