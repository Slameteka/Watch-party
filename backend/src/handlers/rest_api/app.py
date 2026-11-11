"""Main REST API Lambda Handler using AWS Lambda Powertools."""

import time
import uuid
from typing import Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, CORSConfig, Response
from pydantic import ValidationError as PydanticValidationError

from core.auth.token import issue_room_token, verify_room_token
from core.catalog_data import DEFAULT_CATALOG_ITEMS
from core.config import (
    APP_DOMAIN,
    APP_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    LIVEKIT_TOKEN_TTL_SEC,
    RTC_URL,
    WS_URL,
)
from core.errors import (
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
    WatchPartyError,
)
from core.models.common import Role
from core.models.rest import (
    CatalogResponse,
    CreateRoomRequest,
    CreateRoomResponse,
    Health,
    JoinRoomRequest,
    RoomSession,
    RtcToken,
)
from core.repository.room_repo import RoomRepository

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

    # Extract Cognito sub if present (for host), otherwise generate anonymous host user id
    auth_header = app.current_event.headers.get("authorization", "")
    host_user_id = "user_host_local"
    if auth_header.startswith("Bearer "):
        # In real Cognito, extract sub from token claims; default to hash/uuid for local
        host_user_id = f"user_{uuid.uuid4().hex[:12]}"

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

    # Pre-check if returning host via Cognito header
    auth_header = app.current_event.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        cognito_sub = auth_header[7:].strip()
        try:
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
        except ForbiddenError, NotFoundError:
            pass

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
    token = extract_bearer_token()
    verify_room_token(token, expected_room_id=room_id)

    # In local/mock mode, issue representative cookies
    cookie_attrs = f"Domain={APP_DOMAIN}; Path=/media/; Secure; HttpOnly; SameSite=Lax"
    headers = {
        "Set-Cookie": f"CloudFront-Policy=mock-policy; {cookie_attrs}",
    }
    return Response(
        status_code=204,
        headers=headers,
    )


@app.post("/rooms/<room_id>/rtc-token")
def issue_rtc_token(room_id: str) -> dict[str, Any]:
    token = extract_bearer_token()
    claims = verify_room_token(token, expected_room_id=room_id)
    participant = room_repo.get_participant(room_id, claims.sub)

    now_ms = int(time.time() * 1000)
    exp_ms = now_ms + (LIVEKIT_TOKEN_TTL_SEC * 1000)

    # Try LiveKit SDK if keys configured, otherwise fallback to signed room token
    if LIVEKIT_API_KEY and LIVEKIT_API_SECRET:
        try:
            from livekit import api

            livekit_jwt = (
                api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
                .with_identity(participant.participant_id)
                .with_name(participant.display_name)
                .with_grants(
                    api.VideoGrants(
                        room_join=True,
                        room=room_id,
                        can_publish=True,
                        can_subscribe=True,
                    )
                )
                .to_jwt()
            )
        except Exception:
            livekit_jwt, _ = issue_room_token(room_id, participant.participant_id, participant.role)
    else:
        livekit_jwt, _ = issue_room_token(room_id, participant.participant_id, participant.role)

    rtc_token = RtcToken(
        token=livekit_jwt,
        url=RTC_URL,
        expires_at_ms=exp_ms,
    )
    return rtc_token.model_dump(by_alias=True)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    return app.resolve(event, context)
