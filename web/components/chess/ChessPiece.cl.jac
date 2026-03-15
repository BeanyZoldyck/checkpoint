cl import from "react" { useState, useRef }

cl {
    def piece_symbols() -> dict {
        return {
            'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
            'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
        };
    }

    def:pub ChessPiece(props: {
        piece: str,
        square: str,
        isDragging: bool,
        onDragStart?: Function,
        onDragEnd?: Function,
        size?: int
    }) -> JsxElement {
        has draggedRef: Any = useRef(None);
        has size: int = props.size if props.size else 48;
        has symbols: dict = piece_symbols();
        
        def handle_drag_start(event: Any) -> None {
            if props.onDragStart {
                props.onDragStart(props.square, props.piece);
            }
            # Set drag data for the piece
            event.dataTransfer.setData("text/plain", f"{props.square}:{props.piece}");
            event.dataTransfer.effectAllowed = "move";
            draggedRef.current = event.target;
        }

        def handle_drag_end(event: Any) -> None {
            if props.onDragEnd {
                props.onDragEnd();
            }
        }

        if not props.piece {
            return <div></div>;
        }

        return <div 
            className={f"chess-piece cursor-pointer select-none {
                'opacity-50' if props.isDragging else 'opacity-100'
            }"}
            style={{
                fontSize: f"{size}px",
                width: f"{size}px", 
                height: f"{size}px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none"
            }}
            draggable={True}
            onDragStart={handle_drag_start}
            onDragEnd={handle_drag_end}
        >
            {symbols[props.piece] or "?"}
        </div>;
    }
}