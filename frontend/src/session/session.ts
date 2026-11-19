// Session layer: join the room, keep ONE WebSocket alive, and hand each server message to
// the right store. Owner: FE-Player. FE-Social only reads useSocialStore.
//
// Source of truth: docs/contracts/ws-messages.md (§1 connect, §3 client messages,
// §4 server messages, §5 reconnect) and docs/contracts/openapi.yaml.

import { estimateClockOffset, type ClockSample } from '../player/sync'
import { usePlaybackStore } from '../player/usePlaybackStore'
import { useSocialStore } from '../state/useSocialStore'
import { wsClient } from '../services/websocket'
import type {
  ChatMessage,
  EmojiType,
  ErrorPayload,
  MediaItem,
  Participant,
  PlaybackState,
  Role,
  WsEnvelope,
} from '../types'
import { ApiError, joinRoom, refreshSession, requestMediaCookies, type RoomSession } from './api'
import { backoffDelayMs } from './backoff'

// Numbers from docs/contracts/ws-messages.md and docs/architecture.md §3.
const CLOCK_PING_COUNT = 5
const CLOCK_PING_GAP_MS = 200
const CLOCK_RESYNC_MS = 60_000
const MEDIA_COOKIE_REFRESH_MS = 90 * 60 * 1000
const TOKEN_REFRESH_BEFORE_MS = 30 * 60 * 1000
const FAILED_RECONNECTS_BEFORE_DIAGNOSE = 3
const COMMAND_LIMIT = 10
const STATUS_LIMIT = 10
const RATE_WINDOW_MS = 10_000
// Not in the contract: how long we wait for the answer to one playback.command.
const COMMAND_TIMEOUT_MS = 3000
const COMMAND_ERROR_VISIBLE_MS = 4000

export type PlaybackAction = 'play' | 'pause' | 'seek'
export type PlayerReportStatus = 'buffering' | 'syncing' | 'ready'
export type CommandResult = 'sent' | 'forbidden' | 'not-ready' | 'busy' | 'rate-limited'

interface RoomSnapshotPayload {
  room: { expiresAtMs: number }
  media: MediaItem
  playback: PlaybackState
  participants: Participant[]
  recentChat: ChatMessage[]
  self: { participantId: string; role: Role }
}

type Timer = ReturnType<typeof setTimeout>

interface Context {
  session: RoomSession | null
  ended: boolean
  attempt: number
  failures: number
  reconnectTimer: Timer | null
  cookieTimer: Timer | null
  expiryTimer: Timer | null
  clockTimers: Timer[]
  clockInterval: ReturnType<typeof setInterval> | null
  clockSamples: ClockSample[]
  expiresAtMs: number | null
  pendingRequestId: string | null
  pendingTimer: Timer | null
  errorTimer: Timer | null
  commandTimes: number[]
  statusTimes: number[]
  wantedStatus: PlayerReportStatus | null
  sentStatus: PlayerReportStatus | null
  statusTimer: Timer | null
  unsubscribe: Array<() => void>
}

function freshContext(): Context {
  return {
    session: null,
    ended: false,
    attempt: 0,
    failures: 0,
    reconnectTimer: null,
    cookieTimer: null,
    expiryTimer: null,
    clockTimers: [],
    clockInterval: null,
    clockSamples: [],
    expiresAtMs: null,
    pendingRequestId: null,
    pendingTimer: null,
    errorTimer: null,
    commandTimes: [],
    statusTimes: [],
    wantedStatus: null,
    sentStatus: null,
    statusTimer: null,
    unsubscribe: [],
  }
}

let ctx = freshContext()
// Bumped on every start/stop. An async step that wakes up in an older generation stops,
// so React StrictMode (start, stop, start) never leaves two sessions running.
let generation = 0

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StartSessionOptions {
  roomId: string
  displayName: string
  /** Only the mock server reads this. The real backend gives host to the Cognito owner. */
  mockRole?: Role
}

