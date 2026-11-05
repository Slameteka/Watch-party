"""Unit tests for token authentication."""

import time

import pytest

from core.auth.token import issue_room_token, verify_room_token
from core.errors import ForbiddenError, UnauthorizedError
from core.models.common import Role


def test_issue_and_verify_valid_room_token():
    room_id = "aZ3kP9qL2mXw"
    part_id = "p_Q8w2Ez7Rt5Yu1Io3"
    role = Role.HOST

    token, expires_at_ms = issue_room_token(room_id, part_id, role)
    assert token
    assert expires_at_ms > int(time.time() * 1000)

    claims = verify_room_token(token, expected_room_id=room_id)
    assert claims.sub == part_id
    assert claims.room_id == room_id
    assert claims.role == Role.HOST
    assert claims.iss == "watchparty"
    assert claims.aud == "room"


def test_token_room_id_mismatch_raises_forbidden():
    room_id = "aZ3kP9qL2mXw"
    part_id = "p_Q8w2Ez7Rt5Yu1Io3"

    token, _ = issue_room_token(room_id, part_id, Role.VIEWER)

    with pytest.raises(ForbiddenError):
        verify_room_token(token, expected_room_id="otherRoomId12")


def test_token_expired_raises_unauthorized():
    room_id = "aZ3kP9qL2mXw"
    part_id = "p_Q8w2Ez7Rt5Yu1Io3"

    # Issue token with negative TTL (already expired)
    token, _ = issue_room_token(room_id, part_id, Role.VIEWER, ttl_sec=-10)

    with pytest.raises(UnauthorizedError, match="Room token has expired."):
        verify_room_token(token, expected_room_id=room_id)


def test_tampered_token_raises_unauthorized():
    room_id = "aZ3kP9qL2mXw"
    part_id = "p_Q8w2Ez7Rt5Yu1Io3"

    key1 = "super-secret-key-1-at-least-32-chars-long!"
    key2 = "super-secret-key-2-at-least-32-chars-long!"

    token, _ = issue_room_token(room_id, part_id, Role.VIEWER, secret=key1)

    with pytest.raises(UnauthorizedError):
        verify_room_token(token, expected_room_id=room_id, secret=key2)
