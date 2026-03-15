import { Chess } from "chess.js";

export function createChess(fen) {
  return new Chess(fen);
}