/** Join the room over REST, ask for media cookies, then open the WebSocket. */
export async function startSession(options: StartSessionOptions): Promise<void> {
  stopSession()
  const mine = generation
  const playback = usePlaybackStore.getState()
  playback.setConnection('connecting')

  let session: RoomSession
  try {
    session = await joinRoom(options.roomId, options.displayName, options.mockRole)
  } catch (error) {
    if (mine === generation) failFromError(error)
    return
  }
  if (mine !== generation) return
  ctx.session = session
  useSocialStore.getState().setSelf(session.participantId, session.role)

  await fetchMediaCookies()
  if (mine !== generation) return
  ctx.cookieTimer = setInterval(() => void fetchMediaCookies(), MEDIA_COOKIE_REFRESH_MS)

  ctx.unsubscribe.push(wsClient.onMessage(handleServerMessage))
  ctx.unsubscribe.push(wsClient.onClose(handleClose))
  await connect(true)
}

/** Close everything and forget the session. */
export function stopSession(): void {
  generation += 1
  clearTimers()
  ctx.unsubscribe.forEach((off) => off())
  wsClient.disconnect()
  ctx = freshContext()
  usePlaybackStore.getState().reset()
}

/**
 * Send play, pause or seek. Only host and controller may do this (ws-messages.md §3.1).
 * `positionSec` is the local position for play/pause, and the target for seek.
 */
export function sendPlaybackCommand(action: PlaybackAction, positionSec: number): CommandResult {
  const playback = usePlaybackStore.getState()
  if (useSocialStore.getState().selfRole === 'viewer') return 'forbidden'
  if (!playback.state || !playback.media || playback.connection !== 'connected') return 'not-ready'
  if (ctx.pendingRequestId) return 'busy'
  if (!takeSlot(ctx.commandTimes, COMMAND_LIMIT)) {
    showCommandError('Terlalu cepat. Tunggu sebentar lalu coba lagi.')
    return 'rate-limited'
  }

  // The backend does not clamp the position, so we do it here.
  const clamped = Math.min(Math.max(positionSec, 0), playback.media.durationSec)
  const requestId = newRequestId()
  ctx.pendingRequestId = requestId
  playback.setCommandPending(true)
  playback.setCommandError(null)
  ctx.pendingTimer = setTimeout(clearPending, COMMAND_TIMEOUT_MS)

  wsClient.send(
    'playback.command',
    { action, positionSec: clamped, baseVersion: playback.state.version },
    requestId,
  )
  return 'sent'
}

/** Tell the room how this player is doing (buffering, syncing, ready). Repeats are dropped. */
export function reportPlayerStatus(status: PlayerReportStatus): void {
  ctx.wantedStatus = status
  flushPlayerStatus()
}

// ---------------------------------------------------------------------------
// Server messages
// ---------------------------------------------------------------------------

/** Route one server message to the stores. Exported for tests. */
export function handleServerMessage(msg: WsEnvelope<unknown>): void {
  const social = useSocialStore.getState()
  const playback = usePlaybackStore.getState()

  switch (msg.type) {
    case 'room.snapshot': {
      const p = msg.payload as RoomSnapshotPayload
      playback.applySnapshot(p.media, p.playback)
      social.setInitialSnapshot(p.participants, p.recentChat, p.self)
      playback.setConnection('connected')
      ctx.attempt = 0
      ctx.failures = 0
      ctx.sentStatus = null
      ctx.expiresAtMs = p.room.expiresAtMs
      scheduleExpiry()
      startClockSync()
      flushPlayerStatus()
      break
    }
    case 'playback.state': {
      const p = msg.payload as { state: PlaybackState }
      playback.applyPlaybackState(p.state)
      if (msg.requestId && msg.requestId === ctx.pendingRequestId) clearPending()
      break
    }
    case 'clock.pong': {
      const p = msg.payload as { clientSendMs: number; serverTimeMs: number }
      ctx.clockSamples = [
        ...ctx.clockSamples,
        { clientSendMs: p.clientSendMs, serverTimeMs: p.serverTimeMs, clientRecvMs: Date.now() },
      ].slice(-CLOCK_PING_COUNT)
      const best = estimateClockOffset(ctx.clockSamples)
      if (best) {
        playback.setClockOffset(best.offsetMs)
        scheduleExpiry()
      }
      break
    }
    case 'participant.joined': {
      social.onParticipantJoined((msg.payload as { participant: Participant }).participant)
      break
    }
    case 'participant.updated': {
      const { participant } = msg.payload as { participant: Participant }
      social.onParticipantUpdated(participant)
      // The host can change our role (viewer <-> controller). Keep it current.
      if (participant.participantId === social.selfParticipantId) {
        social.setSelf(participant.participantId, participant.role)
      }
      break
    }
    case 'participant.left': {
      const p = msg.payload as { participantId: string; reason: string }
      social.onParticipantLeft(p.participantId, p.reason)
      break
    }
    case 'chat.message': {
      social.addChatMessage((msg.payload as { message: ChatMessage }).message)
      break
    }
    case 'reaction.added': {
      const p = msg.payload as { participantId: string; emoji: EmojiType }
      social.triggerReaction(p.participantId, p.emoji)
      break
    }
    case 'session.ended': {
      endSession((msg.payload as { reason: string }).reason)
      break
    }
    case 'error': {
      handleServerError(msg as WsEnvelope<ErrorPayload>)
      break
    }
    default:
      console.warn('Unknown WebSocket message type:', msg.type)
  }
}

