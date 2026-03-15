cl import from "react" { useState, useEffect, useCallback }
cl import from ".Chessboard" { Chessboard }
cl import from "..ui.button" { Button }
cl import from "..ui.card" { Card, CardContent, CardHeader, CardTitle }
cl import from "..ui.badge" { Badge }
cl import from "..ui.alert" { Alert, AlertTitle, AlertDescription }
cl import from "..ui.separator" { Separator }
cl import from "...lib.chess" { create_game, get_starting_position }

cl {
    def:pub ChessGame(props: {
        gameCode: str,
        playerName: str,
        playerColor?: str,
        gameType?: str,  # "digital" or "physical"
        onLeaveGame?: Function
    }) -> JsxElement {
        [game, setGame] = useState(None);
        [position, setPosition] = useState({});
        [gameStatus, setGameStatus] = useState({});
        [moveHistory, setMoveHistory] = useState([]);
        [lastMove, setLastMove] = useState({});
        [highlightedSquares, setHighlightedSquares] = useState([]);
        [isConnected, setIsConnected] = useState(True);
        [opponentName, setOpponentName] = useState("Waiting...");
        [statusMessage, setStatusMessage] = useState("Game starting...");
        [playerColor, setPlayerColor] = useState(props["playerColor"] or "white");
        [mockConnection, setMockConnection] = useState({
            "connected": True,
            "gameState": "waiting_for_opponent"
        });

        useEffect(lambda() -> None {
            # Initialize game state
            newGame = create_game(props["gameCode"]);
            setGame(newGame);
            newGame.set_player_color(playerColor);
            setPosition(newGame.get_position());
            setGameStatus(newGame.get_game_status());
            
            # Mock opponent connection after 2 seconds
            setTimeout(lambda() -> None {
                setMockConnection({"connected": True, "gameState": "active"});
                if props["gameType"] == "physical" {
                    setOpponentName("Digital Player");
                } else {
                    setOpponentName("Physical Player");
                }
                setStatusMessage(f"Connected! Playing as {playerColor}");
                setIsConnected(True);
            }, 2000);
        }, []);

        def handle_move(move: dict) -> None {
            if not game or not game.is_my_turn() {
                setStatusMessage("It's not your turn!");
                return;
            }

            has move_result: dict;
            move_result = game.make_move(move);
            
            if move_result["success"] {
                setPosition(game.get_position());
                setGameStatus(game.get_game_status());
                setMoveHistory(game.get_move_history());
                setLastMove({
                    "from": move["from"],
                    "to": move["to"]
                });
                
                # Check for game ending conditions
                if move_result["isCheckmate"] {
                    setStatusMessage("Checkmate! You win!");
                } elif move_result["isStalemate"] {
                    setStatusMessage("Stalemate - Draw!");
                } elif move_result["isDraw"] {
                    setStatusMessage("Draw!");
                } elif move_result["isCheck"] {
                    setStatusMessage(f"Check! {move_result['san']}");
                } else {
                    setStatusMessage("Waiting for opponent...");
                }

                # Mock sending move to opponent
                mock_send_move_to_opponent(move_result);
            } else {
                setStatusMessage(f"Invalid move: {move_result['error']}");
            }
        }

        def mock_send_move_to_opponent(move_result: dict) -> None {
            # Simulate opponent move after random delay (2-8 seconds)
            has delay: int = 2000 + 3000;

            setTimeout(lambda() -> None {
                if game and not gameStatus["isGameOver"] {
                    # Get random legal move for opponent
                    has legal_moves: list = game.get_legal_moves();
                    if legal_moves.length > 0 {
                        has random_index: int = 0;
                        if legal_moves.length > 1 {
                            random_index = 1;
                        }
                        has random_move: dict = legal_moves[random_index];
                        has opponent_result: dict = game.make_move({
                            "from": random_move["from"],
                            "to": random_move["to"],
                            "promotion": random_move["promotion"]
                        });
                        
                        if opponent_result["success"] {
                            setPosition(game.get_position());
                            setGameStatus(game.get_game_status());
                            setMoveHistory(game.get_move_history());
                            setLastMove({
                                "from": random_move["from"],
                                "to": random_move["to"]
                            });
                            
                            if opponent_result["isCheckmate"] {
                                setStatusMessage("Checkmate! You lose!");
                            } elif opponent_result["isStalemate"] {
                                setStatusMessage("Stalemate - Draw!");
                            } elif opponent_result["isDraw"] {
                                setStatusMessage("Draw!");
                            } elif opponent_result["isCheck"] {
                                setStatusMessage(f"Check! Opponent played {opponent_result['san']}");
                            } else {
                                setStatusMessage(f"Opponent played {opponent_result['san']}. Your turn!");
                            }
                        }
                    }
                }
            }, delay);
        }

        def handle_resign() -> None {
            setStatusMessage("You resigned. Game over.");
            has newStatus: dict = gameStatus;
            newStatus["isGameOver"] = True;
            setGameStatus(newStatus);
        }

        def handle_offer_draw() -> None {
            setStatusMessage("Draw offer sent to opponent");
        }

        def handle_leave_game() -> None {
            if props["onLeaveGame"] {
                props["onLeaveGame"]();
            }
        }

        def get_status_variant() -> str {
            if statusMessage.includes("Checkmate") or statusMessage.includes("resign") {
                return "destructive";
            } elif statusMessage.includes("Check") {
                return "secondary";
            } elif statusMessage.includes("Draw") or statusMessage.includes("Stalemate") {
                return "outline";
            } else {
                return "default";
            }
        }

        def get_connection_badge_variant() -> str {
            if isConnected {
                return "default";
            } else {
                return "destructive";
            }
        }

        def get_connection_status_text() -> str {
            if isConnected {
                return "Connected";
            } else {
                return "Disconnected";
            }
        }

        def format_player_color() -> str {
            return playerColor[0].toUpperCase() + playerColor[1:];
        }

        def get_current_player_badge_variant() -> str {
            if gameStatus["turn"] == playerColor {
                return "default";
            } else {
                return "secondary";
            }
        }

        def get_opponent_badge_variant() -> str {
            if gameStatus["turn"] != playerColor {
                return "default";
            } else {
                return "secondary";
            }
        }

        def get_opponent_color() -> str {
            if playerColor == "white" {
                return "black";
            } else {
                return "white";
            }
        }

        def get_current_turn_text() -> str {
            if gameStatus["turn"] == "w" {
                return "White";
            } else {
                return "Black";
            }
        }

        def get_game_status_text() -> str {
            if gameStatus["isCheckmate"] {
                return "Checkmate";
            } elif gameStatus["isStalemate"] {
                return "Stalemate";
            } elif gameStatus["isDraw"] {
                return "Draw";
            } elif gameStatus["isCheck"] {
                return "Check";
            } else {
                return "In progress";
            }
        }

        def format_move_history() -> list {
            has formatted: list = [];
            has i: int = 0;
            while i < moveHistory.length {
                has move_number: int = (i // 2) + 1;
                has white_move: str = "";
                if i < moveHistory.length {
                    white_move = (moveHistory[i]["san"] if moveHistory[i] else "") or "";
                }
                has black_move: str = "";
                if i + 1 < moveHistory.length {
                    black_move = (moveHistory[i + 1]["san"] if moveHistory[i + 1] else "") or "";
                }
                formatted.push({
                    "number": move_number,
                    "white": white_move,
                    "black": black_move
                });
                i = i + 2;
            }
            return formatted;
        }

        def render_move_history_items() -> list {
            has items: list = [];
            has formatted: list = format_move_history();
            has i: int = 0;
            while i < formatted.length {
                has move: dict = formatted[i];
                items.push(<div className="flex items-center gap-4 text-sm font-mono">
                    <span className="w-6 text-muted-foreground">{move["number"]}.</span>
                    <span className="w-12">{move["white"]}</span>
                    <span className="w-12">{move["black"]}</span>
                </div>);
                i = i + 1;
            }
            return items;
        }

        return <div className="flex flex-col lg:flex-row gap-6 p-4 max-w-7xl mx-auto">
            <div className="flex-1 space-y-4">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">
                                Game {props["gameCode"]}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant={get_connection_badge_variant()}>
                                    {get_connection_status_text()}
                                </Badge>
                                <Badge variant="outline">
                                    {format_player_color()}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Alert variant={get_status_variant()}>
                            <AlertTitle>Game Status</AlertTitle>
                            <AlertDescription>{statusMessage}</AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>

                <div className="flex justify-center">
                    <Chessboard
                        position={position}
                        orientation={playerColor}
                        onMove={handle_move}
                        lastMove={lastMove}
                        highlightSquares={highlightedSquares}
                        showCoordinates={True}
                        size={480}
                    />
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap gap-2 justify-center">
                            <Button
                                variant="outline"
                                onClick={handle_offer_draw}
                                disabled={gameStatus["isGameOver"]}
                            >
                                Offer Draw
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handle_resign}
                                disabled={gameStatus["isGameOver"]}
                            >
                                Resign
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handle_leave_game}
                            >
                                Leave Game
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="w-full lg:w-80 space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Players</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span>{props["playerName"]}</span>
                            <Badge variant={get_current_player_badge_variant()}>
                                {playerColor}
                            </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span>{opponentName}</span>
                            <Badge variant={get_opponent_badge_variant()}>
                                {get_opponent_color()}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Move History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-60 overflow-y-auto">
                            {format_move_history().length > 0 &&
                                <div className="space-y-1">
                                    {render_move_history_items()}
                                </div>
                            }
                            {format_move_history().length == 0 &&
                                <p className="text-sm text-muted-foreground">No moves yet</p>
                            }
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Game Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Move count:</span>
                            <span>{moveHistory.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Turn:</span>
                            <span>{get_current_turn_text()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Status:</span>
                            <span>{get_game_status_text()}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>;
    }
}