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
cl import from ".components.chess.ChessGame" { ChessGame }
cl import ".global.css";

cl {
    def:pub app() -> JsxElement {
        has darkMode: bool = False;

        def handle_new_game() -> None {
            # Reset to start a new game
            window.location.reload();
        }

        return <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border p-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-primary">ChessLink</h1>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={handle_new_game}
                            className="text-sm px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            New Game
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