# Product Requirements Document: Checkpoint
### Open-Source DGT Board Alternative via Computer Vision

**Version:** 1.0 (MVP)
**Date:** 2026-03-14

---

## 1. Overview

ChessLink is a free, open-source alternative to expensive DGT electronic chessboards ($400-$800+). It enables two players to play chess remotely: one player uses a **physical chessboard** with a phone camera capturing moves, and the other plays on a **web-based digital board**. Computer vision running on AWS translates physical board moves into digital moves in real time.

---

## 2. Problem Statement

DGT boards and similar electronic chess boards are prohibitively expensive for casual players, clubs, and players in developing regions. There is no affordable way to bridge the gap between physical and digital chess play. ChessLink solves this by replacing expensive sensor hardware with a smartphone camera and cloud-based computer vision.

---

## 3. Target Users

| User Type | Description |
|-----------|-------------|
| **Physical Board Player** | Prefers playing on a real board; owns a standard chess set and a smartphone |
| **Digital Player** | Plays remotely on a laptop/desktop browser; interacts with a web-based chess UI |

---

## 4. Core User Flow

```
Physical Player                        Cloud (AWS)                     Digital Player
+-----------------+                +------------------+            +------------------+
| Phone camera    | -- images ---> | Vision Model     |            |                  |
| pointed at      |                | (move detection) |-- move --> | Web chess board   |
| physical board  |                |                  |            | updates           |
+-----------------+                +------------------+            +------------------+
                                                                          |
| Secondary screen| <--------- opponent move notification --------------- |
| (phone/tablet)  |                                                       |
| shows opponent  |                                                       |
| move; player    | -- physically moves piece on board -->                |
| updates board   |                (camera detects it)                    |
+-----------------+                                                       |
```

### Step-by-step:

1. **Physical player** opens a companion web page on their phone, which accesses the camera and points it at the board.
2. The phone streams images to AWS at regular intervals.
3. AWS vision model detects the board state and identifies when a move has been made.
4. The move is validated (basic legality check) and transmitted to the digital player's web client.
5. The digital player sees the move rendered on their browser-based chessboard.
6. The digital player makes their move by clicking/dragging on the web board.
7. The move is sent back and displayed on the physical player's phone screen (overlaid or shown alongside the camera feed) so they can manually update their physical board.
8. Loop from step 2.

---

## 5. System Architecture

### 5.1 High-Level Components

| Component | Technology | Description |
|-----------|------------|-------------|
| **Phone Camera Client** | Web app (PWA) | Captures images from phone camera via browser API, sends to backend |
| **Digital Chess Client** | Web app (React) | Interactive chessboard UI for the remote digital player |
| **Image Ingestion API** | AWS API Gateway + Lambda | Receives board images from the phone client |
| **Board Vision Model** | AWS SageMaker or Rekognition Custom Labels | Detects board state from images, identifies pieces and positions |
| **Move Detection Service** | AWS Lambda | Compares consecutive board states to determine what move was made |
| **Game State Service** | AWS Lambda + DynamoDB | Manages game sessions, current board state, turn tracking |
| **Move Validation** | AWS Lambda | Basic chess legality checks (piece movement rules, turn order) |
| **Real-time Communication** | AWS AppSync (WebSocket) or API Gateway WebSocket | Pushes moves to both clients in real time |

### 5.2 Architecture Diagram

```
Phone (Camera)                          AWS                              Browser (Digital Player)
+-------------+     HTTPS/WS      +-----------+                        +-------------------+
|  Camera PWA | ---- images -----> | API GW    |                        |  React Chess UI   |
|  (captures  |                    |   +       |                        |  (chessboard.js   |
|   frames)   |                    | Lambda    |                        |   or similar)     |
|             | <--- opponent --   | Ingest    |                        |                   |
|  Shows opp. |     move notif     +-----+-----+                        +--------+----------+
|  move on    |                          |                                       |
|  screen     |                    +-----v-----+                                 |
+-------------+                    | SageMaker  |                                |
                                   | Vision     |                                |
                                   | Model      |                                |
                                   +-----+------+                                |
                                         |                                       |
                                   +-----v------+      +-------------+           |
                                   | Move Detect |----->| DynamoDB    |           |
                                   | Lambda      |      | Game State  |           |
                                   +-----+-------+      +------+------+           |
                                         |                      |                 |
                                   +-----v-------+             |                 |
                                   | Validation   |             |                 |
                                   | Lambda        |             |                 |
                                   +-----+---------+             |                 |
                                         |                      |                 |
                                   +-----v----------+           |                 |
                                   | AppSync / WS   | <---------+                 |
                                   | (bidirectional) | ---- move pushed ---------> |
                                   +-----------------+ <--- digital move --------- |
```

