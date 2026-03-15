cl import from "react" { useState, useRef, useEffect }
cl import from "..ui.button" { Button }
cl import from "..ui.card" { Card, CardContent, CardHeader, CardTitle, CardDescription }
cl import from "..ui.alert" { Alert, AlertTitle, AlertDescription }
cl import from "..ui.badge" { Badge }
cl import from "..ui.progress" { Progress }

cl {
    def:pub CameraCapture(props: {
        gameCode: str,
        playerName: str,
        onGameReady?: Function,
        onBackToLobby?: Function
    }) -> JsxElement {
        has videoRef: Any = useRef(None);
        has canvasRef: Any = useRef(None);
        has isCameraActive: bool = False;
        has isCalibrated: bool = False;
        has isStreaming: bool = False;
        has error: str = "";
        has calibrationStep: int = 0;  # 0: not started, 1: position board, 2: tap corners, 3: confirm
        has captureInterval: Any = None;
        has opponentJoined: bool = False;
        has connectionStatus: str = "waiting";  # waiting, connected, streaming
        has boardCorners: list = [];
        has lastOpponentMove: str = "";

        def start_camera() -> None {
            navigator.mediaDevices.getUserMedia({
                "video": {
                    "facingMode": "environment",  # Use back camera on mobile
                    "width": { "ideal": 1280 },
                    "height": { "ideal": 720 }
                }
            }).then(lambda(stream: Any) -> None {
                if videoRef.current {
                    videoRef.current.srcObject = stream;
                    isCameraActive = True;
                    error = "";
                }
            }).catch(lambda(err: Any) -> None {
                error = f"Camera access denied: {err.message}";
            });
        }

        def stop_camera() -> None {
            if videoRef.current and videoRef.current.srcObject {
                has tracks = videoRef.current.srcObject.getTracks();
                tracks.forEach(lambda(track: Any) -> None { track.stop(); });
                videoRef.current.srcObject = None;
            }
            isCameraActive = False;
            if captureInterval {
                clearInterval(captureInterval);
                captureInterval = None;
            }
            isStreaming = False;
        }

        def start_calibration() -> None {
            if not isCameraActive {
                error = "Please start camera first";
                return;
            }
            calibrationStep = 1;
            error = "";
        }

        def complete_calibration() -> None {
            isCalibrated = True;
            calibrationStep = 0;
            error = "";
            
            # Mock opponent joining after calibration
            setTimeout(lambda() -> None {
                opponentJoined = True;
                connectionStatus = "connected";
                
                # Start mock streaming
                setTimeout(lambda() -> None {
                    start_streaming();
                }, 1000);
            }, 2000);
        }

        def start_streaming() -> None {
            if not isCalibrated {
                error = "Please calibrate the board first";
                return;
            }

            isStreaming = True;
            connectionStatus = "streaming";
            
            # Start mock image capture every 3 seconds
            captureInterval = setInterval(lambda() -> None {
                capture_board_image();
            }, 3000);

            # Mock opponent moves occasionally
            setTimeout(lambda() -> None {
                mock_opponent_moves();
            }, 5000);
        }

        def capture_board_image() -> None {
            if not videoRef.current or not canvasRef.current {
                return;
            }

            has canvas = canvasRef.current;
            has ctx = canvas.getContext('2d');
            has video = videoRef.current;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            # Mock image processing - in real app, this would send to AWS
            has imageData = canvas.toDataURL('image/jpeg', 0.8);
            console.log("Captured board image, size:", imageData.length);

            # Mock move detection
            if Math.random() > 0.7 {  # 30% chance of detecting a move
                has moves = ["e4", "Nf3", "Bb5", "O-O", "d4", "Nc3"];
                has detected_move = moves[Math.floor(Math.random() * moves.length)];
                console.log("Mock detected move:", detected_move);
            }
        }

        def mock_opponent_moves() -> None {
            has moves = [
                "e5 - Opponent played King's Pawn",
                "Nc6 - Knight to c6",
                "Nf6 - Knight to f6", 
                "Bb4 - Bishop to b4",
                "O-O - Opponent castled"
            ];

            setInterval(lambda() -> None {
                if isStreaming and Math.random() > 0.6 {
                    has move = moves[Math.floor(Math.random() * moves.length)];
                    lastOpponentMove = move;
                    
                    # Clear after 5 seconds
                    setTimeout(lambda() -> None {
                        lastOpponentMove = "";
                    }, 5000);
                }
            }, 8000);
        }

        def handle_corner_tap(event: Any) -> None {
            if calibrationStep != 2 {
                return;
            }

            has rect = event.currentTarget.getBoundingClientRect();
            has x = event.clientX - rect.left;
            has y = event.clientY - rect.top;
            
            boardCorners.push({"x": x, "y": y});
            
            if boardCorners.length >= 4 {
                calibrationStep = 3;
            }
        }

        useEffect(lambda() -> None {
            return lambda() -> None { stop_camera(); };
        }, []);

        def get_calibration_instructions() -> str {
            if calibrationStep == 1 {
                return "Position your phone camera above the chessboard. Ensure the entire board is visible.";
            } elif calibrationStep == 2 {
                return f"Tap the four corners of the chessboard in order: top-left, top-right, bottom-right, bottom-left. ({boardCorners.length}/4 corners selected)";
            } elif calibrationStep == 3 {
                return "Perfect! Review the board detection and confirm when ready.";
            } else {
                return "";
            }
        }

        def render_game_ready() -> JsxElement {
            return <div className="space-y-4">
                <Alert className="border-primary">
                    <AlertTitle>Ready to Play!</AlertTitle>
                    <AlertDescription>
                        Camera is calibrated and opponent has joined. You can now start playing chess!
                    </AlertDescription>
                </Alert>

                <div className="flex gap-2 justify-center">
                    <Button 
                        onClick={lambda() -> None {
                            if props.onGameReady {
                                props.onGameReady({
                                    "gameCode": props.gameCode,
                                    "playerName": props.playerName,
                                    "playerColor": "white",  # Physical player is usually white
                                    "gameType": "physical"
                                });
                            }
                        }}
                        size="lg"
                    >
                        Start Chess Game
                    </Button>
                    <Button 
                        variant="outline"
                        onClick={stop_camera}
                    >
                        Stop Camera
                    </Button>
                </div>
            </div>;
        }

        return <div className="max-w-4xl mx-auto p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        Camera Setup - Game {props.gameCode}
                        <Button variant="outline" onClick={props.onBackToLobby}>
                            Back to Lobby
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        Set up your camera to capture the physical chessboard
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error ? 
                        <Alert className="border-destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    : <></>}

                    {/* Connection status */}
                    <div className="flex items-center gap-4">
                        <Badge variant={
                            connectionStatus == "streaming" ? "default" :
                            connectionStatus == "connected" ? "secondary" : "outline"
                        }>
                            {connectionStatus == "streaming" ? "Streaming" :
                             connectionStatus == "connected" ? "Connected" : "Waiting for opponent"}
                        </Badge>
                        
                        {opponentJoined ? 
                            <span className="text-sm text-green-600">✓ Opponent joined</span>
                        : 
                            <span className="text-sm text-muted-foreground">⏳ Waiting for opponent to join...</span>
                        }
                    </div>

                    {/* Camera view */}
                    <div className="relative bg-black rounded-lg overflow-hidden">
                        <video 
                            ref={videoRef}
                            autoplay
                            muted
                            playsInline
                            className="w-full h-auto"
                            style={{ maxHeight: "400px" }}
                            onClick={handle_corner_tap}
                        />
                        
                        {calibrationStep == 2 ? 
                            <div className="absolute inset-0 pointer-events-none">
                                {boardCorners.map(lambda(corner: dict, index: int) -> JsxElement {
                                    return <div
                                        key={index}
                                        className="absolute w-4 h-4 bg-red-500 rounded-full transform -translate-x-2 -translate-y-2"
                                        style={{
                                            left: f"{corner.x}px",
                                            top: f"{corner.y}px"
                                        }}
                                    />;
                                })}
                            </div>
                        : <></>}
                        
                        {!isCameraActive ? 
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                                <p className="text-white">Camera not active</p>
                            </div>
                        : <></>}
                        
                        <canvas ref={canvasRef} style={{ display: "none" }} />
                    </div>

                    {/* Camera controls */}
                    <div className="flex gap-2 justify-center">
                        {!isCameraActive ? 
                            <Button onClick={start_camera}>Start Camera</Button>
                        :
                            <>
                                <Button onClick={stop_camera} variant="outline">Stop Camera</Button>
                                {!isCalibrated ? 
                                    <Button onClick={start_calibration}>Calibrate Board</Button>
                                : <></>}
                            </>
                        }
                    </div>

                    {/* Calibration instructions */}
                    {calibrationStep > 0 and calibrationStep < 3 ? 
                        <Alert>
                            <AlertTitle>Calibration Step {calibrationStep}/2</AlertTitle>
                            <AlertDescription>{get_calibration_instructions()}</AlertDescription>
                        </Alert>
                    : <></>}

                    {calibrationStep == 3 ? 
                        <Alert className="border-green-500">
                            <AlertTitle>Calibration Complete!</AlertTitle>
                            <AlertDescription>
                                Board corners detected successfully. Click confirm to finish calibration.
                            </AlertDescription>
                            <div className="mt-2">
                                <Button onClick={complete_calibration} size="sm">
                                    Confirm Calibration
                                </Button>
                            </div>
                        </Alert>
                    : <></>}

                    {/* Game ready state */}
                    {isStreaming and opponentJoined ? render_game_ready() : <></>}

                    {/* Opponent move notification */}
                    {lastOpponentMove ? 
                        <Alert className="border-blue-500">
                            <AlertTitle>Opponent Move</AlertTitle>
                            <AlertDescription>{lastOpponentMove}</AlertDescription>
                        </Alert>
                    : <></>}
                </CardContent>
            </Card>
        </div>;
    }
}