import json
import boto3
import uuid
import chess
import random
import string
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# Initialize AWS clients
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
lambda_client = boto3.client("lambda")

# Environment variables (will be set by CDK)
import os

GAMES_TABLE_NAME = os.environ.get("GAMES_TABLE", "chess-games")
IMAGES_BUCKET = os.environ.get("IMAGES_BUCKET", "checkpoint-images")
PUSH_NOTIFICATION_FUNCTION = os.environ.get(
    "PUSH_NOTIFICATION_FUNCTION", "checkpoint-push-notifications"
)

games_table = dynamodb.Table(GAMES_TABLE_NAME)


def generate_game_id() -> str:
    """Generate a consistent game ID for the single game session"""
    return "single-game-session"


def get_current_timestamp() -> str:
    """Get current ISO timestamp"""
    return datetime.now(timezone.utc).isoformat()


def send_push_notification(notification_data: Dict[str, Any]) -> None:
    """
    Send push notification by invoking the notification Lambda function
    """
    try:
        lambda_client.invoke(
            FunctionName=PUSH_NOTIFICATION_FUNCTION,
            InvocationType="Event",  # Async invocation
            Payload=json.dumps(notification_data),
        )
        print(f"Push notification queued: {notification_data.get('type', 'unknown')}")
    except Exception as e:
        print(f"Error sending push notification: {str(e)}")
        # Don't fail the main operation if push notification fails


def get_player_push_tokens(game_id: str) -> Dict[str, str]:
    """
    Get push tokens for players in a game
    Returns dict with player colors as keys and tokens as values
    """
    try:
        # In a real implementation, you'd have a separate table for player push tokens
        # For now, we'll assume they're stored with the game data
        response = games_table.get_item(Key={"id": game_id})
        if "Item" in response:
            game = response["Item"]
            return {
                "white": game.get("whitePlayerPushToken", ""),
                "black": game.get("blackPlayerPushToken", ""),
            }
    except Exception as e:
        print(f"Error getting push tokens: {str(e)}")

    return {"white": "", "black": ""}


