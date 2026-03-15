"""Checkpoint API - stub implementation so jac build succeeds. Replace with real API or use compile:lib + alias for full build."""
def:pub configureAWS(cfg: Any = None) -> None { }

def:pub resetBoard(gameId: str, playerId: str, resetType: str = "FULL_RESET") -> Any {
    return Promise.resolve({"success": True, "gameId": gameId, "message": "Board reset (stub)"});
}

def:pub subscribeToResetEvents(gameId: str, onReset: callable, onStatusChange: callable = None) -> callable {
    if onStatusChange != None {
        onStatusChange("connected");
    }
    return lambda() -> None {
        if onStatusChange != None {
            onStatusChange("disconnected");
        }
    };
}
