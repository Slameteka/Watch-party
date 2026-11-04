"""REST API Request and Response schemas matching openapi.yaml."""

from typing import Literal

from core.models.common import (
    CamelModel,
    DisplayName,
    MaxParticipants,
    MediaId,
    ParticipantId,
    Role,
    RoomId,
)
from core.models.room import Media, Room


class Health(CamelModel):
    status: Literal["ok"] = "ok"


class CatalogResponse(CamelModel):
    items: list[Media]


class RoomSession(CamelModel):
    room_id: RoomId
    participant_id: ParticipantId
    display_name: DisplayName
    role: Role
    room_token: str
    room_token_expires_at_ms: int
    ws_url: str


class CreateRoomRequest(CamelModel):
    media_id: MediaId
    display_name: DisplayName
    max_participants: MaxParticipants = 10


class CreateRoomResponse(CamelModel):
    room: Room
    session: RoomSession


class JoinRoomRequest(CamelModel):
    display_name: DisplayName


class RtcToken(CamelModel):
    token: str
    url: str
    expires_at_ms: int
