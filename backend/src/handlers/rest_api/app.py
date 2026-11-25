"""Main REST API Lambda Handler using AWS Lambda Powertools."""

import asyncio
import time
import uuid
from datetime import timedelta
from os import getenv
from typing import Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, CORSConfig, Response
from aws_lambda_powertools.shared.cookies import Cookie, SameSite
from botocore.exceptions import ClientError
from pydantic import ValidationError as PydanticValidationError

from core.auth.cloudfront import media_resource, sign_cookies
from core.auth.cognito import verify_cognito_jwt
from core.auth.token import issue_room_token, verify_room_token
from core.broadcast.gateway import broadcast_to_room, get_apigw_client, send_to_connection
from core.catalog_data import DEFAULT_CATALOG_ITEMS
from core.config import (
    APP_URL,
    CLOUDFRONT_KEY_PAIR_ID,
    LIVEKIT_TOKEN_TTL_SEC,
    LIVEKIT_URL,
    MEDIA_COOKIES_TTL_SEC,
    MEDIA_DOMAIN,
    WS_MANAGEMENT_ENDPOINT,
    WS_URL,
)
from core.errors import (
    ForbiddenError,
    NotFoundError,
    RoomClosedError,
    UnauthorizedError,
    ValidationError,
    WatchPartyError,
)
from core.models.common import Role, RoomStatus
from core.models.rest import (
    CatalogResponse,
    CreateRoomRequest,
    CreateRoomResponse,
    Health,
    JoinRoomRequest,
    RoomSession,
    RtcToken,
)
from core.models.room import Participant, Room
from core.models.websocket import (
    MsgParticipantLeft,
    MsgParticipantUpdated,
    MsgSessionEnded,
    ParticipantLeftPayload,
    ParticipantUpdatedPayload,
    SessionEndedPayload,
    WsEnvelope,
)
from core.repository.base import current_epoch_ms
from core.repository.room_repo import RoomRepository
from core.secret_store import (
    SecretNotConfiguredError,
    cloudfront_private_key_pem,
    livekit_api_credentials,
    running_in_lambda,
)

logger = Logger(service="rest-api")

cors_config = CORSConfig(
    allow_origin=APP_URL,
    allow_credentials=True,
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600,
)

app = APIGatewayHttpResolver(cors=cors_config)
room_repo = RoomRepository()


# ==============================================================================
# Error Handling
# ==============================================================================


@app.exception_handler(WatchPartyError)
def handle_domain_error(ex: WatchPartyError):
    headers = {}
    if ex.retry_after_sec is not None:
        headers["Retry-After"] = str(ex.retry_after_sec)
    return Response(
        status_code=ex.status_code,
        content_type="application/json",
        body=ex.to_dict(),
        headers=headers,
    )


@app.exception_handler(PydanticValidationError)
def handle_validation_error(ex: PydanticValidationError):
    first_error = ex.errors()[0] if ex.errors() else {}
    field_name = str(first_error.get("loc", ["unknown"])[-1])
    msg = first_error.get("msg", "Invalid input.")
    return Response(
        status_code=400,
        content_type="application/json",
        body={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": f"{field_name}: {msg}",
                "details": {"field": field_name},
            }
        },
    )


def extract_bearer_token() -> str:
    """Extracts bearer token from Authorization header."""
    auth_header = app.current_event.headers.get("authorization", "")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header.")
    return auth_header[7:].strip()


def require_active_participant(room_id: str) -> tuple[Room, Participant]:
    """Authenticates the room token and loads an open room and a non-kicked participant.

    Raises 401 (bad token), 403 (other room or kicked), 404 (unknown), 410 (room closed).
    The role is always read from DynamoDB, never from the token.
    """
    claims = verify_room_token(extract_bearer_token(), expected_room_id=room_id)
    room = room_repo.get_room_summary(room_id)
    if room.status == RoomStatus.CLOSED:
        raise RoomClosedError()
    participant = room_repo.get_participant(room_id, claims.sub)
    return room, participant


