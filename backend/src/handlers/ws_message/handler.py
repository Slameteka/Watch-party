"""WebSocket $default Message Router Lambda Handler."""

import json
from typing import Any

from aws_lambda_powertools import Logger
from pydantic import TypeAdapter
from pydantic import ValidationError as PydanticValidationError

from core.broadcast.gateway import broadcast_to_room, send_to_connection
from core.errors import VersionConflictError, WatchPartyError
from core.models.common import ErrorCode, Role
from core.models.websocket import (
    ChatMessagePayload,
    ClientMessage,
    ClockPongPayload,
    ErrorPayload,
    MsgChatMessage,
    MsgClockPong,
    MsgError,
    MsgPlaybackState,
    MsgReactionAdded,
    MsgRoomSnapshot,
    MsgSessionEnded,
    PlaybackStatePayload,
    ReactionAddedPayload,
    RoomSnapshotPayload,
    SessionEndedPayload,
)
from core.repository.base import current_epoch_ms
from core.repository.connection_repo import ConnectionRepository
from core.repository.playback_repo import PlaybackRepository
from core.repository.room_repo import RoomRepository

logger = Logger(service="ws-message")
conn_repo = ConnectionRepository()
room_repo = RoomRepository()
playback_repo = PlaybackRepository()
client_msg_adapter = TypeAdapter(ClientMessage)


