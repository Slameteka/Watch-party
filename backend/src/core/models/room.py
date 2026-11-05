"""Domain models for Room, Media, Participant, PlaybackState, and Chat."""

from typing import Literal

from pydantic import Field

from core.models.common import (
    CamelModel,
    DisplayName,
    MaxParticipants,
    MediaId,
    ParticipantId,
    PlayerStatus,
    Role,
    RoomId,
    RoomStatus,
)


class Media(CamelModel):
    media_id: MediaId
    title: str
    description: str | None = None
    duration_sec: float = Field(ge=0, description="Video duration in seconds")
    poster_url: str = Field(description="Public poster URL at /posters/*")
    playback_url: str = Field(
        description="Master HLS playlist URL at /media/* (requires signed cookies)"
    )
    license: str
    attribution: str


class PlaybackState(CamelModel):
    room_id: RoomId
    media_id: MediaId
    status: Literal["playing", "paused"]
    position_sec: float = Field(ge=0, description="Playback position in seconds")
    playback_rate: float = Field(default=1.0, description="Playback rate (always 1.0 in v1)")
    updated_at_server_ms: int = Field(
        description="Server epoch timestamp in milliseconds when state was updated"
    )
    version: int = Field(
        ge=1,
        description="Monotonically increasing version counter for optimistic locking",
    )


class Participant(CamelModel):
    participant_id: ParticipantId
    display_name: DisplayName
    role: Role
    player_status: PlayerStatus
    connected: bool = Field(
        description="Active WebSocket connection state. Host shown even when false."
    )
    joined_at_ms: int


class Room(CamelModel):
    room_id: RoomId
    media_id: MediaId
    media_title: str
    status: RoomStatus
    host_display_name: DisplayName
    participant_count: int = Field(ge=0, description="Number of currently connected participants")
    max_participants: MaxParticipants
    created_at_ms: int
    expires_at_ms: int
    closed_at_ms: int | None = None
    invite_url: str


class ChatMessage(CamelModel):
    message_id: str = Field(min_length=1, max_length=64)
    participant_id: ParticipantId
    display_name: DisplayName
    text: str = Field(min_length=1, max_length=500)
    created_at_ms: int
