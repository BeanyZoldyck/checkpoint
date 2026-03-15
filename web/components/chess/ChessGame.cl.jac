cl import from "react" { useState, useEffect, useRef }
cl import from ".Chessboard" { Chessboard }
cl import from "..ui.button" { Button }
cl import from "..ui.card" { Card, CardContent, CardHeader, CardTitle }
cl import from "..ui.badge" { Badge }
cl import from "..ui.alert" { Alert, AlertTitle, AlertDescription }
cl import from "..ui.separator" { Separator }
cl import from "...lib.chess" { create_game }
cl import from "...lib.api" {
    connectDigitalPlayer,
    completeCalibration,
    makeDigitalMove,
    updatePlayerConnection,
    subscribeToMoves,
    resetGame
}

cl {
    def:pub ChessGame(props: {
        gameCode: str,
        playerName: str,
        playerColor?: str,
        gameType?: str,
        onLeaveGame?: Function
    }) -> JsxElement {
        [game, setGame] = useState(None);
        [position, setPosition] = useState({});
        [moveHistory, setMoveHistory] = useState([]);
        [lastMove, setLastMove] = useState({});
        [highlightedSquares, setHighlightedSquares] = useState([]);
        [wsStatus, setWsStatus] = useState("disconnected");
        [opponentConnected, setOpponentConnected] = useState(False);
        [opponentName, setOpponentName] = useState("Waiting for opponent...");
        [statusMessage, setStatusMessage] = useState("Connecting to game...");
        [playerColor, setPlayerColor] = useState(props["playerColor"] if props["playerColor"] else "white");
        [gameStatus, setGameStatus] = useState("WAITING_FOR_PLAYERS");
        [currentTurn, setCurrentTurn] = useState("white");
        [isSendingMove, setIsSendingMove] = useState(False);
        [isStartingGame, setIsStartingGame] = useState(False);
        [isResetting, setIsResetting] = useState(False);

        unsubRef = useRef(None);
        stateRef = useRef({"game": None, "moveHistory": [], "playerColor": "white"});
        stateRef.current = {"game": game, "moveHistory": moveHistory, "playerColor": playerColor};

        def refresh_position(g: Any) -> None {
            if g {
                setPosition(g.get_position());
            }
        }

        def is_my_turn() -> bool {
            return currentTurn == playerColor;
        }

        def apply_incoming_move(move: dict) -> None {
            cur = stateRef.current;
            if not cur["game"] { return; }
            move_color = (move["playerColor"] if move["playerColor"] else "").toLowerCase();
            if move_color == cur["playerColor"] { return; }

            result = cur["game"].make_move({"from": move["from"], "to": move["to"]});
            if result["success"] {
                refresh_position(cur["game"]);
                setLastMove({"from": move["from"], "to": move["to"]});
                newHistory = cur["moveHistory"].slice(0);
                newHistory.push({"san": result["san"], "color": move_color});
                setMoveHistory(newHistory);
                new_turn = "white" if move_color == "black" else "black";
                setCurrentTurn(new_turn);
                if result["isCheckmate"] {
                    setStatusMessage(f"Checkmate! {move_color.charAt(0).toUpperCase() + move_color.slice(1)} wins!");
                    setGameStatus("COMPLETED");
                } elif result["isStalemate"] or result["isDraw"] {
                    setStatusMessage("Draw!");
                    setGameStatus("COMPLETED");
                } elif result["isCheck"] {
                    setStatusMessage("Check! Your turn.");
                } else {
                    setStatusMessage("Your turn!" if new_turn == cur["playerColor"] else "Opponent's turn...");
                }
            }
        }

        useEffect(lambda() -> None {
            g = create_game();
            setGame(g);
            refresh_position(g);

            connectDigitalPlayer().then(lambda(gameData: Any) -> None {
                if gameData {
                    dc = (gameData["digitalPlayerColor"] if gameData["digitalPlayerColor"] else "WHITE").toLowerCase();
                    setPlayerColor(dc);
                    g.set_player_color(dc);
                    setOpponentConnected(gameData["physicalPlayerConnected"] or False);
                    if gameData["physicalPlayerConnected"] {
                        setOpponentName("Physical Player");
                    }

                    def apply_active_state(status: str, fen: str, turn_raw: str) -> None {
                        setGameStatus(status);
                        if fen { g.load_fen(fen); refresh_position(g); }
                        turn = turn_raw.toLowerCase() if turn_raw else "white";
                        setCurrentTurn(turn);
                        setStatusMessage("Your turn!" if turn == dc else "Waiting for opponent's move...");
                    }

                    if gameData["status"] == "ACTIVE" {
                        apply_active_state("ACTIVE", gameData["currentFEN"], gameData["currentTurn"] if gameData["currentTurn"] else "WHITE");
                    } else {
                        # Auto-activate the game so moves can be sent immediately
                        setStatusMessage("Activating game...");
                        completeCalibration().then(lambda(result: Any) -> None {
                            fen = result["currentFEN"] if result and result.get("currentFEN") else gameData["currentFEN"];
                            turn_raw = result["currentTurn"] if result and result.get("currentTurn") else "WHITE";
                            apply_active_state("ACTIVE", fen, turn_raw);
                        }).catch(lambda(err: Any) -> None {
                            # completeCalibration failed — still set ACTIVE locally so the board is usable
                            apply_active_state("ACTIVE", gameData["currentFEN"], gameData["currentTurn"] if gameData["currentTurn"] else "WHITE");
                        });
                    }
                }
            }).catch(lambda(err: Any) -> None {
                setStatusMessage("Could not reach server — moves will not sync.");
            });

            unsub = subscribeToMoves(
                lambda(move: Any) -> None { apply_incoming_move(move); },
                lambda(status: str) -> None { setWsStatus(status); }
            );
            unsubRef.current = unsub;
            updatePlayerConnection(True);

            return lambda() -> None {
                if unsubRef.current { unsubRef.current(); }
                updatePlayerConnection(False);
            };
        }, []);

        def handle_test_e4() -> None {
            if not game { return; }
            if isSendingMove { return; }
            result = game.make_move({"from": "e2", "to": "e4", "promotion": "q"});
            if not result["success"] {
                setStatusMessage("e4 not available (already played or illegal).");
                return;
            }
            refresh_position(game);
            setLastMove({"from": "e2", "to": "e4"});
            newHistory = moveHistory.slice(0);
            newHistory.push({"san": result["san"], "color": playerColor});
            setMoveHistory(newHistory);
            opp_turn = "black" if currentTurn == "white" else "white";
            setCurrentTurn(opp_turn);
            setStatusMessage("Waiting for opponent's move...");
            setIsSendingMove(True);
            makeDigitalMove("e2", "e4", None).then(lambda(r: Any) -> None {
                setIsSendingMove(False);
            }).catch(lambda(err: Any) -> None {
                setIsSendingMove(False);
                console.error("test e4 failed:", err);
                game.undo_move();
                refresh_position(game);
                setMoveHistory(newHistory.slice(0, -1));
                setCurrentTurn(currentTurn);
                errMsg = (err.message if err and err.message else String(err));
                setStatusMessage(f"Failed: {errMsg}");
            });
        }

        def handle_move(move: dict) -> None {
            if not game { return; }
            if not is_my_turn() {
                setStatusMessage("Not your turn!");
                return;
            }
            if isSendingMove { return; }

            result = game.make_move({
                "from": move["from"],
                "to": move["to"],
                "promotion": move["promotion"] if move.get("promotion") else "q"
            });

            if not result["success"] {
                setStatusMessage("Illegal move.");
                return;
            }

            refresh_position(game);
            setLastMove({"from": move["from"], "to": move["to"]});
            newHistory = moveHistory.slice(0);
            newHistory.push({"san": result["san"], "color": playerColor});
            setMoveHistory(newHistory);
            opp_turn = "black" if playerColor == "white" else "white";
            setCurrentTurn(opp_turn);

            if result["isCheckmate"] {
                setStatusMessage("Checkmate! You win!");
                setGameStatus("COMPLETED");
            } elif result["isStalemate"] or result["isDraw"] {
                setStatusMessage("Draw!");
                setGameStatus("COMPLETED");
            } elif result["isCheck"] {
                setStatusMessage("Check! Waiting for opponent...");
            } else {
                setStatusMessage("Waiting for opponent's move...");
            }

            setIsSendingMove(True);
            prom = move["promotion"] if move.get("promotion") else None;
            makeDigitalMove(move["from"], move["to"], prom).then(lambda(r: Any) -> None {
                setIsSendingMove(False);
            }).catch(lambda(err: Any) -> None {
                setIsSendingMove(False);
                console.error("makeDigitalMove failed:", err);
                if game { game.undo_move(); }
                refresh_position(game);
                setMoveHistory(newHistory.slice(0, -1));
                setCurrentTurn(playerColor);
                errMsg = (err.message if err and err.message else String(err));
                setStatusMessage(f"Failed: {errMsg}");
            });
        }

        def handle_start_game() -> None {
            setIsStartingGame(True);
            completeCalibration().then(lambda(result: Any) -> None {
                setIsStartingGame(False);
                setGameStatus("ACTIVE");
                if game {
                    game.reset();
                    refresh_position(game);
                }
                # Use the turn returned by the server; fall back to current state.
                serverTurn = (result["currentTurn"] if result and result.get("currentTurn") else None);
                activeTurn = serverTurn.toLowerCase() if serverTurn else currentTurn;
                setCurrentTurn(activeTurn);
                cur_color = stateRef.current["playerColor"];
                setStatusMessage("Your turn!" if activeTurn == cur_color else "Waiting for opponent's move...");
            }).catch(lambda(err: Any) -> None {
                setIsStartingGame(False);
                setStatusMessage("Failed to start game. Try again.");
            });
        }

        def handle_resign() -> None {
            setStatusMessage("You resigned.");
            setGameStatus("COMPLETED");
        }

        def handle_reset_game() -> None {
            setIsResetting(True);
            resetGame().then(lambda(_result: Any) -> None {
                g = create_game();
                setGame(g);
                refresh_position(g);
                setMoveHistory([]);
                setLastMove({});
                setCurrentTurn("white");
                setStatusMessage("Your turn!" if playerColor == "white" else "Waiting for opponent's move...");
                setIsResetting(False);
            }).catch(lambda(_err: Any) -> None {
                setIsResetting(False);
                setStatusMessage("Failed to reset game.");
            });
        }

        def handle_leave_game() -> None {
            if unsubRef.current { unsubRef.current(); }
            updatePlayerConnection(False);
            if props["onLeaveGame"] { props["onLeaveGame"](); }
        }

        def get_status_variant() -> str {
            if statusMessage.includes("Checkmate") or statusMessage.includes("resign") {
                return "destructive";
            } elif statusMessage.includes("Check!") {
                return "secondary";
            } elif statusMessage.includes("Draw") or statusMessage.includes("Stalemate") {
                return "outline";
            } else {
                return "default";
            }
        }

        def get_ws_badge_variant() -> str {
            if wsStatus == "connected" {
                return "default";
            } else {
                return "destructive";
            }
        }

        def get_ws_badge_text() -> str {
            if wsStatus == "connected" {
                return "Live";
            } else {
                return "Disconnected";
            }
        }

        def format_player_color() -> str {
            return playerColor.charAt(0).toUpperCase() + playerColor.slice(1);
        }

        def get_opponent_color() -> str {
            return "black" if playerColor == "white" else "white";
        }

        def render_sending_badge() -> JsxElement {
            if isSendingMove {
                return <Badge variant="secondary">Sending...</Badge>;
            }
            return <></>;
        }

        def render_opponent_status() -> JsxElement {
            if opponentConnected {
                return <span className="text-xs text-green-600">Online</span>;
            }
            return <span className="text-xs text-muted-foreground">Waiting...</span>;
        }

        def render_move_history_content() -> JsxElement {
            if len(moveHistory) > 0 {
                return <div className="space-y-1">
                    {render_move_history_items()}
                </div>;
            }
            return <p className="text-sm text-muted-foreground">No moves yet</p>;
        }

        def format_move_history() -> list {
            formatted = [];
            i = 0;
            while i < len(moveHistory) {
                move_number = int(i / 2) + 1;
                white_move = moveHistory[i]["san"] if i < len(moveHistory) else "";
                black_move = moveHistory[i + 1]["san"] if i + 1 < len(moveHistory) else "";
                formatted.append({
                    "number": move_number,
                    "white": white_move,
                    "black": black_move
                });
                i = i + 2;
            }
            return formatted;
        }

        def render_move_history_items() -> list {
            items = [];
            formatted = format_move_history();
            i = 0;
            while i < len(formatted) {
                mv = formatted[i];
                items.append(<div key={i} className="flex items-center gap-4 text-sm font-mono">
                    <span className="w-6 text-muted-foreground">{mv.number}.</span>
                    <span className="w-12">{mv.white}</span>
                    <span className="w-12 text-muted-foreground">{mv.black}</span>
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
                                Game {props.gameCode}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant={get_ws_badge_variant()}>
                                    {get_ws_badge_text()}
                                </Badge>
                                <Badge variant="outline">
                                    {format_player_color()}
                                </Badge>
                                {render_sending_badge()}
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
                        interactive={is_my_turn() and gameStatus == "ACTIVE" and not isSendingMove}
                    />
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap gap-2 justify-center">
                            {gameStatus != "ACTIVE" and <Button
                                variant="default"
                                onClick={handle_start_game}
                                disabled={isStartingGame}
                            >
                                {"Starting..." if isStartingGame else "Start Game"}
                            </Button>}
                            <Button
                                variant="secondary"
                                onClick={lambda() -> None { handle_test_e4(); }}
                                disabled={gameStatus != "ACTIVE" or isSendingMove}
                            >
                                Test: e4
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handle_reset_game}
                                disabled={isResetting}
                            >
                                {"Resetting..." if isResetting else "Reset Board"}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handle_resign}
                                disabled={gameStatus != "ACTIVE"}
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
                            <span>{props.playerName}</span>
                            <Badge variant="default">{playerColor}</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span>{opponentName}</span>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">{get_opponent_color()}</Badge>
                                {render_opponent_status()}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Move History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-60 overflow-y-auto">
                            {render_move_history_content()}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Game Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Status:</span>
                            <span>{gameStatus}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Turn:</span>
                            <span>{currentTurn.charAt(0).toUpperCase() + currentTurn.slice(1)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Moves:</span>
                            <span>{len(moveHistory)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>;
    }
}