function handleServerError(msg: WsEnvelope<ErrorPayload>): void {
  const { code, message, details } = msg.payload
  const isOurCommand = !!msg.requestId && msg.requestId === ctx.pendingRequestId
  if (!isOurCommand) {
    console.warn(`Server error ${code}: ${message}`)
    return
  }
  clearPending()

  if (code === 'VERSION_CONFLICT') {
    // Someone else changed the state first. Take the current state, the user can try again.
    const current = details?.currentState as PlaybackState | undefined
    if (current) usePlaybackStore.getState().applyPlaybackState(current)
    showCommandError('Ada perubahan lain dari peserta lain. Coba lagi.')
  } else if (code === 'FORBIDDEN') {
    showCommandError('Hanya host atau controller yang bisa mengatur pemutaran.')
  } else if (code === 'RATE_LIMITED') {
    showCommandError('Terlalu cepat. Tunggu sebentar lalu coba lagi.')
  } else {
    showCommandError(message)
  }
}

// ---------------------------------------------------------------------------
// Connect, reconnect (ws-messages.md §5)
// ---------------------------------------------------------------------------

async function connect(first: boolean): Promise<void> {
  const session = ctx.session
  if (!session || ctx.ended) return
  const lastVersion = usePlaybackStore.getState().state?.version
  try {
    await wsClient.connect(session.wsUrl, session.roomToken, lastVersion ? { lastVersion } : {})
  } catch {
    ctx.failures += 1
    // §5.3: diagnose after the first failed connect, or after 3 failed reconnects in a row.
    const diagnose = first || ctx.failures >= FAILED_RECONNECTS_BEFORE_DIAGNOSE
    if (diagnose && !(await refreshToken())) return
    scheduleReconnect()
  }
}

function handleClose(event: { wasOpen: boolean }): void {
  // A socket that never opened is handled by connect() itself.
  if (!event.wasOpen || ctx.ended || !ctx.session) return
  stopClockSync()
  scheduleReconnect()
}

function scheduleReconnect(): void {
  if (ctx.ended || !ctx.session) return
  usePlaybackStore.getState().setConnection('reconnecting')
  const delay = backoffDelayMs(ctx.attempt)
  ctx.attempt += 1
  ctx.reconnectTimer = setTimeout(async () => {
    const session = ctx.session
    if (!session || ctx.ended) return
    const left = session.roomTokenExpiresAtMs - Date.now()
    if (left < TOKEN_REFRESH_BEFORE_MS && !(await refreshToken())) return
    await connect(false)
  }, delay)
}

/**
 * Get a fresh room token. Returns false when the failure is final (we stop reconnecting).
 * A network error is not final: the caller keeps trying.
 */
async function refreshToken(): Promise<boolean> {
  const session = ctx.session
  if (!session) return false
  try {
    ctx.session = await refreshSession(session.roomId, session.roomToken)
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) {
      failFromError(error)
      return false
    }
    return true
  }
}

function failFromError(error: unknown): void {
  let reason = 'NETWORK_ERROR'
  if (error instanceof ApiError) {
    const byStatus: Record<number, string> = {
      401: 'UNAUTHORIZED',
      403: 'KICKED',
      404: 'ROOM_NOT_FOUND',
      409: 'ROOM_FULL',
      410: 'ROOM_CLOSED',
    }
    reason = byStatus[error.status] ?? error.code
  }
  clearTimers()
  wsClient.disconnect()
  ctx.ended = true
  usePlaybackStore.getState().setConnection('failed', reason)
}