def connect_physical_player_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Connect physical player to the single game session
    """
    try:
        args = event["arguments"]
        physical_player_color = args["playerColor"]

        # Use consistent game ID for single game session
        game_id = generate_game_id()

        # Determine digital player color
        digital_player_color = "BLACK" if physical_player_color == "WHITE" else "WHITE"

        # Check if game already exists
        response = games_table.get_item(Key={"id": game_id})

        if "Item" in response:
            # Game exists, update physical player connection
            game = response["Item"]
            updated_game = games_table.update_item(
                Key={"id": game_id},
                UpdateExpression="""
                    SET physicalPlayerConnected = :connected,
                        physicalPlayerColor = :physicalColor,
                        digitalPlayerColor = :digitalColor,
                        #status = :status,
                        updatedAt = :updated
                """,
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":connected": True,
                    ":physicalColor": physical_player_color,
                    ":digitalColor": digital_player_color,
                    ":status": "WAITING_FOR_PLAYERS"
                    if not game.get("digitalPlayerConnected", False)
                    else "CALIBRATING",
                    ":updated": get_current_timestamp(),
                },
                ReturnValues="ALL_NEW",
            )
            return updated_game["Attributes"]
        else:
            # Create new game
            initial_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

            game = {
                "id": game_id,
                "status": "WAITING_FOR_PLAYERS",
                "currentFEN": initial_fen,
                "currentTurn": "WHITE",
                "physicalPlayerColor": physical_player_color,
                "digitalPlayerColor": digital_player_color,
                "moveHistory": [],
                "physicalPlayerConnected": True,
                "digitalPlayerConnected": False,
                "lastImageS3Key": None,
                "createdAt": get_current_timestamp(),
                "updatedAt": get_current_timestamp(),
            }

            # Save to DynamoDB
            games_table.put_item(Item=game)

            print(
                f"Created single game session with physical player color {physical_player_color}"
            )
            return game

    except Exception as e:
        print(f"Error connecting physical player: {str(e)}")
        raise Exception(f"Failed to connect physical player: {str(e)}")


def connect_digital_player_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Connect digital player to the single game session.
    Always returns a fully-populated Game object with all required fields.
    """
    initial_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

    try:
        game_id = generate_game_id()
        now = get_current_timestamp()

        # Fetch existing game if any
        response = games_table.get_item(Key={"id": game_id})
        existing = response.get("Item")

        if existing:
            # Merge: preserve physical-player fields, mark digital player connected
            game = {
                "id": game_id,
                "status": "CALIBRATING"
                if existing.get("physicalPlayerConnected")
                else "WAITING_FOR_PLAYERS",
                "currentFEN": existing.get("currentFEN") or initial_fen,
                "currentTurn": existing.get("currentTurn") or "WHITE",
                "physicalPlayerColor": existing.get("physicalPlayerColor") or "WHITE",
                "digitalPlayerColor": existing.get("digitalPlayerColor") or "BLACK",
                "moveHistory": existing.get("moveHistory") or [],
                "physicalPlayerConnected": bool(
                    existing.get("physicalPlayerConnected", False)
                ),
                "digitalPlayerConnected": True,
                "lastImageS3Key": existing.get("lastImageS3Key"),
                "createdAt": existing.get("createdAt") or now,
                "updatedAt": now,
            }
        else:
            game = {
                "id": game_id,
                "status": "WAITING_FOR_PLAYERS",
                "currentFEN": initial_fen,
                "currentTurn": "WHITE",
                "physicalPlayerColor": "WHITE",
                "digitalPlayerColor": "BLACK",
                "moveHistory": [],
                "physicalPlayerConnected": False,
                "digitalPlayerConnected": True,
                "lastImageS3Key": None,
                "createdAt": now,
                "updatedAt": now,
            }

        # Write complete record back (handles both create and repair cases)
        games_table.put_item(Item=game)

        # Notify physical player if already connected
        if game["physicalPlayerConnected"]:
            push_tokens = get_player_push_tokens(game_id)
            token = push_tokens.get(game["physicalPlayerColor"].lower(), "")
            if token:
                send_push_notification(
                    {
                        "type": "game_start",
                        "game_id": game_id,
                        "expo_token": token,
                        "opponent_name": "Digital Player",
                    }
                )

        print(f"Digital player connected to game {game_id}, status={game['status']}")
        return game

    except Exception as e:
        print(f"Error connecting digital player: {str(e)}")
        raise Exception(f"Failed to connect digital player: {str(e)}")


def get_current_game_resolver(
    event: Dict[str, Any], context
) -> Optional[Dict[str, Any]]:
    """
    Get the current single game session
    """
    try:
        game_id = generate_game_id()
        response = games_table.get_item(Key={"id": game_id})
        return response.get("Item")
    except Exception as e:
        print(f"Error getting current game: {str(e)}")
        return None


