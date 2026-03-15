import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoveArrowOverlay } from '@/components/move-arrow-overlay';
import { useGame } from '@/context/GameContext';
import { configureAWS, subscribeToMoves, type GameMove } from '@/services/api';
import { squareToPixel } from '@/services/chessCoords';
import { getAppSyncConfig } from '@/services/config';
import { speakMove } from '@/services/elevenlabs';

interface ArrowState {
  fromPixel: { x: number; y: number } | null;
  toPixel:   { x: number; y: number } | null;
  /** Stores from/to squares so we can recompute on layout change */
  fromSquare: string | null;
  toSquare:   string | null;
  label:      string | null;
}

const EMPTY_ARROW: ArrowState = {
  fromPixel: null, toPixel: null,
  fromSquare: null, toSquare: null,
  label: null,
};

export function GameScreen() {
  const insets = useSafeAreaInsets();
  const [permission] = useCameraPermissions();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [arrow, setArrow] = useState<ArrowState>(EMPTY_ARROW);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { corners, imageWidth, imageHeight, playerColor, resetLock } = useGame();

  /** Compute pixel coords for a pair of squares given current layout */
  const computePixels = useCallback(
    (from: string, to: string, w: number, h: number) => {
      if (!corners || w === 0 || h === 0) return null;
      const color = playerColor ?? 'white';
      return {
        from: squareToPixel(from, corners, color, imageWidth, imageHeight, w, h),
        to:   squareToPixel(to,   corners, color, imageWidth, imageHeight, w, h),
      };
    },
    [corners, playerColor, imageWidth, imageHeight],
  );

  // Subscribe to moves on mount (re-subscribe if corners/color change)
  useEffect(() => {
    configureAWS(getAppSyncConfig());

    const unsubscribe = subscribeToMoves(
      (move: GameMove) => {
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

        const pixels = computePixels(move.from, move.to, layout.width, layout.height);

        setArrow({
          fromPixel:  pixels?.from ?? null,
          toPixel:    pixels?.to   ?? null,
          fromSquare: move.from,
          toSquare:   move.to,
          label:      `${move.san}  (${move.from} → ${move.to})`,
        });

        // Speak the move aloud via ElevenLabs TTS
        speakMove(move.san);

        clearTimerRef.current = setTimeout(() => setArrow(EMPTY_ARROW), 6000);
      },
      setWsStatus,
    );

    return () => {
      unsubscribe();
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corners, imageWidth, imageHeight, playerColor]);

  // Recompute pixel positions when layout changes (handles rotation)
  useEffect(() => {
    if (!arrow.fromSquare || !arrow.toSquare) return;
    const pixels = computePixels(arrow.fromSquare, arrow.toSquare, layout.width, layout.height);
    if (pixels) {
      setArrow(prev => ({ ...prev, fromPixel: pixels.from, toPixel: pixels.to }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  return (
    <View
      style={styles.container}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      {/* Camera preview */}
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {/* Arrow overlay */}
      <MoveArrowOverlay
        fromPixel={arrow.fromPixel}
        toPixel={arrow.toPixel}
        moveLabel={arrow.label}
        width={layout.width}
        height={layout.height}
      />

      {/* Connection status — top left */}
      <View style={[styles.statusPill, { top: insets.top + 10 }]}>
        <View style={[styles.dot, wsStatus === 'connected' ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.statusText}>
          {wsStatus === 'connected' ? 'Live' : 'Connecting…'}
        </Text>
        <Text style={styles.colorBadge}>
          {playerColor === 'white' ? '♔' : '♚'}
        </Text>
      </View>

      {/* Re-lock button — top right */}
      <Pressable
        style={({ pressed }) => [
          styles.relockBtn,
          { top: insets.top + 10 },
          pressed && styles.relockBtnPressed,
        ]}
        onPress={resetLock}
      >
        <Text style={styles.relockText}>Re-lock</Text>
      </Pressable>

      {/* Waiting hint when no arrow is shown */}
      {!arrow.fromPixel && (
        <View style={styles.waitingHint}>
          <Text style={styles.waitingText}>Waiting for opponent's move…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusPill: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOn:  { backgroundColor: '#4ade80' },
  dotOff: { backgroundColor: '#f87171' },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  colorBadge: {
    color: '#FFD700',
    fontSize: 16,
  },
  relockBtn: {
    position: 'absolute',
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  relockBtnPressed: {
    opacity: 0.7,
  },
  relockText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '600',
  },
  waitingHint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  waitingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
});
