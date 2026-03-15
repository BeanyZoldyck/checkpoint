cl import from "react" { useState, useEffect, useCallback }
cl import from ".Chessboard" { Chessboard }
cl import from "..ui.button" { Button }
cl import from "..ui.card" { Card, CardContent, CardHeader, CardTitle }
cl import from "..ui.badge" { Badge }
cl import from "..ui.alert" { Alert, AlertTitle, AlertDescription }
cl import from "..ui.separator" { Separator }
cl import from "...lib.simple_board" { create_board, get_empty_position }

cl {
    def:pub ChessGame(props: {
        gameCode: str,
        playerName: str,
        playerColor?: str,
        gameType?: str,  # "digital" or "physical"
        onLeaveGame?: Function
    }) -> JsxElement {
        [board, setBoard] = useState(None);
        [position, setPosition] = useState({});
        [moveHistory, setMoveHistory] = useState([]);
        [lastMove, setLastMove] = useState({});
        [highlightedSquares, setHighlightedSquares] = useState([]);
        [isConnected, setIsConnected] = useState(True);
        [opponentName, setOpponentName] = useState("Waiting...");
        [statusMessage, setStatusMessage] = useState("Place pieces on the board!");
        [playerColor, setPlayerColor] = useState(props["playerColor"] or "white");
        [placementMode, setPlacementMode] = useState(True);
        [selectedPieceType, setSelectedPieceType] = useState("wP");

        useEffect(lambda() -> None {
            # Initialize simple board
            newBoard = create_board();
            setBoard(newBoard);
            setPosition(newBoard.get_position());
            setStatusMessage("Click on squares to place pieces!");
            
            # Mock opponent connection after 2 seconds  
            setTimeout(lambda() -> None {
                if props["gameType"] == "physical" {
                    setOpponentName("Digital Player");
                } else {
                    setOpponentName("Physical Player");
                }
                setStatusMessage(f"Ready to play as {playerColor}!");
                setIsConnected(True);
            }, 2000);
        }, []);

        def handle_move(move: dict) -> None {
            if not board or placementMode {
                setStatusMessage("Place pieces first or start the game!");
                return;
            }

            # Simple move - just move the piece from one square to another
            success = board.move_piece(move["from"], move["to"]);
            
            if success {
                setPosition(board.get_position());
                setLastMove({
                    "from": move["from"],
                    "to": move["to"]
                });
                setStatusMessage(f"Moved piece from {move['from']} to {move['to']}");
                
                # Add to move history
                newHistory = moveHistory.slice(0);
                newHistory.push({
                    "from": move["from"],
                    "to": move["to"],
                    "san": f"{move['from']}-{move['to']}"
                });
                setMoveHistory(newHistory);
            } else {
                setStatusMessage("No piece to move!");
            }
        }

        def handle_place_piece(square: str) -> None {
            if not board or not placementMode {
                return;
            }

            # Check if square is empty or if we want to replace a piece
            currentPiece = board.get_piece(square);
            if currentPiece {
                # Remove piece if clicking on occupied square
                board.remove_piece(square);
                setStatusMessage(f"Removed piece from {square}");
            } else {
                # Place selected piece type on empty square
                board.place_piece(square, selectedPieceType);
                setStatusMessage(f"Placed {selectedPieceType} on {square}");
            }
            
            # Update position display
            setPosition(board.get_position());
        }

        def handle_resign() -> None {
            setStatusMessage("Game resigned.");
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
            return playerColor.charAt(0).toUpperCase() + playerColor.slice(1);
        }

        def get_current_player_badge_variant() -> str {
            return "default";  # Simplified
        }

        def get_opponent_badge_variant() -> str {
            return "secondary";  # Simplified
        }

        def get_opponent_color() -> str {
            if playerColor == "white" {
                return "black";
            } else {
                return "white";
            }
        }

        def get_current_turn_text() -> str {
            return "White's turn";  # Simplified since we don't track turns
        }

        def get_game_status_text() -> str {
            return "Placing pieces";  # Simplified status
        }

        def format_move_history() -> list {
            has formatted: list = [];
            has i: int = 0;
            while i < len(moveHistory) {
                has move_number: int = (i // 2) + 1;
                has white_move: str = "";
                if i < len(moveHistory) {
                    white_move = (moveHistory[i]["san"] if moveHistory[i] else "") or "";
                }
                has black_move: str = "";
                if i + 1 < len(moveHistory) {
                    black_move = (moveHistory[i + 1]["san"] if moveHistory[i + 1] else "") or "";
                }
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
            has items: list = [];
            has formatted: list = format_move_history();
            has i: int = 0;
            while i < len(formatted) {
                has move: dict = formatted[i];
                items.append(<div className="flex items-center gap-4 text-sm font-mono">
                    <span className="w-6 text-muted-foreground">{move.number}.</span>
                    <span className="w-12">{move.white}</span>
                    <span className="w-12">{move.black}</span>
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
                                disabled={placementMode}
                            >
                                Offer Draw
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handle_resign}
                                disabled={placementMode}
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
                            {len(format_move_history()) > 0 &&
                                <div className="space-y-1">
                                    {render_move_history_items()}
                                </div>
                            }
                            {len(format_move_history()) == 0 &&
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
                            <span>{len(moveHistory)}</span>
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