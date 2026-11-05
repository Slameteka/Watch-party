"""Common types, enums, and base models for Pydantic."""

import re
from enum import StrEnum
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
)
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base Pydantic model enforcing camelCase serialization and forbidding extra fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        validate_default=True,
    )


class Role(StrEnum):
    HOST = "host"
    CONTROLLER = "controller"
    VIEWER = "viewer"


class PlayerStatus(StrEnum):
    UNKNOWN = "unknown"
    BUFFERING = "buffering"
    SYNCING = "syncing"
    READY = "ready"


class RoomStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class Emoji(StrEnum):
    THUMBS_UP = "thumbsUp"
    HEART = "heart"
    LAUGH = "laugh"
    WOW = "wow"
    SAD = "sad"


class PlaybackAction(StrEnum):
    PLAY = "play"
    PAUSE = "pause"
    SEEK = "seek"


class ErrorCode(StrEnum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    ROOM_FULL = "ROOM_FULL"
    ROOM_CLOSED = "ROOM_CLOSED"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    RATE_LIMITED = "RATE_LIMITED"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    UNSUPPORTED_VERSION = "UNSUPPORTED_VERSION"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# Regex patterns
ROOM_ID_REGEX = r"^[A-Za-z0-9]{12}$"
PARTICIPANT_ID_REGEX = r"^p_[A-Za-z0-9]{16}$"
MEDIA_ID_REGEX = r"^[a-z0-9-]{1,64}$"
CONTROL_CHAR_REGEX = re.compile(r"[\x00-\x1f\x7f-\x9f]")

RoomId = Annotated[
    str,
    Field(
        pattern=ROOM_ID_REGEX,
        description="12-character base62 room identifier",
        examples=["aZ3kP9qL2mXw"],
    ),
]

ParticipantId = Annotated[
    str,
    Field(
        pattern=PARTICIPANT_ID_REGEX,
        description="p_ prefix followed by 16-character base62 participant identifier",
        examples=["p_Q8w2Ez7Rt5Yu1Io3"],
    ),
]

MediaId = Annotated[
    str,
    Field(
        pattern=MEDIA_ID_REGEX,
        description="1 to 64 character alphanumeric and hyphen media identifier",
        examples=["sintel"],
    ),
]


def _validate_display_name(v: str) -> str:
    if not isinstance(v, str):
        raise ValueError("Display name must be a string")
    trimmed = v.strip()
    if len(trimmed) < 1 or len(trimmed) > 32:
        raise ValueError("Display name must be between 1 and 32 characters")
    if CONTROL_CHAR_REGEX.search(trimmed):
        raise ValueError("Display name cannot contain control characters")
    return trimmed


DisplayName = Annotated[
    str,
    AfterValidator(_validate_display_name),
    Field(
        min_length=1,
        max_length=32,
        description="Display name after trim, without control characters",
        examples=["Bella"],
    ),
]


MaxParticipants = Annotated[
    int,
    Field(
        ge=2,
        le=10,
        description="Room participant capacity limit (2-10). Default and max v1 is 10.",
        examples=[10],
    ),
]


class ErrorDetail(CamelModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] | None = None
    retry_after_sec: int | None = None


class ErrorResponse(CamelModel):
    error: ErrorDetail
