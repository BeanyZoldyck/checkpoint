// ============================================================================
// Checkpoint API Service — AWS AppSync
//
// Schema: chess-link/graphql/schema.graphql
//
// Operations used by the Jac web (digital player) app:
//   Mutation  connectDigitalPlayer: Game!
//   Mutation  makeDigitalMove(from, to, promotion?): Move!
//   Mutation  updatePlayerConnection(playerType, connected): Game!
//   Query     getCurrentGame: Game
//   Sub       onGameEvent: Move  (fires on makeDigitalMove | recordPhysicalMove)
// ============================================================================

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import { getAppSyncConfig } from './config';

// ---------------------------------------------------------------------------
// Bootstrap — configure once at module load time
// ---------------------------------------------------------------------------

const cfg = getAppSyncConfig();

Amplify.configure({
  API: {
    GraphQL: {
      endpoint: cfg.aws_appsync_graphqlEndpoint,
      region: cfg.aws_appsync_region,
      defaultAuthMode: 'apiKey',
      apiKey: cfg.aws_appsync_apiKey,
    },
  },
});

const client = generateClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Game {
  id: string;
  status: string;
  currentFEN: string;
  currentTurn: 'WHITE' | 'BLACK';
  physicalPlayerColor: 'WHITE' | 'BLACK';
  digitalPlayerColor: 'WHITE' | 'BLACK';
  moveHistory: string[];
  physicalPlayerConnected: boolean;
  digitalPlayerConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GameMove {
  id: string;
  gameId: string;
  from: string;
  to: string;
  piece: string;
  san: string;
  fen: string;
  playerColor: 'WHITE' | 'BLACK';
  moveNumber: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const CONNECT_DIGITAL_PLAYER = /* GraphQL */ `
  mutation ConnectDigitalPlayer {
    connectDigitalPlayer {
      id
      status
      currentFEN
      currentTurn
      physicalPlayerColor
      digitalPlayerColor
      moveHistory
      physicalPlayerConnected
      digitalPlayerConnected
      createdAt
      updatedAt
    }
  }
`;

export async function connectDigitalPlayer(): Promise<Game | null> {
  try {
    const result = await (client.graphql({ query: CONNECT_DIGITAL_PLAYER }) as any);
    return result.data?.connectDigitalPlayer ?? null;
  } catch (err) {
    console.error('connectDigitalPlayer error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------

const MAKE_DIGITAL_MOVE = /* GraphQL */ `
  mutation MakeDigitalMove($from: String!, $to: String!, $promotion: String) {
    makeDigitalMove(from: $from, to: $to, promotion: $promotion) {
      id
      gameId
      from
      to
      piece
      san
      fen
      playerColor
      moveNumber
      timestamp
    }
  }
`;

export async function makeDigitalMove(
  from: string,
  to: string,
  promotion?: string,
): Promise<GameMove | null> {
  try {
    const result = await (client.graphql({
      query: MAKE_DIGITAL_MOVE,
      variables: { from, to, promotion: promotion ?? null },
    }) as any);
    return result.data?.makeDigitalMove ?? null;
  } catch (err) {
    console.error('makeDigitalMove error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------

const UPDATE_PLAYER_CONNECTION = /* GraphQL */ `
  mutation UpdatePlayerConnection($playerType: String!, $connected: Boolean!) {
    updatePlayerConnection(playerType: $playerType, connected: $connected) {
      id
      digitalPlayerConnected
      physicalPlayerConnected
    }
  }
`;

export async function updatePlayerConnection(connected: boolean): Promise<void> {
  try {
    await (client.graphql({
      query: UPDATE_PLAYER_CONNECTION,
      variables: { playerType: 'digital', connected },
    }) as any);
  } catch (err) {
    console.error('updatePlayerConnection error:', err);
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const GET_CURRENT_GAME = /* GraphQL */ `
  query GetCurrentGame {
    getCurrentGame {
      id
      status
      currentFEN
      currentTurn
      physicalPlayerColor
      digitalPlayerColor
      moveHistory
      physicalPlayerConnected
      digitalPlayerConnected
      createdAt
      updatedAt
    }
  }
`;

export async function getCurrentGame(): Promise<Game | null> {
  try {
    const result = await (client.graphql({ query: GET_CURRENT_GAME }) as any);
    return result.data?.getCurrentGame ?? null;
  } catch (err) {
    console.error('getCurrentGame error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

const ON_GAME_EVENT = /* GraphQL */ `
  subscription OnGameEvent {
    onGameEvent {
      id
      gameId
      from
      to
      piece
      san
      fen
      playerColor
      moveNumber
      timestamp
    }
  }
`;

export function subscribeToMoves(
  onMove: (move: GameMove) => void,
  onStatusChange?: (status: 'connected' | 'disconnected') => void,
): () => void {
  try {
    onStatusChange?.('connected');

    const sub = (client.graphql({ query: ON_GAME_EVENT }) as any).subscribe({
      next: (data: any) => {
        const move: GameMove = data?.data?.onGameEvent;
        if (move?.from && move?.to) {
          onMove(move);
        }
      },
      error: (err: any) => {
        console.error('subscribeToMoves error:', err);
        onStatusChange?.('disconnected');
      },
    });

    return () => {
      sub.unsubscribe();
      onStatusChange?.('disconnected');
    };
  } catch (err) {
    console.error('Error setting up subscribeToMoves:', err);
    onStatusChange?.('disconnected');
    return () => {};
  }
}
