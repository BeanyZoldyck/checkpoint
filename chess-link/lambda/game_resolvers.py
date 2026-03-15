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


def generate_join_code() -> str:
    """Generate a 6-character join code"""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


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


def create_game_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Create a new chess game
    """
    try:
        args = event["arguments"]
        physical_player_color = args["physicalPlayerColor"]

        # Generate unique game ID and join code
        game_id = str(uuid.uuid4())
        join_code = generate_join_code()

        # Ensure join code is unique (small chance of collision)
        while True:
            existing = games_table.scan(
                FilterExpression="joinCode = :code",
                ExpressionAttributeValues={":code": join_code},
            )
            if not existing["Items"]:
                break
            join_code = generate_join_code()

        # Determine digital player color
        digital_player_color = "BLACK" if physical_player_color == "WHITE" else "WHITE"

        # Create initial game state
        initial_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

        game = {
            "id": game_id,
            "joinCode": join_code,
            "status": "WAITING_FOR_DIGITAL_PLAYER",
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

        print(f"Created game {game_id} with join code {join_code}")
        return game

    except Exception as e:
        print(f"Error creating game: {str(e)}")
        raise Exception(f"Failed to create game: {str(e)}")


def join_game_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Digital player joins a game using join code
    """
    try:
        args = event["arguments"]
        join_code = args["joinCode"].upper()

        # Find game by join code
        response = games_table.scan(
            FilterExpression="joinCode = :code",
            ExpressionAttributeValues={":code": join_code},
        )

        if not response["Items"]:
            raise Exception(f"Game not found with code: {join_code}")

        game = response["Items"][0]

        # Check if game is in correct state
        if game["status"] != "WAITING_FOR_DIGITAL_PLAYER":
            raise Exception(
                f"Game is not available for joining. Status: {game['status']}"
            )

        # Update game state
        updated_game = games_table.update_item(
            Key={"id": game["id"]},
            UpdateExpression="""
                SET digitalPlayerConnected = :connected,
                    #status = :status,
                    updatedAt = :updated
            """,
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":connected": True,
                ":status": "CALIBRATING",
                ":updated": get_current_timestamp(),
            },
            ReturnValues="ALL_NEW",
        )

        # Send game start notification to physical player
        push_tokens = get_player_push_tokens(game["id"])
        physical_player_color = game["physicalPlayerColor"].lower()
        physical_player_token = push_tokens.get(physical_player_color, "")

        if physical_player_token:
            notification_data = {
                "type": "game_start",
                "game_id": game["id"],
                "expo_token": physical_player_token,
                "opponent_name": "Digital Player",
            }
            send_push_notification(notification_data)

        print(f"Digital player joined game {game['id']}")
        return updated_game["Attributes"]

    except Exception as e:
        print(f"Error joining game: {str(e)}")
        raise Exception(f"Failed to join game: {str(e)}")


def make_digital_move_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Digital player makes a move
    """
    try:
        args = event["arguments"]
        game_id = args["gameId"]
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
        game_id = args["gameId"]
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
        game_id = args["gameId"]
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
        game_id = args["gameId"]
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


def get_game_by_join_code_resolver(
    event: Dict[str, Any], context
) -> Optional[Dict[str, Any]]:
    """
    Get game by join code
    """
    try:
        join_code = event["arguments"]["joinCode"].upper()

        response = games_table.scan(
            FilterExpression="joinCode = :code",
            ExpressionAttributeValues={":code": join_code},
        )

        if response["Items"]:
            return response["Items"][0]
        return None

    except Exception as e:
        print(f"Error getting game by join code: {str(e)}")
        return None


def register_push_token_resolver(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Register a push token for a player in a game
    """
    try:
        args = event["arguments"]
        game_id = args["gameId"]
        player_id = args["playerId"]
        push_token = args["pushToken"]
        player_color = args.get("playerColor", "").lower()

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
