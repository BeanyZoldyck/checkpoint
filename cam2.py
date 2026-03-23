#!/usr/bin/env python3
"""
ChessLink Camera — Monitors a physical chessboard via webcam, detects when
moves are made using motion detection, and triggers Bedrock move analysis.

Flow:
  1. On startup, captures and saves the initial board position (start image).
  2. Waits idle until significant motion is detected (a hand entering the frame).
  3. Once motion starts, waits for it to settle (no significant motion for
     SETTLE_SECONDS), then captures the new board position.
  4. Sends the before/after images to Bedrock for move detection (unless --debug).
  5. The "after" image becomes the new "before" image; loop back to step 2.

Keybinds:
    q     — quit
    s     — force-capture current frame as new baseline
    SPACE — pause/resume (releases camera while paused)
    p     — play the next move from the predetermined sequence
    k     — enter a custom move in UCI format (e.g. e7e5)

Usage:
    python cam.py                  # Full mode — captures + Bedrock analysis
    python cam.py --debug          # Debug mode — captures only, no Bedrock calls
    python cam.py --camera 1       # Use a different camera index
    python cam.py --settle 5       # Wait 5s of calm instead of default 4s
"""

import argparse
import json
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MOTION_AREA_THRESHOLD = 500  # min contour area (px^2) to count as motion
MOTION_FRAME_THRESHOLD = 15  # pixel intensity diff to count as changed
SETTLE_SECONDS = 4  # seconds of no motion before capturing
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
IMAGE_DIR = Path("captures")

# ---------------------------------------------------------------------------
# AppSync config
# ---------------------------------------------------------------------------
APPSYNC_ENDPOINT = (
    "https://wltticbi65fl5kmnpsenbj26ky.appsync-api.us-east-2.amazonaws.com/graphql"
)
APPSYNC_API_KEY = "da2-idf5umd5m5hu3cui4hyi526dee"

# ---------------------------------------------------------------------------
# Predetermined move sequence (physical player = BLACK)
# Each entry: (from_square, to_square, piece_letter)
# ---------------------------------------------------------------------------
PREDETERMINED_MOVES = [
    ("e7", "e5", "p"),  # 1... e5
    ("e8", "e7", "k"),  # 2... Ke7
]

# ---------------------------------------------------------------------------
# Bedrock integration (imported lazily so --debug works without boto3)
# ---------------------------------------------------------------------------
_detect_move = None


def _load_detect_move():
    """Lazy-import detect_move from detect_position.py."""
    global _detect_move
    if _detect_move is None:
        from detect_position import detect_move

        _detect_move = detect_move
    return _detect_move


# ---------------------------------------------------------------------------
# AppSync GraphQL helpers
# ---------------------------------------------------------------------------
def record_physical_move(
    from_sq: str, to_sq: str, piece: str = "p", fen: str = ""
) -> dict:
    """Call the recordPhysicalMove mutation on AppSync."""
    mutation = """
    mutation RecordPhysicalMove($from: String!, $to: String!, $piece: String!, $fen: String!) {
        recordPhysicalMove(from: $from, to: $to, piece: $piece, fen: $fen) {
            id gameId from to piece san fen playerColor moveNumber timestamp
        }
    }
    """
    payload = json.dumps(
        {
            "query": mutation,
            "variables": {"from": from_sq, "to": to_sq, "piece": piece, "fen": fen},
        }
    ).encode()

    req = Request(APPSYNC_ENDPOINT, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("x-api-key", APPSYNC_API_KEY)

    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())

    if "errors" in data:
        raise RuntimeError(data["errors"][0]["message"])

    return data["data"]["recordPhysicalMove"]


def _prompt_for_move() -> str | None:
    """Blocking input prompt for a custom UCI move. Runs in a thread."""
    try:
        move = input("[k] Enter move in UCI format (e.g. e7e5): ").strip()
        return move if move else None
    except EOFError:
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def save_capture(frame: np.ndarray, label: str) -> str:
    """Save a frame to disk with a timestamped filename. Returns the path."""
    IMAGE_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{label}_{timestamp}.jpg"
    path = str(IMAGE_DIR / filename)
    cv2.imwrite(path, frame)
    return path


