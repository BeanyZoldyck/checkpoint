// Board calibration for computer vision perspective correction
class BoardCalibration {
    constructor() {
        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;
        this.corners = [];
        this.currentStep = 0;
        this.isComplete = false;
        
        this.callbacks = {
            onComplete: null,
            onError: null,
            onStepComplete: null
        };
        
        this.cornerLabels = [
            'Top-Left',
            'Top-Right', 
            'Bottom-Right',
            'Bottom-Left'
        ];
    }
    
    // Start the calibration process
    start(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        this.reset();
        this.setupCanvas();
        this.setupEventHandlers();
        
        console.log('Board calibration started');
    }
    
    // Set up canvas dimensions and styling
    setupCanvas() {
        const updateCanvasSize = () => {
            const rect = this.videoElement.getBoundingClientRect();
            this.canvasElement.width = rect.width;
            this.canvasElement.height = rect.height;
            this.canvasElement.style.width = rect.width + 'px';
            this.canvasElement.style.height = rect.height + 'px';
            
            this.redrawCorners();
        };
        
        // Update on video metadata load
        this.videoElement.addEventListener('loadedmetadata', updateCanvasSize);
        
        // Update on resize
        window.addEventListener('resize', updateCanvasSize);
        
        // Initial setup
        if (this.videoElement.videoWidth > 0) {
            updateCanvasSize();
        }
    }
    
