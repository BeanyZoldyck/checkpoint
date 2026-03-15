#!/usr/bin/env python3
"""
ChessLink PoC — Detect chess position from a board image in S3 using Bedrock.

Supports both Anthropic Claude and Amazon Nova models automatically.

Usage:
    # Analyze a specific image from S3
    python detect_position.py --bucket checkpoint-rh --key board.jpg

    # Analyze all images in a prefix
    python detect_position.py --bucket checkpoint-rh --prefix boards/

    # Use a local file instead of S3
    python detect_position.py --local photo.jpg

    # Compare two consecutive images to detect a move
    python detect_position.py --bucket checkpoint-rh --key before.jpg --after after.jpg

    # Override the model (default: auto-detect best available)
    BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0 python detect_position.py --local board.jpg
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import boto3
import chess

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REGION = "us-east-2"
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "")  # auto-detect if empty
MAX_TOKENS = 5000

# Model preference order for auto-detection (best vision accuracy first)
MODEL_CANDIDATES = [
    "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    "us.anthropic.claude-3-haiku-20240307-v1:0",
    "us.amazon.nova-pro-v1:0",
    "us.amazon.nova-lite-v1:0",
]

# ---------------------------------------------------------------------------
# Bedrock prompts
# ---------------------------------------------------------------------------
POSITION_PROMPT = """Analyze this chess board image and determine the exact position of every piece.

Rules for your analysis:
1. Carefully identify the board orientation (which side is white, which is black).
2. Go through EVERY single square from a8 to h1 (rank 8 down to rank 1, file a to h).
   For each square, state if it is empty or which piece is on it.
3. Use standard piece notation: K=King, Q=Queen, R=Rook, B=Bishop, N=Knight, P=Pawn.
   Uppercase = White, lowercase = black.
4. After analyzing all 64 squares, construct a valid FEN string.
5. If you cannot determine castling rights or en passant from the image, use reasonable defaults
   (KQkq for castling if rooks and kings are on starting squares, - otherwise).

Return your response in this exact JSON format and nothing else:
{
    "fen": "<full FEN string>",
    "confidence": "<high|medium|low>",
    "notes": "<any observations about the position or image quality>"
}"""

MOVE_DETECTION_PROMPT = """I'm showing you two chess board images taken at different times during a game.
The first image is the BEFORE state and the second image is the AFTER state.

Determine what move was made between the two images.

