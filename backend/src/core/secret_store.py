"""Secret lookup for Lambda (SSM Parameter Store) and local dev/tests (plain env vars).

In Lambda, secrets are read only from SSM SecureString parameters named by the
``*_NAME`` environment variables that Terraform sets. Plain value variables are
ignored there, so a secret can never sneak into the Lambda configuration and
there is no hardcoded fallback: a missing secret fails closed.

Outside Lambda (local server, pytest), a plain value variable such as
``ROOM_TOKEN_SECRET`` is used when present.

Values are cached for the lifetime of the Lambda execution environment. Rotating
a secret therefore needs new execution environments (update the function
configuration or redeploy), which key rotation does anyway.
"""

import os
from functools import cache

import boto3
from aws_lambda_powertools import Logger
from botocore.exceptions import BotoCoreError, ClientError

from core.config import AWS_REGION
from core.errors import InternalError

logger = Logger(child=True)


class SecretNotConfiguredError(InternalError):
    """Raised when a required secret is missing or cannot be read."""


def running_in_lambda() -> bool:
    return bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


@cache
def _read_ssm_secure_string(name: str) -> str:
    client = boto3.client("ssm", region_name=AWS_REGION)
    try:
        response = client.get_parameter(Name=name, WithDecryption=True)
    except (ClientError, BotoCoreError) as e:
        # Log the parameter name, never the value; the client only sees a generic 500.
        logger.exception("Failed to read SSM parameter", extra={"parameter_name": name})
        raise SecretNotConfiguredError() from e
    return response["Parameter"]["Value"]


def get_secret(value_env: str, name_env: str) -> str:
    """Returns a secret value.

    Args:
        value_env: env var holding the plain value (local dev and tests only).
        name_env: env var holding the SSM parameter name (set by Terraform).

    Raises:
        SecretNotConfiguredError: if the secret is not configured or unreadable.
    """
    in_lambda = running_in_lambda()
    if not in_lambda:
        value = os.getenv(value_env, "")
        if value:
            return value

    name = os.getenv(name_env, "")
    if name:
        return _read_ssm_secure_string(name)

    logger.error("Secret not configured", extra={"name_env": name_env, "in_lambda": in_lambda})
    raise SecretNotConfiguredError()


def room_token_secret() -> str:
    return get_secret("ROOM_TOKEN_SECRET", "ROOM_TOKEN_SECRET_NAME")


def cloudfront_private_key_pem() -> str:
    return get_secret("CLOUDFRONT_PRIVATE_KEY_PEM", "CLOUDFRONT_PRIVATE_KEY_NAME")


def livekit_api_credentials() -> tuple[str, str]:
    return (
        get_secret("LIVEKIT_API_KEY", "LIVEKIT_API_KEY_NAME"),
        get_secret("LIVEKIT_API_SECRET", "LIVEKIT_API_SECRET_NAME"),
    )


def clear_cache() -> None:
    """Drops cached SSM values (used by tests)."""
    _read_ssm_secure_string.cache_clear()