def make_digital_move_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Digital player makes a move
    """
    try:
        args = event["arguments"]
        game_id = generate_game_id()  # Use single game session
        from_square = args["from"]
        to_square = args["to"]
        promotion = args.get("promotion")

        # Get current game state
        game_response = games_table.get_item(Key={"id": game_id})
        if "Item" not in game_response:
            raise Exception(f"Game {game_id} not found")

        game = game_response["Item"]

        # Validate game is active
        if game["status"] != "ACTIVE":
            raise Exception(f"Game is not active. Status: {game['status']}")

        # Validate it's the digital player's turn
        board = chess.Board(game["currentFEN"])
        current_color = "WHITE" if board.turn else "BLACK"

        if current_color != game["digitalPlayerColor"]:
            raise Exception("Not your turn!")

        # Create and validate the move
        move_uci = from_square + to_square + (promotion or "")
        try:
            move = chess.Move.from_uci(move_uci)
        except Exception:
            raise Exception(f"Invalid move format: {move_uci}")

        if move not in board.legal_moves:
            raise Exception(f"Illegal move: {move_uci}")

        # Apply the move
        board_copy = chess.Board(game["currentFEN"])
        san_move = board_copy.san(move)
        board.push(move)

        # Create move record
        move_record = {
            "id": str(uuid.uuid4()),
            "gameId": game_id,
            "from": from_square,
            "to": to_square,
            "piece": str(board_copy.piece_at(move.from_square)),
            "san": san_move,
            "fen": board.fen(),
            "playerColor": game["digitalPlayerColor"],
            "moveNumber": len(game["moveHistory"]) + 1,
            "timestamp": get_current_timestamp(),
        }

        # Update game state
        new_turn = "WHITE" if not board.turn else "BLACK"
        games_table.update_item(
            Key={"id": game_id},
            UpdateExpression="""
                SET currentFEN = :fen,
                    currentTurn = :turn,
                    moveHistory = list_append(moveHistory, :move),
                    updatedAt = :updated
            """,
            ExpressionAttributeValues={
                ":fen": board.fen(),
                ":turn": new_turn,
                ":move": [san_move],
                ":updated": get_current_timestamp(),
            },
        )

        # Note: Move notifications removed - moves are shown on camera overlay instead
        # Push notifications now only used for game start/end events

        print(f"Digital player made move: {san_move} in game {game_id}")
        return move_record

    except Exception as e:
        print(f"Error making digital move: {str(e)}")
        raise Exception(f"Failed to make move: {str(e)}")


def record_physical_move_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Record a move detected by computer vision
    """
    try:
        args = event["arguments"]
        game_id = generate_game_id()  # Use single game session
        from_square = args["from"]
        to_square = args["to"]
        piece = args["piece"]
        new_fen = args["fen"]

        # Get current game state
        game_response = games_table.get_item(Key={"id": game_id})
        if "Item" not in game_response:
            raise Exception(f"Game {game_id} not found")

        game = game_response["Item"]

        # Validate game is active
        if game["status"] != "ACTIVE":
            raise Exception(f"Game is not active. Status: {game['status']}")

        # Validate it's the physical player's turn
        board = chess.Board(game["currentFEN"])
        current_color = "WHITE" if board.turn else "BLACK"

        if current_color != game["physicalPlayerColor"]:
            raise Exception("Not physical player's turn!")

        # Validate the move
        try:
            move = chess.Move.from_uci(from_square + to_square)
        except Exception:
            raise Exception(f"Invalid move format: {from_square + to_square}")

        if move not in board.legal_moves:
            raise Exception(f"Illegal move detected: {from_square + to_square}")

        # Generate SAN notation
        san_move = board.san(move)
        board.push(move)

        # Create move record
        move_record = {
            "id": str(uuid.uuid4()),
            "gameId": game_id,
            "from": from_square,
            "to": to_square,
            "piece": piece,
            "san": san_move,
            "fen": board.fen(),
            "playerColor": game["physicalPlayerColor"],
            "moveNumber": len(game["moveHistory"]) + 1,
            "timestamp": get_current_timestamp(),
        }

        # Update game state
        new_turn = "WHITE" if not board.turn else "BLACK"
        games_table.update_item(
            Key={"id": game_id},
            UpdateExpression="""
                SET currentFEN = :fen,
                    currentTurn = :turn,
                    moveHistory = list_append(moveHistory, :move),
                    updatedAt = :updated
            """,
            ExpressionAttributeValues={
                ":fen": board.fen(),
                ":turn": new_turn,
                ":move": [san_move],
                ":updated": get_current_timestamp(),
            },
        )

        # Note: Move notifications removed - moves are shown on camera overlay instead
        # Push notifications now only used for game start/end events

        print(f"Physical move recorded: {san_move} in game {game_id}")
        return move_record

    except Exception as e:
        print(f"Error recording physical move: {str(e)}")
        raise Exception(f"Failed to record move: {str(e)}")