---

## 6. Component Specifications

### 6.1 Phone Camera Client (Companion Web App)

**Purpose:** Capture board images and display opponent's moves.

**Requirements:**
- Browser-based (no app store install needed); works on mobile Safari and Chrome.
- Uses `getUserMedia` API to access the rear camera.
- **Capture mode:** Takes a photo every **2-3 seconds** (configurable). Periodic snapshots are more efficient than continuous streaming for this use case since chess moves are discrete and infrequent.
- Sends each image frame (JPEG, compressed to ~100-200KB) to the ingestion API via HTTPS POST.
- Displays the opponent's last move prominently on screen (e.g., "Opponent played: Nf3") with a simple board diagram.
- Shows connection status and game state (whose turn it is).
- Includes a one-time **calibration step**: user positions the camera and taps corners of the board to establish perspective transform bounds.

**AWS Services:**
- Hosted on **S3 + CloudFront** (static web hosting).

### 6.2 Board Vision Model

**Purpose:** Detect the full board state (which piece is on which square) from a single image.

**Approach — Two-stage pipeline:**

#### Stage 1: Board Detection & Perspective Correction
- Detect the chessboard quadrilateral in the image.
- Apply perspective transform to produce a normalized top-down 8x8 grid image.
- Use classical CV (OpenCV via Lambda Layer) or a lightweight object detection model.

#### Stage 2: Piece Classification
- For each of the 64 squares, classify what piece (if any) occupies it.
- **13-class classification:** empty, white pawn, white rook, white knight, white bishop, white queen, white king, black pawn, black rook, black knight, black bishop, black queen, black king.
- Run inference on each square's cropped image (or a single pass with a grid-aware model).

**AWS Services:**
- **SageMaker Endpoint** (real-time inference) with a custom model (PyTorch/TensorFlow).
- Alternative: **AWS Lambda** with a lightweight ONNX model if latency and cost allow.
- Model stored in **S3**.

**Training Data:**
- Synthetic dataset: render 3D chessboard images with varying piece sets, lighting, angles.
- Real dataset: manually labeled photos of physical boards (community-contributed).
- Data augmentation: rotation, brightness, color jitter, different board/piece styles.

**Performance Targets:**
- Accuracy: >95% per-square classification on standard chess sets.
- Latency: <2 seconds end-to-end (image upload to move detection).

### 6.3 Move Detection Service

**Purpose:** Compare the previous board state to the newly detected state and determine the move.

**Logic:**
1. Receive new board state (64-square array) from vision model.
2. Diff against the stored previous board state in DynamoDB.
3. Determine the move:
   - **Normal move:** One square emptied, one square filled (or piece changed).
   - **Capture:** One square emptied, one square's piece changed.
   - **Castling:** King and rook both move simultaneously.
   - **En passant:** Captured pawn's square empties without being the destination.
   - **Promotion:** Pawn reaches 8th rank, new piece appears.
