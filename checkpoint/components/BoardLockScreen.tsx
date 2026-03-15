import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { useGame } from '@/context/GameContext';
import type { BoardCorners } from '@/services/chessCoords';
import { getAppSyncConfig } from '@/services/config';

// Shape of the Lambda response
interface LambdaResponse {
  success: boolean;
  corners?: {
    topLeft:     { x: number; y: number };
    topRight:    { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft:  { x: number; y: number };
  };
  imageWidth?:  number;
  imageHeight?: number;
  error?: string;
}

async function detectBoard(imageUri: string, lambdaEndpoint: string): Promise<LambdaResponse> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'board.jpg',
    type: 'image/jpeg',
  } as any);

  const response = await fetch(lambdaEndpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Lambda returned ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Grid guide overlay — 8×8 semi-transparent lines centred on camera view
// ---------------------------------------------------------------------------
function GridGuide({ width, height }: { width: number; height: number }) {
  if (width === 0 || height === 0) return null;

  const size = Math.min(width, height) * 0.82;
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;
  const cell = size / 8;

  const lines: React.ReactElement[] = [];

  // Vertical lines (9 lines for 8 columns)
  for (let i = 0; i <= 8; i++) {
    const x = offsetX + i * cell;
    lines.push(
      <Line
        key={`v${i}`}
        x1={x} y1={offsetY}
        x2={x} y2={offsetY + size}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />,
    );
  }

  // Horizontal lines (9 lines for 8 rows)
  for (let i = 0; i <= 8; i++) {
    const y = offsetY + i * cell;
    lines.push(
      <Line
        key={`h${i}`}
        x1={offsetX}     y1={y}
        x2={offsetX + size} y2={y}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />,
    );
  }

  // Bolder border
  lines.push(
    <Line key="border-t" x1={offsetX} y1={offsetY} x2={offsetX + size} y2={offsetY} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
    <Line key="border-b" x1={offsetX} y1={offsetY + size} x2={offsetX + size} y2={offsetY + size} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
    <Line key="border-l" x1={offsetX} y1={offsetY} x2={offsetX} y2={offsetY + size} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
    <Line key="border-r" x1={offsetX + size} y1={offsetY} x2={offsetX + size} y2={offsetY + size} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
  );

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {lines}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function BoardLockScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setLockedBoard } = useGame();
  const config = getAppSyncConfig();

  const handleLockOn = useCallback(async () => {
    if (!cameraRef.current || locking) return;
    setLocking(true);
    setError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
      });

      if (!photo?.uri) throw new Error('No photo captured');

      const result = await detectBoard(photo.uri, config.lambdaEndpoint);

      if (result.success && result.corners && result.imageWidth && result.imageHeight) {
        const corners: BoardCorners = {
          topLeft:     result.corners.topLeft,
          topRight:    result.corners.topRight,
          bottomRight: result.corners.bottomRight,
          bottomLeft:  result.corners.bottomLeft,
        };
        setLockedBoard(corners, result.imageWidth, result.imageHeight);
      } else {
        setError('Board not found — align the board inside the grid and try again');
      }
    } catch (err) {
      console.error('Lock-on failed:', err);
      setError('Could not reach the server — check your connection and try again');
    } finally {
      setLocking(false);
    }
  }, [locking, config.lambdaEndpoint, setLockedBoard]);

  // Permission not yet determined
  if (!permission) {
    return <View style={styles.center} />;
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is required to detect the board.</Text>
        <Pressable style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      {/* Camera preview */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Grid alignment guide */}
      <GridGuide width={layout.width} height={layout.height} />

      {/* Top instruction */}
      <View style={[styles.instructionBar, { top: insets.top + 12 }]}>
        <Text style={styles.instructionText}>
          Align the chessboard inside the grid
        </Text>
      </View>

      {/* Error message */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.lockBtn,
            locking && styles.lockBtnDisabled,
            pressed && !locking && styles.lockBtnPressed,
          ]}
          onPress={handleLockOn}
          disabled={locking}
        >
          {locking ? (
            <>
              <ActivityIndicator color="#000" size="small" style={{ marginRight: 8 }} />
              <Text style={styles.lockBtnText}>Detecting…</Text>
            </>
          ) : (
            <Text style={styles.lockBtnText}>Lock On</Text>
          )}
        </Pressable>
        <Text style={styles.lockHint}>
          Hold the phone flat above the board for best results
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
  instructionBar: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(220,38,38,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  lockBtnDisabled: {
    backgroundColor: 'rgba(255,215,0,0.5)',
  },
  lockBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  lockBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
  lockHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 10,
  },
});
