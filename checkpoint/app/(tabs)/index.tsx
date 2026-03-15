import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { configureAWS, connectPhysicalPlayer, completeCalibration, subscribeToMoves, type GameMove } from '@/services/api';
import { getAppSyncConfig } from '@/services/config';
import { speakMove } from '@/services/elevenlabs';

interface MoveEntry {
  id: string;
  san: string;
  from: string;
  to: string;
  playerColor: string;
  moveNumber: number;
  timestamp: string;
}

function MoveRow({ entry, isLatest }: { entry: MoveEntry; isLatest: boolean }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, []);

  const isWhite = entry.playerColor === 'WHITE';

  return (
    <Animated.View style={[styles.moveRow, isLatest && styles.moveRowLatest, { opacity: fadeAnim }]}>
      <Text style={styles.moveNumber}>{entry.moveNumber}.</Text>
      <View style={[styles.colorDot, isWhite ? styles.colorDotWhite : styles.colorDotBlack]} />
      <Text style={styles.moveSan}>{entry.san}</Text>
      <Text style={styles.moveSquares}>{entry.from} → {entry.to}</Text>
      {isLatest && <View style={styles.latestBadge}><Text style={styles.latestBadgeText}>LATEST</Text></View>}
    </Animated.View>
  );
}

export default function MoveScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [moves, setMoves] = useState<MoveEntry[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    configureAWS(getAppSyncConfig());

    // Register as the physical player so the backend creates/joins the game
    // session and the digital player (web) can connect and make moves.
    // Physical player is always BLACK; the digital (web) player is WHITE and
    // makes the first move. The backend ignores the color argument below.
    connectPhysicalPlayer('BLACK').then((game) => {
      if (!game) {
        console.warn('[checkpoint] connectPhysicalPlayer returned null');
        return;
      }
      console.log('[checkpoint] connected as physical player, game status:', game.status);
      if (game.status !== 'ACTIVE') {
        return completeCalibration('{}').then((updated) => {
          console.log('[checkpoint] game activated, status:', updated?.status);
        });
      }
    }).catch((err) => {
      console.error('[checkpoint] connectPhysicalPlayer error:', err);
    });

    const unsubscribe = subscribeToMoves(
      (move: GameMove) => {
        setMoves(prev => [
          ...prev,
          {
            id: move.id ?? `${Date.now()}`,
            san: move.san,
            from: move.from,
            to: move.to,
            playerColor: move.playerColor,
            moveNumber: move.moveNumber ?? prev.length + 1,
            timestamp: move.timestamp ?? new Date().toISOString(),
          },
        ]);
        speakMove(move.san);
        // Scroll to bottom on new move
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      },
      (s) => setStatus(s === 'connected' ? 'connected' : 'disconnected'),
    );

    return unsubscribe;
  }, []);

  const statusColor = status === 'connected' ? '#4ade80' : status === 'connecting' ? '#facc15' : '#f87171';
  const statusLabel = status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Disconnected';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Checkpoint</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      {/* Move list */}
      {moves.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>♟</Text>
          <Text style={styles.emptyTitle}>Waiting for moves</Text>
          <Text style={styles.emptySubtitle}>
            When a player makes a move it will appear here in real time.
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        >
          {moves.map((entry, i) => (
            <MoveRow
              key={entry.id}
              entry={entry}
              isLatest={i === moves.length - 1}
            />
          ))}
        </ScrollView>
      )}

      {/* Latest move big display */}
      {moves.length > 0 && (
        <View style={[styles.latestCard, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.latestLabel}>Latest move</Text>
          <Text style={styles.latestMove}>{moves[moves.length - 1].san}</Text>
          <Text style={styles.latestSquares}>
            {moves[moves.length - 1].from} → {moves[moves.length - 1].to}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Move list
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  moveRowLatest: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  moveNumber: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    width: 24,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  colorDotWhite: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorDotBlack: {
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  moveSan: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  moveSquares: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  latestBadge: {
    backgroundColor: '#FFD700',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  latestBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Latest move card at bottom
  latestCard: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  latestLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  latestMove: {
    color: '#FFD700',
    fontSize: 48,
    fontWeight: '800',
  },
  latestSquares: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
