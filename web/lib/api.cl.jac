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

    def:pub recordPhysicalMove(from_sq: str, to_sq: str, piece: str = "p") -> Any {
        q = "mutation RecordPhysicalMove($from: String!, $to: String!, $piece: String!, $fen: String!) { recordPhysicalMove(from: $from, to: $to, piece: $piece, fen: $fen) { id gameId from to piece san fen playerColor moveNumber timestamp } }";
        return _gql(q, {"from": from_sq, "to": to_sq, "piece": piece, "fen": ""}).then(
            lambda(d: Any) -> Any { return d["recordPhysicalMove"]; }
        );
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
    def _gemini_key() -> str {
        return "AIzaSyCauoOGlGThybDyJucSvmJNQ2dQUpgieM4";
    }

    def _gemini(prompt: str) -> Any {
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={_gemini_key()}";
        body = {"contents": [{"parts": [{"text": prompt}]}]};
        return fetch(url, {
            "method": "POST",
            "headers": {"Content-Type": "application/json"},
            "body": JSON.stringify(body)
        }).then(lambda(r: Any) -> Any {
            return r.json();
        }).then(lambda(d: Any) -> Any {
            if not d or not d["candidates"] or not d["candidates"][0] {
                raise Exception("No response from Gemini");
            }
            return d["candidates"][0]["content"]["parts"][0]["text"];
        });
    }

    def:pub getGameAnalysis(moveHistory: list, outcome: str, onStep: callable) -> Any {
        sans = [];
        for m in moveHistory { sans.append(m["san"]); }
        moves_str = " ".join(sans);

        # Step 1 — identify the 3 critical moments
        p1 = f"You are a chess analyst. Given these moves: {moves_str} (result: {outcome}), identify the 3 most critical moments in the game. For each, state the move number, the move played, and one sentence on why it was critical. Be concise. Format as a numbered list.";

        return _gemini(p1).then(lambda(moments: str) -> Any {
            onStep("Critical Moments", moments);

            # Step 2 — for each moment, what should have been played instead
            p2 = f"You are a chess coach. Here are 3 critical moments from a game ({moves_str}, result: {outcome}):\n{moments}\n\nFor each moment, explain in one sentence what the better move or plan would have been and why. Be specific.";
            return _gemini(p2).then(lambda(improvements: str) -> Any {
                onStep("Better Moves", improvements);

                # Step 3 — synthesize into a coaching summary
                p3 = f"You are a chess coach. A game just ended ({outcome}). Here are the critical moments:\n{moments}\n\nAnd the improvements:\n{improvements}\n\nWrite a 2-3 sentence coaching summary: what pattern or concept each player should study to improve. Be direct and practical.";
                return _gemini(p3).then(lambda(summary: str) -> Any {
                    onStep("Coaching Summary", summary);
                    return summary;
                });
            });
        });
    }

    def:pub getMoveComment(san: str, fen: str) -> Any {
        return Reflect.construct(Promise, [lambda(resolve: Any, _reject: Any) -> None {
            resolve("");
        }]);
    }

    def:pub subscribeToMoves(onMove: callable, onStatusChange: callable = None) -> callable {
        SUBSCRIPTION_QUERY = "subscription OnGameEvent { onGameEvent { id gameId from to piece san fen playerColor moveNumber timestamp } }";

        host = _endpoint().replace("https://", "").replace("/graphql", "");
        header_obj = {"host": host, "x-api-key": _api_key()};
        header_b64 = btoa(JSON.stringify(header_obj));
        payload_b64 = btoa("{}");

        ws_url = _ws_endpoint() + "?header=" + header_b64 + "&payload=" + payload_b64;

        ws = Reflect.construct(WebSocket, [ws_url, ["graphql-ws"]]);
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
                move = msg?["payload"]?["data"]?["onGameEvent"];
                if move and move?["from"] and move?["to"] {
                    onMove(move);
                }
            } elif t == "ka" {
                # keep-alive — ignore
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
