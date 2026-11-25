"""Amazon Cognito JWT verification using RS256 and cached JWKS."""

from functools import lru_cache
from os import getenv

import jwt
from jwt import PyJWKClient

from core.config import AWS_REGION, COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID
from core.errors import UnauthorizedError


@lru_cache(maxsize=4)
def get_cognito_jwk_client(jwks_url: str) -> PyJWKClient:
    """Returns a cached PyJWKClient for Cognito JWKS URL."""
    return PyJWKClient(jwks_url, cache_keys=True)


def verify_cognito_jwt(
    token: str,
    user_pool_id: str | None = None,
    client_id: str | None = None,
    region: str | None = None,
) -> str:
    """Verifies a Cognito RS256 access or ID token and returns its `sub` claim.

    Fails closed when Cognito configuration is missing or signature/claims are invalid.
    """
    pool_id = (
        user_pool_id
        if user_pool_id is not None
        else (getenv("COGNITO_USER_POOL_ID") or COGNITO_USER_POOL_ID)
    )
    app_client_id = (
        client_id
        if client_id is not None
        else (getenv("COGNITO_APP_CLIENT_ID") or getenv("COGNITO_CLIENT_ID") or COGNITO_CLIENT_ID)
    )
    aws_region = region if region is not None else (getenv("AWS_REGION") or AWS_REGION)

    if not pool_id or not app_client_id:
        raise UnauthorizedError("Cognito authentication is not configured.")

    issuer = f"https://cognito-idp.{aws_region}.amazonaws.com/{pool_id}"
    jwks_url = f"{issuer}/.well-known/jwks.json"

    try:
        jwk_client = get_cognito_jwk_client(jwks_url)
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={
                "require": ["exp", "sub", "iss", "token_use"],
                "verify_aud": False,
            },
        )
    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedError("Cognito token has expired.") from e
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError("Invalid Cognito token.") from e
    except Exception as e:
        raise UnauthorizedError("Failed to verify Cognito token.") from e

    token_use = decoded.get("token_use")
    if token_use == "access":
        if decoded.get("client_id") != app_client_id:
            raise UnauthorizedError("Invalid Cognito token client_id.")
    elif token_use == "id":
        aud = decoded.get("aud")
        valid_aud = aud == app_client_id or (isinstance(aud, list) and app_client_id in aud)
        if not valid_aud:
            raise UnauthorizedError("Invalid Cognito token audience.")
    else:
        raise UnauthorizedError("Unsupported Cognito token_use.")

    sub = decoded.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise UnauthorizedError("Cognito token is missing subject.")
    return sub
