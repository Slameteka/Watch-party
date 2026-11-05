"""Unit tests for DynamoDB repositories using moto."""

import boto3
import pytest
from moto import mock_aws

from core.errors import ForbiddenError, RoomFullError, VersionConflictError
from core.models.common import PlaybackAction, Role, RoomStatus
from core.models.room import Media
from core.repository.connection_repo import ConnectionRepository
from core.repository.playback_repo import PlaybackRepository
from core.repository.room_repo import RoomRepository


@pytest.fixture
def mock_dynamodb():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")

        # Create main table
        main_table = dynamodb.create_table(
            TableName="watchparty-test-main",
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # Create connections table with byRoom GSI
        connections_table = dynamodb.create_table(
            TableName="watchparty-test-connections",
            KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "connectionId", "AttributeType": "S"},
                {"AttributeName": "roomId", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "byRoom",
                    "KeySchema": [
                        {"AttributeName": "roomId", "KeyType": "HASH"},
                        {"AttributeName": "connectionId", "KeyType": "RANGE"},
                    ],
                    "Projection": {
                        "ProjectionType": "INCLUDE",
                        "NonKeyAttributes": ["participantId"],
                    },
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        yield main_table, connections_table


@pytest.fixture
def sample_media():
    return Media(
        media_id="sintel",
        title="Sintel",
        duration_sec=888.0,
        poster_url="https://watchparty.chescloud.my.id/posters/sintel.jpg",
        playback_url="https://watchparty.chescloud.my.id/media/sintel/master.m3u8",
        license="CC BY 3.0",
        attribution="(c) copyright Blender Foundation",
    )


def test_create_room_and_get_summary(mock_dynamodb, sample_media):
    main_table, _ = mock_dynamodb
    repo = RoomRepository(table=main_table)

    room, host = repo.create_room(
        media=sample_media,
        host_display_name="Alice",
        host_user_id="cognito-sub-1234",
        max_participants=5,
    )

    assert room.room_id
    assert room.host_display_name == "Alice"
    assert room.max_participants == 5
    assert room.status == RoomStatus.OPEN
    assert host.role == Role.HOST
    assert host.display_name == "Alice"

    # Get summary
    summary = repo.get_room_summary(room.room_id)
    assert summary.room_id == room.room_id
    assert summary.participant_count == 0


def test_join_guest_and_capacity_check(mock_dynamodb, sample_media):
    main_table, _ = mock_dynamodb
    repo = RoomRepository(table=main_table)

    # Room with capacity 3 (1 host + 2 guests)
    room, _ = repo.create_room(
        media=sample_media,
        host_display_name="Alice",
        host_user_id="cognito-sub-1234",
        max_participants=3,
    )

    # Join guest 1
    r1, g1 = repo.join_guest(room.room_id, "Bob")
    assert g1.role == Role.VIEWER
    assert g1.display_name == "Bob"

    # Simulate guest capacity filled (connectedGuestCount = 2, maxParticipants - 1 = 2)
    main_table.update_item(
        Key={"PK": f"ROOM#{room.room_id}", "SK": "META"},
        UpdateExpression="SET connectedGuestCount = :val",
        ExpressionAttributeValues={":val": 2},
    )

    # Trying to join guest when capacity is full raises RoomFullError
    with pytest.raises(RoomFullError):
        repo.join_guest(room.room_id, "Charlie")


def test_update_participant_role(mock_dynamodb, sample_media):
    main_table, _ = mock_dynamodb
    repo = RoomRepository(table=main_table)

    room, _ = repo.create_room(
        media=sample_media,
        host_display_name="Alice",
        host_user_id="cognito-sub-1234",
    )
    _, guest = repo.join_guest(room.room_id, "Bob")

    # Promote viewer to controller
    updated = repo.update_participant_role(room.room_id, guest.participant_id, Role.CONTROLLER)
    assert updated.role == Role.CONTROLLER

    # Promoting to host is forbidden
    with pytest.raises(ForbiddenError):
        repo.update_participant_role(room.room_id, guest.participant_id, Role.HOST)


def test_playback_optimistic_concurrency(mock_dynamodb, sample_media):
    main_table, _ = mock_dynamodb
    room_repo = RoomRepository(table=main_table)
    pb_repo = PlaybackRepository(table=main_table)

    room, _ = room_repo.create_room(
        media=sample_media,
        host_display_name="Alice",
        host_user_id="cognito-sub-1234",
    )

    initial_state = pb_repo.get_playback_state(room.room_id)
    assert initial_state.version == 1
    assert initial_state.status == "paused"
    assert initial_state.position_sec == 0.0

    # Successful update with matching base_version=1
    updated = pb_repo.update_playback_state(
        room_id=room.room_id,
        action=PlaybackAction.PLAY,
        position_sec=15.0,
        base_version=1,
    )
    assert updated.version == 2
    assert updated.status == "playing"
    assert updated.position_sec == 15.0

    # Stale update with old base_version=1 raises VersionConflictError
    with pytest.raises(VersionConflictError):
        pb_repo.update_playback_state(
            room_id=room.room_id,
            action=PlaybackAction.PAUSE,
            position_sec=20.0,
            base_version=1,
        )


def test_connection_connect_and_disconnect(mock_dynamodb, sample_media):
    main_table, conn_table = mock_dynamodb
    room_repo = RoomRepository(table=main_table)
    conn_repo = ConnectionRepository(main_table=main_table, connections_table=conn_table)

    # Create room with maxParticipants = 3 (1 host + 2 guests)
    room, host = room_repo.create_room(
        media=sample_media,
        host_display_name="Alice",
        host_user_id="cognito-sub-1234",
        max_participants=3,
    )
    _, guest1 = room_repo.join_guest(room.room_id, "Bob")
    _, guest2 = room_repo.join_guest(room.room_id, "Charlie")

    # Host connects -> allowed
    status, _, role = conn_repo.handle_connect("conn-host-1", room.room_id, host.participant_id)
    assert status == "joined"
    assert role == Role.HOST

    # Guest 1 connects -> allowed, guest counter incremented to 1
    status, _, role = conn_repo.handle_connect("conn-guest-1", room.room_id, guest1.participant_id)
    assert status == "joined"
    assert role == Role.VIEWER

    # Guest 2 connects -> allowed, guest counter incremented to 2 (full)
    status, _, role = conn_repo.handle_connect("conn-guest-2", room.room_id, guest2.participant_id)
    assert status == "joined"

    # Guest 1 disconnects -> counter decremented
    should_broadcast, r_id, p_id, is_host = conn_repo.handle_disconnect("conn-guest-1")
    assert should_broadcast is True
    assert r_id == room.room_id
    assert p_id == guest1.participant_id
    assert is_host is False
