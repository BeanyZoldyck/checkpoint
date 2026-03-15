cl import from ".components.ui.button" { Button }
cl import from ".components.ui.card" { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter }
cl import from ".components.ui.badge" { Badge }
cl import from ".components.ui.input" { Input }
cl import from ".components.ui.label" { Label }
cl import from ".components.ui.textarea" { Textarea }
cl import from ".components.ui.separator" { Separator }
cl import from ".components.ui.tabs" { Tabs, TabsList, TabsTrigger, TabsContent }
cl import from ".components.ui.switch" { Switch }
cl import from ".components.ui.checkbox" { Checkbox }
cl import from ".components.ui.progress" { Progress }
cl import from ".components.ui.avatar" { Avatar, AvatarFallback }
cl import from ".components.ui.skeleton" { Skeleton }
cl import from ".components.ui.alert" { Alert, AlertTitle, AlertDescription }
cl import from react { useEffect }
cl import from ".components.chess.ChessGame" { ChessGame }
cl import from ".lib.api" { resetBoard, subscribeToResetEvents, configureAWS }
cl import ".global.css";

cl {
    def:pub app() -> JsxElement {
        has darkMode: bool = False;
        has gameId: str = "game-web-" + str(Date.now());
        has playerId: str = "player-web-" + str(Date.now());
        has isResetting: bool = False;
        has resetStatus: str = "";

        # Initialize AWS AppSync when component mounts
        useEffect(lambda() -> None {
            configureAWS();
            
            # Subscribe to reset events for this game
            unsubscribe = subscribeToResetEvents(
                gameId,
                lambda(resetData: dict) -> None {
                    print(f"Board reset received: {resetData}");
                    resetStatus = resetData.get("message", "Board was reset");
                    # Reset the board state
                    handle_new_game();
                },
                lambda(status: str) -> None {
                    print(f"Reset subscription status: {status}");
                }
            );
            
            return unsubscribe;
        }, []);

        def handle_new_game() -> None {
            # Reset to start a new game
            window.location.reload();
        }

        def get_reset_button_label() -> str {
            if isResetting {
                return "Resetting...";
            } else {
                return "Reset Board";
            }
        }

        def handle_reset_board() -> None {
            if isResetting {
                return;
            }
            
            isResetting = True;
            resetStatus = "Resetting board...";
            
            resetBoard(gameId, playerId, "FULL_RESET").then(lambda(result: dict) -> None {
                isResetting = False;
                if result.get("success") {
                    resetStatus = "Board reset successfully!";
                    # The subscription will handle the actual board reset
                } else {
                    resetStatus = f"Reset failed: {result.get('error', 'Unknown error')}";
                }
                
                # Clear status message after 3 seconds
                setTimeout(lambda() -> None {
                    resetStatus = "";
                }, 3000);
            }).catch(lambda(error: Any) -> None {
                isResetting = False;
                resetStatus = f"Reset failed: {error}";
                setTimeout(lambda() -> None {
                    resetStatus = "";
                }, 3000);
            });
        }

        return <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border p-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-primary">Checkpoint</h1>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={handle_new_game}
                            className="text-sm px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            New Game
                        </button>
                        <button 
                            onClick={handle_reset_board}
                            disabled={isResetting}
                            className="text-sm px-3 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {get_reset_button_label()}
                        </button>
                        <label className="flex items-center gap-2 text-sm">
                            <Switch checked={darkMode} onCheckedChange={lambda(v: Any) -> None {
                                darkMode = v;
                                if v {
                                    document.documentElement.classList.add("dark");
                                } else {
                                    document.documentElement.classList.remove("dark");
                                }
                            }} />
                            Dark Mode
                        </label>
                    </div>
                </div>
            </header>
            {resetStatus && 
                <div className="bg-blue-100 dark:bg-blue-900 border-l-4 border-blue-500 p-4 mx-4 mt-4">
                    <div className="flex">
                        <div className="ml-3">
                            <p className="text-sm text-blue-700 dark:text-blue-200">
                                {resetStatus}
                            </p>
                        </div>
                    </div>
                </div>
            }
            <main className="min-h-[calc(100vh-4rem)]">
                <ChessGame
                    gameCode="GAME01"
                    playerName="Player"
                    playerColor="white"
                    gameType="digital"
                    onLeaveGame={handle_new_game}
                />
            </main>
        </div>;
    }
}