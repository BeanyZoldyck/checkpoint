import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGame } from '@/context/GameContext';

export function ColorSelectScreen() {
  const insets = useSafeAreaInsets();
  const { setPlayerColor } = useGame();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={styles.title}>Checkpoint</Text>
      <Text style={styles.subtitle}>Choose your color</Text>

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [styles.colorBtn, styles.whiteBtn, pressed && styles.pressed]}
          onPress={() => setPlayerColor('white')}
        >
          <Text style={styles.pieceSymbol}>♔</Text>
          <Text style={styles.colorLabel}>White</Text>
          <Text style={styles.colorDesc}>You move first</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.colorBtn, styles.blackBtn, pressed && styles.pressed]}
          onPress={() => setPlayerColor('black')}
        >
          <Text style={[styles.pieceSymbol, styles.darkText]}>♚</Text>
          <Text style={[styles.colorLabel, styles.darkText]}>Black</Text>
          <Text style={[styles.colorDesc, styles.darkSubText]}>Opponent moves first</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Point your camera at the board from above, then tap "Lock On" to calibrate.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#FFD700',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    marginBottom: 48,
  },
  buttons: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 40,
  },
  colorBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  whiteBtn: {
    backgroundColor: '#F5F5F5',
    borderColor: '#FFD700',
  },
  blackBtn: {
    backgroundColor: '#1A1A1A',
    borderColor: '#FFD700',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  pieceSymbol: {
    fontSize: 52,
    marginBottom: 8,
    color: '#111',
  },
  colorLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  colorDesc: {
    fontSize: 12,
    color: '#555',
  },
  darkText: {
    color: '#F5F5F5',
  },
  darkSubText: {
    color: 'rgba(255,255,255,0.45)',
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
