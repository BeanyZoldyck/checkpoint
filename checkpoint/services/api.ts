// ============================================================================
// Checkpoint API Service with AWS AppSync Integration
//
// Connects to AWS AppSync for real-time chess gameplay
// ============================================================================

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

// AppSync configuration - will be set dynamically
let appSyncConfig: {
  aws_appsync_graphqlEndpoint?: string;
  aws_appsync_region?: string;
  aws_appsync_authenticationType?: string;
  aws_appsync_apiKey?: string;
} = {};

// Configure AWS AppSync
export function configureAWS(config: typeof appSyncConfig) {
  appSyncConfig = config;
  
  Amplify.configure({
    API: {
      GraphQL: {
        endpoint: config.aws_appsync_graphqlEndpoint!,
        region: config.aws_appsync_region!,
        defaultAuthMode: 'apiKey',
        apiKey: config.aws_appsync_apiKey!,
      }
    }
  });
}

const client = generateClient();

const STUB_MODE = !appSyncConfig.aws_appsync_graphqlEndpoint;

// --- Stubbed move sequences for demo purposes ---
const STUB_OPPONENT_MOVES = [
  { from: 'e7', to: 'e5', san: 'e5' },
  { from: 'b8', to: 'c6', san: 'Nc6' },
  { from: 'g8', to: 'f6', san: 'Nf6' },
];
let stubMoveIndex = 0;

const STUB_DETECTED_MOVES = [
  { from: 'e2', to: 'e4', san: 'e4' },
  { from: 'g1', to: 'f3', san: 'Nf3' },
  { from: 'f1', to: 'b5', san: 'Bb5' },
];
let stubDetectIndex = 0;

// --- Types ---

export interface ChessMove {
  from: string; // e.g. 'e2'
  to: string;   // e.g. 'e4'
  san: string;  // e.g. 'e4', 'Nf3'
}

export interface MoveResponse {
  success: boolean;
  detectedMove?: ChessMove;
  error?: string;
}

export interface GameState {
  gameId: string;
  joinCode?: string;
  status: 'waiting' | 'active' | 'finished';
  currentTurn: 'white' | 'black';
  state: string; // FEN notation
  lastMove?: ChessMove;
  winner?: 'white' | 'black' | 'draw';
  createdAt: string;
  updatedAt: string;
}

export interface JoinGameResponse {
  success: boolean;
  game?: GameState;
  playerId?: string;
  error?: string;
}

// --- Image Upload ---

// GraphQL mutations and queries
const UPLOAD_IMAGE_MUTATION = `
  mutation UploadImage($gameId: ID!, $playerId: ID!, $imageKey: String!) {
    uploadImage(gameId: $gameId, playerId: $playerId, imageKey: $imageKey) {
      success
      detectedMove {
        from
        to
        san
      }
      error
    }
  }
`;

export async function uploadBoardImage(imageUri: string, gameId: string, playerId: string): Promise<MoveResponse> {
  if (STUB_MODE) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1200));
    console.log('[STUB] Would upload image to AWS:', imageUri);

    const move = STUB_DETECTED_MOVES[stubDetectIndex % STUB_DETECTED_MOVES.length];
    stubDetectIndex++;

    return { success: true, detectedMove: move };
  }

  try {
    // In a real implementation, you would first upload the image to S3
    // For now, we'll use a placeholder image key
    const imageKey = `game-${gameId}/move-${Date.now()}.jpg`;

    const result = await client.graphql({
      query: UPLOAD_IMAGE_MUTATION,
      variables: { gameId, playerId, imageKey }
    });

    return result.data.uploadImage;
  } catch (error) {
    console.error('Error uploading board image:', error);
    return { success: false, error: 'Upload failed' };
  }
}

// --- AppSync Subscriptions for Real-time Updates ---

const GAME_UPDATES_SUBSCRIPTION = `
  subscription OnGameUpdated($gameId: ID!) {
    onGameUpdated(gameId: $gameId) {
      gameId
      state
      currentTurn
      lastMove {
        from
        to
        san
      }
      winner
      status
      updatedAt
    }
  }
`;

export function subscribeToGameUpdates(
  gameId: string,
  onOpponentMove: (move: ChessMove) => void,
  onStatusChange?: (status: 'connected' | 'disconnected') => void,
): () => void {
  if (STUB_MODE) {
    console.log('[STUB] Would subscribe to AppSync for game:', gameId);
    onStatusChange?.('connected');

    // Simulate opponent responding ~5s after connection
    const timer = setTimeout(() => {
      const move = STUB_OPPONENT_MOVES[stubMoveIndex % STUB_OPPONENT_MOVES.length];
      stubMoveIndex++;
      console.log('[STUB] Simulating opponent move:', move.san);
      onOpponentMove(move);
    }, 5000);

    return () => {
      clearTimeout(timer);
      onStatusChange?.('disconnected');
    };
  }

  try {
    onStatusChange?.('connected');
    
    const subscription = client.graphql({
      query: GAME_UPDATES_SUBSCRIPTION,
      variables: { gameId }
    }).subscribe({
      next: (data) => {
        const gameUpdate = data.data?.onGameUpdated;
        if (gameUpdate?.lastMove) {
          onOpponentMove(gameUpdate.lastMove);
        }
      },
      error: (error) => {
        console.error('Subscription error:', error);
        onStatusChange?.('disconnected');
      }
    });

    return () => {
      subscription.unsubscribe();
      onStatusChange?.('disconnected');
    };
  } catch (error) {
    console.error('Error setting up subscription:', error);
    onStatusChange?.('disconnected');
    return () => {};
  }
}