def _require_host(room_id: str) -> tuple[Room, Participant]:
    """Authenticates an active participant and enforces the host role from DynamoDB."""
    room, participant = require_active_participant(room_id)
    if participant.role != Role.HOST:
        raise ForbiddenError("Only host can perform this action.")
    return room, participant


def _ws_endpoint() -> str:
    return getenv("WS_MANAGEMENT_ENDPOINT") or WS_MANAGEMENT_ENDPOINT


def _broadcast_ws(room_id: str, message: WsEnvelope) -> None:
    """Broadcasts a room WebSocket event if management endpoint is configured."""
    endpoint = _ws_endpoint()
    if not endpoint:
        return
    try:
        broadcast_to_room(endpoint_url=endpoint, room_id=room_id, message=message)
    except Exception as e:
        logger.warning(
            "WebSocket broadcast failed",
            extra={"roomId": room_id, "error": str(e)},
        )


def _disconnect_kicked_ws(connection_id: str | None) -> None:
    """Sends session.ended (kicked) and closes the kicked participant's WebSocket."""
    if not connection_id:
        return
    endpoint = _ws_endpoint()
    if not endpoint:
        return
    try:
        send_to_connection(
            endpoint_url=endpoint,
            connection_id=connection_id,
            message=MsgSessionEnded(
                sent_at_ms=current_epoch_ms(),
                payload=SessionEndedPayload(reason="kicked"),
            ),
        )
        get_apigw_client(endpoint).delete_connection(ConnectionId=connection_id)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code not in ("GoneException", "410"):
            logger.warning(
                "Failed to close kicked WebSocket connection",
                extra={"errorCode": error_code},
            )
    except Exception as e:
        logger.warning("Failed to disconnect kicked WebSocket", extra={"error": str(e)})


def _remove_from_livekit(room_id: str, participant_id: str) -> None:
    """Best-effort removal of a kicked participant from LiveKit SFU room."""
    try:
        api_key, api_secret = livekit_api_credentials()
    except SecretNotConfiguredError:
        return

    try:
        from livekit import api

        async def _remove() -> None:
            async with api.LiveKitAPI(
                url=LIVEKIT_URL,
                api_key=api_key,
                api_secret=api_secret,
            ) as lk:
                await lk.room.remove_participant(
                    api.RoomParticipantIdentity(room=room_id, identity=participant_id)
                )

        asyncio.run(_remove())
    except Exception as e:
        logger.warning(
            "Best-effort LiveKit participant removal failed",
            extra={"roomId": room_id, "participantId": participant_id, "error": str(e)},
        )


# ==============================================================================
# Routes
# ==============================================================================


@app.get("/health")
def get_health() -> dict[str, Any]:
    return Health().model_dump(by_alias=True)


@app.get("/catalog")
def get_catalog() -> dict[str, Any]:
    items = room_repo.get_catalog()
    if not items:
        # Fallback to curated default catalog if table is not yet seeded
        items = DEFAULT_CATALOG_ITEMS
    return CatalogResponse(items=items).model_dump(by_alias=True)


