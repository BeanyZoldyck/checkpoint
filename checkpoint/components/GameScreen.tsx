import React, { useEffect, useRef, useState } from 'react';
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
import { configureAWS, subscribeToMoves } from '@/services/api';
import { uciToPixels } from '@/services/chessCoords';
import { getAppSyncConfig } from '@/services/config';

interface ArrowState {
  fromPixel: { x: number; y: number } | null;
  toPixel:   { x: number; y: number } | null;
  label:     string | null;
}

export function GameScreen() {
  const insets = useSafeAreaInsets();
  const [permission] = useCameraPermissions();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [arrow, setArrow] = useState<ArrowState>({ fromPixel: null, toPixel: null, label: null });
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { corners, imageWidth, imageHeight, playerColor, resetLock } = useGame();

  // Configure Amplify and subscribe to moves on mount
  useEffect(() => {
    const config = getAppSyncConfig();
    configureAWS(config);

    const unsubscribe = subscribeToMoves(
      (uci: string) => {
        if (!corners || layout.width === 0 || layout.height === 0) return;

        const pixels = uciToPixels(
          uci,
          corners,
          playerColor ?? 'white',
          imageWidth,
          imageHeight,
          layout.width,
          layout.height,
        );

        if (!pixels) return;

        // Clear any existing auto-dismiss timer
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

        const from = uci.slice(0, 2);
        const to   = uci.slice(2, 4);
        setArrow({
          fromPixel: pixels.from,
          toPixel:   pixels.to,
          label:     `${from} → ${to}`,
        });

        // Auto-dismiss arrow after 6 seconds
        clearTimerRef.current = setTimeout(() => {
          setArrow({ fromPixel: null, toPixel: null, label: null });
        }, 6000);
      },
      setWsStatus,
    );

    return () => {
      unsubscribe();
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
    // layout is intentionally excluded — the subscription callback closes over layout
    // via the state captured at subscription time. Re-subscribing on every layout
    // change would reset the AppSync connection too frequently.
    // Instead we accept the first layout snapshot for coordinate scaling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corners, imageWidth, imageHeight, playerColor]);

  // Recompute arrow pixels when layout changes so existing arrow stays accurate
  // (handles orientation changes)
  useEffect(() => {
    if (!arrow.label || !corners || layout.width === 0 || layout.height === 0) return;
    // label is "from → to", extract the UCI squares
    const parts = arrow.label.split(' → ');
    if (parts.length !== 2) return;
    const uci = parts[0] + parts[1];
    const pixels = uciToPixels(
      uci, corners, playerColor ?? 'white',
      imageWidth, imageHeight, layout.width, layout.height,
    );
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