    // Set up click event handlers for corner selection
    setupEventHandlers() {
        this.canvasElement.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
        
        // Touch support for mobile
        this.canvasElement.addEventListener('touchend', (event) => {
            event.preventDefault();
            const touch = event.changedTouches[0];
            const clickEvent = new MouseEvent('click', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleCanvasClick(clickEvent);
        });
    }
    
    // Handle canvas clicks for corner selection
    handleCanvasClick(event) {
        if (this.isComplete) return;
        
        const rect = this.canvasElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Convert to video coordinates (normalized 0-1)
        const videoX = x / rect.width;
        const videoY = y / rect.height;
        
        // Add corner
        this.addCorner(videoX, videoY);
        
        console.log(`Corner ${this.currentStep} selected: (${videoX.toFixed(3)}, ${videoY.toFixed(3)})`);
    }
    
    // Add a corner point
    addCorner(x, y) {
        if (this.currentStep >= 4) return;
        
        this.corners[this.currentStep] = { x, y };
        this.currentStep++;
        
        this.updateUI();
        this.redrawCorners();
        
        if (this.callbacks.onStepComplete) {
            this.callbacks.onStepComplete(this.currentStep, this.cornerLabels[this.currentStep - 1]);
        }
        
        if (this.currentStep >= 4) {
            this.completeCalibration();
        }
    }
    
    // Update progress UI
    updateUI() {
        // Update progress steps
        const progressSteps = document.querySelectorAll('.progress-step');
        progressSteps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            
            if (index < this.currentStep) {
                step.classList.add('completed');
            } else if (index === this.currentStep) {
                step.classList.add('active');
            }
        });
    }
    
    // Redraw corners on canvas
    redrawCorners() {
        if (!this.ctx) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw existing corners
        this.corners.forEach((corner, index) => {
            if (corner) {
                this.drawCorner(
                    corner.x * this.canvasElement.width,
                    corner.y * this.canvasElement.height,
                    index + 1
                );
            }
        });
        
        // Draw connecting lines if we have enough corners
        if (this.corners.length >= 2) {
            this.drawLines();
        }
    }
    
    // Draw a single corner marker
    drawCorner(x, y, number) {
        const radius = 15;
        
        // Draw outer circle
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(39, 174, 96, 0.8)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#27ae60';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Draw number
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(number.toString(), x, y);
    }
    
    // Draw connecting lines between corners
    drawLines() {
        if (this.corners.length < 2) return;
        
        this.ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        
        for (let i = 0; i < this.corners.length; i++) {
            if (!this.corners[i]) continue;
            
            const x = this.corners[i].x * this.canvasElement.width;
            const y = this.corners[i].y * this.canvasElement.height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        // Close the quadrilateral if we have 4 corners
        if (this.corners.length === 4 && this.corners[3]) {
            const x = this.corners[0].x * this.canvasElement.width;
            const y = this.corners[0].y * this.canvasElement.height;
            this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset dash
    }
    
    // Complete the calibration
    completeCalibration() {
        if (this.corners.length !== 4) {
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error('Need exactly 4 corners for calibration'));
            }
            return;
        }
        
        // Validate the quadrilateral
        if (!this.isValidQuadrilateral()) {
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error('Invalid quadrilateral. Please ensure corners form a proper rectangle.'));
            }
            return;
        }
        
        this.isComplete = true;
        
        const calibrationData = {
            corners: this.corners,
            timestamp: Date.now(),
            videoWidth: this.videoElement.videoWidth,
            videoHeight: this.videoElement.videoHeight,
            canvasWidth: this.canvasElement.width,
            canvasHeight: this.canvasElement.height
        };
        
        console.log('Calibration completed:', calibrationData);
        
        if (this.callbacks.onComplete) {
            this.callbacks.onComplete(calibrationData);
        }
    }
    
    // Validate that the corners form a reasonable quadrilateral
    isValidQuadrilateral() {
        if (this.corners.length !== 4) return false;
        
        // Check that no two corners are too close
        const minDistance = 0.1; // 10% of video dimensions
        
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                const dx = this.corners[i].x - this.corners[j].x;
                const dy = this.corners[i].y - this.corners[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < minDistance) {
                    return false;
                }
            }
        }
        
        // Check that corners are roughly in the right order (clockwise from top-left)
        const [tl, tr, br, bl] = this.corners;
        
        // Top-left should be upper-left
        if (tl.x > tr.x || tl.y > bl.y) return false;
        
        // Top-right should be upper-right
        if (tr.x < tl.x || tr.y > br.y) return false;
        
        // Bottom-right should be lower-right
        if (br.x < bl.x || br.y < tr.y) return false;
        
        // Bottom-left should be lower-left
        if (bl.x > tl.x || bl.y < bl.y) return false;
        
        return true;
    }
    
    // Reset calibration
    reset() {
        this.corners = [];
        this.currentStep = 0;
        this.isComplete = false;
        
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        
        this.updateUI();
        
        console.log('Calibration reset');
    }
    
    // Get calibration data
    getCalibrationData() {
        if (!this.isComplete) {
            throw new Error('Calibration not complete');
        }
        
        return {
            corners: this.corners,
            timestamp: Date.now(),
            videoWidth: this.videoElement.videoWidth,
            videoHeight: this.videoElement.videoHeight
        };
    }
    
    // Estimate perspective transform matrix
    getPerspectiveTransform() {
        if (!this.isComplete) {
            throw new Error('Calibration not complete');
        }
        
        // This is a simplified version - in a real implementation,
        // you'd calculate the full perspective transformation matrix
        const [tl, tr, br, bl] = this.corners;
        
        return {
            topLeft: tl,
            topRight: tr,
            bottomRight: br,
            bottomLeft: bl,
            width: Math.max(
                this.distance(tl, tr),
                this.distance(bl, br)
            ),
            height: Math.max(
                this.distance(tl, bl),
                this.distance(tr, br)
            )
        };
    }
    
    // Calculate distance between two points
    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Set callbacks
    onComplete(callback) {
        this.callbacks.onComplete = callback;
    }
    
    onError(callback) {
        this.callbacks.onError = callback;
    }
    
    onStepComplete(callback) {
        this.callbacks.onStepComplete = callback;
    }
    
    // Get current status
    getStatus() {
        return {
            currentStep: this.currentStep,
            totalSteps: 4,
            isComplete: this.isComplete,
            corners: this.corners,
            nextCorner: this.currentStep < 4 ? this.cornerLabels[this.currentStep] : null
        };
    }
}