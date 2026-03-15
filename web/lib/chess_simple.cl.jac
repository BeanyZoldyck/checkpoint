cl {
    # Simplified Chess game with hardcoded starting position
    class ChessGame {
        def init(fen: str = None) {
            # Initialize with empty board
            self.position: dict = {};
            self.history: list = [];
            self.gameId: Any = None;
            self.playerColor: str = "white";
            self.opponentColor: str = "black";
            self.isMyTurn: bool = True;
            self.turn: str = "w";  # 'w' for white, 'b' for black
            self.gameOver: bool = False;
            self.isCheck: bool = False;
        }

        def get_position(self) -> dict {
            return self.position;
        }

        def place_piece(self, square: str, piece: str) -> bool {
            # Place a piece on the specified square
            # piece format: "wK", "bQ", "wP", etc.
            if square and piece {
                self.position[square] = piece;
                return True;
            }
            return False;
        }

        def remove_piece(self, square: str) -> bool {
            # Remove piece from the specified square
            if square in self.position {
                del self.position[square];
                return True;
            }
            return False;
        }

        def make_move(self, move: dict) -> dict {
            # Basic move validation and execution
            from_square = move["from"];
            to_square = move["to"];
            
            # Check if there's a piece at the source square
            if from_square not in self.position {
                return {"success": False, "error": "No piece at source square"};
            }
            
            piece = self.position[from_square];
            
            # Basic validation: check piece color matches current turn
            piece_color = piece[0];  # 'w' or 'b'
            if piece_color != self.turn {
                return {"success": False, "error": "Not your turn"};
            }
            
            # Move the piece
            del self.position[from_square];
            self.position[to_square] = piece;
            
            # Switch turns
            self.turn = "b" if self.turn == "w" else "w";
            self.isMyTurn = not self.isMyTurn;
            
            # Create move record
            move_record = {
                "from": from_square,
                "to": to_square,
                "piece": piece,
                "san": f"{piece[1]}{to_square}"  # Simple algebraic notation
            };
            
            self.history.push(move_record);
            
            return {
                "success": True,
                "move": move_record,
                "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "san": move_record["san"],
                "isCheck": False,
                "isCheckmate": False,
                "isStalemate": False,
                "isDraw": False
            };
        }

        def get_legal_moves(self, square: str = None) -> list {
            # Return some basic legal moves for demonstration
            legal_moves = [];
            
            # Add some sample pawn moves
            if square == "e2" {
                legal_moves.push({"from": "e2", "to": "e3", "piece": "wP"});
                legal_moves.push({"from": "e2", "to": "e4", "piece": "wP"});
            } elif square == "e7" {
                legal_moves.push({"from": "e7", "to": "e6", "piece": "bP"});
                legal_moves.push({"from": "e7", "to": "e5", "piece": "bP"});
            }
            
            return legal_moves;
        }

        def is_my_turn(self) -> bool {
            return self.isMyTurn;
        }

        def get_turn(self) -> str {
            return self.turn;
        }

        def get_game_status(self) -> dict {
            return {
                "turn": self.turn,
                "isCheck": self.isCheck,
                "isCheckmate": False,
                "isStalemate": False,
                "isDraw": False,
                "isGameOver": self.gameOver,
                "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "moveCount": self.history.length
            };
        }

        def get_move_history(self) -> list {
            return self.history;
        }

        def undo_move(self) -> bool {
            if self.history.length > 0 {
                last_move = self.history.pop();
                # Restore piece position
                self.position[last_move["from"]] = last_move["piece"];
                if last_move["to"] in self.position {
                    del self.position[last_move["to"]];
                }
                # Switch turn back
                self.turn = "b" if self.turn == "w" else "w";
                self.isMyTurn = not self.isMyTurn;
                return True;
            }
            return False;
        }

        def reset(self) -> None {
            self.position = {};  # Empty board
            self.history = [];
            self.isMyTurn = True;
            self.turn = "w";
            self.gameOver = False;
        }

        def set_player_color(self, color: str) -> None {
            self.playerColor = color;
            self.opponentColor = "black" if color == "white" else "white";
            self.isMyTurn = color == "white";
        }
    }

    # Hardcoded starting chess position
    def get_starting_chess_position() -> dict {
        return {
            # Black pieces
            "a8": "bR", "b8": "bN", "c8": "bB", "d8": "bQ", "e8": "bK", "f8": "bB", "g8": "bN", "h8": "bR",
            "a7": "bP", "b7": "bP", "c7": "bP", "d7": "bP", "e7": "bP", "f7": "bP", "g7": "bP", "h7": "bP",
            
            # White pieces  
            "a1": "wR", "b1": "wN", "c1": "wB", "d1": "wQ", "e1": "wK", "f1": "wB", "g1": "wN", "h1": "wR",
            "a2": "wP", "b2": "wP", "c2": "wP", "d2": "wP", "e2": "wP", "f2": "wP", "g2": "wP", "h2": "wP"
        };
    }

    # Utility functions
    def:pub create_game(gameId: str = None) -> ChessGame {
        game = ChessGame();
        game.init();
        if gameId {
            game.gameId = gameId;
        }
        return game;
    }

    def:pub get_starting_position() -> dict {
        return {};  # Return empty board
    }

    def:pub validate_move(from_square: str, to_square: str, fen: str = None) -> bool {
        game = ChessGame();
        game.init(fen);
        move_result = game.make_move({"from": from_square, "to": to_square});
        return move_result["success"];
    }
}