function endSession(reason: string): void {
  clearTimers()
  ctx.ended = true
  // The server closes the socket after session.ended. Detach so it does not look like a drop.
  wsClient.disconnect()
  usePlaybackStore.getState().setConnection('ended', reason)
}

async function fetchMediaCookies(): Promise<void> {
  const session = ctx.session
  if (!session) return
  try {
    await requestMediaCookies(session.roomId, session.roomToken)
  } catch (error) {
    // Not fatal here: playback shows its own error if the video cannot load.
    console.warn('Could not get media cookies:', error)
  }
}

// ---------------------------------------------------------------------------
// Clock sync, expiry, status, helpers
// ---------------------------------------------------------------------------

/** 5 pings (200 ms apart) after every snapshot, then 1 ping every 60 s (ws-messages.md §1). */
function startClockSync(): void {
  stopClockSync()
  ctx.clockSamples = []
  for (let i = 0; i < CLOCK_PING_COUNT; i += 1) {
    ctx.clockTimers.push(setTimeout(() => wsClient.sendClockPing(), i * CLOCK_PING_GAP_MS))
  }
  ctx.clockInterval = setInterval(() => wsClient.sendClockPing(), CLOCK_RESYNC_MS)
}

function stopClockSync(): void {
  ctx.clockTimers.forEach(clearTimeout)
  ctx.clockTimers = []
  if (ctx.clockInterval) clearInterval(ctx.clockInterval)
  ctx.clockInterval = null
}

/** Act like session.ended "expired" when the room time is over (ws-messages.md §4.5). */
function scheduleExpiry(): void {
  if (ctx.expiryTimer) clearTimeout(ctx.expiryTimer)
  ctx.expiryTimer = null
  if (ctx.expiresAtMs === null) return
  const serverNow = Date.now() + usePlaybackStore.getState().clockOffsetMs
  const left = ctx.expiresAtMs - serverNow
  if (left <= 0) {
    endSession('expired')
    return
  }
  ctx.expiryTimer = setTimeout(() => endSession('expired'), left)
}

function flushPlayerStatus(): void {
  if (ctx.statusTimer) clearTimeout(ctx.statusTimer)
  ctx.statusTimer = null
  const wanted = ctx.wantedStatus
  if (!wanted || wanted === ctx.sentStatus) return
  if (usePlaybackStore.getState().connection !== 'connected') return
  if (!takeSlot(ctx.statusTimes, STATUS_LIMIT)) {
    // Over the limit: try again later so the last status is never lost.
    ctx.statusTimer = setTimeout(flushPlayerStatus, 1000)
    return
  }
  ctx.sentStatus = wanted
  wsClient.sendPlayerStatus(wanted)
}

/** Fixed-window style limiter. Returns false when `limit` messages were sent in the window. */
function takeSlot(times: number[], limit: number): boolean {
  const now = Date.now()
  while (times.length > 0 && now - times[0] >= RATE_WINDOW_MS) times.shift()
  if (times.length >= limit) return false
  times.push(now)
  return true
}

function clearPending(): void {
  if (ctx.pendingTimer) clearTimeout(ctx.pendingTimer)
  ctx.pendingTimer = null
  ctx.pendingRequestId = null
  usePlaybackStore.getState().setCommandPending(false)
}

function showCommandError(message: string): void {
  usePlaybackStore.getState().setCommandError(message)
  if (ctx.errorTimer) clearTimeout(ctx.errorTimer)
  ctx.errorTimer = setTimeout(
    () => usePlaybackStore.getState().setCommandError(null),
    COMMAND_ERROR_VISIBLE_MS,
  )
}

function newRequestId(): string {
  // crypto.randomUUID only exists in secure contexts (https or localhost).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function clearTimers(): void {
  for (const timer of [
    ctx.reconnectTimer,
    ctx.expiryTimer,
    ctx.pendingTimer,
    ctx.errorTimer,
    ctx.statusTimer,
  ]) {
    if (timer) clearTimeout(timer)
  }
  ctx.reconnectTimer = null
  ctx.expiryTimer = null
  ctx.pendingTimer = null
  ctx.errorTimer = null
  ctx.statusTimer = null
  if (ctx.cookieTimer) clearInterval(ctx.cookieTimer)
  ctx.cookieTimer = null
  stopClockSync()
}
