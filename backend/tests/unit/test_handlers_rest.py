"""Unit tests for REST API handlers."""

import json
import sys
from types import SimpleNamespace

import boto3
import pytest
from moto import mock_aws

from core.errors import UnauthorizedError
from core.repository.connection_repo import ConnectionRepository
from handlers.rest_api.app import lambda_handler

rest_app = sys.modules["handlers.rest_api.app"]


@pytest.fixture
def mock_aws_env():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
        dynamodb.create_table(
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
        dynamodb.create_table(
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
        yield


def create_api_event(
    method: str,
    path: str,
    body: dict | None = None,
    headers: dict | None = None,
    authorizer_sub: str | None = None,
) -> dict:
    all_headers = {
        "content-type": "application/json",
        "host": "api.watchparty.chescloud.my.id",
    }
    if headers:
        for k, v in headers.items():
            all_headers[k.lower()] = v

    request_context: dict = {
        "stage": "$default",
        "http": {
            "method": method,
            "path": path,
            "protocol": "HTTP/1.1",
        },
    }
    if authorizer_sub is not None:
        request_context["authorizer"] = {
            "jwt": {
                "claims": {"sub": authorizer_sub},
            }
        }

    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": "",
        "headers": all_headers,
        "requestContext": request_context,
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }


def test_rest_health(mock_aws_env):
    event = create_api_event("GET", "/health")
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {"status": "ok"}


def test_rest_catalog(mock_aws_env):
    event = create_api_event("GET", "/catalog")
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert "items" in body
    assert len(body["items"]) >= 1
    assert body["items"][0]["mediaId"] == "sintel"


def test_rest_create_room_and_join(mock_aws_env):
    # 1. Create Room
    create_event = create_api_event(
        "POST",
        "/rooms",
        body={"mediaId": "sintel", "displayName": "Alice", "maxParticipants": 5},
    )
    res = lambda_handler(create_event, None)
    assert res["statusCode"] == 201
    created = json.loads(res["body"])
    assert "room" in created
    assert "session" in created
    room_id = created["room"]["roomId"]
    host_token = created["session"]["roomToken"]
    assert host_token != ""
    assert created["session"]["role"] == "host"

    # 2. Get Room Summary
    get_event = create_api_event("GET", f"/rooms/{room_id}")
    res = lambda_handler(get_event, None)
    assert res["statusCode"] == 200
    room_summary = json.loads(res["body"])
    assert room_summary["roomId"] == room_id
    assert room_summary["hostDisplayName"] == "Alice"

    # 3. Join Guest
    join_event = create_api_event(
        "POST",
        f"/rooms/{room_id}/join",
        body={"displayName": "Bob"},
    )
    res = lambda_handler(join_event, None)
    assert res["statusCode"] == 200
    guest_session = json.loads(res["body"])
    assert guest_session["role"] == "viewer"
    assert guest_session["displayName"] == "Bob"
    guest_token = guest_session["roomToken"]

    # 4. Refresh Guest Session
    refresh_event = create_api_event(
        "POST",
        f"/rooms/{room_id}/session/refresh",
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    res = lambda_handler(refresh_event, None)
    assert res["statusCode"] == 200
    refreshed = json.loads(res["body"])
    assert refreshed["participantId"] == guest_session["participantId"]
    assert refreshed["roomToken"] != ""


def test_rest_validation_error(mock_aws_env):
    # Invalid display name (empty)
    event = create_api_event(
        "POST",
        "/rooms",
        body={"mediaId": "sintel", "displayName": "   "},
    )
    res = lambda_handler(event, None)
    assert res["statusCode"] == 400
    body = json.loads(res["body"])
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_rest_cognito_host_rejoin_and_reject_forged_bearer(mock_aws_env, monkeypatch):
    def fake_verify(token: str) -> str:
        if token == "valid-host-jwt":
            return "cognito-sub-host-1"
        if token == "valid-other-jwt":
            return "cognito-sub-other"
        raise UnauthorizedError("Invalid token")

    monkeypatch.setattr(rest_app, "verify_cognito_jwt", fake_verify)

    create_res = lambda_handler(
        create_api_event(
            "POST",
            "/rooms",
            body={"mediaId": "sintel", "displayName": "Alice"},
            authorizer_sub="cognito-sub-host-1",
        ),
        None,
    )
    assert create_res["statusCode"] == 201
    created = json.loads(create_res["body"])
    room_id = created["room"]["roomId"]
    host_participant_id = created["session"]["participantId"]

    # Spoofed/raw sub string as bearer must NOT grant host role
    spoof_res = lambda_handler(
        create_api_event(
            "POST",
            f"/rooms/{room_id}/join",
            body={"displayName": "Attacker"},
            headers={"Authorization": "Bearer cognito-sub-host-1"},
        ),
        None,
    )
    assert spoof_res["statusCode"] == 200
    assert json.loads(spoof_res["body"])["role"] == "viewer"

    # Valid JWT of a different user joins as viewer
    other_res = lambda_handler(
        create_api_event(
            "POST",
            f"/rooms/{room_id}/join",
            body={"displayName": "Bob"},
            headers={"Authorization": "Bearer valid-other-jwt"},
        ),
        None,
    )
    assert other_res["statusCode"] == 200
    assert json.loads(other_res["body"])["role"] == "viewer"

    # Valid JWT matching host sub returns host session with original participantId
    rejoin_res = lambda_handler(
        create_api_event(
            "POST",
            f"/rooms/{room_id}/join",
            body={"displayName": "Alice"},
            headers={"Authorization": "Bearer valid-host-jwt"},
        ),
        None,
    )
    assert rejoin_res["statusCode"] == 200
    rejoined = json.loads(rejoin_res["body"])
    assert rejoined["role"] == "host"
    assert rejoined["participantId"] == host_participant_id


def test_rest_grant_and_revoke_controller(mock_aws_env, monkeypatch):
    monkeypatch.setenv("WS_MANAGEMENT_ENDPOINT", "https://ws.example.test/prod")
    broadcasts = []
    monkeypatch.setattr(
        rest_app,
        "broadcast_to_room",
        lambda endpoint_url, room_id, message: broadcasts.append((endpoint_url, room_id, message)),
    )

    created = json.loads(
        lambda_handler(
            create_api_event("POST", "/rooms", body={"mediaId": "sintel", "displayName": "Host"}),
            None,
        )["body"]
    )
    room_id = created["room"]["roomId"]
    host_id = created["session"]["participantId"]
    host_token = created["session"]["roomToken"]

    guest = json.loads(
        lambda_handler(
            create_api_event("POST", f"/rooms/{room_id}/join", body={"displayName": "Budi"}),
            None,
        )["body"]
    )
    guest_id = guest["participantId"]
    guest_token = guest["roomToken"]

    # Non-host cannot grant controller
    forbid_res = lambda_handler(
        create_api_event(
            "PUT",
            f"/rooms/{room_id}/controllers/{guest_id}",
            headers={"Authorization": f"Bearer {guest_token}"},
        ),
        None,
    )
    assert forbid_res["statusCode"] == 403

    # Host cannot modify self role
    self_res = lambda_handler(
        create_api_event(
            "PUT",
            f"/rooms/{room_id}/controllers/{host_id}",
            headers={"Authorization": f"Bearer {host_token}"},
        ),
        None,
    )
    assert self_res["statusCode"] == 403

    # Unknown participant returns 404
    missing_res = lambda_handler(
        create_api_event(
            "PUT",
            f"/rooms/{room_id}/controllers/p_missing",
            headers={"Authorization": f"Bearer {host_token}"},
        ),
        None,
    )
    assert missing_res["statusCode"] == 404

    # Host grants controller (and idempotent repeat)
    grant_res = lambda_handler(
        create_api_event(
            "PUT",
            f"/rooms/{room_id}/controllers/{guest_id}",
            headers={"Authorization": f"Bearer {host_token}"},
        ),
        None,
    )
    assert grant_res["statusCode"] == 200
    assert json.loads(grant_res["body"])["role"] == "controller"

    # Host revokes controller back to viewer
    revoke_res = lambda_handler(
        create_api_event(
            "DELETE",
            f"/rooms/{room_id}/controllers/{guest_id}",
            headers={"Authorization": f"Bearer {host_token}"},
        ),
        None,
    )
    assert revoke_res["statusCode"] == 200
    assert json.loads(revoke_res["body"])["role"] == "viewer"
    assert [m.type for _, _, m in broadcasts] == ["participant.updated", "participant.updated"]


def test_rest_kick_participant_and_blocks_session(mock_aws_env, monkeypatch):
    monkeypatch.setenv("WS_MANAGEMENT_ENDPOINT", "https://ws.example.test/prod")
    sent_direct = []
    deleted_conns = []
    broadcasts = []

    monkeypatch.setattr(
        rest_app,
        "send_to_connection",
        lambda endpoint_url, connection_id, message: (
            sent_direct.append((connection_id, message)) or True
        ),
    )
    monkeypatch.setattr(
        rest_app,
        "get_apigw_client",
        lambda _endpoint: SimpleNamespace(
            delete_connection=lambda ConnectionId: deleted_conns.append(ConnectionId)
        ),
    )
    monkeypatch.setattr(
        rest_app,
        "broadcast_to_room",
        lambda endpoint_url, room_id, message: broadcasts.append((room_id, message)),
    )

    created = json.loads(
        lambda_handler(
            create_api_event("POST", "/rooms", body={"mediaId": "sintel", "displayName": "Host"}),
            None,
        )["body"]
    )
    room_id = created["room"]["roomId"]
    host_id = created["session"]["participantId"]
    host_token = created["session"]["roomToken"]

    guest = json.loads(
        lambda_handler(
            create_api_event("POST", f"/rooms/{room_id}/join", body={"displayName": "Budi"}),
            None,
        )["body"]
    )
    guest_id = guest["participantId"]
    guest_token = guest["roomToken"]

    # Connect guest over WebSocket repo so connectedGuestCount = 1 and connectionId exists
    ConnectionRepository().handle_connect("conn-guest-1", room_id, guest_id)

    # Viewer cannot kick
    assert (
        lambda_handler(
            create_api_event(
                "DELETE",
                f"/rooms/{room_id}/participants/{host_id}",
                headers={"Authorization": f"Bearer {guest_token}"},
            ),
            None,
        )["statusCode"]
        == 403
    )

    # Host cannot kick self
    assert (
        lambda_handler(
            create_api_event(
                "DELETE",
                f"/rooms/{room_id}/participants/{host_id}",
                headers={"Authorization": f"Bearer {host_token}"},
            ),
            None,
        )["statusCode"]
        == 403
    )

    # Host kicks guest -> 204
    kick_res = lambda_handler(
        create_api_event(
            "DELETE",
            f"/rooms/{room_id}/participants/{guest_id}",
            headers={"Authorization": f"Bearer {host_token}"},
        ),
        None,
    )
    assert kick_res["statusCode"] == 204
    assert sent_direct[0][0] == "conn-guest-1"
    assert sent_direct[0][1].type == "session.ended"
    assert sent_direct[0][1].payload.reason == "kicked"
    assert deleted_conns == ["conn-guest-1"]
    assert broadcasts[0][1].type == "participant.left"
    assert broadcasts[0][1].payload.participant_id == guest_id
    assert broadcasts[0][1].payload.reason == "kicked"

    # Kicked guest is rejected on session/refresh (403)
    refresh_res = lambda_handler(
        create_api_event(
            "POST",
            f"/rooms/{room_id}/session/refresh",
            headers={"Authorization": f"Bearer {guest_token}"},
        ),
        None,
    )
    assert refresh_res["statusCode"] == 403

    # Guest seat is freed (connectedGuestCount == 0 -> participant_count == 0)
    summary = json.loads(lambda_handler(create_api_event("GET", f"/rooms/{room_id}"), None)["body"])
    assert summary["participantCount"] == 0