4. Handle **no change detected** (player hasn't moved yet) — no action, wait for next frame.
5. Handle **ambiguous/error states** — multiple squares changed unexpectedly. Trigger a re-capture or flag to the user.

**AWS Services:** Lambda function triggered by the vision model output.

### 6.4 Move Validation

**Purpose:** Basic chess rule enforcement.

**Validates:**
- The moved piece can legally reach the destination square (movement patterns).
- It is the correct player's turn.
- The move does not leave the player's own king in check (if feasible at MVP).
- Detects check, checkmate, and stalemate conditions.

**Does NOT enforce (MVP):**
- Advanced clock/time rules.
- Draw by repetition or 50-move rule.

**Implementation:** Use an existing chess logic library (e.g., `chess.js` ported to Python, or `python-chess`) running in Lambda.

**AWS Services:** Lambda function.

### 6.5 Game State Service

**Purpose:** Manage game sessions, board state, and player connections.

**Data Model (DynamoDB):**

```
GameSession {
  gameId: string (partition key)
  createdAt: ISO timestamp
  status: "waiting" | "active" | "completed"
  physicalPlayerId: string
  digitalPlayerId: string
  currentFEN: string  // standard chess notation for board state
  moveHistory: [string]  // list of moves in algebraic notation
  currentTurn: "white" | "black"
  physicalPlayerColor: "white" | "black"
  lastBoardImage: S3 key  // most recent captured image for debugging
}
```

**Game Session Flow:**
1. Physical player creates a game, gets a **6-character join code**.
2. Digital player enters the join code on the web client.
3. Both players are connected via WebSocket.
4. Game proceeds with alternating turns.

**AWS Services:** DynamoDB, Lambda.

### 6.6 Real-time Communication Layer

**Purpose:** Push moves bidirectionally between both clients with low latency.

**Requirements:**
- Sub-second delivery after a move is validated.
- Handle reconnection gracefully (player's phone loses signal briefly).
- Notify both clients of: moves, game state changes, errors, opponent disconnection.

**AWS Services:**
- **API Gateway WebSocket API** — simpler and cheaper for this use case than AppSync.
- Lambda functions for `$connect`, `$disconnect`, and `sendMove` routes.
- **DynamoDB** connection table to track active WebSocket connections per game.

### 6.7 Digital Chess Client (Web App)

**Purpose:** Full chess playing interface for the remote/digital player.

**Requirements:**
- Interactive chessboard: click or drag-and-drop to make moves.
- Displays board from the digital player's perspective (their color at bottom).
- Shows move indicator when it's their turn.
- Shows opponent's last move highlighted on the board.
- Displays basic game info: move list (algebraic notation), whose turn.
- Game join screen: enter a 6-character code to join.
- Responsive: works on desktop and tablet browsers.

**Technology:**
- React (or vanilla JS) with a chessboard rendering library (e.g., `chessboardjsx`, `cm-chessboard`, or custom canvas).
- WebSocket connection to API Gateway for real-time move exchange.
- Chess logic via `chess.js` for client-side validation/state.

**AWS Services:**
- Hosted on **S3 + CloudFront**.

---

## 7. Image Capture: Snapshots vs. Streaming

| Approach | Pros | Cons |
|----------|------|------|
| **Periodic snapshots (chosen)** | Lower bandwidth, simpler pipeline, cheaper (less data processed) | Slight delay in move detection (up to capture interval) |
| Continuous video stream | Faster move detection | Higher bandwidth, complex (Kinesis Video Streams), expensive |

**Decision:** Periodic snapshots every **2-3 seconds**. Chess is a slow game; a 2-3 second detection delay is imperceptible. Snapshots also simplify the AWS pipeline (simple HTTPS POST vs. video streaming infrastructure).

**Optimization:** After a move is detected, increase the interval to **5 seconds** (opponent is thinking). When the opponent makes their digital move and it's the physical player's turn again, decrease back to **2 seconds**.

---

## 8. API Design

### 8.1 REST Endpoints (API Gateway)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/game/create` | Physical player creates a new game session |
| POST | `/game/join` | Digital player joins with a game code |
| POST | `/game/image` | Phone client uploads a board image |
| GET | `/game/{gameId}/state` | Get current game state |

### 8.2 WebSocket Messages

| Direction | Event | Payload |
|-----------|-------|---------|
| Server -> Both | `move` | `{ from, to, piece, san, fen }` |
| Server -> Both | `gameState` | `{ status, currentTurn, fen }` |
| Server -> Both | `error` | `{ code, message }` |
| Client -> Server | `digitalMove` | `{ from, to, promotion? }` |
| Server -> Physical | `opponentMove` | `{ san, description }` |

---

## 9. Infrastructure & Deployment

### 9.1 AWS Services Summary

| Service | Purpose | Est. Cost/mo (low usage) |
|---------|---------|--------------------------|
| S3 | Static hosting, image storage, model artifacts | ~$1 |
| CloudFront | CDN for web apps | ~$1 |
| API Gateway (REST) | Image upload, game management | ~$3 |
| API Gateway (WebSocket) | Real-time move communication | ~$1 |
| Lambda | All compute (ingestion, detection, validation, game logic) | ~$5 |
| DynamoDB | Game state, connections | ~$1 (on-demand) |
| SageMaker (real-time endpoint) | Vision model inference | ~$50-100 (ml.m5.large) |
| ECR | Container registry for model | ~$1 |
| **Total estimate** | | **~$60-115/month** |

**Cost note:** SageMaker real-time endpoints are the primary cost driver. Alternatives to reduce cost:
- **SageMaker Serverless Inference** — pay per invocation, cheaper at low volume but has cold start (~5-10s).
- **Lambda with ONNX Runtime** — if the model is small enough (<250MB packaged), run inference directly in Lambda for ~$5/mo instead of $50-100.
- Start with Lambda + ONNX for MVP, graduate to SageMaker if latency or model size requires it.

### 9.2 Infrastructure as Code

- **AWS CDK (Python)** for all infrastructure definition.
- Single `cdk deploy` to provision the entire stack.

---

## 10. Board Calibration & Camera Requirements

### 10.1 Initial Calibration

When starting a game, the physical player must:
1. Position the phone above or at an angle to the board with a stable mount (tripod, phone holder, stack of books).
2. Open the companion web app; the camera feed appears.
3. The app auto-detects the board (or the user taps the four corners).
4. The app confirms calibration by overlaying a grid on the detected board.
5. The board must be in the **starting position** for the first capture (this establishes the baseline).

### 10.2 Camera Requirements

- Minimum resolution: 720p (1280x720).
- The full board must be visible in frame.
- Reasonable lighting (no extreme shadows or glare).
- Camera should be roughly stable (small vibrations OK; the perspective correction handles minor angle changes).

---

## 11. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Board bumped / pieces knocked over | Detect >4 squares changed simultaneously; pause game, ask player to fix and re-capture |
| Piece placed on wrong square | Vision detects a state inconsistent with any legal move; prompt player to correct |
| Camera obstructed (hand over board) | Detect insufficient board visibility; skip frame, wait for next capture |
| Player picks up piece but hasn't placed it | Detect a piece removed but not placed; treat as "in progress", wait for next frame |
| Phone disconnects | WebSocket disconnect detected; notify digital player "Opponent disconnected"; allow reconnection within 60s |
| Ambiguous piece detection (e.g., bishop vs queen at odd angle) | Use the known previous board state + legal move analysis to disambiguate |

---

## 12. MVP Scope & Non-Goals

### In Scope (MVP)
- One physical player (phone camera) vs. one digital player (web browser).
- Standard chess starting position.
- Basic move validation (legal piece movement, turn order).
- Real-time move relay via WebSocket.
- Single game at a time per session.
- Join via 6-character code.
- Works with standard Staunton-style chess sets (most common).

### Out of Scope (Future)
- Multiple simultaneous games / matchmaking.
- Chess clock / timed games.
- Move history review or PGN export.
- Engine analysis or Stockfish integration.
- Support for non-standard piece sets (themed, novelty).
- Mobile native apps.
- Spectator mode.
- Account system / user profiles.
- Game persistence (resume after both disconnect).

---

## 13. Development Phases

### Phase 1: Board Vision (Weeks 1-3)
- Collect/generate training data for piece classification.
- Train and evaluate the board detection + piece classification model.
- Deploy model to Lambda (ONNX) or SageMaker.
- Build and test the image pipeline: upload image -> detect board -> classify pieces -> output board state.

### Phase 2: Game Backend (Weeks 3-4)
- Set up DynamoDB tables and game session management.
- Implement move detection logic (board state diffing).
- Implement basic move validation with `python-chess`.
- Set up WebSocket API for real-time communication.
- Deploy with CDK.

### Phase 3: Phone Camera Client (Weeks 4-5)
- Build the companion PWA for camera capture.
- Implement board calibration UI.
- Implement periodic snapshot capture and upload.
- Display opponent's moves on screen.

### Phase 4: Digital Chess Client (Weeks 5-6)
- Build the React web app with interactive chessboard.
- Implement game join flow (enter code).
- Connect to WebSocket for real-time move updates.
- Handle making and displaying moves.

### Phase 5: Integration & Testing (Weeks 6-8)
- End-to-end testing with real physical boards.
- Tune vision model accuracy on diverse boards/lighting.
- Latency optimization.
- Error handling and edge case testing.
- Beta testing with real users.

---

## 14. Success Metrics

| Metric | Target |
|--------|--------|
| Board state detection accuracy | >95% per square |
| End-to-end move latency (image capture to opponent's screen) | <3 seconds |
| Game completion rate (no crashes/errors forcing restart) | >90% |
| Works with standard chess sets under normal indoor lighting | Yes |
| Total AWS cost for <100 games/month | <$50 |

---

## 15. Open Questions & Risks

| # | Item | Status |
|---|------|--------|
| 1 | What model architecture performs best for square-level piece classification? ResNet, EfficientNet, or a YOLO-based approach detecting all pieces at once? | Needs prototyping |
| 2 | Can the model run within Lambda's 10GB memory / 15min timeout, or do we need SageMaker? | Needs benchmarking |
| 3 | How well does the vision model generalize across different chess set styles (wood, plastic, marble)? | Needs testing with diverse sets |
| 4 | Is 2-3 second snapshot interval responsive enough, or do users want faster detection? | Needs user testing |
| 5 | Should we support board orientations other than white-at-bottom for the physical board? | Decision needed |

---

*This document will be updated as decisions are made and the project progresses.*
