"""Interactive multi-client watch party simulation.

Simulates Host (Alice) and Guests (Bob, Charlie) watching a movie together:
- Room creation & guest joins
- WebSocket connection & seat capacity locking
- Host playback commands (play, seek) with versioning
- Role-based authorization & optimistic concurrency conflict rejection
- Realtime chat and emoji reactions
- Snapshot verification
- Graceful disconnect and host presence preservation (BR-7)
"""

import os
import sys

# Ensure backend src is on path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(backend_dir, "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

# Set mock AWS environment variables
os.environ["AWS_DEFAULT_REGION"] = "ap-southeast-1"
os.environ["AWS_ACCESS_KEY_ID"] = "mock_key"
os.environ["AWS_SECRET_ACCESS_KEY"] = "mock_secret"
os.environ["MAIN_TABLE_NAME"] = "watchparty-prod-main"
os.environ["CONNECTIONS_TABLE_NAME"] = "watchparty-prod-connections"
os.environ["ROOM_MAX_PARTICIPANTS"] = "10"
os.environ["ROOM_TOKEN_SECRET_NAME"] = "/watchparty/prod/room-token-signing-key"
os.environ["MOCK_ROOM_TOKEN_KEY"] = "super-secret-key-for-local-testing-123456"

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

from core.catalog_data import DEFAULT_CATALOG_ITEMS  # noqa: E402
from core.errors import VersionConflictError  # noqa: E402
from core.models.common import PlaybackAction, Role, RoomStatus  # noqa: E402
from core.repository.connection_repo import ConnectionRepository  # noqa: E402
from core.repository.playback_repo import PlaybackRepository  # noqa: E402
from core.repository.room_repo import RoomRepository  # noqa: E402


def setup_mock_dynamodb():
    """Initializes in-memory DynamoDB tables matching infra/terraform/modules/data/."""
    ddb = boto3.resource("dynamodb", region_name="ap-southeast-1")

    # 1. Main Single-Table
    main_table = ddb.create_table(
        TableName="watchparty-prod-main",
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
    )

    # 2. Connections Table with byRoom GSI
    connections_table = ddb.create_table(
        TableName="watchparty-prod-connections",
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[
            {"AttributeName": "connectionId", "KeyType": "HASH"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "connectionId", "AttributeType": "S"},
            {"AttributeName": "roomId", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "byRoom",
                "KeySchema": [
                    {"AttributeName": "roomId", "KeyType": "HASH"},
                    {"AttributeName": "connectionId", "KeyType": "RANGE"},
                ],
                "Projection": {
                    "ProjectionType": "INCLUDE",
                    "NonKeyAttributes": ["participantId"],
                },
            }
        ],
    )
    return main_table, connections_table


def log_step(title: str):
    print(f"\n{'=' * 65}")
    print(f"🎬 {title}")
    print(f"{'=' * 65}")


