cl import from ".components.ui.switch" { Switch }
cl import from ".components.chess.GameLobby" { GameLobby }
cl import from ".components.chess.ChessGame" { ChessGame }
cl import ".global.css";

cl {
    def:pub app() -> JsxElement {
        has darkMode: bool = False;
        has screen: str = "lobby";   # "lobby" | "game" | "camera"
        has gameInfo: dict = {};

        def handle_join_game(info: dict) -> None {
            gameInfo = info;
            screen = "game";
        }

        def handle_create_game(info: dict) -> None {
            gameInfo = info;
            screen = "lobby";
        }

        def handle_start_camera(info: dict) -> None {
            gameInfo = info;
            screen = "lobby";  # Camera flow handled by mobile app
        }

        def handle_leave_game() -> None {
            gameInfo = {};
            screen = "lobby";
        }

        def get_game_code() -> str {
            if gameInfo?["gameCode"] { return gameInfo["gameCode"]; }
            return "session";
        }

        def get_player_name() -> str {
            if gameInfo?["playerName"] { return gameInfo["playerName"]; }
            return "Player";
        }

        def get_player_color() -> str {
            if gameInfo?["playerColor"] { return gameInfo["playerColor"]; }
            return "white";
        }

        def get_game_type() -> str {
            if gameInfo?["gameType"] { return gameInfo["gameType"]; }
            return "digital";
        }

        def render_screen() -> JsxElement {
            if screen == "game" {
                return <ChessGame
                    gameCode={get_game_code()}
                    playerName={get_player_name()}
                    playerColor={get_player_color()}
                    gameType={get_game_type()}
                    onLeaveGame={handle_leave_game}
                />;
            } else {
                return <GameLobby
                    onJoinGame={handle_join_game}
                    onCreateGame={handle_create_game}
                    onStartCamera={handle_start_camera}
                />;
            }
        }

        return <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border p-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <button
                        onClick={handle_leave_game}
                        className="text-2xl font-bold text-primary hover:opacity-80"
                    >
                        Checkpoint
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
            </header>
            <main className="min-h-[calc(100vh-4rem)]">
                {render_screen()}
            </main>
        </div>;
    }
}