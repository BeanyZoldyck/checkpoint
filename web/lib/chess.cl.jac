cl import from ".chess-engine" { createChess }

cl {
    # Chess game state management
    class ChessGame {
        def init(fen: str = None) {
            self.engine: Any = createChess(fen);
            self.history: list = [];
            self.gameId: Any = None;
            self.playerColor: str = "white";
            self.opponentColor: str = "black";
            self.isMyTurn: bool = True;
        }

        def get_position() -> dict {
            board = {};
            
            # Use the correct squares for chess.js get() method
            squares = ['a8','b8','c8','d8','e8','f8','g8','h8',
                      'a7','b7','c7','d7','e7','f7','g7','h7',
                      'a6','b6','c6','d6','e6','f6','g6','h6',
                      'a5','b5','c5','d5','e5','f5','g5','h5',
                      'a4','b4','c4','d4','e4','f4','g4','h4',
                      'a3','b3','c3','d3','e3','f3','g3','h3',
                      'a2','b2','c2','d2','e2','f2','g2','h2',
                      'a1','b1','c1','d1','e1','f1','g1','h1'];
            
            for square in squares {
                piece = self.engine.get(square);
                if piece {
                    board[square] = piece["color"] + piece["type"].toUpperCase();
                }
            }
            return board;
        }

        def make_move(move: dict) -> dict {
            prom = move["promotion"] if move.get("promotion") else "q";
            chess_move = self.engine.move({
                "from": move["from"],
                "to": move["to"],
                "promotion": prom
            });
            if chess_move {
                self.history.push(chess_move);
                self.isMyTurn = not self.isMyTurn;
                return {
                    "success": True,
                    "move": chess_move,
                    "fen": self.engine.fen(),
                    "san": chess_move.san,
                    "isCheck": self.engine.inCheck(),
                    "isCheckmate": self.engine.isCheckmate(),
                    "isStalemate": self.engine.isStalemate(),
                    "isDraw": self.engine.isDraw()
                };
            } else {
                return {"success": False, "error": "Invalid move"};
            }
        }

        def get_legal_moves(square: str = None) -> list {
            if square {
                return self.engine.moves({"square": square, "verbose": True});
            } else {
                return self.engine.moves({"verbose": True});
            }
        }

        def is_my_turn() -> bool {
            return self.isMyTurn;
        }

        def get_turn() -> str {
            return self.engine.turn();
        }

        def get_game_status() -> dict {
            return {
                "turn": self.engine.turn(),
                "isCheck": self.engine.inCheck(),
                "isCheckmate": self.engine.isCheckmate(),
                "isStalemate": self.engine.isStalemate(),
                "isDraw": self.engine.isDraw(),
                "isGameOver": self.engine.isGameOver(),
                "fen": self.engine.fen(),
                "moveCount": self.history.length
            };
        }

        def get_move_history() -> list {
            return self.history;
        }

        def undo_move() -> bool {
            move = self.engine.undo();
            if move {
                self.history.pop();
                self.isMyTurn = not self.isMyTurn;
                return True;
            }
            return False;
        }

        def reset() -> None {
            self.engine.reset();
            self.history = [];
            self.isMyTurn = True;
        }

        def load_fen(fen: str) -> bool {
            return self.engine.load(fen);
        }

        def set_player_color(color: str) -> None {
            self.playerColor = color;
            self.opponentColor = "black" if color == "white" else "white";
            self.isMyTurn = color == "white";
        }
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
        game = ChessGame();
        game.init();
        return game.get_position();
    }

    def:pub validate_move(from_square: str, to_square: str, fen: str = None) -> bool {
        game = ChessGame();
        game.init(fen);
        move_result = game.make_move({"from": from_square, "to": to_square});
        return move_result["success"];
    }
}