def has_significant_motion(prev_gray: np.ndarray, curr_gray: np.ndarray) -> bool:
    """Compare two grayscale-blurred frames and return True if significant motion."""
    frame_delta = cv2.absdiff(prev_gray, curr_gray)
    _, thresh = cv2.threshold(
        frame_delta, MOTION_FRAME_THRESHOLD, 255, cv2.THRESH_BINARY
    )
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        if cv2.contourArea(contour) > MOTION_AREA_THRESHOLD:
            return True
    return False


def draw_motion_overlay(
    frame: np.ndarray, prev_gray: np.ndarray, curr_gray: np.ndarray
) -> None:
    """Draw green rectangles around motion regions (in-place)."""
    frame_delta = cv2.absdiff(prev_gray, curr_gray)
    _, thresh = cv2.threshold(
        frame_delta, MOTION_FRAME_THRESHOLD, 255, cv2.THRESH_BINARY
    )
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        if cv2.contourArea(contour) > MOTION_AREA_THRESHOLD:
            x, y, w, h = cv2.boundingRect(contour)
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------
class State:
    WAITING_FOR_START = "waiting_for_start"
    IDLE = "idle"  # no motion — waiting for a move to begin
    MOTION_DETECTED = "motion"  # motion happening — hand is over the board
    SETTLING = "settling"  # motion stopped — waiting SETTLE_SECONDS to confirm
    PAUSED = "paused"  # execution paused — spacebar to resume


