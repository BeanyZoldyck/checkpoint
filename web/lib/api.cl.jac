"""Checkpoint API — fetch + polling against AWS AppSync."""

cl {
    def _endpoint() -> str {
        return "https://wltticbi65fl5kmnpsenbj26ky.appsync-api.us-east-2.amazonaws.com/graphql";
    }

    def _api_key() -> str {
        return "da2-idf5umd5m5hu3cui4hyi526dee";
    }

    def _gql(query: str, variables: dict = None) -> Any {
        body = {"query": query};
        if variables {
            body["variables"] = variables;
        }
        return fetch(_endpoint(), {
            "method": "POST",
            "headers": {
                "Content-Type": "application/json",
                "x-api-key": _api_key()
            },
            "body": JSON.stringify(body)
        }).then(lambda(r: Any) -> Any {
            return r.json();
        }).then(lambda(data: Any) -> Any {
            if data["errors"] {
                raise Exception(data["errors"][0]["message"]);
            }
            return data["data"];
        });
    }

    def:pub connectDigitalPlayer() -> Any {
        q = "mutation ConnectDigitalPlayer { connectDigitalPlayer { id status currentFEN currentTurn physicalPlayerColor digitalPlayerColor moveHistory physicalPlayerConnected digitalPlayerConnected createdAt updatedAt } }";
        return _gql(q).then(lambda(d: Any) -> Any { return d["connectDigitalPlayer"]; });
    }

    def:pub makeDigitalMove(from_sq: str, to_sq: str, promotion: str = None) -> Any {
        q = "mutation MakeDigitalMove($from: String!, $to: String!, $promotion: String) { makeDigitalMove(from: $from, to: $to, promotion: $promotion) { id gameId from to piece san fen playerColor moveNumber timestamp } }";
        return _gql(q, {"from": from_sq, "to": to_sq, "promotion": promotion}).then(
            lambda(d: Any) -> Any { return d["makeDigitalMove"]; }
        );
    }

    def:pub completeCalibration() -> Any {
        q = "mutation CompleteCalibration($calibrationData: String!) { completeCalibration(calibrationData: $calibrationData) { id status currentFEN currentTurn digitalPlayerColor physicalPlayerColor } }";
        return _gql(q, {"calibrationData": "{}"}).then(lambda(d: Any) -> Any { return d["completeCalibration"]; });
    }

    def:pub updatePlayerConnection(connected: bool) -> Any {
        q = "mutation UpdatePlayerConnection($playerType: String!, $connected: Boolean!) { updatePlayerConnection(playerType: $playerType, connected: $connected) { id digitalPlayerConnected physicalPlayerConnected } }";
        return _gql(q, {"playerType": "digital", "connected": connected}).catch(
            lambda(e: Any) -> Any { print("updatePlayerConnection error:", e); }
        );
    }

    def _get_current_game() -> Any {
        q = "query GetCurrentGame { getCurrentGame { id status currentFEN currentTurn digitalPlayerColor physicalPlayerColor moveHistory physicalPlayerConnected digitalPlayerConnected } }";
        return _gql(q).then(lambda(d: Any) -> Any { return d["getCurrentGame"]; });
    }

    # Poll every 2s for new moves — simpler than raw WebSocket which needs `new`
    def:pub subscribeToMoves(onMove: callable, onStatusChange: callable = None) -> callable {
        lastMoveCount = 0;
        stopped = False;

        def poll() -> None {
            if stopped { return; }
            _get_current_game().then(lambda(game: Any) -> None {
                if not game { return; }
                history = game["moveHistory"];
                if history and history.length > lastMoveCount {
                    newMoves = history.slice(lastMoveCount);
                    lastMoveCount = history.length;
                    currentFen = game["currentFEN"];
                    currentTurn = (game["currentTurn"] if game["currentTurn"] else "WHITE").lower();
                    for san in newMoves {
                        onMove({
                            "san": san,
                            "fen": currentFen,
                            "playerColor": "white" if currentTurn == "black" else "black",
                            "from": "",
                            "to": ""
                        });
                    }
                }
                setTimeout(poll, 2000);
            }).catch(lambda(e: Any) -> None {
                setTimeout(poll, 3000);
            });
        }

        if onStatusChange != None {
            onStatusChange("connected");
        }
        setTimeout(poll, 1000);

        return lambda() -> None {
            stopped = True;
            if onStatusChange != None {
                onStatusChange("disconnected");
            }
        };
    }
}
