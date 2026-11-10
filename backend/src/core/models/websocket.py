"""WebSocket Envelope and Message schemas matching ws-messages.schema.json (v1 protocol)."""

from typing import Annotated, Any, Literal

from pydantic import Field

from core.models.common import (
    CamelModel,
    Emoji,
    ErrorCode,
    ParticipantId,
    PlaybackAction,
    Role,
)
from core.models.room import ChatMessage, Media, Participant, PlaybackState, Room

# Protocol version constant
WS_PROTOCOL_VERSION: int = 1


# --- Base Envelope ---
class WsEnvelope(CamelModel):
    v: Literal[1] = 1
    type: str
    request_id: str | None = Field(default=None, min_length=1, max_length=64)
    sent_at_ms: int


# ==============================================================================
# Client Messages (Client -> Server)
# ==============================================================================


class SessionResumePayload(CamelModel):
    last_version: int | None = Field(default=None, ge=1)


class MsgSessionResume(WsEnvelope):
    type: Literal["session.resume"] = "session.resume"
    payload: SessionResumePayload


class ClockPingPayload(CamelModel):
    client_send_ms: int


class MsgClockPing(WsEnvelope):
    type: Literal["clock.ping"] = "clock.ping"
    payload: ClockPingPayload


class HeartbeatPayload(CamelModel):
    pass


class MsgHeartbeat(WsEnvelope):
    type: Literal["heartbeat"] = "heartbeat"
    payload: HeartbeatPayload


class PlaybackCommandPayload(CamelModel):
    action: PlaybackAction
    position_sec: float = Field(ge=0)
    base_version: int = Field(ge=1)


class MsgPlaybackCommand(WsEnvelope):
    type: Literal["playback.command"] = "playback.command"
    request_id: str = Field(min_length=1, max_length=64)
    payload: PlaybackCommandPayload


class PlayerStatusPayload(CamelModel):
    status: Literal["buffering", "syncing", "ready"]


class MsgPlayerStatus(WsEnvelope):
    type: Literal["player.status"] = "player.status"
    payload: PlayerStatusPayload


class ChatSendPayload(CamelModel):
    text: str = Field(min_length=1, max_length=500)


class MsgChatSend(WsEnvelope):
    type: Literal["chat.send"] = "chat.send"
    request_id: str = Field(min_length=1, max_length=64)
    payload: ChatSendPayload


class ReactionSendPayload(CamelModel):
    emoji: Emoji


class MsgReactionSend(WsEnvelope):
    type: Literal["reaction.send"] = "reaction.send"
    payload: ReactionSendPayload


class MetricsReportPayload(CamelModel):
    window_sec: int = Field(ge=1, le=60)
    drift_ms: list[float] = Field(max_length=60)
    command_latency_ms: list[float] | None = Field(default=None, max_length=20)
    join_to_first_frame_ms: float | None = Field(default=None, ge=0)
    rtt_ms: float | None = Field(default=None, ge=0)


class MsgMetricsReport(WsEnvelope):
    type: Literal["metrics.report"] = "metrics.report"
    payload: MetricsReportPayload


ClientMessage = Annotated[
    MsgSessionResume
    | MsgClockPing
    | MsgHeartbeat
    | MsgPlaybackCommand
    | MsgPlayerStatus
    | MsgChatSend
    | MsgReactionSend
    | MsgMetricsReport,
    Field(discriminator="type"),
]


# ==============================================================================
# Server Messages (Server -> Client)
# ==============================================================================


class SelfParticipant(CamelModel):
    participant_id: ParticipantId
    role: Role


class RoomSnapshotPayload(CamelModel):
    room: Room
    media: Media
    playback: PlaybackState
    participants: list[Participant]
    recent_chat: list[ChatMessage] = Field(max_length=20)
    self: SelfParticipant


class MsgRoomSnapshot(WsEnvelope):
    type: Literal["room.snapshot"] = "room.snapshot"
    payload: RoomSnapshotPayload


class PlaybackStatePayload(CamelModel):
    state: PlaybackState
    action: PlaybackAction
    caused_by: ParticipantId


class MsgPlaybackState(WsEnvelope):
    type: Literal["playback.state"] = "playback.state"
    payload: PlaybackStatePayload


class ClockPongPayload(CamelModel):
    client_send_ms: int
    server_time_ms: int


class MsgClockPong(WsEnvelope):
    type: Literal["clock.pong"] = "clock.pong"
    payload: ClockPongPayload


class ParticipantJoinedPayload(CamelModel):
    participant: Participant


class MsgParticipantJoined(WsEnvelope):
    type: Literal["participant.joined"] = "participant.joined"
    payload: ParticipantJoinedPayload


class ParticipantUpdatedPayload(CamelModel):
    participant: Participant


class MsgParticipantUpdated(WsEnvelope):
    type: Literal["participant.updated"] = "participant.updated"
    payload: ParticipantUpdatedPayload


class ParticipantLeftPayload(CamelModel):
    participant_id: ParticipantId
    reason: Literal["disconnected", "kicked"]


class MsgParticipantLeft(WsEnvelope):
    type: Literal["participant.left"] = "participant.left"
    payload: ParticipantLeftPayload


class ChatMessagePayload(CamelModel):
    message: ChatMessage


class MsgChatMessage(WsEnvelope):
    type: Literal["chat.message"] = "chat.message"
    payload: ChatMessagePayload


class ReactionAddedPayload(CamelModel):
    participant_id: ParticipantId
    emoji: Emoji


class MsgReactionAdded(WsEnvelope):
    type: Literal["reaction.added"] = "reaction.added"
    payload: ReactionAddedPayload


class SessionEndedPayload(CamelModel):
    reason: Literal["kicked", "roomClosed", "expired", "replaced"]


class MsgSessionEnded(WsEnvelope):
    type: Literal["session.ended"] = "session.ended"
    payload: SessionEndedPayload


class ErrorPayload(CamelModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] | None = None


class MsgError(WsEnvelope):
    type: Literal["error"] = "error"
    payload: ErrorPayload


ServerMessage = Annotated[
    MsgRoomSnapshot
    | MsgPlaybackState
    | MsgClockPong
    | MsgParticipantJoined
    | MsgParticipantUpdated
    | MsgParticipantLeft
    | MsgChatMessage
    | MsgReactionAdded
    | MsgSessionEnded
    | MsgError,
    Field(discriminator="type"),
]
