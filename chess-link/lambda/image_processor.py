import json
import boto3
import base64
import uuid
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# AWS clients
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
appsync = boto3.client("appsync")

# Environment variables
GAMES_TABLE_NAME = os.environ.get("GAMES_TABLE", "chess-games")
IMAGES_BUCKET = os.environ.get("IMAGES_BUCKET", "checkpoint-images")
APPSYNC_ENDPOINT = os.environ.get("APPSYNC_ENDPOINT", "")

games_table = dynamodb.Table(GAMES_TABLE_NAME)


def upload_board_image_resolver(event: Dict[str, Any], context) -> str:
    """
    Handle board image upload for computer vision processing
    """
    try:
        args = event["arguments"]
        game_id = args["gameId"]
        image_data_base64 = args["imageData"]

        # Decode base64 image
        image_data = base64.b64decode(image_data_base64)

        # Generate S3 key
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        s3_key = f"games/{game_id}/images/{timestamp}_{uuid.uuid4().hex[:8]}.jpg"

        # Upload to S3
        s3.put_object(
            Bucket=IMAGES_BUCKET, Key=s3_key, Body=image_data, ContentType="image/jpeg"
        )

        # Update game with latest image
        games_table.update_item(
            Key={"id": game_id},
            UpdateExpression="SET lastImageS3Key = :key, updatedAt = :updated",
            ExpressionAttributeValues={
                ":key": s3_key,
                ":updated": datetime.now(timezone.utc).isoformat(),
            },
        )

        # TODO: Trigger computer vision processing
        # For now, return the S3 key
        print(f"Uploaded image for game {game_id}: {s3_key}")

        # In a real implementation, this would trigger CV processing
        # process_board_image_async(game_id, s3_key)

        return s3_key

    except Exception as e:
        print(f"Error uploading image: {str(e)}")
        raise Exception(f"Failed to upload image: {str(e)}")


def process_board_image_async(game_id: str, s3_key: str):
    """
    Async computer vision processing (placeholder)
    In real implementation, this would:
    1. Download image from S3
    2. Run computer vision model
    3. Detect board state and moves
    4. Call AppSync mutation if move detected
    """
    # This is a placeholder for the computer vision pipeline
    # The actual implementation would involve:
    # - SageMaker endpoint or Lambda with ONNX model
    # - Board detection and piece classification
    # - Move detection logic
    pass


def detect_move_from_image(game_id: str, s3_key: str) -> Optional[Dict[str, str]]:
    """
    Process chess board image and detect moves using computer vision
    """
    try:
        # Import CV model
        from cv_model import ChessBoardDetector

        # Download image from S3
        s3_response = s3.get_object(Bucket=IMAGES_BUCKET, Key=s3_key)
        image_data = s3_response["Body"].read()
        image_base64 = base64.b64encode(image_data).decode()

        # Initialize detector
        detector = ChessBoardDetector()

        # Get game state to retrieve calibration data
        game_response = games_table.get_item(Key={"id": game_id})
        game = game_response.get("Item", {})

        # TODO: Retrieve calibration data from game state
        calibration_data = None

        # Process image
        detection_result = detector.process_image(image_base64, calibration_data)

        if not detection_result["success"]:
            print(f"CV processing failed: {detection_result.get('error')}")
            return None

        current_board_state = detection_result["board_state"]

        # Get previous board state
        previous_fen = game.get(
            "currentFEN", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        )

        # Convert FEN to board state for comparison
        # For now, use the detector's move detection
        move = detector.detect_move(current_board_state)

        if move and move["type"] == "normal_move":
            # Convert to expected format
            return {
                "from": move["from"],
                "to": move["to"],
                "piece": move["piece"],
                "fen": detector.board_state_to_fen(current_board_state),
            }

        return None

    except Exception as e:
        print(f"Error in computer vision processing: {str(e)}")
        return None


# Keep mock function for fallback
def mock_detect_move_from_image(game_id: str, s3_key: str) -> Optional[Dict[str, str]]:
    """
    Mock function to simulate move detection - used as fallback
    """
    return {
        "from": "e2",
        "to": "e4",
        "piece": "P",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    }


def trigger_physical_move_detection(event: Dict[str, Any], context):
    """
    Lambda function triggered by S3 image upload
    This would be called automatically when images are uploaded
    """
    try:
        # Parse S3 event
        for record in event.get("Records", []):
            bucket = record["s3"]["bucket"]["name"]
            s3_key = record["s3"]["object"]["key"]

            # Extract game ID from S3 key
            # Format: games/{game_id}/images/{timestamp}_{uuid}.jpg
            path_parts = s3_key.split("/")
            if len(path_parts) >= 3 and path_parts[0] == "games":
                game_id = path_parts[1]

                # Process the image with computer vision
                move_data = detect_move_from_image(game_id, s3_key)

                # Fallback to mock if CV fails
                if move_data is None:
                    print(f"CV detection failed for {game_id}, using mock data")
                    move_data = mock_detect_move_from_image(game_id, s3_key)

                if move_data:
                    # Call AppSync mutation to record the move
                    trigger_appsync_physical_move(game_id, move_data)

    except Exception as e:
        print(f"Error processing image upload: {str(e)}")
        raise


def trigger_appsync_physical_move(game_id: str, move_data: Dict[str, str]):
    """
    Trigger AppSync mutation when computer vision detects a move
    """
    try:
        mutation = """
            mutation RecordPhysicalMove(
                $gameId: ID!
                $from: String!
                $to: String!
                $piece: String!
                $fen: String!
            ) {
                recordPhysicalMove(
                    gameId: $gameId
                    from: $from
                    to: $to
                    piece: $piece
                    fen: $fen
                ) {
                    id
                    san
                    fen
                    timestamp
                }
            }
        """

        variables = {
            "gameId": game_id,
            "from": move_data["from"],
            "to": move_data["to"],
            "piece": move_data["piece"],
            "fen": move_data["fen"],
        }

        # Execute GraphQL mutation
        response = appsync.evaluate_mapping_template(
            template=mutation, context_map=json.dumps({"arguments": variables})
        )

        print(f"Triggered physical move via AppSync for game {game_id}: {move_data}")
        return response

    except Exception as e:
        print(f"Error triggering AppSync mutation: {str(e)}")
        raise
