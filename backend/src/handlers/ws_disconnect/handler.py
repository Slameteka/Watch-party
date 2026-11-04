"""WebSocket $disconnect Lambda Handler."""

from typing import Any

from aws_lambda_powertools import Logger

from core.broadcast.gateway import broadcast_to_room
from core.models.websocket import (
    MsgParticipantLeft,
    MsgParticipantUpdated,
    ParticipantLeftPayload,
    ParticipantUpdatedPayload,
)
from core.repository.base import current_epoch_ms
from core.repository.connection_repo import ConnectionRepository
from core.repository.room_repo import RoomRepository

logger = Logger(service="ws-disconnect")
conn_repo = ConnectionRepository()
room_repo = RoomRepository()


def get_apigw_endpoint(event: dict[str, Any]) -> str:
    domain = event["requestContext"]["domainName"]
    stage = event["requestContext"]["stage"]
    return f"https://{domain}/{stage}"


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    connection_id = event["requestContext"]["connectionId"]

    should_broadcast, room_id, participant_id, is_host = conn_repo.handle_disconnect(connection_id)

    if not should_broadcast or not room_id or not participant_id:
        return {"statusCode": 200, "body": "Disconnected"}

    endpoint_url = get_apigw_endpoint(event)
    now_ms = current_epoch_ms()

    if is_host:
        # Host disconnected -> participant.updated with connected=False (offline, PRD BR-7)
        try:
            host_participant = room_repo.get_participant(room_id, participant_id)
            broadcast_to_room(
                endpoint_url=endpoint_url,
                room_id=room_id,
                message=MsgParticipantUpdated(
                    sent_at_ms=now_ms,
                    payload=ParticipantUpdatedPayload(participant=host_participant),
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to fetch host participant on disconnect: {e}")
    else:
        # Guest disconnected -> participant.left
        broadcast_to_room(
            endpoint_url=endpoint_url,
            room_id=room_id,
            message=MsgParticipantLeft(
                sent_at_ms=now_ms,
                payload=ParticipantLeftPayload(
                    participant_id=participant_id,
                    reason="disconnected",
                ),
            ),
        )

    return {"statusCode": 200, "body": "Disconnected"}
