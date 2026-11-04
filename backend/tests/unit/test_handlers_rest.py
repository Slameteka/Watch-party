"""Unit tests for REST API handlers."""

import json

import boto3
import pytest
from moto import mock_aws

from handlers.rest_api.app import lambda_handler


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
        yield


def create_api_event(
    method: str,
    path: str,
    body: dict | None = None,
    headers: dict | None = None,
) -> dict:
    all_headers = {
        "content-type": "application/json",
        "host": "api.watchparty.chescloud.my.id",
    }
    if headers:
        for k, v in headers.items():
            all_headers[k.lower()] = v

    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": "",
        "headers": all_headers,
        "requestContext": {
            "stage": "$default",
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
            },
        },
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
