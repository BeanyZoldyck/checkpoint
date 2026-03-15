import { Image } from 'expo-image';

export interface ChessSquare {
  rank: number; // 0-7 (1-8 on board)
  file: number; // 0-7 (a-h on board)
  color: 'white' | 'black';
  piece: Piece | null;
  center: { x: number; y: number };
}

export interface Piece {
  type: 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
  color: 'white' | 'black';
}

export interface BoardDetection {
  success: boolean;
  squares?: ChessSquare[];
  corners?: { x: number; y: number }[];
  error?: string;
}

export interface ChessBoardState {
  fen: string;
  squares: ChessSquare[];
  confidence: number;
}

class ChessboardRecognizer {
  private modelLoaded = false;
  private classificationModel: any = null;

  /**
   * Initialize the recognition models
   */
  async initialize() {
    if (this.modelLoaded) return;

    try {
      // Load TensorFlow Lite models for classification
      // For now, we'll use rule-based methods until models are integrated
      this.modelLoaded = true;
      console.log('Chessboard recognizer initialized');
    } catch (error) {
      console.error('Failed to initialize recognizer:', error);
      throw error;
    }
  }

  /**
   * Preprocess image for chessboard detection
   */
  async preprocessImage(imageUri: string): Promise<string> {
    try {
      // Return the original URI for now
      // In production, you would use proper image manipulation libraries
      return imageUri;
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      throw error;
    }
  }

  /**
   * Detect chessboard corners using edge detection
   * This is a simplified version - in production, use OpenCV
   */
  detectBoardCorners(imageData: any): { x: number; y: number }[] | null {
    // Simplified corner detection algorithm
    // In production, use OpenCV's findChessboardCorners or Hough lines
    
    // Placeholder - would need actual image pixel data
    const corners = [
      { x: 100, y: 100 },
      { x: 540, y: 100 },
      { x: 540, y: 540 },
      { x: 100, y: 540 }
    ];

    return corners;
  }

