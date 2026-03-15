// ============================================================================
// GameContext.tsx
//
// Global app state for the chess AR overlay flow:
//   color-select  →  lock-on  →  game
//
// Stored state
// ------------
//   playerColor   'white' | 'black' | null  — chosen on the color-select screen
//   corners       BoardCorners | null        — derived from captured photo on lock-on
//   imageWidth    number                     — width of the photo used during lock-on
//   imageHeight   number                     — height of the photo used during lock-on
//   gamePhase     GamePhase                  — drives which screen to show
//
// Side effects
// ------------
//   setPlayerColor  → calls connectPhysicalPlayer on AppSync to register with
//                     the backend, then transitions to 'lock-on'.
// ============================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

import { configureAWS, connectPhysicalPlayer } from '@/services/api';
import type { BoardCorners } from '@/services/chessCoords';
import { getAppSyncConfig } from '@/services/config';

export type GamePhase = 'color-select' | 'lock-on' | 'game';

interface GameState {
  playerColor: 'white' | 'black' | null;
  corners: BoardCorners | null;
  imageWidth: number;
  imageHeight: number;
  gamePhase: GamePhase;
  connecting: boolean;
  connectError: string | null;
}

interface GameContextValue extends GameState {
  /** Called from ColorSelectScreen — registers with backend then goes to lock-on */
  setPlayerColor: (color: 'white' | 'black') => void;
  /** Called from BoardLockScreen after successful lock-on */
  setLockedBoard: (corners: BoardCorners, imageWidth: number, imageHeight: number) => void;
  /** Called from GameScreen's "Re-lock" button */
  resetLock: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>({
    playerColor: null,
    corners: null,
    imageWidth: 0,
    imageHeight: 0,
    gamePhase: 'color-select',
    connecting: false,
    connectError: null,
  });

  const setPlayerColor = useCallback((color: 'white' | 'black') => {
    // Optimistically advance to lock-on screen immediately, then connect in background.
    // If connection fails we still allow proceeding — the game will work in STUB_MODE
    // and the backend will handle reconnection on the next mutation.
    setState(prev => ({
      ...prev,
      playerColor: color,
      gamePhase: 'lock-on',
      connecting: true,
      connectError: null,
    }));

    // Fire-and-forget: register with AppSync backend
    const appsyncColor = color === 'white' ? 'WHITE' : 'BLACK';
    configureAWS(getAppSyncConfig());
    connectPhysicalPlayer(appsyncColor)
      .then(game => {
        console.log('[GameContext] connectPhysicalPlayer success, gameId:', game?.id);
        setState(prev => ({ ...prev, connecting: false }));
      })
      .catch(err => {
        console.warn('[GameContext] connectPhysicalPlayer failed (non-fatal):', err);
        setState(prev => ({ ...prev, connecting: false, connectError: String(err) }));
      });
  }, []);

  const setLockedBoard = useCallback(
    (corners: BoardCorners, imageWidth: number, imageHeight: number) => {
      setState(prev => ({
        ...prev,
        corners,
        imageWidth,
        imageHeight,
        gamePhase: 'game',
      }));
    },
    [],
  );

  const resetLock = useCallback(() => {
    setState(prev => ({
      ...prev,
      corners: null,
      imageWidth: 0,
      imageHeight: 0,
      gamePhase: 'lock-on',
    }));
  }, []);

  return (
    <GameContext.Provider value={{ ...state, setPlayerColor, setLockedBoard, resetLock }}>
      {children}
    </GameContext.Provider>
  );
}

/** Throws if used outside a <GameProvider>. */
export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
