import React, { useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { chessboardRecognizer, ChessBoardState, BoardDetection } from '@/services/chessboard-recognizer';
import { MoveArrowOverlay } from '@/components/move-arrow-overlay';
import type { ChessMove } from '@/services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ChessboardRecognition() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  
  const [processing, setProcessing] = useState(false);
  const [boardState, setBoardState] = useState<ChessBoardState | null>(null);
  const [previousBoardState, setPreviousBoardState] = useState<ChessBoardState | null>(null);
  const [lastDetected, setLastDetected] = useState<ChessMove | null>(null);
  const [detectionResult, setDetectionResult] = useState<BoardDetection | null>(null);

  const handleCapture = async () => {
    if (!cameraRef.current || processing) return;

    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        // Perform chessboard recognition
        const result = await chessboardRecognizer.recognizeChessboard(photo.uri);
        setDetectionResult(result);

        if (result.success && result.squares) {
          // Analyze board state
          const currentBoard = await chessboardRecognizer.analyzeBoardState(
            photo.uri,
            result.squares
          );

          // Check if we have a previous state to compare
          if (previousBoardState) {
            const detectedMove = chessboardRecognizer.detectMove(
              previousBoardState,
              currentBoard
            );

            if (detectedMove) {
              setLastDetected({
                from: detectedMove.from,
                to: detectedMove.to,
                san: detectedMove.san
              });
            }
          }

          // Update board states
          setPreviousBoardState(boardState);
          setBoardState(currentBoard);

          console.log('Board state:', currentBoard.fen);
        } else {
          console.error('Detection failed:', result.error);
        }
      }
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed for chessboard recognition.</Text>
        <Pressable style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      />

      {/* Detection results overlay */}
      {detectionResult?.success && detectionResult.corners && (
        <View style={styles.detectionOverlay}>
          <Text style={styles.statusText}>
            ✅ Chessboard detected
          </Text>
          {boardState && (
            <Text style={styles.fenText}>
              FEN: {boardState.fen}
            </Text>
          )}
        </View>
      )}

      {/* Last detected move */}
      {lastDetected && (
        <MoveArrowOverlay
          fromPixel={null}
          toPixel={null}
          moveLabel={`${lastDetected.from} → ${lastDetected.to}`}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
        />
      )}

      {/* Status information */}
      <View style={styles.infoPanel}>
        {processing ? (
          <Text style={styles.infoText}>Processing...</Text>
        ) : (
          <Text style={styles.infoText}>
            {detectionResult?.success 
              ? 'Tap to capture next move' 
              : 'Tap to detect chessboard'}
          </Text>
        )}
        {lastDetected && (
          <Text style={styles.moveText}>
            Last: {lastDetected.san} ({lastDetected.from} → {lastDetected.to})
          </Text>
        )}
      </View>

      {/* Capture button */}
      <View style={styles.bottomBar}>
        <Pressable
          style={({ pressed }) => [
            styles.captureBtn,
            pressed && styles.captureBtnPressed,
            processing && styles.captureBtnDisabled,
          ]}
          onPress={handleCapture}
          disabled={processing}
        >
          <View style={styles.captureInner} />
        </Pressable>
        <Text style={styles.captureHint}>
          {processing ? 'Analyzing board...' : 'Tap to capture'}
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
    flex: 1,
  },
  detectionOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 128, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fenText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  infoPanel: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  infoText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  moveText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
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
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  captureHint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    marginTop: 8,
  },
});