"""Repository for WebSocket connections and capacity management."""

from typing import Any

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from core.config import ROOM_LIFETIME_SEC
from core.errors import ForbiddenError, NotFoundError, RoomFullError
from core.models.common import Role
from core.repository.base import (
    current_epoch_ms,
    current_epoch_sec,
    get_connections_table,
    get_dynamodb_resource,
    get_main_table,
    is_conditional_check_failed,
)


class ConnectionRepository:
    def __init__(self, main_table=None, connections_table=None):
        self._main_table = main_table
        self._connections_table = connections_table

    @property
    def main_table(self):
        if self._main_table is None:
            self._main_table = get_main_table()
        return self._main_table

    @property
    def connections_table(self):
        if self._connections_table is None:
            self._connections_table = get_connections_table()
        return self._connections_table

    def get_connection(self, connection_id: str) -> dict[str, Any] | None:
        """Retrieves connection record."""
        resp = self.connections_table.get_item(Key={"connectionId": connection_id})
        return resp.get("Item")

    def get_room_connections(self, room_id: str) -> list[dict[str, Any]]:
        """Queries active connections for a room via byRoom GSI (AP-8)."""
        resp = self.connections_table.query(
            IndexName="byRoom",
            KeyConditionExpression=Key("roomId").eq(room_id),
        )
        return resp.get("Items", [])

    def handle_connect(
        self,
        connection_id: str,
        room_id: str,
        participant_id: str,
    ) -> tuple[str, str | None, Role]:
        """Locks seat, tracks active connection, and manages presence (AP-14).

        Returns:
            tuple[str, str | None, Role]: (connect_type: 'joined' | 'replaced', old_connection_id, role)

        Raises:
            RoomFullError: If guest capacity is full.
            ForbiddenError: If participant is kicked or conditions failed.
        """
        # Read participant and room meta
        part_resp = self.main_table.get_item(
            Key={"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"}
        )
        part = part_resp.get("Item")
        if not part:
            raise NotFoundError(f"Participant '{participant_id}' not found.")
        if part.get("kicked") is True:
            raise ForbiddenError("Participant has been removed from this room.")

        meta_resp = self.main_table.get_item(Key={"PK": f"ROOM#{room_id}", "SK": "META"})
        meta = meta_resp.get("Item")
        if not meta:
            raise NotFoundError(f"Room '{room_id}' not found.")

        role = Role(part["role"])
        is_host = role == Role.HOST
        now_ms = current_epoch_ms()
        now_sec = current_epoch_sec()
        room_expires_at_ms = int(meta["createdAtMs"]) + (ROOM_LIFETIME_SEC * 1000)
        conn_ttl = now_sec + (3 * 3600)  # 3 hours TTL

        is_connected = part.get("connected") is True
        old_conn_id = part.get("connectionId")

        # Case 1: Reconnection / Connection Replacement (already connected)
        if is_connected and old_conn_id:
            try:
                self.main_table.update_item(
                    Key={"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"},
                    UpdateExpression="SET connectionId = :new_conn",
                    ConditionExpression="connectionId = :old_conn AND connected = :true_val AND kicked = :false_val",
                    ExpressionAttributeValues={
                        ":new_conn": connection_id,
                        ":old_conn": old_conn_id,
                        ":true_val": True,
                        ":false_val": False,
                    },
                )
            except ClientError as e:
                if is_conditional_check_failed(e):
                    # Condition failed (old connection might have disconnected just now); re-read and fallback to fresh connect
                    return self.handle_connect(connection_id, room_id, participant_id)
                raise

            # Save new connection item
            self.connections_table.put_item(
                Item={
                    "connectionId": connection_id,
                    "roomId": room_id,
                    "participantId": participant_id,
                    "isHost": is_host,
                    "connectedAtMs": now_ms,
                    "roomExpiresAtMs": room_expires_at_ms,
                    "expiresAt": conn_ttl,
                }
            )
            return "replaced", old_conn_id, role

        # Case 2: New Connection (connected = False)
        max_participants = int(meta["maxParticipants"])
        guest_seats = max_participants - 1

        transact_items = [
            {
                "Update": {
                    "TableName": self.main_table.name,
                    "Key": {"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"},
                    "UpdateExpression": "SET connected = :true_val, connectionId = :new_conn",
                    "ConditionExpression": "connected = :false_val AND kicked = :false_val",
                    "ExpressionAttributeValues": {
                        ":true_val": True,
                        ":false_val": False,
                        ":new_conn": connection_id,
                    },
                }
            }
        ]

        # For guest, conditionally increment connectedGuestCount
        if not is_host:
            transact_items.append(
                {
                    "Update": {
                        "TableName": self.main_table.name,
                        "Key": {"PK": f"ROOM#{room_id}", "SK": "META"},
                        "UpdateExpression": "SET connectedGuestCount = connectedGuestCount + :one",
                        "ConditionExpression": "connectedGuestCount < :guest_seats",
                        "ExpressionAttributeValues": {
                            ":one": 1,
                            ":guest_seats": guest_seats,
                        },
                    }
                }
            )

        resource = get_dynamodb_resource()
        try:
            resource.meta.client.transact_write_items(TransactItems=transact_items)
        except ClientError as e:
            if is_conditional_check_failed(e):
                raise RoomFullError() from e
            raise

        # Save connection item
        self.connections_table.put_item(
            Item={
                "connectionId": connection_id,
                "roomId": room_id,
                "participantId": participant_id,
                "isHost": is_host,
                "connectedAtMs": now_ms,
                "roomExpiresAtMs": room_expires_at_ms,
                "expiresAt": conn_ttl,
            }
        )
        return "joined", None, role

    def handle_disconnect(self, connection_id: str) -> tuple[bool, str | None, str | None, bool]:
        """Removes connection and updates participant presence (AP-13).

        Returns:
            tuple[bool, str | None, str | None, bool]:
                (should_broadcast, room_id, participant_id, is_host)
        """
        conn = self.get_connection(connection_id)
        if not conn:
            return False, None, None, False

        room_id = conn["roomId"]
        participant_id = conn["participantId"]
        is_host = bool(conn.get("isHost", False))

        # Delete connection item
        self.connections_table.delete_item(Key={"connectionId": connection_id})

        # Atomically update participant connected status and decrement guest counter if guest
        transact_items = [
            {
                "Update": {
                    "TableName": self.main_table.name,
                    "Key": {"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"},
                    "UpdateExpression": "SET connected = :false_val REMOVE connectionId",
                    "ConditionExpression": "connectionId = :this_conn AND connected = :true_val",
                    "ExpressionAttributeValues": {
                        ":this_conn": connection_id,
                        ":false_val": False,
                        ":true_val": True,
                    },
                }
            }
        ]

        if not is_host:
            transact_items.append(
                {
                    "Update": {
                        "TableName": self.main_table.name,
                        "Key": {"PK": f"ROOM#{room_id}", "SK": "META"},
                        "UpdateExpression": "SET connectedGuestCount = connectedGuestCount - :one",
                        "ConditionExpression": "connectedGuestCount > :zero",
                        "ExpressionAttributeValues": {
                            ":one": 1,
                            ":zero": 0,
                        },
                    }
                }
            )

        resource = get_dynamodb_resource()
        try:
            resource.meta.client.transact_write_items(TransactItems=transact_items)
            return True, room_id, participant_id, is_host
        except ClientError as e:
            if is_conditional_check_failed(e):
                # Condition failed (connection was already replaced by another tab or processed)
                return False, room_id, participant_id, is_host
            raise
