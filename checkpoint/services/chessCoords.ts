// ============================================================================
// chessCoords.ts — Pure math utility (no React Native dependencies)
//
// Converts a chess square name (e.g. "e2") to pixel coordinates on screen,
// using the four corners of the board as detected by the Lambda function.
//
// Coordinate system
// -----------------
//   Lambda returns corners relative to the full captured photo resolution.
//   The on-screen camera preview is typically smaller, so we scale every
//   pixel coordinate by (previewWidth / imageWidth, previewHeight / imageHeight).
//
// Board orientation
// -----------------
//   White perspective: a1 = bottomLeft, h1 = bottomRight, a8 = topLeft
//   Black perspective: a1 = topRight,   h1 = topLeft,    a8 = bottomRight
//
// Interpolation
// -------------
//   The board quad may not be a perfect rectangle (handheld perspective skew).
//   We use bilinear interpolation across the quad:
//
//     P(u, v) = (1-u)(1-v)·TL + u(1-v)·TR + (1-u)v·BL + u·v·BR
//
//   where u ∈ [0,1] goes left→right and v ∈ [0,1] goes top→bottom
//   in the *image* coordinate frame (y increases downward).
// ============================================================================

export interface BoardCorners {
  topLeft:     { x: number; y: number };
  topRight:    { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft:  { x: number; y: number };
}

/**
 * Parse a square name like "e2" into (col, row) indices, both 0–7.
 *   col: 0 = file a … 7 = file h
 *   row: 0 = rank 1 … 7 = rank 8
 *
 * Throws if the input is not a valid square name.
 */
export function parseSquare(square: string): { col: number; row: number } {
  if (square.length !== 2) throw new Error(`Invalid square: "${square}"`);
  const file = square.charCodeAt(0) - 97; // 'a'=0 … 'h'=7
  const rank = parseInt(square[1], 10) - 1; // '1'=0 … '8'=7
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    throw new Error(`Square out of range: "${square}"`);
  }
  return { col: file, row: rank };
}

/**
 * Bilinear interpolation across the board quad.
 *
 * @param u  0 = left edge of board,  1 = right edge (in image coordinates)
 * @param v  0 = top edge of board,   1 = bottom edge (y increases downward)
 * @param corners  The four corners of the board in image pixel coordinates
 */
function bilinear(
  u: number,
  v: number,
  corners: BoardCorners,
): { x: number; y: number } {
  const { topLeft: TL, topRight: TR, bottomLeft: BL, bottomRight: BR } = corners;
  const x =
    (1 - u) * (1 - v) * TL.x +
    u       * (1 - v) * TR.x +
    (1 - u) * v       * BL.x +
    u       * v       * BR.x;
  const y =
    (1 - u) * (1 - v) * TL.y +
    u       * (1 - v) * TR.y +
    (1 - u) * v       * BL.y +
    u       * v       * BR.y;
  return { x, y };
}

/**
 * Convert a chess square to the pixel center of that square on the camera
 * preview, given the board corners from the Lambda detector.
 *
 * @param square       Algebraic notation, e.g. "e2"
 * @param corners      Board corners in captured-image pixel space (from Lambda)
 * @param playerColor  Whose perspective to use ("white" or "black")
 * @param imageWidth   Full photo width that Lambda processed
 * @param imageHeight  Full photo height that Lambda processed
 * @param previewWidth  On-screen camera preview width in logical pixels
 * @param previewHeight On-screen camera preview height in logical pixels
 * @returns Pixel center of the square in preview (screen) coordinates
 */
export function squareToPixel(
  square: string,
  corners: BoardCorners,
  playerColor: 'white' | 'black',
  imageWidth: number,
  imageHeight: number,
  previewWidth: number,
  previewHeight: number,
): { x: number; y: number } {
  const { col, row } = parseSquare(square);

  // Compute the normalized (u, v) position of the square's center.
  // Each cell is 1/8 of the board; we want the center, so offset by 0.5.
  //
  // White perspective (y increases downward in image):
  //   u: col 0 (a-file) → left (u=0),  col 7 (h-file) → right (u=1)
  //   v: row 0 (rank 1)  → bottom,      row 7 (rank 8) → top
  //      so v = (7 - row + 0.5) / 8  ... but image y=0 is at top, so
  //      rank 8 has small v (top), rank 1 has large v (bottom):
  //      v = (7 - row + 0.5) / 8  is correct (rank 8 → v≈0.0625, rank 1 → v≈0.9375)
  //
  // Black perspective: flip both axes.

  let u: number;
  let v: number;

  if (playerColor === 'white') {
    u = (col + 0.5) / 8;
    v = (7 - row + 0.5) / 8;
  } else {
    // Black: a-file is on the right, rank 1 is at the top
    u = (7 - col + 0.5) / 8;
    v = (row + 0.5) / 8;
  }

  // Interpolate to image-space pixel
  const imagePixel = bilinear(u, v, corners);

  // Scale from image resolution to preview resolution
  const scaleX = previewWidth / imageWidth;
  const scaleY = previewHeight / imageHeight;

  return {
    x: imagePixel.x * scaleX,
    y: imagePixel.y * scaleY,
  };
}

/**
 * Convenience: convert a UCI move string (e.g. "e2e4") to from/to pixels.
 * Returns null if the string is malformed.
 */
export function uciToPixels(
  uci: string,
  corners: BoardCorners,
  playerColor: 'white' | 'black',
  imageWidth: number,
  imageHeight: number,
  previewWidth: number,
  previewHeight: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (uci.length < 4) return null;
  try {
    const fromSquare = uci.slice(0, 2);
    const toSquare   = uci.slice(2, 4);
    const from = squareToPixel(
      fromSquare, corners, playerColor,
      imageWidth, imageHeight, previewWidth, previewHeight,
    );
    const to = squareToPixel(
      toSquare, corners, playerColor,
      imageWidth, imageHeight, previewWidth, previewHeight,
    );
    return { from, to };
  } catch {
    return null;
  }
}
