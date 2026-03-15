#!/usr/bin/env node

/**
 * Checkpoint Real-time Test Server
 * 
 * This simulates the AWS AppSync backend for testing real-time messaging
 * between the mobile PWA and digital player web app.
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve static files for both web apps
app.use('/physical', express.static('./chess-link/web-clients/physical-player'));
app.use('/digital', express.static('./chess-link/web-clients/digital-player'));

// In-memory game storage (simulates DynamoDB)
const games = new Map();
const connections = new Map(); // gameId -> { physical: socketId, digital: socketId }

// Generate random 6-character join code
function generateJoinCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Game management endpoints (simulates AppSync mutations)
app.post('/api/createGame', (req, res) => {
  const { physicalPlayerColor } = req.body;
  const gameId = Math.random().toString(36).substr(2, 9);
  const joinCode = generateJoinCode();
  
  const game = {
    id: gameId,
    joinCode,
    status: 'WAITING_FOR_DIGITAL_PLAYER',
    physicalPlayerColor,
    digitalPlayerColor: physicalPlayerColor === 'WHITE' ? 'BLACK' : 'WHITE',
    currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    currentTurn: 'WHITE',
    moveHistory: [],
    physicalPlayerConnected: false,
    digitalPlayerConnected: false,
    createdAt: new Date().toISOString()
  };
  
  games.set(gameId, game);
  
  console.log(`🎮 Game created: ${joinCode} (${gameId})`);
  res.json(game);
});

app.post('/api/joinGame', (req, res) => {
  const { joinCode } = req.body;
  
  const game = Array.from(games.values()).find(g => g.joinCode === joinCode);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  game.status = 'ACTIVE';
  game.digitalPlayerConnected = true;
  
  console.log(`🎲 Player joined game: ${joinCode}`);
  res.json(game);
});

app.post('/api/makeMove', (req, res) => {
  const { gameId, from, to, playerType } = req.body;
  
  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const moveId = Math.random().toString(36).substr(2, 9);
  const move = {
    id: moveId,
    gameId,
    from,
    to,
    san: `${from}-${to}`, // Simplified notation
    playerType,
    timestamp: new Date().toISOString()
  };
  
  game.moveHistory.push(move.san);
  game.currentTurn = game.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE';
  
  // Broadcast to both players
  const gameConnections = connections.get(gameId);
  if (gameConnections) {
    const event = {
      type: 'MOVE_MADE',
      gameId,
      move,
      gameState: game,
      timestamp: new Date().toISOString()
    };
    
    if (gameConnections.physical) {
      io.to(gameConnections.physical).emit('gameEvent', event);
    }
    if (gameConnections.digital) {
      io.to(gameConnections.digital).emit('gameEvent', event);
    }
    
    console.log(`📱 Move broadcast: ${from}→${to} by ${playerType}`);
  }
  
  res.json(move);
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('joinGameRoom', ({ gameId, playerType }) => {
    socket.join(gameId);
    
    if (!connections.has(gameId)) {
      connections.set(gameId, {});
    }
    
    const gameConnections = connections.get(gameId);
    gameConnections[playerType] = socket.id;
    
    console.log(`👤 ${playerType} player connected to game ${gameId}`);
    
    // Notify connection status change
    const game = games.get(gameId);
    if (game) {
      if (playerType === 'physical') {
        game.physicalPlayerConnected = true;
      } else {
        game.digitalPlayerConnected = true;
      }
      
      const event = {
        type: 'PLAYER_CONNECTED',
        gameId,
        gameState: game,
        message: `${playerType} player connected`,
        timestamp: new Date().toISOString()
      };
      
      socket.broadcast.to(gameId).emit('gameEvent', event);
    }
  });
  
  socket.on('testMessage', (data) => {
    console.log('📨 Test message:', data);
    socket.broadcast.emit('testResponse', {
      original: data,
      response: 'Message received!',
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
    
    // Remove from connections
    for (const [gameId, gameConnections] of connections) {
      if (gameConnections.physical === socket.id) {
        gameConnections.physical = null;
        
        const game = games.get(gameId);
        if (game) {
          game.physicalPlayerConnected = false;
          const event = {
            type: 'PLAYER_DISCONNECTED',
            gameId,
            gameState: game,
            message: 'Physical player disconnected',
            timestamp: new Date().toISOString()
          };
          socket.broadcast.to(gameId).emit('gameEvent', event);
        }
      }
      
      if (gameConnections.digital === socket.id) {
        gameConnections.digital = null;
        
        const game = games.get(gameId);
        if (game) {
          game.digitalPlayerConnected = false;
          const event = {
            type: 'PLAYER_DISCONNECTED',
            gameId,
            gameState: game,
            message: 'Digital player disconnected',
            timestamp: new Date().toISOString()
          };
          socket.broadcast.to(gameId).emit('gameEvent', event);
        }
      }
    }
  });
});

// Test endpoints
app.get('/', (req, res) => {
  res.send(`
    <h1>♟️ Checkpoint Real-time Test Server</h1>
    <p>WebSocket server running for testing real-time chess communication.</p>
    <h2>Test Links:</h2>
    <ul>
      <li><a href="/physical" target="_blank">📱 Physical Player (Mobile PWA)</a></li>
      <li><a href="/digital" target="_blank">💻 Digital Player (Web App)</a></li>
    </ul>
    <h2>Active Games:</h2>
    <pre id="games">${JSON.stringify(Array.from(games.values()), null, 2)}</pre>
    <script>
      // Auto-refresh game list every 2 seconds
      setInterval(() => {
        fetch('/api/games').then(r => r.json()).then(data => {
          document.getElementById('games').textContent = JSON.stringify(data, null, 2);
        });
      }, 2000);
    </script>
  `);
});

app.get('/api/games', (req, res) => {
  res.json(Array.from(games.values()));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
♟️ Checkpoint Real-time Test Server Running!

🌐 Server: http://localhost:${PORT}
📱 Physical Player: http://localhost:${PORT}/physical
💻 Digital Player: http://localhost:${PORT}/digital

Ready to test real-time messaging between mobile PWA and web app!
  `);
});