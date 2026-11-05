"""Unit tests for Core Pydantic models (REST & WebSocket)."""

import pytest
from pydantic import ValidationError as PydanticValidationError

from core.models.common import (
    PlaybackAction,
    PlayerStatus,
    Role,
    RoomStatus,
)
from core.models.rest import (
    CreateRoomRequest,
    Health,
    RoomSession,
)
from core.models.room import Media, Participant, PlaybackState, Room
from core.models.websocket import (
    ClientMessage,
    MsgChatSend,
    MsgPlaybackCommand,
    MsgRoomSnapshot,
    ServerMessage,
)


def test_health_model():
    h = Health()
    assert h.status == "ok"
    assert h.model_dump(by_alias=True) == {"status": "ok"}


def test_display_name_validation():
    # Valid display name gets trimmed
    req = CreateRoomRequest(media_id="sintel", display_name="  Alice  ")
    assert req.display_name == "Alice"

    # Too short after trim
    with pytest.raises(PydanticValidationError):
        CreateRoomRequest(media_id="sintel", display_name="   ")

    # Too long (>32 chars)
    with pytest.raises(PydanticValidationError):
        CreateRoomRequest(media_id="sintel", display_name="a" * 33)

    # Control characters
    with pytest.raises(PydanticValidationError):
        CreateRoomRequest(media_id="sintel", display_name="Alice\x00Smith")


def test_room_id_and_participant_id_regex():
    # Valid room id (12 base62)
    valid_room_id = "aZ3kP9qL2mXw"
    valid_part_id = "p_Q8w2Ez7Rt5Yu1Io3"

    session = RoomSession(
        room_id=valid_room_id,
        participant_id=valid_part_id,
        display_name="Bella",
        role=Role.VIEWER,
        room_token="jwt.token.here",
        room_token_expires_at_ms=1700000000000,
        ws_url="wss://ws.watchparty.chescloud.my.id",
    )
    dumped = session.model_dump(by_alias=True)
    assert dumped["roomId"] == valid_room_id
    assert dumped["participantId"] == valid_part_id
    assert dumped["role"] == "viewer"

    # Invalid room id pattern
    with pytest.raises(PydanticValidationError):
        RoomSession(
            room_id="too-short",
            participant_id=valid_part_id,
            display_name="Bella",
            role=Role.VIEWER,
            room_token="jwt.token.here",
            room_token_expires_at_ms=1700000000000,
            ws_url="wss://ws.watchparty.chescloud.my.id",
        )


def test_extra_forbid_rejection():
    # Extra field must be rejected
    data = {
        "mediaId": "sintel",
        "displayName": "Alice",
        "unknownField": "hacker",
    }
    with pytest.raises(PydanticValidationError):
        CreateRoomRequest.model_validate(data)


def test_max_participants_bounds():
    # Valid bounds 2..10
    req2 = CreateRoomRequest(media_id="sintel", display_name="Alice", max_participants=2)
    assert req2.max_participants == 2

    req10 = CreateRoomRequest(media_id="sintel", display_name="Alice", max_participants=10)
    assert req10.max_participants == 10

    # Below 2
    with pytest.raises(PydanticValidationError):
        CreateRoomRequest(media_id="sintel", display_name="Alice", max_participants=1)

    # Above 10
    with pytest.raises(PydanticValidationError):
        CreateRoomRequest(media_id="sintel", display_name="Alice", max_participants=11)


def test_playback_state_serialization():
    pb = PlaybackState(
        room_id="aZ3kP9qL2mXw",
        media_id="sintel",
        status="playing",
        position_sec=120.5,
        playback_rate=1.0,
        updated_at_server_ms=1700000000000,
        version=1,
    )
    dumped = pb.model_dump(by_alias=True)
    assert dumped["roomId"] == "aZ3kP9qL2mXw"
    assert dumped["positionSec"] == 120.5
    assert dumped["playbackRate"] == 1.0
    assert dumped["updatedAtServerMs"] == 1700000000000
    assert dumped["version"] == 1


