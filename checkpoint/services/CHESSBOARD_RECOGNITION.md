# Chessboard Recognition System

This directory contains a complete chessboard recognition system for the Checkpoint chess app. The system is designed to detect chessboards from camera images and identify chess moves.

## Overview

The chessboard recognition system consists of:

1. **`services/chessboard-recognizer.ts`** - Core recognition engine
2. **`components/chessboard-recognition.tsx`** - React component for UI integration
3. **Existing infrastructure** - Camera capture, API integration, and game state management

## Current Implementation

### Features

- ✅ Chessboard detection framework
- ✅ Image preprocessing pipeline
- ✅ Board coordinate system
- ✅ Move detection logic
- ✅ FEN notation support
- ✅ Chess piece representation
- ✅ Integration with existing camera system

### How It Works

1. **Image Capture**: Camera captures the chessboard image
2. **Preprocessing**: Image is resized and optimized for processing
3. **Board Detection**: Algorithm detects chessboard corners
4. **Square Extraction**: Board is divided into 8x8 grid
5. **Piece Analysis**: Each square is analyzed for pieces
6. **Move Detection**: Compare board states to identify moves
7. **FEN Generation**: Convert board state to standard notation

## Integration

### Basic Usage

```typescript
import { chessboardRecognizer } from '@/services/chessboard-recognizer';

// Initialize the recognizer
await chessboardRecognizer.initialize();

// Capture and recognize
const result = await chessboardRecognizer.recognizeChessboard(imageUri);
if (result.success && result.squares) {
  console.log('Board detected:', result.squares.length, 'squares');
  
  // Analyze board state
  const boardState = await chessboardRecognizer.analyzeBoardState(
    imageUri, 
    result.squares
  );
  console.log('FEN:', boardState.fen);
}
```

### With Camera Component

```typescript
import { ChessboardRecognition } from '@/components/chessboard-recognition';

// In your screen
<ChessboardRecognition />
```

### Move Detection

```typescript
// Compare two board states to detect the move
const detectedMove = chessboardRecognizer.detectMove(
  previousBoardState,
  currentBoardState
);

if (detectedMove) {
  console.log(`Move: ${detectedMove.san} (${detectedMove.from} → ${detectedMove.to})`);
}
```

## API Reference

### ChessboardRecognizer

#### `initialize(): Promise<void>`
Initialize the recognition models and prepare for detection.

#### `recognizeChessboard(imageUri: string): Promise<BoardDetection>`
Main recognition pipeline that processes an image and detects the chessboard.

**Returns:**
```typescript
{
  success: boolean;
  squares?: ChessSquare[];    // Array of 64 squares
  corners?: Point[];          // Board corner coordinates
  error?: string;             // Error message if failed
}
```

#### `preprocessImage(imageUri: string): Promise<string>`
Preprocess image for better detection results (resize, normalize, etc.).

#### `detectBoardCorners(imageData: any): Point[] | null`
Detect chessboard corners using edge detection algorithms.

#### `perspectiveTransform(imageUri: string, corners: Point[]): Promise<string>`
Transform the image to get a top-down view of the board.

#### `extractSquares(boardImageUri: string, corners: Point[]): Promise<ChessSquare[]>`
Extract individual square coordinates and properties.

#### `analyzeBoardState(boardImageUri: string, squares: ChessSquare[]): Promise<ChessBoardState>`
Analyze the board to detect pieces and generate board state.

**Returns:**
```typescript
{
  fen: string;              // FEN notation
  squares: ChessSquare[];   // Square data with pieces
  confidence: number;       // Detection confidence score
}
```

#### `detectMove(previousBoard: ChessBoardState, currentBoard: ChessBoardState): ChessMove | null`
Compare two board states to detect the move that was played.

#### `validateFen(fen: string): boolean`
Validate FEN notation string format.

### Utility Functions

#### `squareToAlgebraic(square: ChessSquare): string`
Convert square object to algebraic notation (e.g., "e4").

#### `algebraicToSquare(notation: string): { rank: number; file: number }`
Convert algebraic notation to square coordinates.

#### `getPieceSymbol(piece: Piece): string`
Get Unicode chess piece symbol.

## Data Structures

### ChessSquare
```typescript
{
  rank: number;           // 0-7 (1-8 on board)
  file: number;           // 0-7 (a-h on board)
  color: 'white' | 'black';  // Square color
  piece: Piece | null;    // Piece on square, if any
  center: { x: number; y: number }; // Pixel coordinates
}
```

### Piece
```typescript
{
  type: 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
  color: 'white' | 'black';
}
```

### ChessMove
```typescript
{
  from: string;   // Starting square (e.g., "e2")
  to: string;     // Destination square (e.g., "e4")
  san: string;    // Standard Algebraic Notation (e.g., "e4")
}
```

