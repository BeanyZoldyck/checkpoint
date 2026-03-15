"""
ChessLink Lambda — Detect chess position from S3 board images via Bedrock.

Supports both Anthropic Claude and Amazon Nova models.

Trigger methods:
  1. S3 event trigger: automatically processes images uploaded to the bucket.
  2. API Gateway / direct invoke: pass {"bucket": "...", "key": "..."} in the event.
  3. Move detection: pass {"bucket": "...", "before_key": "...", "after_key": "..."}.

Environment variables:
  BEDROCK_MODEL_ID  — inference profile ID (default: us.amazon.nova-pro-v1:0)
  BEDROCK_REGION    — region for Bedrock (default: us-east-2)
"""

import base64
import json
import os
import re

import boto3

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-2")
MAX_TOKENS = 2048
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# ---------------------------------------------------------------------------
# Prompts
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
# Clients (reused across warm invocations)
# ---------------------------------------------------------------------------
s3_client = boto3.client("s3")
bedrock_client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)


# ---------------------------------------------------------------------------
# Model helpers
# ---------------------------------------------------------------------------
def is_anthropic_model(model_id: str) -> bool:
    return "anthropic" in model_id.lower()


def build_image_content(img_b64: str, media_type: str) -> dict:
    """Build an image content block appropriate for the model family."""
    if is_anthropic_model(BEDROCK_MODEL_ID):
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": img_b64},
        }
    else:
        fmt = media_type.split("/")[-1]
        return {"image": {"format": fmt, "source": {"bytes": img_b64}}}


def build_text_content(text: str) -> dict:
    """Build a text content block appropriate for the model family."""
    if is_anthropic_model(BEDROCK_MODEL_ID):
        return {"type": "text", "text": text}
    else:
        return {"text": text}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_image_from_s3(bucket: str, key: str) -> tuple:
    """Download image from S3, return (base64_data, media_type)."""
    resp = s3_client.get_object(Bucket=bucket, Key=key)
    body = resp["Body"].read()

    ext = key.rsplit(".", 1)[-1].lower() if "." in key else "jpg"
    media_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }
    media_type = media_map.get(ext, "image/jpeg")

    return base64.b64encode(body).decode("utf-8"), media_type


def invoke_bedrock(content_blocks: list) -> dict:
    """Call Bedrock and parse the JSON response."""
    if is_anthropic_model(BEDROCK_MODEL_ID):
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

    response = bedrock_client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        body=json.dumps(body),
    )
    result = json.loads(response["body"].read())

    if is_anthropic_model(BEDROCK_MODEL_ID):
        text = result["content"][0]["text"]
    else:
        text = result["output"]["message"]["content"][0]["text"]

    return _extract_json(text)


def _extract_json(text: str) -> dict:
    """Extract JSON from model response text, handling various formats."""
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
    raise ValueError(f"Could not extract JSON from model response: {text[:500]}")


