cl import from "react" { useState, useEffect, useCallback }
cl import from ".ChessPiece" { ChessPiece }

cl {
    def:pub Chessboard(props: {
        position: dict,
        onMove?: Function,
        onSquareClick?: Function,
        orientation?: str,
        showCoordinates?: bool,
        highlightSquares?: list,
        lastMove?: dict,
        size?: int
    }) -> JsxElement {
        has draggedPiece: str = "";
        has draggedSquare: str = "";
        has isDragging: bool = False;
        has boardSize: int = props.size if props.size else 480;
        has squareSize: int = boardSize // 8;
        has orientation: str = props.orientation if props.orientation else "white";
        has showCoords: bool = props.showCoordinates if props.showCoordinates else True;

        def files() -> list {
            if orientation == "white" {
                return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            } else {
                return ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
            }
        }

        def ranks() -> list {
            if orientation == "white" {
                return ['8', '7', '6', '5', '4', '3', '2', '1'];
            } else {
                return ['1', '2', '3', '4', '5', '6', '7', '8'];
            }
        }

        def square_color(file: str, rank: str) -> str {
            has file_index: int = ord(file) - ord('a');
            has rank_index: int = int(rank) - 1;
            
            if (file_index + rank_index) % 2 == 0 {
                return "bg-amber-100 dark:bg-amber-200";  # Light squares
            } else {
                return "bg-amber-800 dark:bg-amber-900";  # Dark squares
            }
        }

        def is_highlighted(square: str) -> bool {
            if not props.highlightSquares {
                return False;
            }
            return props.highlightSquares.includes(square);
        }

        def is_last_move(square: str) -> bool {
            if not props.lastMove {
                return False;
            }
            return square == props.lastMove["from"] or square == props.lastMove["to"];
        }

        def handle_drag_start(square: str, piece: str) -> None {
            draggedSquare = square;
            draggedPiece = piece;
            isDragging = True;
        }

        def handle_drag_end() -> None {
            isDragging = False;
        }

        def handle_drop(event: Any, target_square: str) -> None {
            event.preventDefault();
            
            if draggedSquare and draggedSquare != target_square and props.onMove {
                props.onMove({
                    "from": draggedSquare,
                    "to": target_square,
                    "piece": draggedPiece
                });
            }
            
            draggedSquare = "";
            draggedPiece = "";
            isDragging = False;
        }

        def handle_drag_over(event: Any) -> None {
            event.preventDefault();
        }

        def handle_square_click(square: str) -> None {
            # Handle piece placement mode
            if props.onSquareClick {
                props.onSquareClick(square);
                return;
            }

            # Handle regular move mode
            if not draggedSquare {
                if props.position and props.position[square] {
                    draggedSquare = square;
                    draggedPiece = props.position[square];
                }
            } else {
                if draggedSquare != square and props.onMove {
                    props.onMove({
                        "from": draggedSquare,
                        "to": square,
                        "piece": draggedPiece
                    });
                }
                draggedSquare = "";
                draggedPiece = "";
            }
        }

        def render_coordinate_labels() -> JsxElement {
            return <>
                <div className="flex absolute bottom-0 left-0 w-full">
                    {files().map(lambda(file: str, index: int) -> JsxElement {
                        has file_color: str = "#92400e" if square_color(file, "1") == "bg-amber-100 dark:bg-amber-200" else "#fbbf24";
                        return <div 
                            key={file}
                            className="flex items-end justify-end text-xs font-medium pr-1 pb-1"
                            style={{
                                width: f"{squareSize}px",
                                height: "16px",
                                color: file_color
                            }}
                        >
                            {file}
                        </div>;
                    })}
                </div>
                <div className="flex flex-col absolute top-0 left-0 h-full">
                    {ranks().map(lambda(rank: str, index: int) -> JsxElement {
                        has rank_color: str = "#92400e" if square_color("a", rank) == "bg-amber-100 dark:bg-amber-200" else "#fbbf24";
                        return <div 
                            key={rank}
                            className="flex items-start justify-start text-xs font-medium pl-1 pt-1"
                            style={{
                                height: f"{squareSize}px",
                                width: "16px",
                                color: rank_color
                            }}
                        >
                            {rank}
                        </div>;
                    })}
                </div>
            </>;
        }

        return <div className="chess-board relative inline-block border-2 border-gray-400 dark:border-gray-600">
            <div 
                className="grid grid-cols-8"
                style={{
                    width: f"{boardSize}px",
                    height: f"{boardSize}px"
                }}
            >
                {ranks().map(lambda(rank: str, rank_index: int) -> JsxElement {
                    return files().map(lambda(file: str, file_index: int) -> JsxElement {
                        square = f"{file}{rank}";
                        piece = (props.position[square] if props.position else "") or "";
                        is_drag_target = isDragging and draggedSquare != square;
                        
                        return <div
                            key={square}
                            className={f"chess-square relative flex items-center justify-center {
                                square_color(file, rank)
                            } {
                                'ring-2 ring-blue-500' if is_highlighted(square) else ''
                            } {
                                'ring-2 ring-green-500' if is_last_move(square) else ''
                            } {
                                'ring-2 ring-yellow-500' if square == draggedSquare else ''
                            } {
                                'border-2 border-dashed border-blue-400' if is_drag_target else ''
                            }"}
                            style={{
                                width: f"{squareSize}px",
                                height: f"{squareSize}px"
                            }}
                            onClick={lambda() -> None { handle_square_click(square); }}
                            onDrop={lambda(e: Any) -> None { handle_drop(e, square); }}
                            onDragOver={handle_drag_over}
                        >
                            <ChessPiece
                                piece={piece}
                                square={square}
                                isDragging={isDragging and square == draggedSquare}
                                onDragStart={handle_drag_start}
                                onDragEnd={handle_drag_end}
                                size={int(squareSize * 0.8)}
                            />
                        </div>;
                    });
                })}
            </div>
            {showCoords and render_coordinate_labels()}
        </div>;
    }
}