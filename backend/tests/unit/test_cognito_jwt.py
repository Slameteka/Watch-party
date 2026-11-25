"""Unit tests for Amazon Cognito RS256 JWT verification."""

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from core.auth import cognito as cognito_module
from core.errors import UnauthorizedError


@pytest.fixture
def rsa_keys():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key(), other_private_key


def _make_token(
    private_key,
    *,
    sub: str = "cognito-sub-123",
    iss: str = "https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_TestPool",
    token_use: str = "access",
    client_id: str | None = "test-client-id",
    aud: str | None = None,
    exp_offset_sec: int = 300,
) -> str:
    now = int(time.time())
    payload: dict[str, object] = {
        "sub": sub,
        "iss": iss,
        "token_use": token_use,
        "iat": now,
        "exp": now + exp_offset_sec,
    }
    if client_id is not None:
        payload["client_id"] = client_id
    if aud is not None:
        payload["aud"] = aud
    return jwt.encode(payload, private_key, algorithm="RS256")


def test_verify_cognito_access_and_id_tokens(monkeypatch, rsa_keys):
    private_key, public_key, _ = rsa_keys
    monkeypatch.setattr(
        cognito_module,
        "get_cognito_jwk_client",
        lambda _url: SimpleNamespace(
            get_signing_key_from_jwt=lambda _tok: SimpleNamespace(key=public_key)
        ),
    )

    access_token = _make_token(private_key, sub="sub-access", token_use="access")
    assert (
        cognito_module.verify_cognito_jwt(
            access_token,
            user_pool_id="ap-southeast-1_TestPool",
            client_id="test-client-id",
            region="ap-southeast-1",
        )
        == "sub-access"
    )

    id_token = _make_token(
        private_key,
        sub="sub-id",
        token_use="id",
        client_id=None,
        aud="test-client-id",
    )
    assert (
        cognito_module.verify_cognito_jwt(
            id_token,
            user_pool_id="ap-southeast-1_TestPool",
            client_id="test-client-id",
            region="ap-southeast-1",
        )
        == "sub-id"
    )


def test_verify_cognito_jwt_rejects_invalid_tokens(monkeypatch, rsa_keys):
    private_key, public_key, other_key = rsa_keys
    monkeypatch.setattr(
        cognito_module,
        "get_cognito_jwk_client",
        lambda _url: SimpleNamespace(
            get_signing_key_from_jwt=lambda _tok: SimpleNamespace(key=public_key)
        ),
    )

    kwargs = {
        "user_pool_id": "ap-southeast-1_TestPool",
        "client_id": "test-client-id",
        "region": "ap-southeast-1",
    }

    # Expired token
    expired = _make_token(private_key, exp_offset_sec=-10)
    with pytest.raises(UnauthorizedError):
        cognito_module.verify_cognito_jwt(expired, **kwargs)

    # Wrong signature
    forged = _make_token(other_key)
    with pytest.raises(UnauthorizedError):
        cognito_module.verify_cognito_jwt(forged, **kwargs)

    # Wrong client_id on access token
    wrong_client = _make_token(private_key, client_id="other-client")
    with pytest.raises(UnauthorizedError):
        cognito_module.verify_cognito_jwt(wrong_client, **kwargs)

    # Wrong aud on id token
    wrong_aud = _make_token(private_key, token_use="id", client_id=None, aud="other-client")
    with pytest.raises(UnauthorizedError):
        cognito_module.verify_cognito_jwt(wrong_aud, **kwargs)

    # Unsupported token_use
    bad_use = _make_token(private_key, token_use="refresh")
    with pytest.raises(UnauthorizedError):
        cognito_module.verify_cognito_jwt(bad_use, **kwargs)

    # Fail closed when config missing
    valid = _make_token(private_key)
    with pytest.raises(UnauthorizedError):
        cognito_module.verify_cognito_jwt(valid, user_pool_id="", client_id="")