Return your response in this exact JSON format and nothing else:
{
    "before_fen": "<FEN of the first image>",
    "after_fen": "<FEN of the second image>",
    "move_san": "<move in Standard Algebraic Notation, e.g. e4, Nf3, O-O>",
    "move_uci": "<move in UCI format, e.g. e2e4, g1f3, e1g1>",
    "confidence": "<high|medium|low>",
    "notes": "<any observations>"
}"""


# ---------------------------------------------------------------------------
# Model detection
# ---------------------------------------------------------------------------
def is_anthropic_model(model_id: str) -> bool:
    return "anthropic" in model_id.lower()


def detect_available_model() -> str:
    """Try each model candidate with a minimal text request to find one that works."""
    client = boto3.client("bedrock-runtime", region_name=REGION)
    for model_id in MODEL_CANDIDATES:
        try:
            if is_anthropic_model(model_id):
                body = {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 5,
                    "messages": [
                        {"role": "user", "content": [{"type": "text", "text": "hi"}]}
                    ],
                }
            else:
                body = {
                    "messages": [{"role": "user", "content": [{"text": "hi"}]}],
                    "inferenceConfig": {"maxTokens": 5},
                }
            client.invoke_model(
                modelId=model_id,
                contentType="application/json",
                body=json.dumps(body),
            )
            print(f"Using model: {model_id}")
            return model_id
        except Exception:
            continue
    print(
        "ERROR: No Bedrock models available. Enable model access in the AWS Bedrock console.",
        file=sys.stderr,
    )
    sys.exit(1)


def get_model_id() -> str:
    """Return the configured model ID, auto-detecting if not set."""
    global MODEL_ID
    if not MODEL_ID:
        MODEL_ID = detect_available_model()
    return MODEL_ID


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_image_from_s3(bucket: str, key: str) -> tuple[str, str]:
    """Download an image from S3 and return (base64_data, media_type)."""
    s3 = boto3.client("s3", region_name=REGION)
    resp = s3.get_object(Bucket=bucket, Key=key)
    body = resp["Body"].read()

    if key.lower().endswith(".png"):
        content_type = "image/png"
    elif key.lower().endswith(".webp"):
        content_type = "image/webp"
    else:
        content_type = "image/jpeg"

    return base64.b64encode(body).decode("utf-8"), content_type


def get_image_from_file(path: str) -> tuple[str, str]:
    """Read a local image file and return (base64_data, media_type)."""
    data = Path(path).read_bytes()
    ext = Path(path).suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    media_type = media_types.get(ext, "image/jpeg")
    return base64.b64encode(data).decode("utf-8"), media_type


def _build_image_content(img_b64: str, media_type: str, model_id: str) -> dict:
    """Build an image content block appropriate for the model family."""
    if is_anthropic_model(model_id):
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": img_b64},
        }
    else:
        # Amazon Nova format
        fmt = media_type.split("/")[-1]
        if fmt == "jpeg":
            fmt = "jpeg"
        return {"image": {"format": fmt, "source": {"bytes": img_b64}}}


def _build_text_content(text: str, model_id: str) -> dict:
    """Build a text content block appropriate for the model family."""
    if is_anthropic_model(model_id):
        return {"type": "text", "text": text}
    else:
        return {"text": text}


def invoke_bedrock(content_blocks: list[dict]) -> dict:
    """Call Bedrock with content blocks and return parsed JSON response.

    Content blocks should be built with _build_image_content / _build_text_content.
    """
    model_id = get_model_id()
    client = boto3.client("bedrock-runtime", region_name=REGION)

    if is_anthropic_model(model_id):
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "messages": [{"role": "user", "content": content_blocks}],
        }
    else:
        body = {
            "messages": [{"role": "user", "content": content_blocks}],
            "inferenceConfig": {"maxTokens": MAX_TOKENS},
        }

    response = client.invoke_model(
        modelId=model_id,
        contentType="application/json",
        body=json.dumps(body),
    )
    result = json.loads(response["body"].read())

    # Extract text from the response (different format per model family)
    if is_anthropic_model(model_id):
        text = result["content"][0]["text"]
    else:
        text = result["output"]["message"]["content"][0]["text"]

    return _extract_json(text)


def _extract_json(text: str) -> dict:
    """Extract JSON from model response text, handling various formats.

    Handles:
      - Pure JSON response
      - JSON wrapped in ```json ... ``` code blocks
      - JSON embedded after preamble text (finds first { ... last })
    """
    stripped = text.strip()

    # 1. Try parsing the full response as-is
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # 2. Try extracting from markdown code blocks
    if "```json" in text:
        block = text.split("```json")[1].split("```")[0]
        try:
            return json.loads(block.strip())
        except json.JSONDecodeError:
            pass
    elif "```" in text:
        block = text.split("```")[1].split("```")[0]
        try:
            return json.loads(block.strip())
        except json.JSONDecodeError:
            pass

    # 3. Find the first '{' and last '}' — extract embedded JSON object
    first_brace = stripped.find("{")
    last_brace = stripped.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = stripped[first_brace : last_brace + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # 4. Nothing worked
    raise ValueError(f"Could not extract JSON from model response:\n{text[:500]}")


def validate_fen(fen: str) -> dict:
    """Validate a FEN string using python-chess. Returns validation info."""
    try:
        board = chess.Board(fen)
        return {
            "valid": True,
            "piece_count": len(board.piece_map()),
            "white_pieces": sum(
                1 for p in board.piece_map().values() if p.color == chess.WHITE
            ),
            "black_pieces": sum(
                1 for p in board.piece_map().values() if p.color == chess.BLACK
            ),
            "is_check": board.is_check(),
            "is_checkmate": board.is_checkmate(),
            "is_stalemate": board.is_stalemate(),
            "legal_moves": [board.san(m) for m in board.legal_moves],
        }
    except ValueError as e:
        return {"valid": False, "error": str(e)}


def print_board(fen: str) -> None:
    """Print an ASCII chess board from FEN."""
    try:
        board = chess.Board(fen)
        print("\n" + str(board))
        print(f"\nFEN: {fen}")
    except ValueError:
        print(f"\nInvalid FEN: {fen}")


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------
def detect_position(
    bucket: str | None = None, key: str | None = None, local: str | None = None
) -> dict:
    """Detect the chess position from a single board image."""
    if local:
        img_b64, media_type = get_image_from_file(local)
        source_desc = local
    else:
        assert bucket is not None and key is not None, (
            "Must provide bucket+key or local"
        )
        img_b64, media_type = get_image_from_s3(bucket, key)
        source_desc = f"s3://{bucket}/{key}"

    model_id = get_model_id()
    print(f"Analyzing board image: {source_desc}")
    print(f"Sending to Bedrock ({model_id})...")

    content = [
        _build_image_content(img_b64, media_type, model_id),
        _build_text_content(POSITION_PROMPT, model_id),
    ]

    result = invoke_bedrock(content)

    # Validate the FEN
    fen = result.get("fen", "")
    validation = validate_fen(fen)
    result["validation"] = validation
    result["model"] = model_id

    return result


def detect_move(
    bucket: str | None = None,
    before_key: str | None = None,
    after_key: str | None = None,
    before_local: str | None = None,
    after_local: str | None = None,
) -> dict:
    """Detect the move made between two board images."""
    if before_local and after_local:
        before_b64, before_mt = get_image_from_file(before_local)
        after_b64, after_mt = get_image_from_file(after_local)
    else:
        assert bucket and before_key and after_key, (
            "Must provide bucket+keys or local files"
        )
        before_b64, before_mt = get_image_from_s3(bucket, before_key)
        after_b64, after_mt = get_image_from_s3(bucket, after_key)

    model_id = get_model_id()
    print("Analyzing move between two board states...")
    print(f"Sending to Bedrock ({model_id})...")

    content = [
        _build_image_content(before_b64, before_mt, model_id),
        _build_image_content(after_b64, after_mt, model_id),
        _build_text_content(MOVE_DETECTION_PROMPT, model_id),
    ]

    result = invoke_bedrock(content)

    # Validate both FENs and the move
    before_fen = result.get("before_fen", "")
    after_fen = result.get("after_fen", "")
    move_uci = result.get("move_uci", "")

    result["before_validation"] = validate_fen(before_fen)
    result["after_validation"] = validate_fen(after_fen)

    # Verify the move is legal from the before position
    try:
        board = chess.Board(before_fen)
        move = chess.Move.from_uci(move_uci)
        result["move_is_legal"] = move in board.legal_moves
    except (ValueError, chess.InvalidMoveError):
        result["move_is_legal"] = False

    return result


def scan_prefix(bucket: str, prefix: str) -> list[dict]:
    """Analyze all images under an S3 prefix."""
    s3 = boto3.client("s3", region_name=REGION)
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    keys = [
        obj["Key"]
        for obj in resp.get("Contents", [])
        if Path(obj["Key"]).suffix.lower() in image_extensions
    ]

    if not keys:
        print(f"No images found under s3://{bucket}/{prefix}")
        return []

    print(f"Found {len(keys)} images under s3://{bucket}/{prefix}")
    results = []
    for key in sorted(keys):
        try:
            result = detect_position(bucket=bucket, key=key)
            result["s3_key"] = key
            results.append(result)
            print_board(result["fen"])
            print(f"Confidence: {result['confidence']}")
            print(f"Notes: {result.get('notes', '')}")
            print("-" * 60)
        except Exception as e:
            print(f"Error processing {key}: {e}")

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Detect chess positions from board images"
    )
    parser.add_argument(
        "--bucket",
        default="checkpoint-rh",
        help="S3 bucket name (default: checkpoint-rh)",
    )
    parser.add_argument("--key", help="S3 object key for the board image")
    parser.add_argument(
        "--after", help="S3 key for the 'after' image (for move detection)"
    )
    parser.add_argument("--prefix", help="S3 prefix to scan for all images")
    parser.add_argument("--local", help="Path to a local image file instead of S3")
    parser.add_argument(
        "--local-after", help="Path to a local 'after' image for move detection"
    )
    parser.add_argument(
        "--json", action="store_true", help="Output raw JSON instead of formatted text"
    )
    args = parser.parse_args()

    if not args.key and not args.prefix and not args.local:
        parser.error("Provide --key, --prefix, or --local")

    # Move detection mode (two images)
    if args.after or args.local_after:
        result = detect_move(
            bucket=args.bucket,
            before_key=args.key,
            after_key=args.after,
            before_local=args.local,
            after_local=args.local_after,
        )
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\nMove detected: {result.get('move_san', '?')}")
            print(f"UCI: {result.get('move_uci', '?')}")
            print(f"Legal: {result.get('move_is_legal', '?')}")
            print(f"Confidence: {result.get('confidence', '?')}")
            print("\nBefore:")
            print_board(result.get("before_fen", ""))
            print("\nAfter:")
            print_board(result.get("after_fen", ""))

    # Prefix scan mode
    elif args.prefix:
        results = scan_prefix(args.bucket, args.prefix)
        if args.json:
            print(json.dumps(results, indent=2))

    # Single image mode
    else:
        result = detect_position(bucket=args.bucket, key=args.key, local=args.local)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\nConfidence: {result['confidence']}")
            print(f"Notes: {result.get('notes', '')}")
            print_board(result["fen"])
            validation = result["validation"]
            if validation["valid"]:
                print(f"\nPosition is valid")
                print(
                    f"Pieces: {validation['white_pieces']}W / {validation['black_pieces']}B"
                )
                if validation["is_checkmate"]:
                    print("CHECKMATE!")
                elif validation["is_check"]:
                    print("CHECK!")
                elif validation["is_stalemate"]:
                    print("STALEMATE!")
                print(f"Legal moves available: {len(validation['legal_moves'])}")
            else:
                print(f"\nFEN validation error: {validation['error']}")


if __name__ == "__main__":
    main()
