import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, Marker, Polygon } from 'react-native-svg';

interface Pixel { x: number; y: number }

interface MoveArrowOverlayProps {
  /** Pre-computed pixel centre of the source square (in screen/preview coordinates) */
  fromPixel: Pixel | null;
  /** Pre-computed pixel centre of the destination square */
  toPixel: Pixel | null;
  /** Human-readable move label shown in the banner, e.g. "e2 → e4" */
  moveLabel: string | null;
  width: number;
  height: number;
}

export function MoveArrowOverlay({
  fromPixel,
  toPixel,
  moveLabel,
  width,
  height,
}: MoveArrowOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fromPixel && toPixel) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 750, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 750, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      const timeout = setTimeout(() => {
        pulse.stop();
        pulseAnim.setValue(1);
      }, 5000);
      return () => {
        clearTimeout(timeout);
        pulse.stop();
      };
    }
  }, [fromPixel, toPixel, pulseAnim]);

  if (!fromPixel || !toPixel || width === 0 || height === 0) return null;

  // Scale arrow dimensions relative to the preview size
  const ref = Math.min(width, height);
  const strokeWidth  = ref / 40;
  const circleRadius = ref / 35;
  const arrowHead    = ref / 20;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Banner */}
      {moveLabel && (
        <Animated.View style={[styles.banner, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.bannerText}>
            Opponent: <Text style={styles.bannerHighlight}>{moveLabel}</Text>
          </Text>
        </Animated.View>
      )}

      <Svg width={width} height={height}>
        <Defs>
          <Marker
            id="arrowhead"
            markerWidth={arrowHead}
            markerHeight={arrowHead}
            refX={arrowHead * 0.8}
            refY={arrowHead / 2}
            orient="auto"
          >
            <Polygon
              points={`0,0 ${arrowHead},${arrowHead / 2} 0,${arrowHead}`}
              fill="#FFD700"
              stroke="#fff"
              strokeWidth="1"
            />
          </Marker>
        </Defs>

        {/* Origin circle */}
        <Circle
          cx={fromPixel.x} cy={fromPixel.y} r={circleRadius}
          fill="rgba(255,215,0,0.25)"
          stroke="#FFD700"
          strokeWidth="3"
        />

        {/* Destination circle */}
        <Circle
          cx={toPixel.x} cy={toPixel.y} r={circleRadius}
          fill="rgba(255,215,0,0.5)"
          stroke="#FFD700"
          strokeWidth="4"
        />

        {/* Arrow shaft */}
        <Line
          x1={fromPixel.x} y1={fromPixel.y}
          x2={toPixel.x}   y2={toPixel.y}
          stroke="#FFD700"
          strokeWidth={strokeWidth}
          strokeOpacity={0.92}
          strokeLinecap="round"
          markerEnd="url(#arrowhead)"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    zIndex: 1000,
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  bannerHighlight: {
    color: '#FFD700',
    fontWeight: '800',
    fontSize: 17,
  },
});
