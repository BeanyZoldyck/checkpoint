import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import Svg, { Defs, Line, Marker, Polygon, Circle } from 'react-native-svg';

import type { ChessMove } from '@/services/api';

interface MoveArrowOverlayProps {
  move: ChessMove | null;
  width: number;
  height: number;
}

function squareToPixel(
  square: string,
  boardSize: number,
  offsetX: number,
  offsetY: number,
) {
  const file = square.charCodeAt(0) - 97; // a=0 … h=7
  const rank = parseInt(square[1], 10) - 1; // 1=0 … 8=7
  const cell = boardSize / 8;

  // White at bottom: a1 = bottom-left
  const x = offsetX + (file + 0.5) * cell;
  const y = offsetY + (7 - rank + 0.5) * cell;
  return { x, y };
}

export function MoveArrowOverlay({ move, width, height }: MoveArrowOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (move) {
      // Create pulsing animation when a new move is shown
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      
      pulse.start();
      
      // Stop animation after 5 seconds
      const timeout = setTimeout(() => {
        pulse.stop();
        pulseAnim.setValue(1);
      }, 5000);
      
      return () => {
        clearTimeout(timeout);
        pulse.stop();
      };
    }
  }, [move, pulseAnim]);
  
  if (!move || width === 0 || height === 0) return null;

  // Assume the board occupies the central square region of the camera view
  const boardSize = Math.min(width, height) * 0.85;
  const offsetX = (width - boardSize) / 2;
  const offsetY = (height - boardSize) / 2;

  const from = squareToPixel(move.from, boardSize, offsetX, offsetY);
  const to = squareToPixel(move.to, boardSize, offsetX, offsetY);

  const arrowHeadSize = boardSize / 20;
  const strokeWidth = boardSize / 40;
  const circleRadius = boardSize / 35;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Move info banner at top with pulse animation */}
      <Animated.View 
        style={[
          styles.moveBanner,
          {
            transform: [{ scale: pulseAnim }]
          }
        ]}
      >
        <Text style={styles.moveBannerText}>
          🎯 Opponent Move: <Text style={styles.moveHighlight}>{move.san}</Text>
          {' '}({move.from} → {move.to})
        </Text>
      </Animated.View>

      <Svg width={width} height={height}>
        <Defs>
          <Marker
            id="arrowhead"
            markerWidth={arrowHeadSize}
            markerHeight={arrowHeadSize}
            refX={arrowHeadSize * 0.8}
            refY={arrowHeadSize / 2}
            orient="auto"
          >
            <Polygon
              points={`0,0 ${arrowHeadSize},${arrowHeadSize / 2} 0,${arrowHeadSize}`}
              fill="#FF6B35"
              stroke="#FFF"
              strokeWidth="1"
            />
          </Marker>
        </Defs>
        
        {/* From circle (where move started) */}
        <Circle
          cx={from.x}
          cy={from.y}
          r={circleRadius}
          fill="rgba(255, 107, 53, 0.3)"
          stroke="#FF6B35"
          strokeWidth="3"
        />
        
        {/* To circle (where move ended) */}
        <Circle
          cx={to.x}
          cy={to.y}
          r={circleRadius}
          fill="rgba(255, 107, 53, 0.5)"
          stroke="#FF6B35"
          strokeWidth="4"
        />
        
        {/* Move arrow */}
        <Line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="#FF6B35"
          strokeWidth={strokeWidth}
          strokeOpacity={0.9}
          strokeLinecap="round"
          strokeDasharray="10,5"
          markerEnd="url(#arrowhead)"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  moveBanner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 107, 53, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
  },
  moveBannerText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  moveHighlight: {
    fontWeight: 'bold',
    color: '#FFD700',
    fontSize: 18,
  },
});
