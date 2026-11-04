"""WebSocket $connect Lambda Handler."""

from typing import Any

from aws_lambda_powertools import Logger

from core.broadcast.gateway import broadcast_to_room, send_to_connection
from core.errors import RoomFullError
from core.models.common import Role
from core.models.websocket import (
    MsgParticipantJoined,
    MsgParticipantUpdated,
    MsgSessionEnded,
    ParticipantJoinedPayload,
    ParticipantUpdatedPayload,
    SessionEndedPayload,
)
from core.repository.base import current_epoch_ms
from core.repository.connection_repo import ConnectionRepository
from core.repository.room_repo import RoomRepository

logger = Logger(service="ws-connect")
conn_repo = ConnectionRepository()
room_repo = RoomRepository()


def get_apigw_endpoint(event: dict[str, Any]) -> str:
    domain = event["requestContext"]["domainName"]
    stage = event["requestContext"]["stage"]
    return f"https://{domain}/{stage}"


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    req_context = event["requestContext"]
    connection_id = req_context["connectionId"]
    authorizer = req_context.get("authorizer", {})

    room_id = authorizer.get("roomId")
    participant_id = authorizer.get("participantId")

    if not room_id or not participant_id:
        return {"statusCode": 403, "body": "Forbidden"}

    try:
        status, old_conn_id, role = conn_repo.handle_connect(
            connection_id=connection_id,
            room_id=room_id,
            participant_id=participant_id,
        )
    except RoomFullError:
        return {"statusCode": 403, "body": "Room is full"}

    endpoint_url = get_apigw_endpoint(event)
    now_ms = current_epoch_ms()

    # Case 1: Replaced previous connection
    if status == "replaced" and old_conn_id:
        send_to_connection(
            endpoint_url=endpoint_url,
            connection_id=old_conn_id,
            message=MsgSessionEnded(
                sent_at_ms=now_ms,
                payload=SessionEndedPayload(reason="replaced"),
            ),
        )
        return {"statusCode": 200, "body": "Connected"}

    # Case 2: Fresh join
    participant = room_repo.get_participant(room_id, participant_id)
    if role == Role.HOST:
        # Host reconnected -> participant.updated with connected=True
        broadcast_to_room(
            endpoint_url=endpoint_url,
            room_id=room_id,
            message=MsgParticipantUpdated(
                sent_at_ms=now_ms,
                payload=ParticipantUpdatedPayload(participant=participant),
            ),
            exclude_connection_id=connection_id,
        )
    else:
        # Guest joined -> participant.joined
        broadcast_to_room(
            endpoint_url=endpoint_url,
            room_id=room_id,
            message=MsgParticipantJoined(
                sent_at_ms=now_ms,
                payload=ParticipantJoinedPayload(participant=participant),
            ),
            exclude_connection_id=connection_id,
        )

    return {"statusCode": 200, "body": "Connected"}
