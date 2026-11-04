"""ApiGatewayManagementApi broadcast helper with automatic pruning of 410 Gone connections."""

import json
from typing import Any

import boto3
from botocore.exceptions import ClientError

from core.config import AWS_REGION
from core.models.websocket import WsEnvelope
from core.repository.connection_repo import ConnectionRepository

_apigw_clients: dict[str, Any] = {}


def get_apigw_client(endpoint_url: str):
    """Caches ApiGatewayManagementApi clients by endpoint_url."""
    if endpoint_url not in _apigw_clients:
        _apigw_clients[endpoint_url] = boto3.client(
            "apigatewaymanagementapi",
            endpoint_url=endpoint_url,
            region_name=AWS_REGION,
        )
    return _apigw_clients[endpoint_url]


def serialize_message(message: Any) -> bytes:
    """Serializes a WsEnvelope model or dict to utf-8 json bytes."""
    if isinstance(message, WsEnvelope):
        return message.model_dump_json(by_alias=True).encode("utf-8")
    if isinstance(message, dict):
        return json.dumps(message).encode("utf-8")
    if isinstance(message, str):
        return message.encode("utf-8")
    return bytes(message)


def send_to_connection(
    endpoint_url: str,
    connection_id: str,
    message: Any,
) -> bool:
    """Sends payload to a single WebSocket connection.

    Returns:
        bool: True if sent, False if connection is Gone (410).
    """
    client = get_apigw_client(endpoint_url)
    payload_bytes = serialize_message(message)
    try:
        client.post_to_connection(
            ConnectionId=connection_id,
            Data=payload_bytes,
        )
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ("GoneException", "410"):
            # Connection no longer exists
            conn_repo = ConnectionRepository()
            conn_repo.handle_disconnect(connection_id)
            return False
        raise


def broadcast_to_room(
    endpoint_url: str,
    room_id: str,
    message: Any,
    exclude_connection_id: str | None = None,
) -> int:
    """Broadcasts payload to all active connections in a room (AP-8).

    Prunes stale (410 Gone) connections automatically.

    Returns:
        int: Count of successfully delivered messages.
    """
    conn_repo = ConnectionRepository()
    connections = conn_repo.get_room_connections(room_id)
    sent_count = 0

    for conn in connections:
        conn_id = conn["connectionId"]
        if exclude_connection_id and conn_id == exclude_connection_id:
            continue
        if send_to_connection(endpoint_url, conn_id, message):
            sent_count += 1

    return sent_count
