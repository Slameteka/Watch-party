"""WebSocket Lambda REQUEST Authorizer for $connect."""

from typing import Any

from core.auth.token import verify_room_token
from core.errors import WatchPartyError


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Authorizes incoming WebSocket connection via query param ?token=<roomToken>."""
    query_params = event.get("queryStringParameters") or {}
    token = query_params.get("token")

    if not token:
        # Deny connection if no token provided
        raise Exception("Unauthorized")

    try:
        claims = verify_room_token(token)
    except WatchPartyError as e:
        raise Exception("Unauthorized") from e

    method_arn = event.get("methodArn", "*")

    return {
        "principalId": claims.sub,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": "Allow",
                    "Resource": method_arn,
                }
            ],
        },
        "context": {
            "roomId": claims.room_id,
            "participantId": claims.sub,
            "role": claims.role.value,
        },
    }
