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
import { configureAWS, getUploadUrl, putImageToS3, completeCalibration } from '@/services/api';
import { getAppSyncConfig } from '@/services/config';

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

  for (let i = 0; i <= 8; i++) {
    const y = offsetY + i * cell;
    lines.push(
      <Line
        key={`h${i}`}
        x1={offsetX}        y1={y}
        x2={offsetX + size} y2={y}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />,
    );
  }

  // Bold border
  lines.push(
    <Line key="bt" x1={offsetX} y1={offsetY}        x2={offsetX + size} y2={offsetY}        stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
    <Line key="bb" x1={offsetX} y1={offsetY + size} x2={offsetX + size} y2={offsetY + size} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
    <Line key="bl" x1={offsetX} y1={offsetY}        x2={offsetX}        y2={offsetY + size} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
    <Line key="br" x1={offsetX + size} y1={offsetY} x2={offsetX + size} y2={offsetY + size} stroke="rgba(255,215,0,0.6)" strokeWidth="2" />,
  );

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Derive board corners from the captured image dimensions.
//
// The backend CV pipeline is not yet returning corners, so we compute a
// reasonable approximation: assume the board occupies the central 80% of
// the image (square crop). This will be replaced once the backend returns
// real corner coordinates.
// ---------------------------------------------------------------------------
function cornersFromImageSize(imageWidth: number, imageHeight: number): BoardCorners {
  const boardSize = Math.min(imageWidth, imageHeight) * 0.80;
  const offsetX = (imageWidth  - boardSize) / 2;
  const offsetY = (imageHeight - boardSize) / 2;
  return {
    topLeft:     { x: offsetX,            y: offsetY },
    topRight:    { x: offsetX + boardSize, y: offsetY },
    bottomRight: { x: offsetX + boardSize, y: offsetY + boardSize },
    bottomLeft:  { x: offsetX,            y: offsetY + boardSize },
  };
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
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setLockedBoard } = useGame();

  const handleLockOn = useCallback(async () => {
    if (!cameraRef.current || locking) return;
    setLocking(true);
    setError(null);
    setStatusMsg('Capturing…');

    try {
      // 1. Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      if (!photo?.uri || !photo.width || !photo.height) {
        throw new Error('No photo captured');
      }

      // 2. Derive board corners and advance to game immediately
      const corners = cornersFromImageSize(photo.width, photo.height);
      setLockedBoard(corners, photo.width, photo.height);

      // 3. Fire-and-forget backend sync (non-blocking)
      configureAWS(getAppSyncConfig());
      getUploadUrl().then(uploadInfo => {
        if (!uploadInfo) return;
        return putImageToS3(uploadInfo.uploadUrl, photo.uri).then(uploaded => {
          if (!uploaded) return;
          const calibrationData = JSON.stringify({
            corners,
            imageWidth:  photo.width,
            imageHeight: photo.height,
            s3Key: uploadInfo.s3Key,
          });
          return completeCalibration(calibrationData);
        });
      }).catch(err => console.warn('[BoardLock] background sync failed (non-fatal):', err));

    } catch (err: any) {
      console.error('Lock-on failed:', err);
      setError(err?.message ?? 'Something went wrong — try again');
    } finally {
      setLocking(false);
      setStatusMsg(null);
    }
  }, [locking, setLockedBoard]);

  if (!permission) return <View style={styles.center} />;

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
              <Text style={styles.lockBtnText}>{statusMsg ?? 'Working…'}</Text>
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