def main():
    parser = argparse.ArgumentParser(description="ChessLink camera move detector")
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Debug mode: capture images but skip Bedrock analysis",
    )
    parser.add_argument(
        "--camera", type=int, default=0, help="Camera device index (default: 0)"
    )
    parser.add_argument(
        "--settle",
        type=float,
        default=SETTLE_SECONDS,
        help=f"Seconds of no motion before capturing (default: {SETTLE_SECONDS})",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without display window (for Pi without monitor)",
    )
    args = parser.parse_args()

    settle_seconds = args.settle

    # --- Init camera ---
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    if not cap.isOpened():
        print(f"ERROR: Could not open camera {args.camera}")
        return

    print(f"Camera {args.camera} opened ({FRAME_WIDTH}x{FRAME_HEIGHT})")
    if args.debug:
        print("DEBUG MODE: Bedrock analysis disabled")
    print(f"Settle time: {settle_seconds}s")
    print("Press 'q' to quit, 's' to force-capture, SPACE to pause/resume")
    print()

    # --- State ---
    state = State.WAITING_FOR_START
    prev_gray = None
    before_image_path = None  # path to the last captured "before" image
    move_number = 0
    last_motion_time = 0.0  # timestamp of last detected motion
    settle_start_time = 0.0  # when settling began
    predetermined_index = 0  # next move to play from PREDETERMINED_MOVES
    pending_custom_move = None  # holds result from 'k' input thread
    input_thread = None  # thread for blocking input prompt

    print("[*] Position your camera over the board in the starting position.")
    print(
        "[*] Press 's' to capture the starting position, or it auto-captures after 3s."
    )
    print("[*] Press 'p' to play next predetermined move, 'k' to enter a custom move")
    startup_time = time.time()

    while True:
        # --- State: paused (camera released) ---
        if state == State.PAUSED:
            if not args.headless:
                # Show a static paused frame (black with text)
                paused_frame = np.zeros((FRAME_HEIGHT, FRAME_WIDTH, 3), dtype=np.uint8)
                cv2.putText(
                    paused_frame,
                    "PAUSED - Press SPACE to resume",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 0, 255),
                    2,
                )
                cv2.putText(
                    paused_frame,
                    f"Move: {move_number}  [PAUSED]",
                    (10, FRAME_HEIGHT - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (255, 255, 255),
                    1,
                )
                cv2.imshow("ChessLink Camera", paused_frame)
                key = cv2.waitKey(50) & 0xFF
                if key == ord("q"):
                    break
                elif key == ord(" "):
                    # Reopen camera
                    cap = cv2.VideoCapture(args.camera)
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
                    if not cap.isOpened():
                        print("ERROR: Could not reopen camera")
                        break
                    # Let camera auto-expose for a moment
                    time.sleep(0.5)
                    # Read a fresh frame to seed prev_gray
                    ret, frame = cap.read()
                    if ret:
                        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        prev_gray = cv2.GaussianBlur(gray, (21, 21), 0)
                    state = State.IDLE
                    print("[*] Resumed. Watching for moves...")
            else:
                time.sleep(0.05)
            continue

        ret, frame = cap.read()
        if not ret:
            print("ERROR: Failed to read frame")
            break

        # Preprocess
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_blurred = cv2.GaussianBlur(gray, (21, 21), 0)

        # --- State: waiting for initial capture ---
        if state == State.WAITING_FOR_START:
            # Draw status
            if not args.headless:
                cv2.putText(
                    frame,
                    "Press 's' to capture start position",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 255),
                    2,
                )

            # Auto-capture after 3 seconds to let camera auto-expose
            key = cv2.waitKey(1) & 0xFF if not args.headless else 0xFF
            if key == ord("s") or (time.time() - startup_time > 3.0):
                before_image_path = save_capture(frame, "start")
                print(f"[+] Starting position captured: {before_image_path}")
                state = State.IDLE
                prev_gray = gray_blurred
                print("[*] Watching for moves...")

        # --- State: idle (waiting for motion) ---
        elif state == State.IDLE:
            if prev_gray is not None and has_significant_motion(
                prev_gray, gray_blurred
            ):
                state = State.MOTION_DETECTED
                last_motion_time = time.time()
                print(f"[~] Motion detected — move in progress...")

            if not args.headless:
                cv2.putText(
                    frame,
                    "IDLE - Waiting for move",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2,
                )

        # --- State: motion detected (hand is over the board) ---
        elif state == State.MOTION_DETECTED:
            if prev_gray is not None:
                if has_significant_motion(prev_gray, gray_blurred):
                    last_motion_time = time.time()
                else:
                    # Motion stopped — start settling timer
                    state = State.SETTLING
                    settle_start_time = time.time()

            if not args.headless and prev_gray is not None:
                draw_motion_overlay(frame, prev_gray, gray_blurred)
                cv2.putText(
                    frame,
                    "MOTION - Move in progress",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 0, 255),
                    2,
                )

        # --- State: settling (motion stopped, waiting to confirm) ---
        elif state == State.SETTLING:
            if prev_gray is not None and has_significant_motion(
                prev_gray, gray_blurred
            ):
                # Motion resumed — back to motion state
                state = State.MOTION_DETECTED
                last_motion_time = time.time()
            else:
                elapsed = time.time() - settle_start_time
                remaining = settle_seconds - elapsed

                if not args.headless:
                    cv2.putText(
                        frame,
                        f"SETTLING - {remaining:.1f}s remaining",
                        (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 165, 255),
                        2,
                    )

                if elapsed >= settle_seconds:
                    # Settled — capture the new position
                    move_number += 1
                    after_image_path = save_capture(frame, f"move_{move_number:03d}")
                    print(f"[+] Move {move_number} captured: {after_image_path}")

                    # --- Detect the move ---
                    if args.debug:
                        print(
                            f"[DEBUG] Checking what move was made "
                            f"(before={before_image_path}, after={after_image_path})"
                        )
                    else:
                        try:
                            print(f"[*] Analyzing move with Bedrock...")
                            detect_fn = _load_detect_move()
                            result = detect_fn(
                                before_local=before_image_path,
                                after_local=after_image_path,
                            )
                            move_san = result.get("move_san", "?")
                            move_uci = result.get("move_uci", "?")
                            confidence = result.get("confidence", "?")
                            before_fen = result.get("before_fen", "?")
                            after_fen = result.get("after_fen", "?")
                            print(
                                f"[+] Move detected: {move_san} ({move_uci}) "
                                f"[confidence: {confidence}]"
                            )
                            print(f"    FEN: {after_fen}")
                        except Exception as e:
                            print(f"[!] Bedrock analysis failed: {e}")

                    # Rotate: after becomes the new before
                    before_image_path = after_image_path
                    state = State.IDLE
                    print("[*] Watching for next move...")

        # Update previous frame
        prev_gray = gray_blurred

        # --- Display ---
        if not args.headless:
            # Show move count
            cv2.putText(
                frame,
                f"Move: {move_number}",
                (10, FRAME_HEIGHT - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
            )
            cv2.imshow("ChessLink Camera", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord(" "):
                if state != State.WAITING_FOR_START:
                    # Release camera so the webcam light turns off
                    cap.release()
                    state = State.PAUSED
                    print("[*] Paused (camera off). Press SPACE to resume.")
            elif key == ord("s") and state not in (
                State.WAITING_FOR_START,
                State.PAUSED,
            ):
                # Manual re-capture of current position
                before_image_path = save_capture(frame, "manual")
                print(f"[+] Manual capture: {before_image_path}")

            # --- 'p' — play next predetermined move ---
            elif key == ord("p"):
                if predetermined_index < len(PREDETERMINED_MOVES):
                    from_sq, to_sq, piece = PREDETERMINED_MOVES[predetermined_index]
                    print(
                        f"[p] Playing predetermined move "
                        f"{predetermined_index + 1}/{len(PREDETERMINED_MOVES)}: "
                        f"{from_sq}{to_sq} ({piece})"
                    )
                    try:
                        result = record_physical_move(from_sq, to_sq, piece)
                        san = result.get("san", "?")
                        fen = result.get("fen", "?")
                        mn = result.get("moveNumber", "?")
                        print(f"[+] Recorded: {san} (move #{mn})")
                        print(f"    FEN: {fen}")
                        predetermined_index += 1
                        move_number += 1
                    except Exception as e:
                        print(f"[!] Failed to record move: {e}")
                else:
                    print(
                        f"[p] No more predetermined moves "
                        f"({len(PREDETERMINED_MOVES)} exhausted). "
                        f"Use 'k' to enter a custom move."
                    )

            # --- 'k' — enter a custom move via terminal ---
            elif key == ord("k"):
                if input_thread is None or not input_thread.is_alive():
                    print("[k] Switch to terminal and enter your move...")

                    def _do_custom_move():
                        nonlocal pending_custom_move
                        pending_custom_move = _prompt_for_move()

                    input_thread = threading.Thread(target=_do_custom_move, daemon=True)
                    input_thread.start()
                else:
                    print("[k] Already waiting for input in terminal...")

        else:
            # Headless: small delay to avoid CPU spin
            time.sleep(0.03)

        # --- Check if custom move input arrived from the thread ---
        if pending_custom_move is not None:
            uci = pending_custom_move
            pending_custom_move = None
            if len(uci) >= 4:
                from_sq = uci[:2]
                to_sq = uci[2:4]
                # Guess piece letter from the square name (best-effort)
                piece = "p"
                print(f"[k] Sending custom move: {from_sq} -> {to_sq}")
                try:
                    result = record_physical_move(from_sq, to_sq, piece)
                    san = result.get("san", "?")
                    fen = result.get("fen", "?")
                    mn = result.get("moveNumber", "?")
                    print(f"[+] Recorded: {san} (move #{mn})")
                    print(f"    FEN: {fen}")
                    move_number += 1
                except Exception as e:
                    print(f"[!] Failed to record custom move: {e}")
            else:
                print(f"[k] Invalid move format: '{uci}' (expected e.g. e7e5)")

    # Cleanup
    cap.release()
    if not args.headless:
        cv2.destroyAllWindows()
    print(f"\nSession ended. {move_number} moves captured.")
    print(f"Images saved to: {IMAGE_DIR.resolve()}")


if __name__ == "__main__":
    main()