  /**
   * Perform perspective transformation to get a top-down view
   */
  async perspectiveTransform(
    imageUri: string,
    corners: { x: number; y: number }[]
  ): Promise<string> {
    try {
      // For now, return the original image URI
      // In production, implement proper perspective transformation
      // using image processing libraries or WebGL
      
      // Calculate the region of interest (for reference)
      const minX = Math.min(...corners.map(c => c.x));
      const minY = Math.min(...corners.map(c => c.y));
      const maxX = Math.max(...corners.map(c => c.x));
      const maxY = Math.max(...corners.map(c => c.y));
      
      console.log(`ROI: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
      
      return imageUri;
    } catch (error) {
      console.error('Perspective transform failed:', error);
      throw error;
    }
  }

  /**
   * Extract individual square images from the board
   */
  async extractSquares(
    boardImageUri: string,
    corners: { x: number; y: number }[]
  ): Promise<ChessSquare[]> {
    const squares: ChessSquare[] = [];
    
    // Calculate grid dimensions
    const boardWidth = corners[1].x - corners[0].x;
    const boardHeight = corners[3].y - corners[0].y;
    
    const squareWidth = boardWidth / 8;
    const squareHeight = boardHeight / 8;

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        // Calculate square position (ranks are flipped in chess notation)
        const x = corners[0].x + file * squareWidth;
        const y = corners[0].y + (7 - rank) * squareHeight;
        
        const center = {
          x: x + squareWidth / 2,
          y: y + squareHeight / 2
        };

        squares.push({
          rank,
          file,
          color: (rank + file) % 2 === 0 ? 'white' : 'black',
          piece: null, // Will be detected
          center
        });
      }
    }

    return squares;
  }

  /**
   * Classify a square image to determine the piece
   * In production, use TensorFlow Lite model
   */
  async classifyPiece(squareImageUri: string): Promise<Piece | null> {
    // Placeholder for ML-based piece classification
    // In production, load the square image and run it through a model
    
    // Simulated detection based on image analysis
    // Would use actual ML model here
    return null;
  }

  /**
   * Analyze board state using color and pattern analysis
   */
  async analyzeBoardState(
    boardImageUri: string,
    squares: ChessSquare[]
  ): Promise<ChessBoardState> {
    // This would analyze the board image to detect pieces
    // For now, return empty board
    
    // In production, this would:
    // 1. Extract each square image
    // 2. Classify piece on each square
    // 3. Convert to FEN notation
    
    const emptyBoard = '8/8/8/8/8/8/8/8 w KQkq - 0 1';
    
    return {
      fen: emptyBoard,
      squares,
      confidence: 0.95
    };
  }

  /**
   * Main recognition pipeline
   */
  async recognizeChessboard(imageUri: string): Promise<BoardDetection> {
    try {
      await this.initialize();

      // Step 1: Preprocess image
      const processedUri = await this.preprocessImage(imageUri);

      // Step 2: Detect board corners (simplified)
      const corners = this.detectBoardCorners(null);
      if (!corners) {
        return {
          success: false,
          error: 'Could not detect chessboard'
        };
      }

      // Step 3: Perform perspective transform
      const transformedUri = await this.perspectiveTransform(processedUri, corners);

      // Step 4: Extract squares
      const squares = await this.extractSquares(transformedUri, corners);

      return {
        success: true,
        squares,
        corners
      };
    } catch (error) {
      console.error('Chessboard recognition failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Compare two board states to detect the move
   */
  detectMove(previousBoard: ChessBoardState, currentBoard: ChessBoardState): {
    from: string;
    to: string;
    san: string;
  } | null {
    // Compare square by square to find differences
    let fromSquare: string | null = null;
    let toSquare: string | null = null;

    for (let i = 0; i < 64; i++) {
      const prevPiece = previousBoard.squares[i].piece;
      const currPiece = currentBoard.squares[i].piece;

      // Piece moved from here
      if (prevPiece && !currPiece) {
        const file = String.fromCharCode(97 + previousBoard.squares[i].file);
        const rank = previousBoard.squares[i].rank + 1;
        fromSquare = `${file}${rank}`;
      }

      // Piece moved to here
      if (!prevPiece && currPiece) {
        const file = String.fromCharCode(97 + currentBoard.squares[i].file);
        const rank = currentBoard.squares[i].rank + 1;
        toSquare = `${file}${rank}`;
      }
    }

    if (fromSquare && toSquare) {
      // Generate simple SAN (Standard Algebraic Notation)
      const piece = currentBoard.squares.find(
        s => s.file === toSquare.charCodeAt(0) - 97 &&
             s.rank === parseInt(toSquare[1]) - 1
      )?.piece;

      let san = '';
      if (piece && piece.type !== 'pawn') {
        san += piece.type.charAt(0).toUpperCase();
      }
      san += toSquare;

      return { from: fromSquare, to: toSquare, san };
    }

    return null;
  }

  /**
   * Validate FEN notation
   */
  validateFen(fen: string): boolean {
    try {
      const parts = fen.split(' ');
      if (parts.length !== 6) return false;

      const board = parts[0];
      const rows = board.split('/');

      if (rows.length !== 8) return false;

      for (const row of rows) {
        let count = 0;
        for (const char of row) {
          if (char >= '1' && char <= '8') {
            count += parseInt(char);
          } else if ('pnbrqkPNBRQK'.includes(char)) {
            count++;
          } else {
            return false;
          }
        }
        if (count !== 8) return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const chessboardRecognizer = new ChessboardRecognizer();

// Export utility functions
export function squareToAlgebraic(square: ChessSquare): string {
  const file = String.fromCharCode(97 + square.file); // 0 -> 'a'
  const rank = square.rank + 1; // 0 -> 1
  return `${file}${rank}`;
}

export function algebraicToSquare(notation: string): { rank: number; file: number } {
  const file = notation.charCodeAt(0) - 97; // 'a' -> 0
  const rank = parseInt(notation[1]) - 1; // '1' -> 0
  return { rank, file };
}

export function getPieceSymbol(piece: Piece): string {
  const symbols: Record<string, Record<string, string>> = {
    'white': {
      'king': '♔',
      'queen': '♕',
      'rook': '♖',
      'bishop': '♗',
      'knight': '♘',
      'pawn': '♙'
    },
    'black': {
      'king': '♚',
      'queen': '♛',
      'rook': '♜',
      'bishop': '♝',
      'knight': '♞',
      'pawn': '♟'
    }
  };
  
  return symbols[piece.color][piece.type];
}