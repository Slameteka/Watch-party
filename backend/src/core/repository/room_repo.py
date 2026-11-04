"""Repository for Room, Catalog, Participant, and Chat operations."""

import secrets
from decimal import Decimal
from typing import Any

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from core.config import (
    APP_URL,
    DEFAULT_MAX_PARTICIPANTS,
    MAX_SNAPSHOT_CHAT_MESSAGES,
    ROOM_DATA_RETENTION_SEC,
    ROOM_LIFETIME_SEC,
    ROOM_MAX_PARTICIPANTS,
)
from core.errors import (
    ForbiddenError,
    NotFoundError,
    RoomClosedError,
    RoomFullError,
    ValidationError,
)
from core.models.common import (
    PlayerStatus,
    Role,
    RoomStatus,
)
from core.models.room import ChatMessage, Media, Participant, Room
from core.repository.base import (
    current_epoch_ms,
    current_epoch_sec,
    get_dynamodb_resource,
    get_main_table,
    is_conditional_check_failed,
)


def generate_room_id() -> str:
    """Generates a 12-character base62 room ID."""
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(12))


def generate_participant_id() -> str:
    """Generates a participant ID matching pattern ^p_[A-Za-z0-9]{16}$."""
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    suffix = "".join(secrets.choice(alphabet) for _ in range(16))
    return f"p_{suffix}"


