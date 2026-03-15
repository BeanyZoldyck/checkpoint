// Camera management for physical board capture
class CameraManager {
    constructor() {
        this.stream = null;
        this.isActive = false;
        this.captureInterval = 3000; // 3 seconds default
        this.captureTimer = null;
        this.callbacks = {
            onFrame: null,
            onError: null,
            onPermissionDenied: null
        };
        
        this.constraints = {
            video: {
                facingMode: 'environment', // Back camera
                width: { ideal: 1920, max: 1920 },
                height: { ideal: 1440, max: 1440 }
            },
            audio: false
        };
    }
    
    // Request camera permission and start stream
    async startCamera(videoElement) {
        try {
            console.log('Requesting camera permission...');
            
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            
            if (videoElement) {
                videoElement.srcObject = this.stream;
                videoElement.play();
            }
            
            this.isActive = true;
            console.log('Camera started successfully');
            
            return this.stream;
            
        } catch (error) {
            console.error('Camera access failed:', error);
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                if (this.callbacks.onPermissionDenied) {
                    this.callbacks.onPermissionDenied(error);
                }
            } else if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
            
            throw error;
        }
    }
    
    // Stop camera stream
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }
        
        if (this.captureTimer) {
            clearInterval(this.captureTimer);
            this.captureTimer = null;
        }
        
        this.isActive = false;
        console.log('Camera stopped');
    }
    
    // Start periodic capture
    startPeriodicCapture(gameId, appSync) {
        if (this.captureTimer) {
            clearInterval(this.captureTimer);
        }
        
        this.captureTimer = setInterval(async () => {
            if (this.isActive && this.stream) {
                await this.captureFrame(gameId, appSync);
            }
        }, this.captureInterval);
        
        console.log(`Started periodic capture every ${this.captureInterval}ms`);
    }
    
    // Stop periodic capture
    stopPeriodicCapture() {
        if (this.captureTimer) {
            clearInterval(this.captureTimer);
            this.captureTimer = null;
        }
        console.log('Stopped periodic capture');
    }
    
    // Capture a single frame and send to server
    async captureFrame(gameId, appSync) {
        try {
            if (!this.stream || !this.isActive) {
                throw new Error('Camera not active');
            }
            
            // Create video element from stream
            const video = document.createElement('video');
            video.srcObject = this.stream;
            video.play();
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                video.onloadedmetadata = resolve;
            });
            
            // Create canvas and capture frame
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            
            // Convert to base64
            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            const base64Data = imageData.split(',')[1];
            
            // Send to AppSync
            if (appSync && gameId) {
                const result = await appSync.executeMutation(`
                    mutation UploadBoardImage($gameId: ID!, $imageData: String!) {
                        uploadBoardImage(gameId: $gameId, imageData: $imageData)
                    }
                `, {
                    gameId: gameId,
                    imageData: base64Data
                });
                
                console.log('Frame captured and uploaded:', result);
                
                if (this.callbacks.onFrame) {
                    this.callbacks.onFrame(result);
                }
            }
            
            // Clean up
            video.srcObject = null;
            
        } catch (error) {
            console.error('Failed to capture frame:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        }
    }
    
    // Capture frame for calibration
    async captureCalibrationFrame(videoElement) {
        try {
            if (!videoElement || !this.isActive) {
                throw new Error('Video element not available or camera not active');
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            
            return canvas.toDataURL('image/jpeg', 0.9);
            
        } catch (error) {
            console.error('Failed to capture calibration frame:', error);
            throw error;
        }
    }
    
    // Check if camera is supported
    static isCameraSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    
    // Get available camera devices
    static async getCameraDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'videoinput');
        } catch (error) {
            console.error('Failed to enumerate camera devices:', error);
            return [];
        }
    }
    
    // Switch to specific camera
    async switchCamera(deviceId, videoElement) {
        this.stopCamera();
        
        this.constraints.video.deviceId = { exact: deviceId };
        
        return this.startCamera(videoElement);
    }
    
    // Update capture interval
    setCaptureInterval(interval) {
        this.captureInterval = interval;
        console.log(`Capture interval updated to ${interval}ms`);
    }
    
    // Set callbacks
    onFrame(callback) {
        this.callbacks.onFrame = callback;
    }
    
    onError(callback) {
        this.callbacks.onError = callback;
    }
    
    onPermissionDenied(callback) {
        this.callbacks.onPermissionDenied = callback;
    }
    
    // Get camera status
    getStatus() {
        return {
            isActive: this.isActive,
            hasStream: !!this.stream,
            captureInterval: this.captureInterval,
            isCapturing: !!this.captureTimer
        };
    }
    
    // Take a manual snapshot
    async takeSnapshot(videoElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            
            // Create download link
            const link = document.createElement('a');
            link.download = `chess-board-${Date.now()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
            
            console.log('Snapshot saved');
            
        } catch (error) {
            console.error('Failed to take snapshot:', error);
            throw error;
        }
    }
    
    // Handle video element error events
    setupVideoErrorHandling(videoElement) {
        videoElement.addEventListener('error', (event) => {
            console.error('Video element error:', event);
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error('Video playback error'));
            }
        });
        
        videoElement.addEventListener('loadstart', () => {
            console.log('Video loading started');
        });
        
        videoElement.addEventListener('loadeddata', () => {
            console.log('Video data loaded');
        });
        
        videoElement.addEventListener('canplay', () => {
            console.log('Video can start playing');
        });
    }
}