def update_player_connection_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Update player connection status
    """
    try:
        args = event["arguments"]
        game_id = generate_game_id()  # Use single game session
        player_type = args["playerType"]
        connected = args["connected"]

        # Determine field to update
        field = (
            "physicalPlayerConnected"
            if player_type == "physical"
            else "digitalPlayerConnected"
        )

        # Update the game
        response = games_table.update_item(
            Key={"id": game_id},
            UpdateExpression=f"SET {field} = :connected, updatedAt = :updated",
            ExpressionAttributeValues={
                ":connected": connected,
                ":updated": get_current_timestamp(),
            },
            ReturnValues="ALL_NEW",
        )

        print(
            f"Updated {player_type} player connection to {connected} for game {game_id}"
        )
        return response["Attributes"]

    except Exception as e:
        print(f"Error updating player connection: {str(e)}")
        raise Exception(f"Failed to update connection: {str(e)}")


def complete_calibration_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Mark calibration as complete and start the game
    """
    try:
        args = event["arguments"]
        game_id = generate_game_id()  # Use single game session
        calibration_data = args["calibrationData"]

        # Update game to active status
        response = games_table.update_item(
            Key={"id": game_id},
            UpdateExpression="""
                SET #status = :status,
                    updatedAt = :updated
            """,
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": "ACTIVE",
                ":updated": get_current_timestamp(),
            },
            ReturnValues="ALL_NEW",
        )

        print(f"Calibration completed for game {game_id}")
        return response["Attributes"]

    except Exception as e:
        print(f"Error completing calibration: {str(e)}")
        raise Exception(f"Failed to complete calibration: {str(e)}")


def get_game_resolver(event: Dict[str, Any], context) -> Optional[Dict[str, Any]]:
    """
    Get game by ID
    """
    try:
        game_id = event["arguments"]["id"]

        response = games_table.get_item(Key={"id": game_id})
        return response.get("Item")

    except Exception as e:
        print(f"Error getting game: {str(e)}")
        return None


# Removed get_game_by_join_code_resolver - not needed for single game session


def register_push_token_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Register a push token for a player in a game
    """
    try:
        args = event["arguments"]
        player_id = args["playerId"]
        push_token = args["pushToken"]
        player_color = args.get("playerColor", "").lower()
        game_id = generate_game_id()  # Use single game session

        # Validate push token format
        if not push_token or not push_token.startswith("ExponentPushToken["):
            raise Exception("Invalid Expo push token format")

        # Update the game with the push token
        if player_color in ["white", "black"]:
            field = f"{player_color}PlayerPushToken"
            games_table.update_item(
                Key={"id": game_id},
                UpdateExpression=f"SET {field} = :token, updatedAt = :updated",
                ExpressionAttributeValues={
                    ":token": push_token,
                    ":updated": get_current_timestamp(),
                },
            )

        print(f"Registered push token for {player_color} player in game {game_id}")

        return {"success": True, "message": "Push token registered successfully"}

    except Exception as e:
        print(f"Error registering push token: {str(e)}")
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Dispatcher handler — single entry point for all AppSync resolvers
# ---------------------------------------------------------------------------

RESOLVER_MAP = {
    "connectPhysicalPlayer": connect_physical_player_resolver,
    "connectDigitalPlayer": connect_digital_player_resolver,
    "getCurrentGame": get_current_game_resolver,
    "getGame": get_game_resolver,
    "makeDigitalMove": make_digital_move_resolver,
    "recordPhysicalMove": record_physical_move_resolver,
    "updatePlayerConnection": update_player_connection_resolver,
    "completeCalibration": complete_calibration_resolver,
    "registerPushToken": register_push_token_resolver,
}


def handler(event, context):
    """
    Single dispatcher entry point for all AppSync Lambda resolvers.
    AppSync passes the full context; we route by field name.
    """
    field = event.get("info", {}).get("fieldName") or event.get("fieldName", "")
    print(f"Dispatching resolver for field: {field}")

    resolver_fn = RESOLVER_MAP.get(field)
    if resolver_fn:
        return resolver_fn(event, context)

    raise Exception(f"Unknown resolver field: {field}")


# Legacy per-field entry points kept for backwards compatibility
# (AppSync data sources were originally configured to call these directly)
def create_game_resolver(event, context):
    return connect_digital_player_resolver(event, context)


def connect_digital_player(event, context):
    return connect_digital_player_resolver(event, context)


def connect_physical_player(event, context):
    return connect_physical_player_resolver(event, context)


def make_digital_move(event, context):
    return make_digital_move_resolver(event, context)


def record_physical_move(event, context):
    return record_physical_move_resolver(event, context)


def update_player_connection(event, context):
    return update_player_connection_resolver(event, context)


def complete_calibration(event, context):
    return complete_calibration_resolver(event, context)


def get_current_game(event, context):
    return get_current_game_resolver(event, context)


def register_push_token(event, context):
    return register_push_token_resolver(event, context)
