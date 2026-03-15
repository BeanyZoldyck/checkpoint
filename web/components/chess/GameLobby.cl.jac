cl import from "react" { useState }
cl import from "..ui.button" { Button }
cl import from "..ui.card" { Card, CardContent, CardHeader, CardTitle, CardDescription }
cl import from "..ui.input" { Input }
cl import from "..ui.label" { Label }
cl import from "..ui.alert" { Alert, AlertDescription }
cl import from "..ui.tabs" { Tabs, TabsList, TabsTrigger, TabsContent }
cl import from "..ui.badge" { Badge }

cl {
    def:pub GameLobby(props: {
        onCreateGame?: Function,
        onJoinGame?: Function,
        onStartCamera?: Function
    }) -> JsxElement {
        has gameCode: str = "";
        has playerName: str = "";
        has gameType: str = "digital";  # "digital" or "physical"
        has createdGameCode: str = "";
        has isLoading: bool = False;
        has error: str = "";

        def generate_game_code() -> str {
            has chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";  # Exclude O and 0 for clarity
            has code = "";
            for i in [0, 1, 2, 3, 4, 5] {
                code += chars[Math.floor(Math.random() * chars.length)];
            }
            return code;
        }

        def handle_create_game() -> None {
            if not playerName.trim() {
                error = "Please enter your name";
                return;
            }

            isLoading = True;
            error = "";
            
            has newGameCode = generate_game_code();
            createdGameCode = newGameCode;
            
            # Mock API call - in real app this would hit the backend
            setTimeout(lambda() -> None {
                isLoading = False;
                if props.onCreateGame {
                    props.onCreateGame({
                        "gameCode": newGameCode,
                        "playerName": playerName,
                        "gameType": gameType
                    });
                }
            }, 1000);
        }

        def handle_join_game() -> None {
            if not gameCode.trim() {
                error = "Please enter a game code";
                return;
            }
            
            if not playerName.trim() {
                error = "Please enter your name";
                return;
            }

            isLoading = True;
            error = "";
            
            # Mock API call - in real app this would validate the game code
            setTimeout(lambda() -> None {
                isLoading = False;
                if props.onJoinGame {
                    props.onJoinGame({
                        "gameCode": gameCode.toUpperCase(),
                        "playerName": playerName,
                        "gameType": "digital"  # Digital player always joins existing games
                    });
                }
            }, 1000);
        }

        def handle_start_camera() -> None {
            if not createdGameCode {
                error = "Please create a game first";
                return;
            }
            
            if props.onStartCamera {
                props.onStartCamera({
                    "gameCode": createdGameCode,
                    "playerName": playerName
                });
            }
        }

        return <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold text-primary">Checkpoint</h1>
                <p className="text-lg text-muted-foreground">
                    Connect physical and digital chess players
                </p>
            </div>

            {error ? 
                <Alert className="border-destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            : <></>}

            <Tabs defaultValue="join" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="join">Join Game</TabsTrigger>
                    <TabsTrigger value="create">Create Game</TabsTrigger>
                </TabsList>

                <TabsContent value="join">
                    <Card>
                        <CardHeader>
                            <CardTitle>Join Existing Game</CardTitle>
                            <CardDescription>
                                Enter a game code to join as a digital player
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="join-name">Your Name</Label>
                                <Input 
                                    id="join-name"
                                    placeholder="Enter your name"
                                    value={playerName}
                                    onChange={lambda(e: Any) -> None { playerName = e.target.value; }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="game-code">Game Code</Label>
                                <Input 
                                    id="game-code"
                                    placeholder="e.g. ABC123"
                                    value={gameCode}
                                    onChange={lambda(e: Any) -> None { gameCode = e.target.value.toUpperCase(); }}
                                    className="uppercase"
                                    maxLength={6}
                                />
                            </div>
                            <Button 
                                onClick={handle_join_game}
                                disabled={isLoading}
                                className="w-full"
                            >
                                {isLoading ? "Joining..." : "Join Game"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="create">
                    <Card>
                        <CardHeader>
                            <CardTitle>Create New Game</CardTitle>
                            <CardDescription>
                                Create a game as a physical board player
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="create-name">Your Name</Label>
                                <Input 
                                    id="create-name"
                                    placeholder="Enter your name"
                                    value={playerName}
                                    onChange={lambda(e: Any) -> None { playerName = e.target.value; }}
                                />
                            </div>
                            
                            {!createdGameCode ? 
                                <Button 
                                    onClick={handle_create_game}
                                    disabled={isLoading}
                                    className="w-full"
                                >
                                    {isLoading ? "Creating..." : "Create Game"}
                                </Button>
                            :
                                <div className="space-y-4">
                                    <Alert className="border-primary">
                                        <AlertDescription>
                                            <div className="space-y-2">
                                                <p>Game created successfully!</p>
                                                <div className="text-center">
                                                    <Badge variant="outline" className="text-2xl p-2 font-mono">
                                                        {createdGameCode}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm">Share this code with your opponent</p>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                    
                                    <Button 
                                        onClick={handle_start_camera}
                                        className="w-full"
                                        variant="default"
                                    >
                                        Start Camera Setup
                                    </Button>
                                </div>
                            }
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="text-center text-sm text-muted-foreground space-y-2">
                <p>How it works:</p>
                <div className="grid gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">1</Badge>
                        <span>Physical player creates game and shares code</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">2</Badge>
                        <span>Digital player joins using the code</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">3</Badge>
                        <span>Physical player sets up camera to capture board</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">4</Badge>
                        <span>Play chess in real-time!</span>
                    </div>
                </div>
            </div>
        </div>;
    }
}