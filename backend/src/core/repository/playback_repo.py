"""Repository for Room Playback State with Optimistic Concurrency Control."""

from decimal import Decimal
from typing import Any

from botocore.exceptions import ClientError

from core.errors import NotFoundError, VersionConflictError
from core.models.common import PlaybackAction
from core.models.room import PlaybackState
from core.repository.base import (
    current_epoch_ms,
    get_main_table,
    is_conditional_check_failed,
)


class PlaybackRepository:
    def __init__(self, table=None):
        self._table = table

    @property
    def table(self):
        if self._table is None:
            self._table = get_main_table()
        return self._table

    def get_playback_state(self, room_id: str) -> PlaybackState:
        """Reads current playback state item."""
        response = self.table.get_item(Key={"PK": f"ROOM#{room_id}", "SK": "PLAYBACK"})
        item = response.get("Item")
        if not item:
            raise NotFoundError(f"Playback state for room '{room_id}' not found.")

        return self._item_to_model(item, room_id)

    def update_playback_state(
        self,
        room_id: str,
        action: PlaybackAction,
        position_sec: float,
        base_version: int,
    ) -> PlaybackState:
        """Applies a playback command with optimistic concurrency control (AP-7).

        Updates PLAYBACK item only if `version = base_version`.
        Increments version by 1 and updates `updatedAtServerMs`.

        Raises:
            VersionConflictError: If version does not match base_version.
        """
        now_ms = current_epoch_ms()
        new_status: str | None = None
        if action == PlaybackAction.PLAY:
            new_status = "playing"
        elif action == PlaybackAction.PAUSE:
            new_status = "paused"

        update_expr_parts = [
            "positionSec = :new_pos",
            "version = version + :inc",
            "updatedAtServerMs = :now_ms",
        ]
        expr_values: dict[str, Any] = {
            ":base_version": base_version,
            ":new_pos": Decimal(str(position_sec)),
            ":inc": 1,
            ":now_ms": now_ms,
        }
        expr_names: dict[str, str] = {}

        if new_status:
            update_expr_parts.append("#status = :new_status")
            expr_values[":new_status"] = new_status
            expr_names["#status"] = "status"

        update_expr = "SET " + ", ".join(update_expr_parts)

        update_kwargs: dict[str, Any] = {
            "Key": {"PK": f"ROOM#{room_id}", "SK": "PLAYBACK"},
            "UpdateExpression": update_expr,
            "ConditionExpression": "attribute_exists(version) AND version = :base_version",
            "ExpressionAttributeValues": expr_values,
            "ReturnValues": "ALL_NEW",
        }
        if expr_names:
            update_kwargs["ExpressionAttributeNames"] = expr_names

        try:
            response = self.table.update_item(**update_kwargs)
            return self._item_to_model(response["Attributes"], room_id)
        except ClientError as e:
            if is_conditional_check_failed(e):
                current_state = self.get_playback_state(room_id)
                raise VersionConflictError(
                    message=f"Playback state version conflict. Expected version {base_version}, but current version is {current_state.version}."
                ) from e
            raise

    def _item_to_model(self, item: dict[str, Any], room_id: str) -> PlaybackState:
        return PlaybackState(
            room_id=room_id,
            media_id=item["mediaId"],
            status=item["status"],
            position_sec=float(item["positionSec"]),
            playback_rate=float(item.get("playbackRate", 1.0)),
            updated_at_server_ms=int(item["updatedAtServerMs"]),
            version=int(item["version"]),
        )
