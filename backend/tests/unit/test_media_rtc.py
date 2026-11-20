"""Tests for secret lookup, CloudFront signed cookies, and the media-cookies / rtc-token routes."""

import base64
import importlib
import json
import os
import time

import boto3
import jwt
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from moto import mock_aws

from core import secret_store
from core.auth import cloudfront
from core.errors import InternalError
from handlers.rest_api.app import lambda_handler
from tests.unit.test_handlers_rest import create_api_event

DOMAIN = "watchparty.chescloud.my.id"
KEY_PAIR_ID = "K2TESTKEYPAIRID"
LIVEKIT_KEY = "APItestkey"
LIVEKIT_SECRET = "livekit-test-secret-at-least-32-characters"

# handlers.rest_api exports the resolver as `app`, so import the module explicitly.
rest_app = importlib.import_module("handlers.rest_api.app")


def cloudfront_b64decode(value: str) -> bytes:
    return base64.b64decode(value.translate(str.maketrans("-_~", "+=/")))


@pytest.fixture(scope="module")
def rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def private_key_pem(rsa_key) -> str:
    return rsa_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


@pytest.fixture(autouse=True)
def clean_secrets(monkeypatch):
    for name in (
        "AWS_LAMBDA_FUNCTION_NAME",
        "CLOUDFRONT_PRIVATE_KEY_PEM",
        "CLOUDFRONT_PRIVATE_KEY_NAME",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_KEY_NAME",
        "LIVEKIT_API_SECRET",
        "LIVEKIT_API_SECRET_NAME",
        "ROOM_TOKEN_SECRET_NAME",
    ):
        monkeypatch.delenv(name, raising=False)
    secret_store.clear_cache()
    yield
    secret_store.clear_cache()


@pytest.fixture
def aws():
    with mock_aws():
        boto3.resource("dynamodb", region_name="ap-southeast-1").create_table(
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


@pytest.fixture
def signing(monkeypatch, private_key_pem):
    monkeypatch.setenv("CLOUDFRONT_PRIVATE_KEY_PEM", private_key_pem)
    monkeypatch.setattr(rest_app, "CLOUDFRONT_KEY_PAIR_ID", KEY_PAIR_ID)
    monkeypatch.setattr(rest_app, "MEDIA_DOMAIN", DOMAIN)


@pytest.fixture
def livekit(monkeypatch):
    monkeypatch.setenv("LIVEKIT_API_KEY", LIVEKIT_KEY)
    monkeypatch.setenv("LIVEKIT_API_SECRET", LIVEKIT_SECRET)
    monkeypatch.setattr(rest_app, "LIVEKIT_URL", f"wss://rtc.{DOMAIN}")


def create_room_and_guest() -> dict:
    res = lambda_handler(
        create_api_event("POST", "/rooms", body={"mediaId": "sintel", "displayName": "Alice"}),
        None,
    )
    assert res["statusCode"] == 201
    created = json.loads(res["body"])
    room_id = created["room"]["roomId"]
    res = lambda_handler(
        create_api_event("POST", f"/rooms/{room_id}/join", body={"displayName": "Bob"}), None
    )
    guest = json.loads(res["body"])
    return {"room_id": room_id, "guest_id": guest["participantId"], "token": guest["roomToken"]}


def call(path: str, token: str | None) -> dict:
    headers = {"Authorization": f"Bearer {token}"} if token else None
    return lambda_handler(create_api_event("POST", path, headers=headers), None)


def table():
    return boto3.resource("dynamodb", region_name="ap-southeast-1").Table("watchparty-test-main")


# ---------------------------------------------------------------- secret_store


def test_secret_from_env_outside_lambda(monkeypatch):
    monkeypatch.setenv("LIVEKIT_API_KEY", "local-value")
    assert secret_store.get_secret("LIVEKIT_API_KEY", "LIVEKIT_API_KEY_NAME") == "local-value"


def test_plain_env_value_is_ignored_in_lambda(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "watchparty-test-rest-api")
    monkeypatch.setenv("LIVEKIT_API_KEY", "must-not-be-used")
    with pytest.raises(secret_store.SecretNotConfiguredError):
        secret_store.get_secret("LIVEKIT_API_KEY", "LIVEKIT_API_KEY_NAME")


def test_secret_from_ssm_in_lambda(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "watchparty-test-rest-api")
    monkeypatch.setenv("LIVEKIT_API_KEY_NAME", "/watchparty/test/livekit-api-key")
    with mock_aws():
        boto3.client("ssm", region_name="ap-southeast-1").put_parameter(
            Name="/watchparty/test/livekit-api-key", Value="from-ssm", Type="SecureString"
        )
        assert secret_store.get_secret("LIVEKIT_API_KEY", "LIVEKIT_API_KEY_NAME") == "from-ssm"


def test_missing_ssm_parameter_fails_closed(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "watchparty-test-rest-api")
    monkeypatch.setenv("LIVEKIT_API_KEY_NAME", "/watchparty/test/does-not-exist")
    with mock_aws(), pytest.raises(InternalError):
        secret_store.get_secret("LIVEKIT_API_KEY", "LIVEKIT_API_KEY_NAME")


def test_room_token_has_no_hardcoded_fallback_in_lambda(monkeypatch):
    from core.auth.token import issue_room_token

    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "watchparty-test-rest-api")
    with pytest.raises(secret_store.SecretNotConfiguredError):
        issue_room_token("aZ3kP9qL2mXw", "p_Q8w2Ez7Rt5Yu1Io3", "viewer")