def get_apigw_endpoint(event: dict[str, Any]) -> str:
    domain = event["requestContext"]["domainName"]
    stage = event["requestContext"]["stage"]
    return f"https://{domain}/{stage}"


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    req_context = event["requestContext"]
    connection_id = req_context["connectionId"]
    endpoint_url = get_apigw_endpoint(event)
    now_ms = current_epoch_ms()

    # 1. Fetch connection session
    conn = conn_repo.get_connection(connection_id)
    if not conn:
        logger.warning(f"Connection '{connection_id}' not found in active connections table.")
        return {"statusCode": 403, "body": "Forbidden"}

    room_id = conn["roomId"]
    participant_id = conn["participantId"]
    room_expires_at_ms = int(conn.get("roomExpiresAtMs", 0))

    # 2. Check room expiration (AP-15)
    if room_expires_at_ms > 0 and now_ms >= room_expires_at_ms:
        send_to_connection(
            endpoint_url=endpoint_url,
            connection_id=connection_id,
            message=MsgSessionEnded(
                sent_at_ms=now_ms,
                payload=SessionEndedPayload(reason="expired"),
            ),
        )
        return {"statusCode": 200, "body": "Room expired"}

    # 3. Parse and validate message JSON
    body_str = event.get("body", "{}")
    request_id = None
    try:
        raw_json = json.loads(body_str) if isinstance(body_str, str) else body_str
        request_id = raw_json.get("requestId")
        msg = client_msg_adapter.validate_python(raw_json)
    except PydanticValidationError as e:
        first_err = e.errors()[0] if e.errors() else {}
        field = str(first_err.get("loc", ["unknown"])[-1])
        send_to_connection(
            endpoint_url=endpoint_url,
            connection_id=connection_id,
            message=MsgError(
                request_id=request_id,
                sent_at_ms=now_ms,
                payload=ErrorPayload(
                    code=ErrorCode.VALIDATION_ERROR,
                    message=f"Invalid message format for field '{field}'.",
                    details={"field": field},
                ),
            ),
        )
        return {"statusCode": 200}
    except Exception:
        send_to_connection(
            endpoint_url=endpoint_url,
            connection_id=connection_id,
            message=MsgError(
                request_id=request_id,
                sent_at_ms=now_ms,
                payload=ErrorPayload(
                    code=ErrorCode.VALIDATION_ERROR,
                    message="Malformed JSON payload.",
                ),
            ),
        )
        return {"statusCode": 200}

    # 4. Dispatch message based on type
    try:
        msg_type = msg.type

        if msg_type == "session.resume":
            snapshot_dict = room_repo.get_room_snapshot(room_id, participant_id)
            send_to_connection(
                endpoint_url=endpoint_url,
                connection_id=connection_id,
                message=MsgRoomSnapshot(
                    request_id=msg.request_id,
                    sent_at_ms=now_ms,
                    payload=RoomSnapshotPayload.model_validate(snapshot_dict),
                ),
            )

        elif msg_type == "clock.ping":
            send_to_connection(
                endpoint_url=endpoint_url,
                connection_id=connection_id,
                message=MsgClockPong(
                    request_id=msg.request_id,
                    sent_at_ms=now_ms,
                    payload=ClockPongPayload(
                        client_send_ms=msg.payload.client_send_ms,
                        server_time_ms=now_ms,
                    ),
                ),
            )

        elif msg_type == "playback.command":
            # Check permissions (must be host or controller)
            caller = room_repo.get_participant(room_id, participant_id)
            if caller.role == Role.VIEWER:
                send_to_connection(
                    endpoint_url=endpoint_url,
                    connection_id=connection_id,
                    message=MsgError(
                        request_id=msg.request_id,
                        sent_at_ms=now_ms,
                        payload=ErrorPayload(
                            code=ErrorCode.FORBIDDEN,
                            message="Viewer role cannot control playback.",
                            details={"requiredRole": Role.CONTROLLER.value},
                        ),
                    ),
                )
                return {"statusCode": 200}

            try:
                new_state = playback_repo.update_playback_state(
                    room_id=room_id,
                    action=msg.payload.action,
                    position_sec=msg.payload.position_sec,
                    base_version=msg.payload.base_version,
                )
                broadcast_to_room(
                    endpoint_url=endpoint_url,
                    room_id=room_id,
                    message=MsgPlaybackState(
                        request_id=msg.request_id,
                        sent_at_ms=now_ms,
                        payload=PlaybackStatePayload(
                            state=new_state,
                            action=msg.payload.action,
                            caused_by=participant_id,
                        ),
                    ),
                )
            except VersionConflictError as e:
                current_state = playback_repo.get_playback_state(room_id)
                send_to_connection(
                    endpoint_url=endpoint_url,
                    connection_id=connection_id,
                    message=MsgError(
                        request_id=msg.request_id,
                        sent_at_ms=now_ms,
                        payload=ErrorPayload(
                            code=ErrorCode.VERSION_CONFLICT,
                            message=str(e),
                            details={"currentState": current_state.model_dump(by_alias=True)},
                        ),
                    ),
                )

        elif msg_type == "chat.send":
            caller = room_repo.get_participant(room_id, participant_id)
            chat_msg = room_repo.save_chat_message(
                room_id=room_id,
                participant_id=participant_id,
                display_name=caller.display_name,
                text=msg.payload.text,
            )
            broadcast_to_room(
                endpoint_url=endpoint_url,
                room_id=room_id,
                message=MsgChatMessage(
                    request_id=msg.request_id,
                    sent_at_ms=now_ms,
                    payload=ChatMessagePayload(message=chat_msg),
                ),
            )

        elif msg_type == "reaction.send":
            caller = room_repo.get_participant(room_id, participant_id)
            broadcast_to_room(
                endpoint_url=endpoint_url,
                room_id=room_id,
                message=MsgReactionAdded(
                    request_id=msg.request_id,
                    sent_at_ms=now_ms,
                    payload=ReactionAddedPayload(
                        participant_id=participant_id,
                        display_name=caller.display_name,
                        emoji=msg.payload.emoji,
                        added_at_ms=now_ms,
                    ),
                ),
            )

        elif msg_type == "player.status":
            room_repo.update_player_status(room_id, participant_id, msg.payload.status)

        elif msg_type in ("heartbeat", "metrics.report"):
            pass

    except WatchPartyError as e:
        send_to_connection(
            endpoint_url=endpoint_url,
            connection_id=connection_id,
            message=MsgError(
                request_id=request_id,
                sent_at_ms=now_ms,
                payload=ErrorPayload(
                    code=ErrorCode(e.code)
                    if e.code in ErrorCode.__members__
                    else ErrorCode.INTERNAL_ERROR,
                    message=e.message,
                    details=e.details,
                ),
            ),
        )
    except Exception:
        logger.exception("Unexpected error in ws_message handler")
        send_to_connection(
            endpoint_url=endpoint_url,
            connection_id=connection_id,
            message=MsgError(
                request_id=request_id,
                sent_at_ms=now_ms,
                payload=ErrorPayload(
                    code=ErrorCode.INTERNAL_ERROR,
                    message="Internal server error.",
                ),
            ),
        )

    return {"statusCode": 200, "body": "OK"}
