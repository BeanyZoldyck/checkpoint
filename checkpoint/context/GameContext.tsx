// ============================================================================
// GameContext.tsx
//
// Global app state for the chess AR overlay flow:
//   color-select  →  lock-on  →  game
//
// Stored state
// ------------
//   playerColor   'white' | 'black' | null  — chosen on the color-select screen
//   corners       BoardCorners | null        — detected by Lambda on lock-on
//   imageWidth    number                     — photo width Lambda processed
//   imageHeight   number                     — photo height Lambda processed
//   gamePhase     GamePhase                  — drives which screen to show
// ============================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

import type { BoardCorners } from '@/services/chessCoords';

export type GamePhase = 'color-select' | 'lock-on' | 'game';

interface GameState {
  playerColor: 'white' | 'black' | null;
  corners: BoardCorners | null;
  imageWidth: number;
  imageHeight: number;
  gamePhase: GamePhase;
}

interface GameContextValue extends GameState {
  /** Called from ColorSelectScreen */
  setPlayerColor: (color: 'white' | 'black') => void;
  /** Called from BoardLockScreen on successful Lambda response */
  setLockedBoard: (
    corners: BoardCorners,
    imageWidth: number,
    imageHeight: number,
  ) => void;
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
  });

  const setPlayerColor = useCallback((color: 'white' | 'black') => {
    setState(prev => ({
      ...prev,
      playerColor: color,
      gamePhase: 'lock-on',
    }));
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