# ---------------------------------------------------------------- cloudfront signer


def test_cloudfront_b64_uses_url_safe_characters():
    encoded = cloudfront.cloudfront_b64encode(b"\xfb\xff\xfe?")
    assert not set(encoded) & set("+=/")
    assert cloudfront_b64decode(encoded) == b"\xfb\xff\xfe?"


def test_policy_has_no_whitespace_and_one_statement():
    policy = cloudfront.build_policy(f"https://{DOMAIN}/media/sintel/*", 1767290400)
    assert b" " not in policy
    assert json.loads(policy) == {
        "Statement": [
            {
                "Resource": f"https://{DOMAIN}/media/sintel/*",
                "Condition": {"DateLessThan": {"AWS:EpochTime": 1767290400}},
            }
        ]
    }


def test_signature_verifies_with_public_key(rsa_key, private_key_pem):
    values = cloudfront.sign_cookies(
        cloudfront.media_resource(DOMAIN, "sintel"), 1767290400, KEY_PAIR_ID, private_key_pem
    )
    assert set(values) == {"CloudFront-Policy", "CloudFront-Signature", "CloudFront-Key-Pair-Id"}
    policy = cloudfront_b64decode(values["CloudFront-Policy"])
    signature = cloudfront_b64decode(values["CloudFront-Signature"])
    rsa_key.public_key().verify(signature, policy, padding.PKCS1v15(), hashes.SHA1())


# ---------------------------------------------------------------- POST /media-cookies


def test_media_cookies_sets_three_scoped_cookies(aws, signing, rsa_key):
    ctx = create_room_and_guest()
    before = int(time.time())
    res = call(f"/rooms/{ctx['room_id']}/media-cookies", ctx["token"])
    assert res["statusCode"] == 204

    cookies = {c.split("=", 1)[0]: c for c in res["cookies"]}
    assert set(cookies) == {"CloudFront-Policy", "CloudFront-Signature", "CloudFront-Key-Pair-Id"}
    for header in cookies.values():
        attrs = {a.strip() for a in header.split(";")[1:]}
        assert attrs == {f"Domain={DOMAIN}", "Path=/media/", "Secure", "HttpOnly", "SameSite=Lax"}

    value = {name: h.split(";", 1)[0].split("=", 1)[1] for name, h in cookies.items()}
    assert value["CloudFront-Key-Pair-Id"] == KEY_PAIR_ID
    policy_bytes = cloudfront_b64decode(value["CloudFront-Policy"])
    statement = json.loads(policy_bytes)["Statement"][0]
    assert statement["Resource"] == f"https://{DOMAIN}/media/sintel/*"
    expires = statement["Condition"]["DateLessThan"]["AWS:EpochTime"]
    assert before + 7200 <= expires <= int(time.time()) + 7200
    rsa_key.public_key().verify(
        cloudfront_b64decode(value["CloudFront-Signature"]),
        policy_bytes,
        padding.PKCS1v15(),
        hashes.SHA1(),
    )


