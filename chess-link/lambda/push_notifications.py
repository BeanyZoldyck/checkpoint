"""
Checkpoint Push Notification Service
Handles sending push notifications via Expo Push Notification service
"""

import json
import requests
import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


class ExpoNotificationService:
    """Service for sending push notifications via Expo Push Notification API"""

    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Checkpoint-Chess/1.0",
            }
        )

    def send_notification(
        self,
        expo_token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        sound: str = "default",
        priority: str = "high",
    ) -> bool:
        """
        Send a push notification to a single Expo token

        Args:
            expo_token: The Expo push token
            title: Notification title
            body: Notification body
            data: Additional data to send with notification
            sound: Sound to play ('default', 'success', etc.)
            priority: Priority level ('default', 'normal', 'high')

        Returns:
            bool: True if notification was sent successfully
        """

        if not expo_token or not expo_token.startswith("ExponentPushToken["):
            logger.warning(f"Invalid Expo push token: {expo_token}")
            return False

        notification = {
            "to": expo_token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": sound,
            "priority": priority,
            "channelId": "chess-moves"
            if data and data.get("type") == "move"
            else "game-updates",
        }

        try:
            response = self.session.post(
                self.EXPO_PUSH_URL, json=notification, timeout=10
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("data", {}).get("status") == "ok":
                    logger.info(
                        f"Notification sent successfully to {expo_token[:20]}..."
                    )
                    return True
                else:
                    error = result.get("data", {}).get("details", "Unknown error")
                    logger.error(f"Expo API error: {error}")
                    return False
            else:
                logger.error(f"HTTP error {response.status_code}: {response.text}")
                return False

        except Exception as e:
            logger.error(f"Error sending notification: {str(e)}")
            return False

    def send_batch_notifications(
        self, notifications: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Send multiple notifications in a single batch request

        Args:
            notifications: List of notification objects

        Returns:
            Dict with success/failure counts and details
        """

        if not notifications:
            return {"success": 0, "failed": 0, "details": []}

        try:
            response = self.session.post(
                self.EXPO_PUSH_URL, json=notifications, timeout=15
            )

            if response.status_code == 200:
                results = response.json()
                success_count = sum(
                    1 for r in results.get("data", []) if r.get("status") == "ok"
                )
                failed_count = len(notifications) - success_count

                logger.info(
                    f"Batch notification result: {success_count} success, {failed_count} failed"
                )

                return {
                    "success": success_count,
                    "failed": failed_count,
                    "details": results.get("data", []),
                }
            else:
                logger.error(
                    f"Batch notification HTTP error {response.status_code}: {response.text}"
                )
                return {"success": 0, "failed": len(notifications), "details": []}

        except Exception as e:
            logger.error(f"Error sending batch notifications: {str(e)}")
            return {"success": 0, "failed": len(notifications), "details": []}


# Global instance
expo_service = ExpoNotificationService()


# Note: Move notifications removed - moves are now shown directly on camera overlay
# This function kept for backward compatibility but should not be used
def send_move_notification(
    expo_token: str, opponent_name: str, move: str, game_id: str
) -> bool:
    """
    DEPRECATED: Move notifications are now shown on camera overlay instead
    This function is kept for backward compatibility but should not be used
    """

    logger.warning(
        "send_move_notification called but move notifications are disabled - use camera overlay instead"
    )
    return True  # Return success without sending notification


def send_game_start_notification(
    expo_token: str, opponent_name: str, game_id: str
) -> bool:
    """
    Send a notification when a game starts
    """

    title = "Game Started!"
    body = f"Your match against {opponent_name} has begun. Good luck!"

    data = {
        "type": "game_start",
        "gameId": game_id,
        "timestamp": datetime.utcnow().isoformat(),
    }

    return expo_service.send_notification(
        expo_token=expo_token,
        title=title,
        body=body,
        data=data,
        sound="success",
        priority="normal",
    )


def send_game_end_notification(expo_token: str, result: str, game_id: str) -> bool:
    """
    Send a notification when a game ends

    Args:
        result: "win", "loss", or "draw"
    """

    if result == "win":
        title = "Victory!"
        body = "Congratulations! You won the game!"
        sound = "success"
    elif result == "loss":
        title = "Game Over"
        body = "Your opponent won this time. Better luck next game!"
        sound = "default"
    else:  # draw
        title = "Draw"
        body = "The game ended in a draw. Well played!"
        sound = "default"

    data = {
        "type": "game_end",
        "gameId": game_id,
        "result": result,
        "timestamp": datetime.utcnow().isoformat(),
    }

    return expo_service.send_notification(
        expo_token=expo_token,
        title=title,
        body=body,
        data=data,
        sound=sound,
        priority="normal",
    )


def lambda_handler(event, context):
    """
    Lambda handler for sending push notifications
    Can be triggered by SQS, direct invocation, or API Gateway
    """

    try:
        # Handle different event sources
        if "Records" in event:
            # SQS trigger
            for record in event["Records"]:
                if record.get("eventSource") == "aws:sqs":
                    message = json.loads(record["body"])
                    process_notification_message(message)
        else:
            # Direct invocation
            process_notification_message(event)

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Notifications processed successfully"}),
        }

    except Exception as e:
        logger.error(f"Error in push notification handler: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def process_notification_message(message: Dict[str, Any]) -> None:
    """
    Process a single notification message
    """

    notification_type = message.get("type")
    expo_token = message.get("expo_token")
    game_id = message.get("game_id")

    if not expo_token:
        logger.warning("No expo_token provided in notification message")
        return

    if not game_id:
        logger.warning("No game_id provided in notification message")
        return

    if notification_type == "move":
        # Move notifications are now handled by camera overlay - skip sending push notification
        logger.info("Move notification skipped - using camera overlay instead")
        return
    elif notification_type == "game_start":
        send_game_start_notification(
            expo_token=expo_token,
            opponent_name=message.get("opponent_name", "Opponent"),
            game_id=game_id,
        )
    elif notification_type == "game_end":
        send_game_end_notification(
            expo_token=expo_token, result=message.get("result", "draw"), game_id=game_id
        )
    else:
        logger.warning(f"Unknown notification type: {notification_type}")
