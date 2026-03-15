# ChessLink - Jac Chess Application

A full-featured chess application built with the Jaseci stack. Play chess immediately with an AI opponent - no setup required!

## Features Implemented

### ✅ Core Components

1. **Interactive Chess Board** - Drag-and-drop pieces with beautiful UI
2. **AI Opponent** - Smart opponent that makes random legal moves
3. **Real-time Game State** - Live move validation and game status
4. **Chess Rules** - Full chess rules using chess.js library
5. **Move History** - Complete game tracking with algebraic notation

### ✅ User Interfaces

- **Game Lobby**: Create/join games with tabs for different player types
- **Digital Chessboard**: Drag-and-drop pieces with move highlighting
- **Camera Setup**: Board calibration and streaming interface
- **Game Management**: Move history, player status, game controls

### ✅ Chess Features

- Full chess piece set with Unicode symbols
- Drag-and-drop move interface
- Move validation using chess.js
- Game state tracking (check, checkmate, stalemate)
- Move history with algebraic notation
- Player turn management

## Architecture

Built using Jac (Jaseci) with:
- **Frontend**: Jac client-side components with JSX
- **Chess Logic**: chess.js for game rules and validation  
- **UI Components**: Jac-shadcn component library
- **Styling**: Tailwind CSS
- **State Management**: React-style hooks and state

## Project Structure

```
web/
├── components/
│   ├── chess/
│   │   ├── ChessGame.cl.jac      # Main game interface
│   │   ├── Chessboard.cl.jac     # Interactive chessboard
│   │   ├── ChessPiece.cl.jac     # Chess piece component
│   │   ├── GameLobby.cl.jac      # Game creation/join
│   │   └── CameraCapture.cl.jac  # Camera interface
│   └── ui/                        # UI component library
├── lib/
│   └── chess.cl.jac              # Chess game logic
├── main.jac                      # Main application
└── jac.toml                      # Project configuration
```

## Running the Application

1. Install dependencies:
   ```bash
   jac install
   ```

2. Start the development server:
   ```bash
   jac start main.jac
   ```

3. Open browser to: `http://localhost:8001`

## How to Play

1. **Start the server** (see instructions below)
2. **Open browser** to `http://localhost:8001`
3. **Play immediately** - the chess board loads instantly!

### Game Features:
- **Drag & Drop**: Click and drag pieces to move them
- **Auto-Validation**: Only legal moves are allowed
- **AI Opponent**: Computer makes moves every 2-8 seconds
- **Move History**: See all moves in chess notation
- **Game Status**: Check, checkmate, and draw detection
- **New Game**: Click "New Game" button to restart

## Implementation Notes

- **Mock Backend**: Currently uses mock WebSocket and API calls
- **Chess.js Integration**: Handles all chess rule validation
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: Mock implementation shows live game state
- **Camera Features**: Simulated board detection and move capture

## Future Enhancements

The current implementation provides a complete frontend foundation. To match the full PRD:

1. **AWS Integration**: Replace mocks with real API Gateway and Lambda
2. **Computer Vision**: Implement actual board detection with ML models
3. **WebSocket Backend**: Real WebSocket server for live communication
4. **User Authentication**: Add player accounts and game persistence
5. **Advanced Features**: Draw offers, time controls, game analysis

## Dependencies

- `chess.js`: Chess game logic and validation
- `jac-client-node`: Jac frontend framework
- `shadcn components`: UI component library
- `tailwind`: CSS framework

Built with ❤️ using the Jaseci stack.