def test_media_cookies_requires_token(aws, signing):
    ctx = create_room_and_guest()
    assert call(f"/rooms/{ctx['room_id']}/media-cookies", None)["statusCode"] == 401


def test_media_cookies_rejects_token_for_other_room(aws, signing):
    ctx = create_room_and_guest()
    assert call("/rooms/zZ9zZ9zZ9zZ9/media-cookies", ctx["token"])["statusCode"] == 403


def test_media_cookies_rejects_kicked_participant(aws, signing):
    ctx = create_room_and_guest()
    table().update_item(
        Key={"PK": f"ROOM#{ctx['room_id']}", "SK": f"PARTICIPANT#{ctx['guest_id']}"},
        UpdateExpression="SET kicked = :t",
        ExpressionAttributeValues={":t": True},
    )
    res = call(f"/rooms/{ctx['room_id']}/media-cookies", ctx["token"])
    assert res["statusCode"] == 403
    assert "cookies" not in res or not res["cookies"]


def test_media_cookies_returns_410_when_room_closed(aws, signing):
    ctx = create_room_and_guest()
    table().update_item(
        Key={"PK": f"ROOM#{ctx['room_id']}", "SK": "META"},
        UpdateExpression="SET #s = :c",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":c": "closed"},
    )
    res = call(f"/rooms/{ctx['room_id']}/media-cookies", ctx["token"])
    assert res["statusCode"] == 410
    assert json.loads(res["body"])["error"]["code"] == "ROOM_CLOSED"


def test_media_cookies_local_mode_without_key_returns_204_without_cookies(aws):
    ctx = create_room_and_guest()
    res = call(f"/rooms/{ctx['room_id']}/media-cookies", ctx["token"])
    assert res["statusCode"] == 204
    assert not res.get("cookies")


def test_media_cookies_fails_closed_in_lambda_without_key(aws, monkeypatch):
    ctx = create_room_and_guest()
    # Inside Lambda every secret comes from SSM, including the room token key.
    boto3.client("ssm", region_name="ap-southeast-1").put_parameter(
        Name="/watchparty/test/room-token-signing-key",
        Value=os.environ["ROOM_TOKEN_SECRET"],
        Type="SecureString",
    )
    monkeypatch.setenv("ROOM_TOKEN_SECRET_NAME", "/watchparty/test/room-token-signing-key")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "watchparty-test-rest-api")
    res = call(f"/rooms/{ctx['room_id']}/media-cookies", ctx["token"])
    assert res["statusCode"] == 500
    assert json.loads(res["body"])["error"]["code"] == "INTERNAL_ERROR"
    assert not res.get("cookies")


# ---------------------------------------------------------------- POST /rtc-token


def test_rtc_token_grants_and_ttl(aws, livekit):
    ctx = create_room_and_guest()
    res = call(f"/rooms/{ctx['room_id']}/rtc-token", ctx["token"])
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["url"] == f"wss://rtc.{DOMAIN}"

    claims = jwt.decode(body["token"], LIVEKIT_SECRET, algorithms=["HS256"])
    assert claims["iss"] == LIVEKIT_KEY
    assert claims["sub"] == ctx["guest_id"]
    assert claims["name"] == "Bob"
    assert claims["exp"] - claims["nbf"] == 600
    assert abs(body["expiresAtMs"] - claims["exp"] * 1000) <= 2000
    video = claims["video"]
    assert video["roomJoin"] is True
    assert video["room"] == ctx["room_id"]
    assert video["canPublish"] is True
    assert video["canSubscribe"] is True
    assert video["canPublishData"] is False


def test_rtc_token_without_livekit_secret_is_500_not_a_fallback_token(aws):
    ctx = create_room_and_guest()
    res = call(f"/rooms/{ctx['room_id']}/rtc-token", ctx["token"])
    assert res["statusCode"] == 500
    assert "token" not in json.loads(res["body"])


def test_rtc_token_rejects_kicked_participant(aws, livekit):
    ctx = create_room_and_guest()
    table().update_item(
        Key={"PK": f"ROOM#{ctx['room_id']}", "SK": f"PARTICIPANT#{ctx['guest_id']}"},
        UpdateExpression="SET kicked = :t",
        ExpressionAttributeValues={":t": True},
    )
    assert call(f"/rooms/{ctx['room_id']}/rtc-token", ctx["token"])["statusCode"] == 403
