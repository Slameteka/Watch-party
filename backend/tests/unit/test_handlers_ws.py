"""Unit tests for WebSocket handlers."""

import json

import boto3
import pytest
from moto import mock_aws

from core.auth.token import issue_room_token
from core.models.common import Role
from core.models.room import Media
from core.repository.connection_repo import ConnectionRepository
from core.repository.room_repo import RoomRepository
from handlers.ws_authorizer.handler import lambda_handler as auth_handler
from handlers.ws_connect.handler import lambda_handler as connect_handler
from handlers.ws_disconnect.handler import lambda_handler as disconnect_handler
from handlers.ws_message.handler import lambda_handler as message_handler


@pytest.fixture
def mock_ws_env():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
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
        conn_table = dynamodb.create_table(
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
        yield main_table, conn_table


@pytest.fixture
def sample_room_setup(mock_ws_env):
    main_table, _ = mock_ws_env
    repo = RoomRepository(table=main_table)
    media = Media(
        media_id="sintel",
        title="Sintel",
        duration_sec=888.0,
        poster_url="https://watchparty.chescloud.my.id/posters/sintel.jpg",
        playback_url="https://watchparty.chescloud.my.id/media/sintel/master.m3u8",
        license="CC BY 3.0",
        attribution="(c) copyright Blender Foundation",
    )
    room, host = repo.create_room(
        media=media,
        host_display_name="Alice",
        host_user_id="cognito-sub-1234",
        max_participants=5,
    )
    _, guest = repo.join_guest(room.room_id, "Bob")
    return room, host, guest


def test_ws_authorizer_valid_and_invalid(sample_room_setup):
    room, host, _ = sample_room_setup
    token, _ = issue_room_token(room.room_id, host.participant_id, Role.HOST)

    # Valid token
    event = {
        "queryStringParameters": {"token": token},
        "methodArn": "arn:aws:execute-api:ap-southeast-1:123456789012:api-id/prod/$connect",
    }
    res = auth_handler(event, None)
    assert res["principalId"] == host.participant_id
    assert res["policyDocument"]["Statement"][0]["Effect"] == "Allow"
    assert res["context"]["roomId"] == room.room_id
    assert res["context"]["role"] == "host"

    # Missing token -> Exception
    with pytest.raises(Exception, match="Unauthorized"):
        auth_handler({"queryStringParameters": {}}, None)


def test_ws_connect_and_disconnect(sample_room_setup, mocker):
    room, host, guest = sample_room_setup

    # Mock gateway post_to_connection
    mock_post = mocker.patch("core.broadcast.gateway.get_apigw_client")
    mock_client = mocker.MagicMock()
    mock_post.return_value = mock_client

    connect_event = {
        "requestContext": {
            "connectionId": "conn-host-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
            "authorizer": {
                "roomId": room.room_id,
                "participantId": host.participant_id,
                "role": "host",
            },
        }
    }
    res = connect_handler(connect_event, None)
    assert res["statusCode"] == 200

    # Disconnect
    disconnect_event = {
        "requestContext": {
            "connectionId": "conn-host-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
        }
    }
    res = disconnect_handler(disconnect_event, None)
    assert res["statusCode"] == 200


def test_ws_message_playback_command(sample_room_setup, mocker):
    room, host, guest = sample_room_setup

    # Establish connections in table
    conn_repo = ConnectionRepository()
    conn_repo.handle_connect("conn-host-1", room.room_id, host.participant_id)
    conn_repo.handle_connect("conn-guest-1", room.room_id, guest.participant_id)

    # Mock gateway
    mock_post = mocker.patch("core.broadcast.gateway.get_apigw_client")
    mock_client = mocker.MagicMock()
    mock_post.return_value = mock_client

    # 1. Host sends play command
    play_msg = {
        "v": 1,
        "type": "playback.command",
        "requestId": "req-play-1",
        "sentAtMs": 1700000000000,
        "payload": {
            "action": "play",
            "positionSec": 10.0,
            "baseVersion": 1,
        },
    }
    event = {
        "requestContext": {
            "connectionId": "conn-host-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
        },
        "body": json.dumps(play_msg),
    }
    res = message_handler(event, None)
    assert res["statusCode"] == 200
    assert mock_client.post_to_connection.called

    # 2. Viewer tries to send playback command -> rejected with FORBIDDEN
    mock_client.reset_mock()
    viewer_event = {
        "requestContext": {
            "connectionId": "conn-guest-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
        },
        "body": json.dumps(play_msg),
    }
    res = message_handler(viewer_event, None)
    assert res["statusCode"] == 200
    call_args = mock_client.post_to_connection.call_args[1]
    sent_data = json.loads(call_args["Data"].decode("utf-8"))
    assert sent_data["type"] == "error"
    assert sent_data["payload"]["code"] == "FORBIDDEN"


def test_ws_message_chat_and_clock_ping(sample_room_setup, mocker):
    room, host, _ = sample_room_setup
    conn_repo = ConnectionRepository()
    conn_repo.handle_connect("conn-host-1", room.room_id, host.participant_id)

    mock_post = mocker.patch("core.broadcast.gateway.get_apigw_client")
    mock_client = mocker.MagicMock()
    mock_post.return_value = mock_client

    # Clock Ping
    ping_msg = {
        "v": 1,
        "type": "clock.ping",
        "requestId": "req-ping-1",
        "sentAtMs": 1700000000000,
        "payload": {"clientSendMs": 1700000000000},
    }
    event = {
        "requestContext": {
            "connectionId": "conn-host-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
        },
        "body": json.dumps(ping_msg),
    }
    res = message_handler(event, None)
    assert res["statusCode"] == 200
    call_args = mock_client.post_to_connection.call_args[1]
    sent_data = json.loads(call_args["Data"].decode("utf-8"))
    assert sent_data["type"] == "clock.pong"
    assert sent_data["payload"]["clientSendMs"] == 1700000000000


def test_ws_message_player_status_broadcast(sample_room_setup, mocker):
    room, host, guest = sample_room_setup
    conn_repo = ConnectionRepository()
    conn_repo.handle_connect("conn-host-1", room.room_id, host.participant_id)
    conn_repo.handle_connect("conn-guest-1", room.room_id, guest.participant_id)

    mock_post = mocker.patch("core.broadcast.gateway.get_apigw_client")
    mock_client = mocker.MagicMock()
    mock_post.return_value = mock_client

    status_msg = {
        "v": 1,
        "type": "player.status",
        "requestId": "req-status-1",
        "sentAtMs": 1700000000000,
        "payload": {"status": "buffering"},
    }
    event = {
        "requestContext": {
            "connectionId": "conn-guest-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
        },
        "body": json.dumps(status_msg),
    }
    res = message_handler(event, None)
    assert res["statusCode"] == 200
    assert mock_client.post_to_connection.called

    # Verify participant.updated was broadcast to connection
    call_args = mock_client.post_to_connection.call_args[1]
    sent_data = json.loads(call_args["Data"].decode("utf-8"))
    assert sent_data["type"] == "participant.updated"
    assert sent_data["payload"]["participant"]["participantId"] == guest.participant_id
    assert sent_data["payload"]["participant"]["playerStatus"] == "buffering"


def test_ws_message_reaction_broadcast(sample_room_setup, mocker):
    room, host, _ = sample_room_setup
    conn_repo = ConnectionRepository()
    conn_repo.handle_connect("conn-host-1", room.room_id, host.participant_id)

    mock_post = mocker.patch("core.broadcast.gateway.get_apigw_client")
    mock_client = mocker.MagicMock()
    mock_post.return_value = mock_client

    reaction_msg = {
        "v": 1,
        "type": "reaction.send",
        "requestId": "req-rx-1",
        "sentAtMs": 1700000000000,
        "payload": {"emoji": "heart"},
    }
    event = {
        "requestContext": {
            "connectionId": "conn-host-1",
            "domainName": "ws.watchparty.chescloud.my.id",
            "stage": "prod",
        },
        "body": json.dumps(reaction_msg),
    }
    res = message_handler(event, None)
    assert res["statusCode"] == 200
    assert mock_client.post_to_connection.called

    call_args = mock_client.post_to_connection.call_args[1]
    sent_data = json.loads(call_args["Data"].decode("utf-8"))
    assert sent_data["type"] == "reaction.added"
    assert sent_data["payload"] == {
        "participantId": host.participant_id,
        "emoji": "heart",
    }