// --- Game Management Functions ---

const CREATE_GAME_MUTATION = `
  mutation CreateGame($playerId: ID!) {
    createGame(playerId: $playerId) {
      gameId
      joinCode
      playerId
      playerRole
    }
  }
`;

const JOIN_GAME_MUTATION = `
  mutation JoinGame($joinCode: String!, $playerId: ID!) {
    joinGame(joinCode: $joinCode, playerId: $playerId) {
      success
      gameId
      playerId
      playerRole
      error
    }
  }
`;

const GET_GAME_QUERY = `
  query GetGame($gameId: ID!) {
    getGame(gameId: $gameId) {
      gameId
      joinCode
      status
      currentTurn
      state
      lastMove {
        from
        to
        san
      }
      winner
      createdAt
      updatedAt
    }
  }
`;

const REGISTER_PUSH_TOKEN_MUTATION = `
  mutation RegisterPushToken($gameId: ID!, $playerId: ID!, $pushToken: String!, $playerColor: PlayerColor) {
    registerPushToken(gameId: $gameId, playerId: $playerId, pushToken: $pushToken, playerColor: $playerColor) {
      success
      message
      error
    }
  }
`;

export async function createGame(playerId: string): Promise<{ gameId: string; joinCode: string; playerId: string } | null> {
  if (STUB_MODE) {
    console.log('[STUB] Would create game for player:', playerId);
    return {
      gameId: `game-${Date.now()}`,
      joinCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
      playerId
    };
  }

  try {
    const result = await client.graphql({
      query: CREATE_GAME_MUTATION,
      variables: { playerId }
    });

    return result.data.createGame;
  } catch (error) {
    console.error('Error creating game:', error);
    return null;
  }
}

export async function joinGame(joinCode: string, playerId: string): Promise<JoinGameResponse> {
  if (STUB_MODE) {
    console.log('[STUB] Would join game with code:', joinCode);
    return {
      success: true,
      game: {
        gameId: `game-${joinCode}`,
        joinCode,
        status: 'active',
        currentTurn: 'white',
        state: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      playerId
    };
  }

  try {
    const result = await client.graphql({
      query: JOIN_GAME_MUTATION,
      variables: { joinCode, playerId }
    });

    if (result.data.joinGame.success) {
      // Get full game state
      const gameResult = await client.graphql({
        query: GET_GAME_QUERY,
        variables: { gameId: result.data.joinGame.gameId }
      });

      return {
        success: true,
        game: gameResult.data.getGame,
        playerId: result.data.joinGame.playerId
      };
    } else {
      return {
        success: false,
        error: result.data.joinGame.error
      };
    }
  } catch (error) {
    console.error('Error joining game:', error);
    return {
      success: false,
      error: 'Failed to join game'
    };
  }
}

export async function getGameState(gameId: string): Promise<GameState | null> {
  if (STUB_MODE) {
    console.log('[STUB] Would get game state for:', gameId);
    return {
      gameId,
      status: 'active',
      currentTurn: 'white',
      state: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  try {
    const result = await client.graphql({
      query: GET_GAME_QUERY,
      variables: { gameId }
    });

    return result.data.getGame;
  } catch (error) {
    console.error('Error getting game state:', error);
    return null;
  }
}

export async function registerPushToken(gameId: string, playerId: string, pushToken: string, playerColor?: 'white' | 'black'): Promise<boolean> {
  if (STUB_MODE) {
    console.log('[STUB] Would register push token for game:', gameId);
    return true;
  }

  try {
    const result = await client.graphql({
      query: REGISTER_PUSH_TOKEN_MUTATION,
      variables: { 
        gameId, 
        playerId, 
        pushToken, 
        playerColor: playerColor?.toUpperCase() 
      }
    });

    return result.data.registerPushToken.success;
  } catch (error) {
    console.error('Error registering push token:', error);
    return false;
  }
}

// Legacy function for backward compatibility
export function connectWebSocket(
  onOpponentMove: (move: ChessMove) => void,
  onStatusChange?: (status: 'connected' | 'disconnected') => void,
): () => void {
  // For mobile app, we need a game ID - this would come from the game setup
  const gameId = 'legacy-game-id'; // This should be passed from the calling code
  return subscribeToGameUpdates(gameId, onOpponentMove, onStatusChange);
}