class RoomRepository:
    def __init__(self, table=None):
        self._table = table

    @property
    def table(self):
        if self._table is None:
            self._table = get_main_table()
        return self._table

    def get_catalog(self) -> list[Media]:
        """Lists all media items from catalog (AP-1)."""
        response = self.table.query(KeyConditionExpression=Key("PK").eq("CATALOG"))
        items = response.get("Items", [])
        return [
            Media(
                media_id=item["mediaId"],
                title=item["title"],
                description=item.get("description"),
                duration_sec=float(item["durationSec"]),
                poster_url=item["posterUrl"],
                playback_url=item["playbackUrl"],
                license=item["license"],
                attribution=item["attribution"],
            )
            for item in items
        ]

    def get_media_item(self, media_id: str) -> Media:
        """Retrieves a single media item from catalog."""
        response = self.table.get_item(Key={"PK": "CATALOG", "SK": f"MEDIA#{media_id}"})
        item = response.get("Item")
        if not item:
            raise NotFoundError(f"Media '{media_id}' not found in catalog.")
        return Media(
            media_id=item["mediaId"],
            title=item["title"],
            description=item.get("description"),
            duration_sec=float(item["durationSec"]),
            poster_url=item["posterUrl"],
            playback_url=item["playbackUrl"],
            license=item["license"],
            attribution=item["attribution"],
        )

    def create_room(
        self,
        media: Media,
        host_display_name: str,
        host_user_id: str,
        max_participants: int = DEFAULT_MAX_PARTICIPANTS,
    ) -> tuple[Room, Participant]:
        """Creates a new room atomically via TransactWriteItems (AP-2)."""
        if max_participants < 2 or max_participants > ROOM_MAX_PARTICIPANTS:
            raise ValidationError(f"maxParticipants must be between 2 and {ROOM_MAX_PARTICIPANTS}.")

        room_id = generate_room_id()
        host_participant_id = generate_participant_id()
        now_ms = current_epoch_ms()
        now_sec = current_epoch_sec()
        ttl_expires_at = now_sec + ROOM_LIFETIME_SEC + ROOM_DATA_RETENTION_SEC

        meta_item = {
            "PK": f"ROOM#{room_id}",
            "SK": "META",
            "mediaId": media.media_id,
            "mediaTitle": media.title,
            "status": RoomStatus.OPEN.value,
            "hostUserId": host_user_id,
            "hostParticipantId": host_participant_id,
            "hostDisplayName": host_display_name,
            "maxParticipants": max_participants,
            "connectedGuestCount": 0,
            "createdAtMs": now_ms,
            "expiresAt": ttl_expires_at,
        }

        playback_item = {
            "PK": f"ROOM#{room_id}",
            "SK": "PLAYBACK",
            "mediaId": media.media_id,
            "status": "paused",
            "positionSec": Decimal("0"),
            "playbackRate": Decimal("1.0"),
            "updatedAtServerMs": now_ms,
            "version": 1,
            "expiresAt": ttl_expires_at,
        }

        host_participant_item = {
            "PK": f"ROOM#{room_id}",
            "SK": f"PARTICIPANT#{host_participant_id}",
            "displayName": host_display_name,
            "role": Role.HOST.value,
            "playerStatus": PlayerStatus.UNKNOWN.value,
            "connected": False,
            "kicked": False,
            "joinedAtMs": now_ms,
            "expiresAt": ttl_expires_at,
        }

        table_name = self.table.name
        resource = get_dynamodb_resource()
        resource.meta.client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": meta_item,
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": playback_item,
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": host_participant_item,
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
            ]
        )

        room = Room(
            room_id=room_id,
            media_id=media.media_id,
            media_title=media.title,
            status=RoomStatus.OPEN,
            host_display_name=host_display_name,
            participant_count=0,
            max_participants=max_participants,
            created_at_ms=now_ms,
            expires_at_ms=now_ms + (ROOM_LIFETIME_SEC * 1000),
            invite_url=f"{APP_URL}/r/{room_id}",
        )
        participant = Participant(
            participant_id=host_participant_id,
            display_name=host_display_name,
            role=Role.HOST,
            player_status=PlayerStatus.UNKNOWN,
            connected=False,
            joined_at_ms=now_ms,
        )
        return room, participant

    def get_room_summary(self, room_id: str) -> Room:
        """Reads room metadata and counts active connected participants (AP-3)."""
        response = self.table.get_item(Key={"PK": f"ROOM#{room_id}", "SK": "META"})
        meta = response.get("Item")
        if not meta:
            raise NotFoundError(f"Room '{room_id}' not found.")

        # Check room lifetime
        now_ms = current_epoch_ms()
        created_at_ms = int(meta["createdAtMs"])
        expires_at_ms = created_at_ms + (ROOM_LIFETIME_SEC * 1000)
        status = RoomStatus(meta["status"])
        if now_ms >= expires_at_ms and status == RoomStatus.OPEN:
            status = RoomStatus.CLOSED

        # Count connected participants
        part_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ROOM#{room_id}")
            & Key("SK").begins_with("PARTICIPANT#")
        )
        active_count = sum(1 for p in part_resp.get("Items", []) if p.get("connected") is True)

        return Room(
            room_id=room_id,
            media_id=meta["mediaId"],
            media_title=meta["mediaTitle"],
            status=status,
            host_display_name=meta["hostDisplayName"],
            participant_count=active_count,
            max_participants=int(meta["maxParticipants"]),
            created_at_ms=created_at_ms,
            expires_at_ms=expires_at_ms,
            closed_at_ms=int(meta["closedAtMs"]) if "closedAtMs" in meta else None,
            invite_url=f"{APP_URL}/r/{room_id}",
        )

    def join_guest(self, room_id: str, display_name: str) -> tuple[Room, Participant]:
        """Validates capacity and creates a guest viewer participant item (AP-4)."""
        room = self.get_room_summary(room_id)
        if room.status == RoomStatus.CLOSED:
            raise RoomClosedError("Room is closed or expired.")

        # Pre-check guest capacity: guest seats = maxParticipants - 1
        meta_resp = self.table.get_item(Key={"PK": f"ROOM#{room_id}", "SK": "META"})
        meta = meta_resp.get("Item")
        connected_guest_count = int(meta.get("connectedGuestCount", 0))
        guest_seats = room.max_participants - 1
        if connected_guest_count >= guest_seats:
            raise RoomFullError()

        participant_id = generate_participant_id()
        now_ms = current_epoch_ms()
        now_sec = current_epoch_sec()
        ttl_expires_at = now_sec + ROOM_LIFETIME_SEC + ROOM_DATA_RETENTION_SEC

        guest_item = {
            "PK": f"ROOM#{room_id}",
            "SK": f"PARTICIPANT#{participant_id}",
            "displayName": display_name,
            "role": Role.VIEWER.value,
            "playerStatus": PlayerStatus.UNKNOWN.value,
            "connected": False,
            "kicked": False,
            "joinedAtMs": now_ms,
            "expiresAt": ttl_expires_at,
        }
        self.table.put_item(Item=guest_item)

        participant = Participant(
            participant_id=participant_id,
            display_name=display_name,
            role=Role.VIEWER,
            player_status=PlayerStatus.UNKNOWN,
            connected=False,
            joined_at_ms=now_ms,
        )
        return room, participant

    def get_host_participant(self, room_id: str, cognito_sub: str) -> tuple[Room, Participant]:
        """Returns existing host participant if cognito_sub matches (AP-5)."""
        response = self.table.get_item(Key={"PK": f"ROOM#{room_id}", "SK": "META"})
        meta = response.get("Item")
        if not meta:
            raise NotFoundError(f"Room '{room_id}' not found.")
        if meta.get("hostUserId") != cognito_sub:
            raise ForbiddenError("User is not the host of this room.")

        host_part_id = meta["hostParticipantId"]
        part_resp = self.table.get_item(
            Key={"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{host_part_id}"}
        )
        part_item = part_resp.get("Item")
        if not part_item:
            raise NotFoundError("Host participant record not found.")

        room = self.get_room_summary(room_id)
        host_participant = Participant(
            participant_id=host_part_id,
            display_name=part_item["displayName"],
            role=Role.HOST,
            player_status=PlayerStatus(part_item.get("playerStatus", "unknown")),
            connected=bool(part_item.get("connected", False)),
            joined_at_ms=int(part_item["joinedAtMs"]),
        )
        return room, host_participant

    def get_participant(self, room_id: str, participant_id: str) -> Participant:
        """Retrieves a single participant item."""
        response = self.table.get_item(
            Key={"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"}
        )
        item = response.get("Item")
        if not item:
            raise NotFoundError(f"Participant '{participant_id}' not found.")
        if item.get("kicked") is True:
            raise ForbiddenError("Participant has been removed from this room.")
        return Participant(
            participant_id=participant_id,
            display_name=item["displayName"],
            role=Role(item["role"]),
            player_status=PlayerStatus(item.get("playerStatus", "unknown")),
            connected=bool(item.get("connected", False)),
            joined_at_ms=int(item["joinedAtMs"]),
        )

    def update_participant_role(
        self, room_id: str, participant_id: str, new_role: Role
    ) -> Participant:
        """Updates participant role (AP-10). Host role cannot be granted or revoked."""
        if new_role == Role.HOST:
            raise ForbiddenError("Host role cannot be transferred.")

        try:
            response = self.table.update_item(
                Key={"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"},
                UpdateExpression="SET #role = :new_role",
                ConditionExpression="attribute_exists(PK) AND #role <> :host_role AND kicked = :not_kicked",
                ExpressionAttributeNames={"#role": "role"},
                ExpressionAttributeValues={
                    ":new_role": new_role.value,
                    ":host_role": Role.HOST.value,
                    ":not_kicked": False,
                },
                ReturnValues="ALL_NEW",
            )
            item = response["Attributes"]
            return Participant(
                participant_id=participant_id,
                display_name=item["displayName"],
                role=Role(item["role"]),
                player_status=PlayerStatus(item.get("playerStatus", "unknown")),
                connected=bool(item.get("connected", False)),
                joined_at_ms=int(item["joinedAtMs"]),
            )
        except ClientError as e:
            if is_conditional_check_failed(e):
                raise ForbiddenError("Cannot modify host role or kicked participant.") from e
            raise

    def update_player_status(self, room_id: str, participant_id: str, status: str) -> None:
        """Updates participant player status (e.g. ready, buffering, syncing)."""
        self.table.update_item(
            Key={"PK": f"ROOM#{room_id}", "SK": f"PARTICIPANT#{participant_id}"},
            UpdateExpression="SET playerStatus = :status",
            ExpressionAttributeValues={":status": status},
        )

    def save_chat_message(
        self, room_id: str, participant_id: str, display_name: str, text: str
    ) -> ChatMessage:
        """Stores a chat message item (AP-9)."""
        import uuid

        now_ms = current_epoch_ms()
        now_sec = current_epoch_sec()
        msg_id = f"msg_{uuid.uuid4().hex[:16]}"
        ttl_expires_at = now_sec + ROOM_LIFETIME_SEC + ROOM_DATA_RETENTION_SEC

        item = {
            "PK": f"ROOM#{room_id}",
            "SK": f"CHAT#{now_ms}#{msg_id}",
            "messageId": msg_id,
            "participantId": participant_id,
            "displayName": display_name,
            "text": text,
            "createdAtMs": now_ms,
            "expiresAt": ttl_expires_at,
        }
        self.table.put_item(Item=item)
        return ChatMessage(
            message_id=msg_id,
            participant_id=participant_id,
            display_name=display_name,
            text=text,
            created_at_ms=now_ms,
        )

    def get_room_snapshot(self, room_id: str, participant_id: str) -> dict[str, Any]:
        """Assembles room snapshot for session.resume (AP-6)."""
        from core.catalog_data import DEFAULT_CATALOG_ITEMS
        from core.models.websocket import SelfParticipant
        from core.repository.playback_repo import PlaybackRepository

        room = self.get_room_summary(room_id)

        # Get Media
        try:
            media = self.get_media_item(room.media_id)
        except NotFoundError:
            media = next(
                (m for m in DEFAULT_CATALOG_ITEMS if m.media_id == room.media_id),
                DEFAULT_CATALOG_ITEMS[0],
            )

        # Get Playback state
        pb_repo = PlaybackRepository(table=self.table)
        playback = pb_repo.get_playback_state(room_id)

        # Get participants (not kicked)
        part_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ROOM#{room_id}")
            & Key("SK").begins_with("PARTICIPANT#")
        )
        participants = []
        for p in part_resp.get("Items", []):
            if not p.get("kicked", False):
                participants.append(
                    Participant(
                        participant_id=p["SK"].split("#")[1],
                        display_name=p["displayName"],
                        role=Role(p["role"]),
                        player_status=PlayerStatus(p.get("playerStatus", "unknown")),
                        connected=bool(p.get("connected", False)),
                        joined_at_ms=int(p["joinedAtMs"]),
                    )
                )

        # Get recent chat messages (up to 20, ordered oldest to newest)
        chat_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ROOM#{room_id}") & Key("SK").begins_with("CHAT#"),
            ScanIndexForward=False,
            Limit=MAX_SNAPSHOT_CHAT_MESSAGES,
        )
        chat_items = chat_resp.get("Items", [])
        chat_items.reverse()  # oldest to newest
        recent_chat = [
            ChatMessage(
                message_id=c["messageId"],
                participant_id=c["participantId"],
                display_name=c["displayName"],
                text=c["text"],
                created_at_ms=int(c["createdAtMs"]),
            )
            for c in chat_items
        ]

        # Self participant
        caller = next((p for p in participants if p.participant_id == participant_id), None)
        if not caller:
            raise NotFoundError(f"Participant '{participant_id}' not found in room.")

        return {
            "room": room,
            "media": media,
            "playback": playback,
            "participants": participants,
            "recent_chat": recent_chat,
            "self": SelfParticipant(
                participant_id=caller.participant_id,
                role=caller.role,
            ),
        }