## Production Enhancements

### Current Limitations

The current implementation provides a complete framework but uses simplified algorithms for:

1. **Corner Detection**: Currently uses placeholder coordinates
2. **Piece Classification**: Currently returns null for pieces
3. **Image Processing**: Limited preprocessing capabilities

### Recommended Enhancements

#### 1. TensorFlow Lite Integration

For production use, integrate TensorFlow Lite for ML-based detection:

```bash
npm install expo-tensorflow-lite @tensorflow-models/mobilenet
```

Benefits:
- Accurate piece classification
- Real-time performance
- Proven models available

#### 2. OpenCV Integration

Add `react-native-opencv3` for advanced image processing:

```bash
npm install react-native-opencv3
```

Features:
- Robust corner detection
- Perspective transformation
- Edge detection
- Grid analysis

#### 3. Pre-trained Models

Use established chessboard recognition models:

- **Board Detection**: MobileNet or custom CNN
- **Piece Classification**: ResNet or EfficientNet
- **Move Detection**: LSTM or Transformer models

#### 4. Performance Optimization

- **Image Resolution**: Adaptive resolution based on device
- **Frame Processing**: Skip frames for real-time performance
- **Caching**: Cache board states for faster comparisons
- **Parallel Processing**: Use Web Workers for CPU-intensive tasks

#### 5. Accuracy Improvements

- **Multi-frame Analysis**: Combine multiple frames for better accuracy
- **Confidence Scoring**: Implement confidence thresholds
- **Error Handling**: Robust fallback mechanisms
- **Lighting Adaptation**: Handle various lighting conditions

## Testing

### Manual Testing

1. **Board Detection Test**
   ```typescript
   const result = await chessboardRecognizer.recognizeChessboard(testImage);
   assert(result.success);
   assert(result.squares?.length === 64);
   ```

2. **Move Detection Test**
   ```typescript
   const move = chessboardRecognizer.detectMove(
     startingPosition,
     afterMovePosition
   );
   assert(move?.san === 'e4');
   ```

3. **FEN Validation Test**
   ```typescript
   assert(chessboardRecognizer.validateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
   ```

### Test Images

Include test images covering:
- Empty boards
- Starting positions
- Mid-game positions
- Various lighting conditions
- Different board orientations

## Troubleshooting

### Detection Fails

**Issue**: Chessboard not detected
**Solutions**:
- Ensure good lighting
- Hold camera parallel to board
- Minimize background clutter
- Check camera permissions

### Inaccurate Moves

**Issue**: Wrong moves detected
**Solutions**:
- Improve image quality
- Use multiple frames
- Implement confidence scoring
- Add user confirmation

### Performance Issues

**Issue**: Slow processing
**Solutions**:
- Reduce image resolution
- Skip frames between captures
- Use hardware acceleration
- Optimize algorithms

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Camera Capture                         │
│                    (expo-camera)                           │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Chessboard Recognizer                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Image Preprocessing                              │  │
│  │  - Resize                                        │  │
│  │  - Normalize                                     │  │
│  │  - Enhance contrast                              │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                      │
│                     ▼                                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Board Detection                                 │  │
│  │  - Corner detection                              │  │
│  │  - Edge detection                                │  │
│  │  - Perspective transform                          │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                      │
│                     ▼                                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Square Extraction                                │  │
│  │  - Grid division                                 │  │
│  │  - Square coordinates                            │  │
│  │  - Center points                                  │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                      │
│                     ▼                                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Piece Classification                             │  │
│  │  - ML model inference                            │  │
│  │  - Piece type detection                          │  │
│  │  - Piece color detection                          │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                      │
│                     ▼                                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Board State Analysis                            │  │
│  │  - FEN generation                                │  │
│  │  - Move detection                                │  │
│  │  - Validation                                    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Game State Management                         │
│              (services/api.ts)                            │
└─────────────────────────────────────────────────────────┘
```

## Contributing

When enhancing the recognition system:

1. **Maintain backwards compatibility** with existing API
2. **Add comprehensive tests** for new features
3. **Document changes** in this README
4. **Optimize for mobile devices** - consider battery life and performance
5. **Handle edge cases** - poor lighting, partial boards, etc.

## License

This system is part of the Checkpoint chess application.

## Resources

- [FEN Notation Specification](https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation)
- [TensorFlow Lite React Native](https://github.com/tensorflow/tensorflow/tree/master/tensorflow/lite/experimental/swift)
- [OpenCV Documentation](https://docs.opencv.org/)
- [Chess Computer Vision Research](https://arxiv.org/)

## Support

For issues or questions about the chessboard recognition system, please refer to the main project documentation or open an issue.