def validate_fen(fen: str) -> dict:
    """Lightweight FEN validation (no python-chess dependency in Lambda)."""
    try:
        parts = fen.split()
        if len(parts) < 1:
            return {"valid": False, "error": "Empty FEN"}

        rows = parts[0].split("/")
        if len(rows) != 8:
            return {"valid": False, "error": f"Expected 8 rows, got {len(rows)}"}

        piece_counts = {
            "K": 0,
            "Q": 0,
            "R": 0,
            "B": 0,
            "N": 0,
            "P": 0,
            "k": 0,
            "q": 0,
            "r": 0,
            "b": 0,
            "n": 0,
            "p": 0,
        }
        total_pieces = 0

        for row in rows:
            col_count = 0
            for ch in row:
                if ch.isdigit():
                    col_count += int(ch)
                elif ch in piece_counts:
                    piece_counts[ch] += 1
                    total_pieces += 1
                    col_count += 1
                else:
                    return {"valid": False, "error": f"Invalid character in FEN: {ch}"}
            if col_count != 8:
                return {
                    "valid": False,
                    "error": f"Row has {col_count} columns, expected 8",
                }

        if piece_counts["K"] != 1:
            return {
                "valid": False,
                "error": f"Expected 1 white king, got {piece_counts['K']}",
            }
        if piece_counts["k"] != 1:
            return {
                "valid": False,
                "error": f"Expected 1 black king, got {piece_counts['k']}",
            }

        white_pieces = sum(piece_counts[p] for p in "KQRBNP")
        black_pieces = sum(piece_counts[p] for p in "kqrbnp")

        return {
            "valid": True,
            "piece_count": total_pieces,
            "white_pieces": white_pieces,
            "black_pieces": black_pieces,
        }
    except Exception as e:
        return {"valid": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Core detection functions
# ---------------------------------------------------------------------------
def detect_position(bucket: str, key: str) -> dict:
    """Detect chess position from a single board image."""
    img_b64, media_type = get_image_from_s3(bucket, key)

    content = [
        build_image_content(img_b64, media_type),
        build_text_content(POSITION_PROMPT),
    ]

    result = invoke_bedrock(content)
    result["source"] = f"s3://{bucket}/{key}"
    result["model"] = BEDROCK_MODEL_ID
    result["validation"] = validate_fen(result.get("fen", ""))
    return result


def detect_move(bucket: str, before_key: str, after_key: str) -> dict:
    """Detect the move made between two board images."""
    before_b64, before_mt = get_image_from_s3(bucket, before_key)
    after_b64, after_mt = get_image_from_s3(bucket, after_key)

    content = [
        build_image_content(before_b64, before_mt),
        build_image_content(after_b64, after_mt),
        build_text_content(MOVE_DETECTION_PROMPT),
    ]

    result = invoke_bedrock(content)
    result["before_validation"] = validate_fen(result.get("before_fen", ""))
    result["after_validation"] = validate_fen(result.get("after_fen", ""))
    result["move_format_valid"] = bool(
        re.match(r"^[a-h][1-8][a-h][1-8][qrbn]?$", result.get("move_uci", ""))
    )
    return result


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------
def lambda_handler(event, context):
    """
    Entry point for Lambda.

    Accepts:
      - S3 event notification (automatic trigger on image upload)
      - Direct invocation: {"bucket": "...", "key": "..."}
      - Move detection:    {"bucket": "...", "before_key": "...", "after_key": "..."}
      - API Gateway proxy: extracts from queryStringParameters or body
    """
    try:
        # --- Handle API Gateway proxy integration ---
        if "httpMethod" in event or "requestContext" in event:
            if event.get("httpMethod") == "GET":
                params = event.get("queryStringParameters") or {}
            else:
                params = json.loads(event.get("body", "{}"))

            bucket = params.get("bucket")
            key = params.get("key")
            before_key = params.get("before_key")
            after_key = params.get("after_key")

            if not bucket:
                return _api_response(400, {"error": "Missing 'bucket' parameter"})

            if before_key and after_key:
                result = detect_move(bucket, before_key, after_key)
            elif key:
                result = detect_position(bucket, key)
            else:
                return _api_response(
                    400, {"error": "Missing 'key' or 'before_key'/'after_key'"}
                )

            return _api_response(200, result)

        # --- Handle S3 event trigger ---
        if "Records" in event and event["Records"][0].get("eventSource") == "aws:s3":
            record = event["Records"][0]["s3"]
            bucket = record["bucket"]["name"]
            key = record["object"]["key"]

            ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
            if f".{ext}" not in IMAGE_EXTENSIONS:
                return {"statusCode": 200, "body": f"Skipped non-image file: {key}"}

            result = detect_position(bucket, key)
            print(json.dumps(result))  # CloudWatch logs
            return {"statusCode": 200, "body": json.dumps(result)}

        # --- Handle direct invocation ---
        bucket = event.get("bucket")
        before_key = event.get("before_key")
        after_key = event.get("after_key")
        key = event.get("key")

        if before_key and after_key:
            return detect_move(bucket, before_key, after_key)
        elif key:
            return detect_position(bucket, key)
        else:
            return {"error": "Provide 'key' or 'before_key'/'after_key' in the event"}

    except Exception as e:
        error_resp = {"error": str(e), "type": type(e).__name__}
        print(json.dumps(error_resp))
        if "httpMethod" in event or "requestContext" in event:
            return _api_response(500, error_resp)
        return error_resp


def _api_response(status_code: int, body: dict) -> dict:
    """Format an API Gateway proxy response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