@app.post("/rooms")
def create_room() -> Response:
    raw_body = app.current_event.json_body or {}
    req = CreateRoomRequest.model_validate(raw_body)

    # Check media existence in catalog
    media = None
    for item in DEFAULT_CATALOG_ITEMS:
        if item.media_id == req.media_id:
            media = item
            break
    if not media:
        try:
            media = room_repo.get_media_item(req.media_id)
        except NotFoundError as e:
            raise ValidationError(f"Media '{req.media_id}' does not exist.") from e

    # Extract Cognito sub from API Gateway JWT authorizer claims; fallback for local tests without authorizer
    claims = (
        app.current_event.raw_event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    host_user_id = claims.get("sub") or f"user_{uuid.uuid4().hex[:12]}"

    room, host_participant = room_repo.create_room(
        media=media,
        host_display_name=req.display_name,
        host_user_id=host_user_id,
        max_participants=req.max_participants,
    )

    token, exp_ms = issue_room_token(
        room_id=room.room_id,
        participant_id=host_participant.participant_id,
        role=Role.HOST,
    )

    session = RoomSession(
        room_id=room.room_id,
        participant_id=host_participant.participant_id,
        display_name=host_participant.display_name,
        role=Role.HOST,
        room_token=token,
        room_token_expires_at_ms=exp_ms,
        ws_url=WS_URL,
    )

    res = CreateRoomResponse(room=room, session=session)
    return Response(
        status_code=201,
        content_type="application/json",
        body=res.model_dump(by_alias=True),
    )


@app.get("/rooms/<room_id>")
def get_room(room_id: str) -> dict[str, Any]:
    room = room_repo.get_room_summary(room_id)
    return room.model_dump(by_alias=True)


@app.post("/rooms/<room_id>/join")
def join_room(room_id: str) -> dict[str, Any]:
    raw_body = app.current_event.json_body or {}
    req = JoinRoomRequest.model_validate(raw_body)

    # Pre-check if returning host via verified Cognito JWT
    auth_header = app.current_event.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        bearer_token = auth_header[7:].strip()
        try:
            cognito_sub = verify_cognito_jwt(bearer_token)
            room, host = room_repo.get_host_participant(room_id, cognito_sub)
            token, exp_ms = issue_room_token(room_id, host.participant_id, Role.HOST)
            return RoomSession(
                room_id=room.room_id,
                participant_id=host.participant_id,
                display_name=host.display_name,
                role=Role.HOST,
                room_token=token,
                room_token_expires_at_ms=exp_ms,
                ws_url=WS_URL,
            ).model_dump(by_alias=True)
        except UnauthorizedError, ForbiddenError:
            logger.info("Cognito host verification failed on join; continuing as guest viewer")

    # Guest join (viewer)
    room, guest = room_repo.join_guest(room_id, req.display_name)
    token, exp_ms = issue_room_token(room_id, guest.participant_id, Role.VIEWER)

    session = RoomSession(
        room_id=room.room_id,
        participant_id=guest.participant_id,
        display_name=guest.display_name,
        role=Role.VIEWER,
        room_token=token,
        room_token_expires_at_ms=exp_ms,
        ws_url=WS_URL,
    )
    return session.model_dump(by_alias=True)


@app.post("/rooms/<room_id>/session/refresh")
def refresh_session(room_id: str) -> dict[str, Any]:
    token = extract_bearer_token()
    claims = verify_room_token(token, expected_room_id=room_id)

    participant = room_repo.get_participant(room_id, claims.sub)
    new_token, new_exp_ms = issue_room_token(
        room_id=room_id,
        participant_id=participant.participant_id,
        role=participant.role,
    )

    session = RoomSession(
        room_id=room_id,
        participant_id=participant.participant_id,
        display_name=participant.display_name,
        role=participant.role,
        room_token=new_token,
        room_token_expires_at_ms=new_exp_ms,
        ws_url=WS_URL,
    )
    return session.model_dump(by_alias=True)


@app.post("/rooms/<room_id>/media-cookies")
def issue_media_cookies(room_id: str) -> Response:
    """Sets CloudFront signed cookies for this room's film only (F-2.3, ADR-0005)."""
    room, _ = require_active_participant(room_id)

    try:
        private_key_pem = cloudfront_private_key_pem()
        if not CLOUDFRONT_KEY_PAIR_ID:
            logger.error("CLOUDFRONT_KEY_PAIR_ID is not configured")
            raise SecretNotConfiguredError()
    except SecretNotConfiguredError:
        if running_in_lambda():
            raise
        # Local dev server: no CloudFront in front of the media, so no cookies are needed.
        logger.warning("Media signing not configured; local mode returns 204 without cookies")
        return Response(status_code=204)

    values = sign_cookies(
        resource=media_resource(MEDIA_DOMAIN, room.media_id),
        expires_at_sec=int(time.time()) + MEDIA_COOKIES_TTL_SEC,
        key_pair_id=CLOUDFRONT_KEY_PAIR_ID,
        private_key_pem=private_key_pem,
    )
    # No Expires/Max-Age: session cookies, as AWS recommends; the policy itself expires.
    cookies = [
        Cookie(
            name=name,
            value=value,
            domain=MEDIA_DOMAIN,
            path="/media/",
            secure=True,
            http_only=True,
            same_site=SameSite.LAX_MODE,
        )
        for name, value in values.items()
    ]
    return Response(status_code=204, cookies=cookies)


@app.post("/rooms/<room_id>/rtc-token")
def issue_rtc_token(room_id: str) -> dict[str, Any]:
    """Issues a short-lived LiveKit access token (F-3.1, ADR-0004)."""
    _, participant = require_active_participant(room_id)
    api_key, api_secret = livekit_api_credentials()

    # Imported lazily: only this route needs the LiveKit SDK.
    from livekit import api

    ttl = timedelta(seconds=LIVEKIT_TOKEN_TTL_SEC)
    expires_at_ms = int(time.time() * 1000) + LIVEKIT_TOKEN_TTL_SEC * 1000
    livekit_jwt = (
        api.AccessToken(api_key, api_secret)
        .with_identity(participant.participant_id)
        .with_name(participant.display_name)
        .with_ttl(ttl)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_id,
                can_publish=True,
                can_subscribe=True,
                # Chat and reactions go through the WebSocket API, not LiveKit data channels.
                can_publish_data=False,
            )
        )
        .to_jwt()
    )

    return RtcToken(token=livekit_jwt, url=LIVEKIT_URL, expires_at_ms=expires_at_ms).model_dump(
        by_alias=True
    )


