"""Room Token generation and validation using HS256 JWT."""

import time
import uuid

import jwt
from pydantic import BaseModel, ConfigDict, Field

from core.config import ROOM_TOKEN_SECRET, ROOM_TOKEN_TTL_SEC
from core.errors import ForbiddenError, UnauthorizedError
from core.models.common import Role


class RoomTokenClaims(BaseModel):
    """Decoded claims payload from a validated room token."""

    sub: str = Field(description="Participant ID (e.g. p_Q8w2Ez7Rt5Yu1Io3)")
    room_id: str = Field(alias="roomId")
    role: Role
    iss: str
    aud: str
    iat: int
    exp: int
    jti: str

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


def issue_room_token(
    room_id: str,
    participant_id: str,
    role: Role,
    secret: str = ROOM_TOKEN_SECRET,
    ttl_sec: int = ROOM_TOKEN_TTL_SEC,
) -> tuple[str, int]:
    """Issues a signed HS256 room token.

    Returns:
        tuple[str, int]: (encoded_jwt_token, expires_at_ms)
    """
    now_sec = int(time.time())
    exp_sec = now_sec + ttl_sec
    expires_at_ms = exp_sec * 1000

    payload = {
        "sub": participant_id,
        "roomId": room_id,
        "role": role.value if isinstance(role, Role) else role,
        "iss": "watchparty",
        "aud": "room",
        "iat": now_sec,
        "exp": exp_sec,
        "jti": str(uuid.uuid4()),
    }

    token = jwt.encode(payload, secret, algorithm="HS256")
    return token, expires_at_ms


def verify_room_token(
    token: str,
    expected_room_id: str | None = None,
    secret: str = ROOM_TOKEN_SECRET,
) -> RoomTokenClaims:
    """Verifies and decodes an HS256 room token.

    Raises:
        UnauthorizedError: If token is expired, invalid, or signature does not match.
        ForbiddenError: If expected_room_id is provided and does not match token roomId.
    """
    try:
        decoded = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="room",
            issuer="watchparty",
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
        claims = RoomTokenClaims.model_validate(decoded)
    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedError("Room token has expired.") from e
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError("Invalid room token.") from e
    except Exception as e:
        raise UnauthorizedError("Failed to authenticate room token.") from e

    if expected_room_id and claims.room_id != expected_room_id:
        raise ForbiddenError(
            f"Token room ID '{claims.room_id}' does not match requested room ID '{expected_room_id}'."
        )

    return claims
