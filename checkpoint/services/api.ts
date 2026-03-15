// ============================================================================
// Checkpoint API Service — AWS AppSync
//
// Schema source: chess-link/graphql/schema.graphql
//
// Key operations used by the mobile app:
//   Mutation  connectPhysicalPlayer(playerColor: PlayerColor!): Game!
//   Mutation  uploadBoardImage(imageData: String!): String!
//   Mutation  completeCalibration(calibrationData: String!): Game!
//   Query     getCurrentGame: Game
//   Sub       onGameEvent: Move   (fires on makeDigitalMove | recordPhysicalMove)
// ============================================================================

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

import type { AppSyncConfig } from './config';

// ---------------------------------------------------------------------------
// Amplify bootstrap
// ---------------------------------------------------------------------------

export function configureAWS(config: AppSyncConfig) {
  Amplify.configure({
    API: {
      GraphQL: {
        endpoint: config.aws_appsync_graphqlEndpoint,
        region: config.aws_appsync_region,
        defaultAuthMode: 'apiKey',
        apiKey: config.aws_appsync_apiKey,
      },
    },
  });
}

const client = generateClient();

// STUB_MODE: true when no AppSync endpoint is available (local dev without AWS)
// Evaluated lazily so configureAWS() has a chance to run first.
function isStubMode(): boolean {
  try {
    // If Amplify has been configured the API will have an endpoint set.
    // We use the import to check rather than reading private internals.
    return false; // Assume real mode; flip to `true` to force stubs locally
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameMove {
  id: string;
  gameId: string;
  from: string;   // e.g. "e2"
  to: string;     // e.g. "e4"
  piece: string;  // e.g. "P"
  san: string;    // e.g. "e4"
  fen: string;
  playerColor: 'WHITE' | 'BLACK';
  moveNumber: number;
  timestamp: string;
}

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
  lastImageS3Key?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const CONNECT_PHYSICAL_PLAYER_MUTATION = /* GraphQL */ `
  mutation ConnectPhysicalPlayer($playerColor: PlayerColor!) {
    connectPhysicalPlayer(playerColor: $playerColor) {
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

/**
 * Register as the physical (camera) player.
 * Must be called before uploadBoardImage or completeCalibration.
 * Uses the "single-game-session" game on the backend.
 */
export async function connectPhysicalPlayer(
  playerColor: 'WHITE' | 'BLACK',
): Promise<Game | null> {
  if (isStubMode()) {
    console.log('[STUB] connectPhysicalPlayer', playerColor);
    return {
      id: 'single-game-session',
      status: 'WAITING_FOR_PLAYERS',
      currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      currentTurn: 'WHITE',
      physicalPlayerColor: playerColor,
      digitalPlayerColor: playerColor === 'WHITE' ? 'BLACK' : 'WHITE',
      moveHistory: [],
      physicalPlayerConnected: true,
      digitalPlayerConnected: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const result = await (client.graphql({
      query: CONNECT_PHYSICAL_PLAYER_MUTATION,
      variables: { playerColor },
    }) as any);
    return result.data?.connectPhysicalPlayer ?? null;
  } catch (err) {
    console.error('connectPhysicalPlayer error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------

const UPLOAD_BOARD_IMAGE_MUTATION = /* GraphQL */ `
  mutation UploadBoardImage($imageData: String!) {
    uploadBoardImage(imageData: $imageData)
  }
`;

export interface UploadUrlResult {
  uploadUrl: string;
  s3Key: string;
}

/**
 * Ask the backend for a pre-signed S3 PUT URL.
 *
 * The backend no longer accepts the image through AppSync (AppSync has a 1 MB
 * request limit). Instead the Lambda returns a JSON string containing:
 *   { "uploadUrl": "<presigned PUT URL>", "s3Key": "<key>" }
 *
 * The caller should then PUT the JPEG directly to `uploadUrl`, and pass
 * `s3Key` to completeCalibration().
 *
 * We pass a placeholder imageData value because the schema still requires
 * the argument; the Lambda ignores its value.
 */
export async function getUploadUrl(): Promise<UploadUrlResult | null> {
  if (isStubMode()) {
    console.log('[STUB] getUploadUrl — returning fake upload info');
    return {
      uploadUrl: 'https://stub-presigned-url.example.com/upload',
      s3Key: `games/single-game-session/images/stub_${Date.now()}.jpg`,
    };
  }

  try {
    const result = await (client.graphql({
      query: UPLOAD_BOARD_IMAGE_MUTATION,
      variables: { imageData: 'presigned-url-request' },
    }) as any);
    const raw: string | null = result.data?.uploadBoardImage ?? null;
    if (!raw) return null;
    return JSON.parse(raw) as UploadUrlResult;
  } catch (err) {
    console.error('getUploadUrl error:', err);
    return null;
  }
}

/**
 * Upload a JPEG file directly to S3 using a pre-signed PUT URL.
 * Returns true on success.
 */
export async function putImageToS3(presignedUrl: string, imageUri: string): Promise<boolean> {
  if (isStubMode()) {
    console.log('[STUB] putImageToS3 — skipping actual upload');
    return true;
  }

  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();

    const putResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });

    if (!putResponse.ok) {
      console.error('S3 PUT failed:', putResponse.status, putResponse.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('putImageToS3 error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------

const COMPLETE_CALIBRATION_MUTATION = /* GraphQL */ `
  mutation CompleteCalibration($calibrationData: String!) {
    completeCalibration(calibrationData: $calibrationData) {
      id
      status
      currentTurn
      physicalPlayerColor
      updatedAt
    }
  }
`;

/**
 * Tell the backend that board calibration is done and the game can start.
 * Pass the corners JSON as calibrationData so it's stored with the game.
 */
export async function completeCalibration(calibrationData: string): Promise<Game | null> {
  if (isStubMode()) {
    console.log('[STUB] completeCalibration');
    return null;
  }

  try {
    const result = await (client.graphql({
      query: COMPLETE_CALIBRATION_MUTATION,
      variables: { calibrationData },
    }) as any);
    return result.data?.completeCalibration ?? null;
  } catch (err) {
    console.error('completeCalibration error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subscription — real-time moves
// ---------------------------------------------------------------------------

const ON_GAME_EVENT_SUBSCRIPTION = /* GraphQL */ `
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

// Stub moves for offline testing
const STUB_MOVES: Array<Pick<GameMove, 'from' | 'to' | 'san' | 'playerColor'>> = [
  { from: 'e7', to: 'e5', san: 'e5',  playerColor: 'BLACK' },
  { from: 'g8', to: 'f6', san: 'Nf6', playerColor: 'BLACK' },
  { from: 'b8', to: 'c6', san: 'Nc6', playerColor: 'BLACK' },
];
let stubMoveIndex = 0;

/**
 * Subscribe to the onGameEvent AppSync subscription.
 * Fires whenever makeDigitalMove or recordPhysicalMove is called.
 * The callback receives a GameMove with from/to squares.
 */
export function subscribeToMoves(
  onMove: (move: GameMove) => void,
  onStatusChange?: (status: 'connected' | 'disconnected') => void,
): () => void {
  if (isStubMode()) {
    console.log('[STUB] subscribeToMoves — will emit a move in 5s');
    onStatusChange?.('connected');

    const timer = setTimeout(() => {
      const stub = STUB_MOVES[stubMoveIndex % STUB_MOVES.length];
      stubMoveIndex++;
      console.log('[STUB] Emitting move:', stub.san);
      onMove({
        id: `stub-${Date.now()}`,
        gameId: 'single-game-session',
        from: stub.from,
        to: stub.to,
        piece: 'P',
        san: stub.san,
        fen: '',
        playerColor: stub.playerColor,
        moveNumber: stubMoveIndex,
        timestamp: new Date().toISOString(),
      });
    }, 5000);

    return () => {
      clearTimeout(timer);
      onStatusChange?.('disconnected');
    };
  }

  try {
    onStatusChange?.('connected');

    const subscription = (client.graphql({
      query: ON_GAME_EVENT_SUBSCRIPTION,
    }) as any).subscribe({
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
      subscription.unsubscribe();
      onStatusChange?.('disconnected');
    };
  } catch (err) {
    console.error('Error setting up subscribeToMoves:', err);
    onStatusChange?.('disconnected');
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Legacy exports kept for backward compatibility with old index.tsx code
// (they are no longer used by the new screens but removing them would break
// any remaining imports during the transition)
// ---------------------------------------------------------------------------

export type ChessMove = Pick<GameMove, 'from' | 'to' | 'san'>;

/** @deprecated Use subscribeToMoves */
export function connectWebSocket(
  onOpponentMove: (move: ChessMove) => void,
  onStatusChange?: (status: 'connected' | 'disconnected') => void,
): () => void {
  return subscribeToMoves(
    (move) => onOpponentMove({ from: move.from, to: move.to, san: move.san }),
    onStatusChange,
  );
}