@app.put("/rooms/<room_id>/controllers/<participant_id>")
def grant_controller(room_id: str, participant_id: str) -> dict[str, Any]:
    """Grants playback controller role to a participant (F-2.2). Host only."""
    _, host = _require_host(room_id)
    if participant_id == host.participant_id:
        raise ForbiddenError("Host cannot modify own role.")

    updated = room_repo.update_participant_role(room_id, participant_id, Role.CONTROLLER)
    _broadcast_ws(
        room_id,
        MsgParticipantUpdated(
            sent_at_ms=current_epoch_ms(),
            payload=ParticipantUpdatedPayload(participant=updated),
        ),
    )
    return updated.model_dump(by_alias=True)


@app.delete("/rooms/<room_id>/controllers/<participant_id>")
def revoke_controller(room_id: str, participant_id: str) -> dict[str, Any]:
    """Revokes playback controller role back to viewer (F-2.2). Host only."""
    _, host = _require_host(room_id)
    if participant_id == host.participant_id:
        raise ForbiddenError("Host cannot modify own role.")

    updated = room_repo.update_participant_role(room_id, participant_id, Role.VIEWER)
    _broadcast_ws(
        room_id,
        MsgParticipantUpdated(
            sent_at_ms=current_epoch_ms(),
            payload=ParticipantUpdatedPayload(participant=updated),
        ),
    )
    return updated.model_dump(by_alias=True)


@app.delete("/rooms/<room_id>/participants/<participant_id>")
def kick_participant(room_id: str, participant_id: str) -> Response:
    """Removes (kicks) a participant from the room (F-1.6). Host only."""
    _, host = _require_host(room_id)
    if participant_id == host.participant_id:
        raise ForbiddenError("Host cannot kick self.")

    old_conn_id = room_repo.kick_participant(room_id, participant_id)
    _disconnect_kicked_ws(old_conn_id)
    _remove_from_livekit(room_id, participant_id)
    _broadcast_ws(
        room_id,
        MsgParticipantLeft(
            sent_at_ms=current_epoch_ms(),
            payload=ParticipantLeftPayload(participant_id=participant_id, reason="kicked"),
        ),
    )
    return Response(status_code=204)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    return app.resolve(event, context)
