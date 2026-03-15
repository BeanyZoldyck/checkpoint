import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';

import { BoardLockScreen } from '@/components/BoardLockScreen';
import { ColorSelectScreen } from '@/components/ColorSelectScreen';
import { GameScreen } from '@/components/GameScreen';
import { useGame } from '@/context/GameContext';

function PermissionScreen() {
  const [, requestPermission] = useCameraPermissions();
  return (
    <View style={styles.center}>
      <Text style={styles.permText}>Camera access is needed to use Checkpoint.</Text>
      <Pressable style={styles.grantBtn} onPress={requestPermission}>
        <Text style={styles.grantBtnText}>Grant Permission</Text>
      </Pressable>
    </View>
  );
}

export default function Root() {
  const [permission, requestPermission] = useCameraPermissions();
  const { gamePhase } = useGame();

  // Permission not yet determined — show nothing while the OS prompt appears
  if (!permission) return <View style={styles.center} />;

  // Permission denied
  if (!permission.granted) return <PermissionScreen />;

  // Route to the appropriate phase screen
  if (gamePhase === 'color-select') return <ColorSelectScreen />;
  if (gamePhase === 'lock-on')      return <BoardLockScreen />;
  return <GameScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  grantBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  grantBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