def test_websocket_client_message_parsing():
    raw_cmd = {
        "v": 1,
        "type": "playback.command",
        "requestId": "req-12345",
        "sentAtMs": 1700000000000,
        "payload": {
            "action": "play",
            "positionSec": 45.0,
            "baseVersion": 3,
        },
    }
    from pydantic import TypeAdapter

    adapter = TypeAdapter(ClientMessage)
    msg = adapter.validate_python(raw_cmd)
    assert isinstance(msg, MsgPlaybackCommand)
    assert msg.payload.action == PlaybackAction.PLAY
    assert msg.payload.position_sec == 45.0
    assert msg.payload.base_version == 3


def test_websocket_chat_send_length_validation():
    # Chat message text up to 500 characters
    valid_chat = {
        "v": 1,
        "type": "chat.send",
        "requestId": "req-1",
        "sentAtMs": 1700000000000,
        "payload": {"text": "Hello world!"},
    }
    from pydantic import TypeAdapter

    adapter = TypeAdapter(ClientMessage)
    msg = adapter.validate_python(valid_chat)
    assert isinstance(msg, MsgChatSend)
    assert msg.payload.text == "Hello world!"

    # Exceeding 500 chars
    invalid_chat = {
        "v": 1,
        "type": "chat.send",
        "requestId": "req-1",
        "sentAtMs": 1700000000000,
        "payload": {"text": "x" * 501},
    }
    with pytest.raises(PydanticValidationError):
        adapter.validate_python(invalid_chat)


def test_websocket_server_snapshot_serialization():
    media = Media(
        media_id="sintel",
        title="Sintel",
        description="Open movie",
        duration_sec=888.0,
        poster_url="https://watchparty.chescloud.my.id/posters/sintel.jpg",
        playback_url="https://watchparty.chescloud.my.id/media/sintel/master.m3u8",
        license="CC BY 3.0",
        attribution="(c) copyright Blender Foundation",
    )
    room = Room(
        room_id="aZ3kP9qL2mXw",
        media_id="sintel",
        media_title="Sintel",
        status=RoomStatus.OPEN,
        host_display_name="Alice",
        participant_count=1,
        max_participants=10,
        created_at_ms=1700000000000,
        expires_at_ms=1700086400000,
        invite_url="https://watchparty.chescloud.my.id/r/aZ3kP9qL2mXw",
    )
    pb = PlaybackState(
        room_id="aZ3kP9qL2mXw",
        media_id="sintel",
        status="paused",
        position_sec=0.0,
        playback_rate=1.0,
        updated_at_server_ms=1700000000000,
        version=1,
    )
    part = Participant(
        participant_id="p_Q8w2Ez7Rt5Yu1Io3",
        display_name="Alice",
        role=Role.HOST,
        player_status=PlayerStatus.READY,
        connected=True,
        joined_at_ms=1700000000000,
    )
    from core.models.websocket import SelfParticipant

    snapshot = MsgRoomSnapshot(
        sent_at_ms=1700000000100,
        payload={
            "room": room,
            "media": media,
            "playback": pb,
            "participants": [part],
            "recentChat": [],
            "self": SelfParticipant(participant_id="p_Q8w2Ez7Rt5Yu1Io3", role=Role.HOST),
        },
    )
    from pydantic import TypeAdapter

    adapter = TypeAdapter(ServerMessage)
    dumped = snapshot.model_dump(by_alias=True)
    parsed = adapter.validate_python(dumped)
    assert parsed.type == "room.snapshot"
    assert dumped["type"] == "room.snapshot"
    assert dumped["payload"]["room"]["roomId"] == "aZ3kP9qL2mXw"
    assert dumped["payload"]["media"]["durationSec"] == 888.0
    assert dumped["payload"]["self"]["role"] == "host"
