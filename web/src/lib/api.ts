// ============================================================================
// Checkpoint API Service with AWS AppSync Integration for Web Application
//
// Connects to AWS AppSync for real-time chess gameplay
// ============================================================================

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import { getAppSyncConfig } from './config';

// AppSync configuration - will be set dynamically
let appSyncConfig: any = {};

// Configure AWS AppSync
export function configureAWS(config?: any) {
  appSyncConfig = config || getAppSyncConfig();
  
  Amplify.configure({
    API: {
      GraphQL: {
        endpoint: appSyncConfig.aws_appsync_graphqlEndpoint,
        region: appSyncConfig.aws_appsync_region,
        defaultAuthMode: 'apiKey',
        apiKey: appSyncConfig.aws_appsync_apiKey,
      }
    }
  });
}

const client = generateClient();

const STUB_MODE = !appSyncConfig.aws_appsync_graphqlEndpoint || appSyncConfig.aws_appsync_graphqlEndpoint.includes('your-appsync-endpoint');

// --- Types ---

export interface ChessMove {
  from: string; // e.g. 'e2'
  to: string;   // e.g. 'e4'
  san: string;  // e.g. 'e4', 'Nf3'
}

export interface ResetBoardResponse {
  success: boolean;
  gameId: string;
  message?: string;
  error?: string;
}

export type ResetType = 'FULL_RESET' | 'CLEAR_BOARD' | 'UNDO_LAST_MOVE';

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

// --- GraphQL Operations ---

const RESET_BOARD_MUTATION = `
  mutation ResetBoard($input: ResetBoardInput!) {
    resetBoard(input: $input) {
      success
      gameId
      message
      error
    }
  }
`;

const RESET_SUBSCRIPTION = `
  subscription OnBoardReset($gameId: ID!) {
    onBoardReset(gameId: $gameId) {
      success
      gameId
      message
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

// --- API Functions ---

export async function resetBoard(
  gameId: string, 
  playerId: string, 
  resetType: ResetType = 'FULL_RESET'
): Promise<ResetBoardResponse> {
  if (STUB_MODE) {
    console.log('[STUB] Would reset board:', { gameId, playerId, resetType });
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
      success: true,
      gameId,
      message: `Board reset with type: ${resetType}`
    };
  }

  try {
    const result = await client.graphql({
      query: RESET_BOARD_MUTATION,
      variables: {
        input: {
          gameId,
          playerId,
          resetType
        }
      }
    });

    return result.data.resetBoard;
  } catch (error) {
    console.error('Error resetting board:', error);
    return {
      success: false,
      gameId,
      error: 'Failed to reset board'
    };
  }
}

export function subscribeToResetEvents(
  gameId: string,
  onReset: (resetData: ResetBoardResponse) => void,
  onStatusChange?: (status: 'connected' | 'disconnected') => void,
): () => void {
  if (STUB_MODE) {
    console.log('[STUB] Would subscribe to reset events for game:', gameId);
    onStatusChange?.('connected');
    
    return () => {
      onStatusChange?.('disconnected');
    };
  }

  try {
    onStatusChange?.('connected');
    
    const subscription = client.graphql({
      query: RESET_SUBSCRIPTION,
      variables: { gameId }
    }).subscribe({
      next: (data: any) => {
        const resetData = data.data?.onBoardReset;
        if (resetData) {
          onReset(resetData);
        }
      },
      error: (error) => {
        console.error('Reset subscription error:', error);
        onStatusChange?.('disconnected');
      }
    });

    return () => {
      subscription.unsubscribe();
      onStatusChange?.('disconnected');
    };
  } catch (error) {
    console.error('Error setting up reset subscription:', error);
    onStatusChange?.('disconnected');
    return () => {};
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

// Initialize AWS configuration when module loads
configureAWS();