"""Checkpoint API — fetch + AppSync WebSocket subscription."""

cl {
    def _endpoint() -> str {
        return "https://wltticbi65fl5kmnpsenbj26ky.appsync-api.us-east-2.amazonaws.com/graphql";
    }

    def _api_key() -> str {
        return "da2-idf5umd5m5hu3cui4hyi526dee";
    }

    # Derive the AppSync real-time WebSocket URL from the HTTP endpoint.
    # e.g. https://abc.appsync-api.us-east-2.amazonaws.com/graphql
    #   -> wss://abc.appsync-realtime-api.us-east-2.amazonaws.com/graphql
    def _ws_endpoint() -> str {
        http = _endpoint();
        wss = http.replace("https://", "wss://").replace("appsync-api", "appsync-realtime-api");
        return wss;
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

    def:pub resetGame() -> Any {
        q = "mutation ResetGame { resetGame { id status currentFEN currentTurn physicalPlayerColor digitalPlayerColor moveHistory physicalPlayerConnected digitalPlayerConnected updatedAt } }";
        return _gql(q).then(lambda(d: Any) -> Any { return d["resetGame"]; });
    }

    def:pub updatePlayerConnection(connected: bool) -> Any {
        q = "mutation UpdatePlayerConnection($playerType: String!, $connected: Boolean!) { updatePlayerConnection(playerType: $playerType, connected: $connected) { id digitalPlayerConnected physicalPlayerConnected } }";
        return _gql(q, {"playerType": "digital", "connected": connected}).catch(
            lambda(e: Any) -> Any { print("updatePlayerConnection error:", e); }
        );
    }

    # AppSync real-time subscription over WebSocket.
    # Protocol: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-websocket-client.html
    #
    # The connection URL requires two base64-encoded query params:
    #   header  — {"host": "<host>", "x-api-key": "<key>"}
    #   payload — "{}" (empty)
    #
    # After the socket opens we send connection_init, then start a subscription.
    # AppSync fires data messages whenever makeDigitalMove or recordPhysicalMove runs.
    def:pub subscribeToMoves(onMove: callable, onStatusChange: callable = None) -> callable {
        SUBSCRIPTION_QUERY = "subscription OnGameEvent { onGameEvent { id gameId from to piece san fen playerColor moveNumber timestamp } }";

        host = _endpoint().replace("https://", "").replace("/graphql", "");
        header_obj = {"host": host, "x-api-key": _api_key()};
        header_b64 = btoa(JSON.stringify(header_obj));
        payload_b64 = btoa("{}");

        ws_url = _ws_endpoint() + "?header=" + header_b64 + "&payload=" + payload_b64;

        ws = new WebSocket(ws_url, ["graphql-ws"]);
        subId = "sub-moves-1";
        stopped = False;

        ws.onopen = lambda(_e: Any) -> None {
            ws.send(JSON.stringify({"type": "connection_init"}));
        };

        ws.onmessage = lambda(evt: Any) -> None {
            if stopped { return; }
            msg = JSON.parse(evt.data);
            t = msg["type"];

            if t == "connection_ack" {
                # Connection acknowledged — now register the subscription
                sub_payload = {
                    "data": JSON.stringify({
                        "query": SUBSCRIPTION_QUERY,
                        "variables": {}
                    }),
                    "extensions": {
                        "authorization": {
                            "host": host,
                            "x-api-key": _api_key()
                        }
                    }
                };
                ws.send(JSON.stringify({
                    "id": subId,
                    "type": "start",
                    "payload": sub_payload
                }));
            } elif t == "start_ack" {
                if onStatusChange != None { onStatusChange("connected"); }
            } elif t == "data" {
                move = msg.get("payload", {}).get("data", {}).get("onGameEvent");
                if move and move.get("from") and move.get("to") {
                    onMove(move);
                }
            } elif t == "ka" {
                # keep-alive — ignore
                pass;
            } elif t == "connection_error" or t == "error" {
                print("AppSync WS error:", JSON.stringify(msg));
                if onStatusChange != None { onStatusChange("disconnected"); }
            }
        };

        ws.onerror = lambda(_e: Any) -> None {
            if onStatusChange != None { onStatusChange("disconnected"); }
        };

        ws.onclose = lambda(_e: Any) -> None {
            if not stopped and onStatusChange != None { onStatusChange("disconnected"); }
        };

        return lambda() -> None {
            stopped = True;
            if ws.readyState == WebSocket.OPEN or ws.readyState == WebSocket.CONNECTING {
                ws.send(JSON.stringify({"id": subId, "type": "stop"}));
                ws.close();
            }
            if onStatusChange != None { onStatusChange("disconnected"); }
        };
    }
}
