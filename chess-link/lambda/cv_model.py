"""
Computer Vision Model for Chess Board Detection
This is a placeholder implementation that can be extended with a real CV model.
"""

import base64
import io
import json
from typing import Dict, List, Optional, Tuple
from PIL import Image
import numpy as np


class ChessBoardDetector:
    """
    Chess board computer vision detector.
    This is a simplified implementation for MVP - replace with trained model.
    """

    def __init__(self):
        self.piece_map = {
            "empty": 0,
            "wP": 1,
            "wR": 2,
            "wN": 3,
            "wB": 4,
            "wQ": 5,
            "wK": 6,
            "bP": 7,
            "bR": 8,
            "bN": 9,
            "bB": 10,
            "bQ": 11,
            "bK": 12,
        }

        # Standard starting position
        self.starting_position = [
            ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
            ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
            ["empty"] * 8,
            ["empty"] * 8,
            ["empty"] * 8,
            ["empty"] * 8,
            ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
            ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
        ]

        self.last_board_state = None

    def process_image(
        self, image_base64: str, calibration_data: Optional[Dict] = None
    ) -> Dict:
        """
        Process a chess board image and return detected board state.

        Args:
            image_base64: Base64 encoded image
            calibration_data: Camera calibration data for perspective correction

        Returns:
            Dictionary with board state and metadata
        """
        try:
            # Decode image
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))

            # Convert to numpy array
            img_array = np.array(image)

            # Apply perspective correction if calibration data is available
            if calibration_data:
                img_array = self._apply_perspective_correction(
                    img_array, calibration_data
                )

            # Detect board state
            board_state = self._detect_board_state(img_array)

            return {
                "success": True,
                "board_state": board_state,
                "confidence": 0.95,  # Mock confidence score
                "processing_time": 0.5,
                "image_size": image.size,
                "detected_pieces": sum(
                    1 for row in board_state for piece in row if piece != "empty"
                ),
            }

        except Exception as e:
            return {"success": False, "error": str(e), "board_state": None}

    def detect_move(
        self,
        current_board: List[List[str]],
        previous_board: Optional[List[List[str]]] = None,
    ) -> Optional[Dict]:
        """
        Detect what move was made by comparing board states.

        Args:
            current_board: Current board state (8x8 array)
            previous_board: Previous board state (8x8 array)

        Returns:
            Move information or None if no move detected
        """
        if previous_board is None:
            previous_board = self.last_board_state or self.starting_position

        # Find differences
        changes = []
        for row in range(8):
            for col in range(8):
                if current_board[row][col] != previous_board[row][col]:
                    changes.append(
                        {
                            "position": self._coords_to_algebraic(row, col),
                            "from_piece": previous_board[row][col],
                            "to_piece": current_board[row][col],
                        }
                    )

        # Analyze changes to determine move
        move = self._analyze_changes(changes)

        # Update last known state
        self.last_board_state = [row[:] for row in current_board]  # Deep copy

        return move

    def _apply_perspective_correction(
        self, image: np.ndarray, calibration_data: Dict
    ) -> np.ndarray:
        """
        Apply perspective correction using calibration data.
        This is a placeholder - implement with OpenCV's getPerspectiveTransform.
        """
        # TODO: Implement actual perspective transformation
        # For now, just return the original image
        return image

    def _detect_board_state(self, image: np.ndarray) -> List[List[str]]:
        """
        Detect pieces on each square of the chess board.
        This is a mock implementation - replace with trained model.
        """
        # For MVP, return starting position with some variation
        # In real implementation, this would:
        # 1. Extract 64 square regions from the image
        # 2. Run piece classification on each square
        # 3. Return 8x8 array of detected pieces

        # Mock: Return starting position for first detection
        if self.last_board_state is None:
            return [row[:] for row in self.starting_position]

        # Mock: Simulate a move (e2-e4) after first detection
        if self.last_board_state == self.starting_position:
            modified_board = [row[:] for row in self.starting_position]
            modified_board[6][4] = "empty"  # e2 becomes empty
            modified_board[4][4] = "wP"  # e4 gets white pawn
            return modified_board

        # Return previous state (no changes detected)
        return [row[:] for row in self.last_board_state]

    def _analyze_changes(self, changes: List[Dict]) -> Optional[Dict]:
        """
        Analyze board changes to determine the move made.
        """
        if len(changes) == 0:
            return None

        # Simple case: one piece moved (2 changes: from square empty, to square filled)
        if len(changes) == 2:
            from_square = None
            to_square = None
            piece = None

            for change in changes:
                if change["to_piece"] == "empty":
                    # This square became empty
                    from_square = change["position"]
                    piece = change["from_piece"]
                elif change["from_piece"] == "empty":
                    # This square was filled
                    to_square = change["position"]

            if from_square and to_square and piece:
                return {
                    "type": "normal_move",
                    "from": from_square,
                    "to": to_square,
                    "piece": piece,
                    "captured": changes[1]["from_piece"]
                    if changes[1]["from_piece"] != "empty"
                    else None,
                }

        # Handle special moves (castling, en passant, promotion) later
        # For now, return None for complex changes
        return None

    def _coords_to_algebraic(self, row: int, col: int) -> str:
        """
        Convert array coordinates to algebraic notation.
        Row 0 = rank 8, Row 7 = rank 1
        Col 0 = file a, Col 7 = file h
        """
        files = "abcdefgh"
        ranks = "87654321"
        return files[col] + ranks[row]

    def _algebraic_to_coords(self, algebraic: str) -> Tuple[int, int]:
        """
        Convert algebraic notation to array coordinates.
        """
        files = "abcdefgh"
        ranks = "87654321"
        col = files.index(algebraic[0])
        row = ranks.index(algebraic[1])
        return row, col

    def board_state_to_fen(self, board_state: List[List[str]], turn: str = "w") -> str:
        """
        Convert board state to FEN notation.
        """
        fen_pieces = {
            "wP": "P",
            "wR": "R",
            "wN": "N",
            "wB": "B",
            "wQ": "Q",
            "wK": "K",
            "bP": "p",
            "bR": "r",
            "bN": "n",
            "bB": "b",
            "bQ": "q",
            "bK": "k",
            "empty": "1",
        }

        fen_rows = []
        for row in board_state:
            fen_row = ""
            empty_count = 0

            for piece in row:
                if piece == "empty":
                    empty_count += 1
                else:
                    if empty_count > 0:
                        fen_row += str(empty_count)
                        empty_count = 0
                    fen_row += fen_pieces[piece]

            if empty_count > 0:
                fen_row += str(empty_count)

            fen_rows.append(fen_row)

        board_fen = "/".join(fen_rows)
        return f"{board_fen} {turn} KQkq - 0 1"  # Simplified FEN


# Example usage for testing
def test_detector():
    """Test the chess board detector with mock data."""
    detector = ChessBoardDetector()

    # Mock image (in real usage, this would be base64 encoded image)
    mock_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

    # Process starting position
    result1 = detector.process_image(mock_image)
    print("Initial detection:", result1)

    # Mock move detection
    starting_pos = detector.starting_position
    modified_pos = [row[:] for row in starting_pos]
    modified_pos[6][4] = "empty"  # e2 empty
    modified_pos[4][4] = "wP"  # e4 pawn

    move = detector.detect_move(modified_pos, starting_pos)
    print("Detected move:", move)

    # Generate FEN
    fen = detector.board_state_to_fen(modified_pos)
    print("FEN:", fen)


if __name__ == "__main__":
    test_detector()
