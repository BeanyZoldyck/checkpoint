#!/usr/bin/env bash
#
# Quick end-to-end test for the ChessLink PoC.
#
# Usage:
#   ./test_poc.sh                          # Test with a chess board image from the web
#   ./test_poc.sh local  path/to/photo.jpg # Test with a local file
#   ./test_poc.sh lambda                   # Test via Lambda invocation (deploy first)
#
set -euo pipefail

BUCKET="checkpoint-rh"
REGION="us-east-2"
FUNCTION_NAME="chesslink-detect-position"

log() { echo -e "\033[1;34m==>\033[0m $1"; }

# ---------------------------------------------------------------------------
# Generate a test board image using python-chess SVG -> PNG
# ---------------------------------------------------------------------------
generate_test_image() {
    log "Generating a test chess board image..."
    python3 -c "
import chess
import chess.svg

# Create a position (Sicilian Defense after 1.e4 c5 2.Nf3 d6 3.d4)
board = chess.Board()
moves = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4']
for m in moves:
    board.push(chess.Move.from_uci(m))

svg = chess.svg.board(board, size=800)
with open('/tmp/test_board.svg', 'w') as f:
    f.write(svg)
print('FEN:', board.fen())
print('SVG written to /tmp/test_board.svg')
"

    # Convert SVG to PNG (try multiple methods)
    if command -v rsvg-convert &>/dev/null; then
        rsvg-convert /tmp/test_board.svg -o /tmp/test_board.png
        log "Converted to PNG with rsvg-convert"
    elif command -v convert &>/dev/null; then
        convert /tmp/test_board.svg /tmp/test_board.png
        log "Converted to PNG with ImageMagick"
    elif python3 -c "import cairosvg" 2>/dev/null; then
        python3 -c "import cairosvg; cairosvg.svg2png(url='/tmp/test_board.svg', write_to='/tmp/test_board.png', output_width=800)"
        log "Converted to PNG with cairosvg"
    else
        log "No SVG->PNG converter found. Install one of: librsvg2-bin, imagemagick, or pip install cairosvg"
        log "Falling back to using the SVG directly (Bedrock may not accept it)."
        log "Alternatively, take a photo of a physical board and run:"
        echo "  python detect_position.py --local your_photo.jpg"
        exit 1
    fi
    echo "/tmp/test_board.png"
}

case "${1:-local}" in
    # ------------------------------------------------------------------
    # Test with a local image file
    # ------------------------------------------------------------------
    local)
        if [ -n "${2:-}" ]; then
            IMAGE_PATH="$2"
        else
            IMAGE_PATH=$(generate_test_image)
        fi

        log "Testing local mode with: $IMAGE_PATH"
        python3 detect_position.py --local "$IMAGE_PATH"
        ;;

    # ------------------------------------------------------------------
    # Test via S3 + local script
    # ------------------------------------------------------------------
    s3)
        if [ -n "${2:-}" ]; then
            IMAGE_PATH="$2"
        else
            IMAGE_PATH=$(generate_test_image)
        fi

        KEY="test/board_$(date +%s).png"
        log "Uploading $IMAGE_PATH to s3://$BUCKET/$KEY"
        aws s3 cp "$IMAGE_PATH" "s3://$BUCKET/$KEY"

        log "Detecting position from S3..."
        python3 detect_position.py --bucket "$BUCKET" --key "$KEY"
        ;;

    # ------------------------------------------------------------------
    # Test via Lambda invocation
    # ------------------------------------------------------------------
    lambda)
        if [ -n "${2:-}" ]; then
            IMAGE_PATH="$2"
        else
            IMAGE_PATH=$(generate_test_image)
        fi

        KEY="test/board_$(date +%s).png"
        log "Uploading $IMAGE_PATH to s3://$BUCKET/$KEY"
        aws s3 cp "$IMAGE_PATH" "s3://$BUCKET/$KEY"

        log "Invoking Lambda function..."
        aws lambda invoke \
            --function-name "$FUNCTION_NAME" \
            --payload "{\"bucket\": \"$BUCKET\", \"key\": \"$KEY\"}" \
            --cli-binary-format raw-in-base64-out \
            /tmp/lambda_response.json

        log "Lambda response:"
        python3 -m json.tool /tmp/lambda_response.json
        ;;

    *)
        echo "Usage: $0 [local|s3|lambda] [image_path]"
        exit 1
        ;;
esac