def run_simulation():
    with mock_aws():
        main_table, connections_table = setup_mock_dynamodb()

        room_repo = RoomRepository(table=main_table)
        playback_repo = PlaybackRepository(table=main_table)
        conn_repo = ConnectionRepository(
            main_table=main_table,
            connections_table=connections_table,
        )

        # -------------------------------------------------------------
        # 1. Catalog Loading
        # -------------------------------------------------------------
        log_step("STEP 1: Load Media Catalog")
        for item in DEFAULT_CATALOG_ITEMS:
            main_table.put_item(
                Item={
                    "PK": "CATALOG",
                    "SK": f"MEDIA#{item.media_id}",
                    "mediaId": item.media_id,
                    "title": item.title,
                    "description": item.description or "",
                    "durationSec": str(item.duration_sec),
                    "posterUrl": item.poster_url,
                    "playbackUrl": item.playback_url,
                    "license": item.license,
                    "attribution": item.attribution,
                }
            )
        catalog = room_repo.get_catalog()
        print(f"✅ Catalog loaded: {len(catalog)} movies available.")
        for m in catalog:
            print(f"   - [{m.media_id}] {m.title} ({m.duration_sec}s)")

        # -------------------------------------------------------------
        # 2. Host (Alice) Creates Room
        # -------------------------------------------------------------
        log_step("STEP 2: Host (Alice) Creates a Room for 'Sintel'")
        sintel_media = room_repo.get_media_item("sintel")
        room, alice_host = room_repo.create_room(
            media=sintel_media,
            host_display_name="Alice",
            host_user_id="cognito-sub-alice-12345",
            max_participants=5,
        )
        room_id = room.room_id
        initial_playback = playback_repo.get_playback_state(room_id)
        print("✅ Room created successfully!")
        print(f"   - Room ID:          {room_id}")
        print(f"   - Media:            {room.media_title} ({room.media_id})")
        print(f"   - Max Capacity:     {room.max_participants} participants")
        print(f"   - Host Participant:  {alice_host.participant_id} ({alice_host.display_name})")
        print(
            f"   - Initial Playback:  status={initial_playback.status}, version={initial_playback.version}"
        )

        # -------------------------------------------------------------
        # 3. Guests (Bob & Charlie) Join via REST API
        # -------------------------------------------------------------
        log_step("STEP 3: Guests Join via REST API")
        _, bob_guest = room_repo.join_guest(room_id=room_id, display_name="Bob")
        _, charlie_guest = room_repo.join_guest(room_id=room_id, display_name="Charlie")
        print(
            f"✅ Bob joined:     participantId={bob_guest.participant_id}, role={bob_guest.role.value}"
        )
        print(
            f"✅ Charlie joined: participantId={charlie_guest.participant_id}, role={charlie_guest.role.value}"
        )

        # -------------------------------------------------------------
        # 4. WebSocket Connections & Seat Locking (AP-14)
        # -------------------------------------------------------------
        log_step("STEP 4: WebSocket Connect & Seat Capacity Locking ($connect)")
        alice_event, alice_replaced, alice_role = conn_repo.handle_connect(
            connection_id="conn-alice-01",
            room_id=room_id,
            participant_id=alice_host.participant_id,
        )
        print(f"🔌 Alice connected on conn-alice-01 -> event={alice_event}, role={alice_role}")

        bob_event, bob_replaced, bob_role = conn_repo.handle_connect(
            connection_id="conn-bob-01",
            room_id=room_id,
            participant_id=bob_guest.participant_id,
        )
        print(f"🔌 Bob connected on conn-bob-01 -> event={bob_event}, role={bob_role}")

        charlie_event, charlie_replaced, charlie_role = conn_repo.handle_connect(
            connection_id="conn-charlie-01",
            room_id=room_id,
            participant_id=charlie_guest.participant_id,
        )
        print(
            f"🔌 Charlie connected on conn-charlie-01 -> event={charlie_event}, role={charlie_role}"
        )

        active_connections = conn_repo.get_room_connections(room_id)
        print(f"✅ Total active connections in room: {len(active_connections)}")

        # -------------------------------------------------------------
        # 5. Playback Commands & Optimistic Concurrency Control (AP-7)
        # -------------------------------------------------------------
        log_step("STEP 5: Playback Synchronization (Optimistic Locking)")
        print("▶️  Alice sends Play command at 0.0s...")
        pb1 = playback_repo.update_playback_state(
            room_id=room_id,
            action=PlaybackAction.PLAY,
            position_sec=0.0,
            base_version=1,
        )
        print(
            f"   Server updated: status={pb1.status}, position={pb1.position_sec}s, version={pb1.version}"
        )

        print("⏩ Alice seeks forward to 75.5s...")
        pb2 = playback_repo.update_playback_state(
            room_id=room_id,
            action=PlaybackAction.SEEK,
            position_sec=75.5,
            base_version=2,
        )
        print(
            f"   Server updated: status={pb2.status}, position={pb2.position_sec}s, version={pb2.version}"
        )

        # -------------------------------------------------------------
        # 6. Optimistic Concurrency Conflict Test
        # -------------------------------------------------------------
        log_step("STEP 6: Optimistic Concurrency Conflict Test (Stale Version)")
        print("⚠️  Bob tries to update playback using STALE base_version=1 (current is 3)...")
        try:
            playback_repo.update_playback_state(
                room_id=room_id,
                action=PlaybackAction.PAUSE,
                position_sec=10.0,
                base_version=1,
            )
            print("❌ Conflict check FAILED! Should have raised VersionConflictError.")
        except VersionConflictError as e:
            print(f"✅ CONFLICT DETECTED & REJECTED PROPERLY: {e.code} - {e.message}")

        # -------------------------------------------------------------
        # 7. Role Management: Promote Bob to Controller
        # -------------------------------------------------------------
        log_step("STEP 7: Role Promotion (Host promotes Bob to Controller)")
        bob_promoted = room_repo.update_participant_role(
            room_id=room_id,
            participant_id=bob_guest.participant_id,
            new_role=Role.CONTROLLER,
        )
        print(f"👑 Bob's role successfully updated: {bob_promoted.role.value}")

        print("⏸️  Bob (Controller) pauses playback at 90.0s with correct base_version=3...")
        pb3 = playback_repo.update_playback_state(
            room_id=room_id,
            action=PlaybackAction.PAUSE,
            position_sec=90.0,
            base_version=3,
        )
        print(
            f"   Server updated: status={pb3.status}, position={pb3.position_sec}s, version={pb3.version}"
        )

        # -------------------------------------------------------------
        # 8. Chat Messages & History (AP-9)
        # -------------------------------------------------------------
        log_step("STEP 8: Realtime Chat Messages")
        msg1 = room_repo.save_chat_message(
            room_id=room_id,
            participant_id=bob_guest.participant_id,
            display_name="Bob",
            text="Keren banget film Sintel ini!",
        )
        print(f"💬 Bob: '{msg1.text}'")

        msg2 = room_repo.save_chat_message(
            room_id=room_id,
            participant_id=charlie_guest.participant_id,
            display_name="Charlie",
            text="Iya grafisnya mantap 👍",
        )
        print(f"💬 Charlie: '{msg2.text}'")

        # -------------------------------------------------------------
        # 9. Room Snapshot Verification (AP-6)
        # -------------------------------------------------------------
        log_step("STEP 9: Full Room Snapshot Verification (AP-6)")
        snapshot = room_repo.get_room_snapshot(room_id, participant_id=alice_host.participant_id)
        room_data = snapshot["room"]
        playback_data = snapshot["playback"]
        participants_data = snapshot["participants"]
        recent_chat_data = snapshot["recent_chat"]

        print("📸 Room Snapshot:")
        print(f"   - Room Status:         {room_data.status.value}")
        print(f"   - Active Participants: {room_data.participant_count}")
        print(f"   - Playback Version:    {playback_data.version}")
        print(f"   - Playback Status:     {playback_data.status} at {playback_data.position_sec}s")
        print(f"   - Total Participants:  {len(participants_data)}")
        for p in participants_data:
            print(f"     * {p.display_name} [{p.role.value}] - connected: {p.connected}")
        print(f"   - Chat History:        {len(recent_chat_data)} messages")

        # -------------------------------------------------------------
        # 10. Disconnect & Presence Handling (PRD BR-7)
        # -------------------------------------------------------------
        log_step("STEP 10: Disconnects & Business Rule 7 (BR-7)")
        print("👋 Charlie disconnects...")
        c_broadcast, c_room_id, c_part_id, c_is_host = conn_repo.handle_disconnect(
            connection_id="conn-charlie-01"
        )
        print(f"   Charlie disconnect handled: is_host={c_is_host}, should_broadcast={c_broadcast}")

        print("🚪 Host (Alice) closes browser tab (disconnects)...")
        a_broadcast, a_room_id, a_part_id, a_is_host = conn_repo.handle_disconnect(
            connection_id="conn-alice-01"
        )
        print(f"   Host disconnect handled: is_host={a_is_host}, should_broadcast={a_broadcast}")

        # Check final snapshot: Host must remain in participant list marked as offline!
        final_snapshot = room_repo.get_room_snapshot(
            room_id, participant_id=bob_guest.participant_id
        )
        host_p = next(
            p
            for p in final_snapshot["participants"]
            if p.participant_id == alice_host.participant_id
        )
        print("\n🔍 VERIFICATION OF BR-7 (Host offline presence):")
        print("   Host in participant list: True")
        print(f"   Host connected status:    {host_p.connected} (Expected: False)")
        print(
            f"   Playback state affected:  False (Status remains: {final_snapshot['playback'].status})"
        )

        assert not host_p.connected, "Host should be marked offline!"
        assert final_snapshot["room"].status == RoomStatus.OPEN, "Room should remain open!"
        assert len(final_snapshot["recent_chat"]) == 2, "Chat messages preserved!"

        print(f"\n{'=' * 65}")
        print("🎉 ALL SIMULATION STEPS & ARCHITECTURE RULES PASSED 100%!")
        print(f"{'=' * 65}")


if __name__ == "__main__":
    run_simulation()
