import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoveArrowOverlay } from '@/components/move-arrow-overlay';
import { 
  type ChessMove, 
  connectWebSocket, 
  uploadBoardImage, 
  configureAWS,
  createGame,
  joinGame,
  subscribeToGameUpdates,
  registerPushToken,
  subscribeToResetEvents,
  type ResetBoardResponse
} from '@/services/api';
import { getAppSyncConfig } from '@/services/config';


export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [uploading, setUploading] = useState(false);
  const [lastDetected, setLastDetected] = useState<ChessMove | null>(null);
  const [opponentMove, setOpponentMove] = useState<ChessMove | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [resetStatus, setResetStatus] = useState<string>('');
  
  // Game state
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameInitialized, setGameInitialized] = useState(false);

  // Initialize AWS AppSync and game on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Configure AWS AppSync
        const config = getAppSyncConfig();
        configureAWS(config);
        
        // Create a demo game for testing (in real app, this would be user-driven)
        const playerId = `player-${Date.now()}`;
        setPlayerId(playerId);
        
        const gameResult = await createGame(playerId);
        if (gameResult) {
          setGameId(gameResult.gameId);
          
          // Subscribe to game updates
          const unsubscribe = subscribeToGameUpdates(
            gameResult.gameId,
            (move) => {
              // Show move directly on camera overlay - no notification needed
              setOpponentMove(move);
              console.log(`Opponent played: ${move.san} (${move.from} → ${move.to})`);
              
              // Clear the move arrow after 5 seconds so it doesn't stay forever
              setTimeout(() => {
                setOpponentMove(null);
              }, 5000);
            },
            (status) => setWsStatus(status)
          );
          
          // Subscribe to board reset events
          const unsubscribeReset = subscribeToResetEvents(
            gameResult.gameId,
            (resetData: ResetBoardResponse) => {
              console.log('Board reset received:', resetData);
              setResetStatus(resetData.message || 'Board was reset');
              
              // Clear all current state when board is reset
              setLastDetected(null);
              setOpponentMove(null);
              
              // Clear reset status after 3 seconds
              setTimeout(() => {
                setResetStatus('');
              }, 3000);
            },
            (status) => console.log('Reset subscription status:', status)
          );
          
          setGameInitialized(true);
          
          return () => {
            unsubscribe();
            unsubscribeReset();
          };
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Fallback to original WebSocket connection
        const disconnect = connectWebSocket(
          (move) => setOpponentMove(move),
          (status) => setWsStatus(status),
        );
        return disconnect;
      }
    };
    
    initializeApp();
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || uploading) return;

    setUploading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      if (photo?.uri && gameId && playerId) {
        const result = await uploadBoardImage(photo.uri, gameId, playerId);
        if (result.success && result.detectedMove) {
          setLastDetected(result.detectedMove);
          // Clear opponent move arrow when we make our move
          setOpponentMove(null);
        }
      }
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      setUploading(false);
    }
  }, [uploading]);

  // Permission not yet determined
  if (!permission) {
    return <View style={styles.center} />;
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to capture your board.</Text>
        <Pressable style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCameraLayout({ width, height });
        }}
      />

      {/* Arrow overlay for opponent's move */}
      <MoveArrowOverlay
        move={opponentMove}
        width={cameraLayout.width}
        height={cameraLayout.height}
      />

      {/* Status bar at top */}
      <View style={[styles.statusBar, { top: insets.top + 8 }]}>
        <View style={[styles.dot, wsStatus === 'connected' ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.statusText}>
          {gameInitialized 
            ? (wsStatus === 'connected' ? 'Connected to Game' : 'Connecting...') 
            : 'Initializing...'
          }
        </Text>
        {gameId && (
          <Text style={styles.gameIdText}> • Game: {gameId.slice(-6)}</Text>
        )}
      </View>

      {/* Move info banner - now handled by MoveArrowOverlay component */}

      {lastDetected && (
        <View style={[styles.moveBanner, styles.detectedBanner, { top: insets.top + 48 }]}>
          <Text style={styles.moveBannerText}>
            ✅ Your move detected: <Text style={styles.moveHighlight}>{lastDetected.san}</Text>
            {' '}({lastDetected.from} → {lastDetected.to})
          </Text>
        </View>
      )}

      {resetStatus !== '' && (
        <View style={[styles.moveBanner, styles.resetBanner, { top: insets.top + (lastDetected ? 88 : 48) }]}>
          <Text style={styles.moveBannerText}>
            🔄 {resetStatus}
          </Text>
        </View>
      )}

      {/* Capture button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.captureBtn,
            pressed && styles.captureBtnPressed,
            uploading && styles.captureBtnDisabled,
          ]}
          onPress={handleCapture}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </Pressable>
        <Text style={styles.captureHint}>
          {uploading ? 'Analyzing board…' : 'Tap to capture board'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
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
  camera: {
    ...StyleSheet.absoluteFillObject,
  },

  // Status bar
  statusBar: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOn: { backgroundColor: '#4ade80' },
  dotOff: { backgroundColor: '#f87171' },
  statusText: {
    color: '#fff',
    fontSize: 13,
  },
  gameIdText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },

  // Move banners
  moveBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  detectedBanner: {
    backgroundColor: 'rgba(34,197,94,0.25)',
  },
  resetBanner: {
    backgroundColor: 'rgba(59,130,246,0.25)',
  },
  moveBannerText: {
    color: '#fff',
    fontSize: 15,
  },
  moveHighlight: {
    fontWeight: 'bold',
    color: '#FFD700',
  },

  // Capture button
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  captureBtnPressed: {
    opacity: 0.6,
  },
  captureBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  captureHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 8,
  },
});
