// Mock WebSocket server for frontend development (protocol v1).
//
// Source of truth: docs/contracts/ws-messages.md and ws-messages.schema.json.
// This is NOT the real backend: one in-memory room, no REST, no real auth.
// The token is "<role>" or "<role>-<name>", for example "host" or "viewer-bimo".

import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const PROTOCOL_VERSION = 1
const ROLES = ['host', 'controller', 'viewer']
const ACTIONS = ['play', 'pause', 'seek']
const EMOJIS = ['thumbsUp', 'heart', 'laugh', 'wow', 'sad']
const PLAYER_STATUSES = ['buffering', 'syncing', 'ready']

// Numbers from docs/contracts/ws-messages.md (§3, §7) and docs/architecture.md §3.
const MAX_MESSAGE_BYTES = 4096
const MAX_CHAT_LENGTH = 500
const RECENT_CHAT_LIMIT = 20
const MAX_PARTICIPANTS = 10
const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000
const DEFAULT_PORT = 8787
// [limit, windowMs] per participant and message type (ws-messages.md §3).
const RATE_LIMITS = {
  'clock.ping': [10, 10_000],
  'playback.command': [10, 10_000],
  'player.status': [10, 10_000],
  'chat.send': [5, 10_000],
  'reaction.send': [10, 10_000],
  'metrics.report': [1, 15_000],
}

const ROOM_ID = 'MockRoom0001'

const DEFAULT_MEDIA = {
  mediaId: 'big-buck-bunny',
  title: 'Big Buck Bunny',
  description: 'A large and lovable rabbit deals with bullying forest creatures.',
  durationSec: 596,
  posterUrl: 'http://localhost:5173/posters/big-buck-bunny.jpg',
  // Public HLS test stream, so the player can be tried without the real CDN.
  playbackUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  license: 'CC BY 3.0',
  attribution: '(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org',
}

class ProtocolError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

const invalid = (field, message) => new ProtocolError('VALIDATION_ERROR', message, { field })
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isInt = Number.isInteger
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

function checkKeys(obj, allowed, required, where) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw invalid(key, `Unknown field '${key}' in ${where}.`)
  }
  for (const key of required) {
    if (!(key in obj)) throw invalid(key, `Missing field '${key}' in ${where}.`)
  }
}

function requireRequestId(msg) {
  if (msg.requestId === undefined) {
    throw invalid('requestId', 'requestId is required for this message type.')
  }
}

function validateEnvelope(msg) {
  if (!isObject(msg)) throw invalid('envelope', 'Message must be a JSON object.')
  if ('v' in msg && msg.v !== PROTOCOL_VERSION) {
    throw new ProtocolError('UNSUPPORTED_VERSION', `Protocol version ${msg.v} is not supported.`, {
      supported: [PROTOCOL_VERSION],
    })
  }
  checkKeys(
    msg,
    ['v', 'type', 'requestId', 'sentAtMs', 'payload'],
    ['v', 'type', 'sentAtMs', 'payload'],
    'envelope',
  )
  if (typeof msg.type !== 'string') throw invalid('type', "'type' must be a string.")
  if (!isInt(msg.sentAtMs)) throw invalid('sentAtMs', "'sentAtMs' must be an integer.")
  if ('requestId' in msg) {
    const ok =
      typeof msg.requestId === 'string' && msg.requestId.length >= 1 && msg.requestId.length <= 64
    if (!ok) throw invalid('requestId', "'requestId' must be a string of 1 to 64 characters.")
  }
  if (!isObject(msg.payload)) throw invalid('payload', "'payload' must be an object.")
}

// Payload validation per client message type (ws-messages.md §3). Unknown fields are rejected.
const PAYLOAD_VALIDATORS = {
  'session.resume': (p) => {
    checkKeys(p, ['lastVersion'], [], 'payload')
    if ('lastVersion' in p && !(isInt(p.lastVersion) && p.lastVersion >= 1)) {
      throw invalid('lastVersion', "'lastVersion' must be an integer >= 1.")
    }
  },
  'clock.ping': (p) => {
    checkKeys(p, ['clientSendMs'], ['clientSendMs'], 'payload')
    if (!isInt(p.clientSendMs)) throw invalid('clientSendMs', "'clientSendMs' must be an integer.")
  },
  heartbeat: (p) => checkKeys(p, [], [], 'payload'),
  'playback.command': (p, msg) => {
    requireRequestId(msg)
    checkKeys(p, ['action', 'positionSec', 'baseVersion'], ['action', 'positionSec', 'baseVersion'], 'payload')
    if (!ACTIONS.includes(p.action)) throw invalid('action', "'action' must be play, pause, or seek.")
    if (!(isNumber(p.positionSec) && p.positionSec >= 0)) {
      throw invalid('positionSec', "'positionSec' must be a number >= 0.")
    }
    if (!(isInt(p.baseVersion) && p.baseVersion >= 1)) {
      throw invalid('baseVersion', "'baseVersion' must be an integer >= 1.")
    }
  },
  'player.status': (p) => {
    checkKeys(p, ['status'], ['status'], 'payload')
    if (!PLAYER_STATUSES.includes(p.status)) {
      throw invalid('status', "'status' must be buffering, syncing, or ready.")
    }
  },
  'chat.send': (p, msg) => {
    requireRequestId(msg)
    checkKeys(p, ['text'], ['text'], 'payload')
    if (typeof p.text !== 'string' || p.text.length < 1 || p.text.length > MAX_CHAT_LENGTH) {
      throw invalid('text', `'text' must be a string of 1 to ${MAX_CHAT_LENGTH} characters.`)
    }
  },
  'reaction.send': (p) => {
    checkKeys(p, ['emoji'], ['emoji'], 'payload')
    if (!EMOJIS.includes(p.emoji)) throw invalid('emoji', `'emoji' must be one of ${EMOJIS.join(', ')}.`)
  },
  'metrics.report': (p) => {
    checkKeys(
      p,
      ['windowSec', 'driftMs', 'commandLatencyMs', 'joinToFirstFrameMs', 'rttMs'],
      ['windowSec', 'driftMs'],
      'payload',
    )
    if (!(isInt(p.windowSec) && p.windowSec >= 1 && p.windowSec <= 60)) {
      throw invalid('windowSec', "'windowSec' must be an integer from 1 to 60.")
    }
    const list = (value, max) =>
      Array.isArray(value) && value.length <= max && value.every((n) => isNumber(n) && n >= 0)
    if (!list(p.driftMs, 60)) throw invalid('driftMs', "'driftMs' must be up to 60 numbers >= 0.")
    if ('commandLatencyMs' in p && !list(p.commandLatencyMs, 20)) {
      throw invalid('commandLatencyMs', "'commandLatencyMs' must be up to 20 numbers >= 0.")
    }
    for (const key of ['joinToFirstFrameMs', 'rttMs']) {
      if (key in p && !(isNumber(p[key]) && p[key] >= 0)) throw invalid(key, `'${key}' must be a number >= 0.`)
    }
  },
}

// "host" -> role host. "viewer-bimo" -> role viewer, name "Bimo". Anything else -> viewer.
function identityFromToken(token) {
  const [first, ...rest] = token.split('-')
  const hasRole = ROLES.includes(first)
  const role = hasRole ? first : 'viewer'
  const rawName = (hasRole ? rest.join('-') : token) || role
  // eslint-disable-next-line no-control-regex
  const cleaned = rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32) || role
  const displayName = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  const participantId = `p_${createHash('sha256').update(token).digest('hex').slice(0, 16)}`
  return { participantId, displayName, role }
}

/**
 * Starts the mock server.
 * @param {object} [options]
 * @param {number} [options.port] 0 picks a free port (used by the self-test).
 * @param {boolean} [options.rateLimit] Apply the rate limits from the contract.
 * @param {boolean} [options.broadcastPlayerStatus] Broadcast participant.updated on player.status
 *   (the contract says yes; the real backend does not do it yet).
 * @param {object} [options.media] Override the media object.
 */
export function createMockServer({
  port = DEFAULT_PORT,
  rateLimit = true,
  broadcastPlayerStatus = true,
  media = DEFAULT_MEDIA,
} = {}) {
  const createdAtMs = Date.now()
  const playback = {
    roomId: ROOM_ID,
    mediaId: media.mediaId,
    status: 'paused',
    positionSec: 0,
    playbackRate: 1.0,
    updatedAtServerMs: createdAtMs,
    version: 1,
  }
  const participants = new Map() // participantId -> Participant
  const activeConnections = new Map() // participantId -> ws
  const chat = []
  const rateWindows = new Map()

  function send(ws, type, payload, requestId) {
    if (ws.readyState !== WebSocket.OPEN) return
    const envelope = {
      v: PROTOCOL_VERSION,
      type,
      ...(requestId ? { requestId } : {}),
      sentAtMs: Date.now(),
      payload,
    }
    ws.send(JSON.stringify(envelope))
  }

  function sendError(ws, requestId, code, message, details) {
    send(ws, 'error', { code, message, ...(details ? { details } : {}) }, requestId)
  }

  function broadcast(type, payload, { requestId, excludeParticipantId } = {}) {
    for (const [participantId, ws] of activeConnections) {
      if (participantId === excludeParticipantId) continue
      send(ws, type, payload, requestId)
    }
  }

  function connectedCount() {
    return [...participants.values()].filter((p) => p.connected).length
  }

  function snapshotFor(participantId) {
    const host = [...participants.values()].find((p) => p.role === 'host')
    return {
      room: {
        roomId: ROOM_ID,
        mediaId: media.mediaId,
        mediaTitle: media.title,
        status: 'open',
        hostDisplayName: host ? host.displayName : 'Host',
        participantCount: connectedCount(),
        maxParticipants: MAX_PARTICIPANTS,
        createdAtMs,
        expiresAtMs: createdAtMs + ROOM_LIFETIME_MS,
        inviteUrl: `http://localhost:5173/r/${ROOM_ID}`,
      },
      media: { ...media },
      playback: { ...playback },
      participants: [...participants.values()].map((p) => ({ ...p })),
      recentChat: chat.slice(-RECENT_CHAT_LIMIT),
      self: { participantId, role: participants.get(participantId).role },
    }
  }

  function checkRate(participantId, type) {
    if (!rateLimit || !(type in RATE_LIMITS)) return
    const [limit, windowMs] = RATE_LIMITS[type]
    const nowMs = Date.now()
    const key = `${participantId}:${type}`
    let window = rateWindows.get(key)
    if (!window || nowMs - window.start >= windowMs) {
      window = { start: nowMs, count: 0 }
      rateWindows.set(key, window)
    }
    if (window.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((window.start + windowMs - nowMs) / 1000))
      throw new ProtocolError('RATE_LIMITED', 'Rate limit exceeded.', { retryAfterSec })
    }
    window.count += 1
  }

  const HANDLERS = {
    'session.resume': (ws, msg) => {
      send(ws, 'room.snapshot', snapshotFor(ws.ctx.participantId), msg.requestId)
    },

    'clock.ping': (ws, msg) => {
      send(
        ws,
        'clock.pong',
        { clientSendMs: msg.payload.clientSendMs, serverTimeMs: Date.now() },
        msg.requestId,
      )
    },

    heartbeat: () => {},

    'playback.command': (ws, msg) => {
      const { participantId } = ws.ctx
      const { action, positionSec, baseVersion } = msg.payload
      if (participants.get(participantId).role === 'viewer') {
        throw new ProtocolError('FORBIDDEN', 'Viewer role cannot control playback.', {
          requiredRole: 'controller',
        })
      }
      if (positionSec > media.durationSec) {
        throw invalid('positionSec', 'positionSec is greater than the media duration.')
      }
      if (baseVersion !== playback.version) {
        throw new ProtocolError(
          'VERSION_CONFLICT',
          `Playback state version conflict. Expected version ${baseVersion}, but current version is ${playback.version}.`,
          { currentState: { ...playback } },
        )
      }
      if (action === 'play') playback.status = 'playing'
      if (action === 'pause') playback.status = 'paused'
      playback.positionSec = positionSec
      playback.version += 1
      playback.updatedAtServerMs = Date.now()
      broadcast(
        'playback.state',
        { state: { ...playback }, action, causedBy: participantId },
        { requestId: msg.requestId },
      )
    },

    'player.status': (ws, msg) => {
      const participant = participants.get(ws.ctx.participantId)
      participant.playerStatus = msg.payload.status
      if (broadcastPlayerStatus) {
        broadcast('participant.updated', { participant: { ...participant } })
      }
    },

    'chat.send': (ws, msg) => {
      const participant = participants.get(ws.ctx.participantId)
      const message = {
        messageId: randomUUID(),
        participantId: participant.participantId,
        displayName: participant.displayName,
        text: msg.payload.text,
        createdAtMs: Date.now(),
      }
      chat.push(message)
      if (chat.length > RECENT_CHAT_LIMIT) chat.shift()
      broadcast('chat.message', { message }, { requestId: msg.requestId })
    },

    'reaction.send': (ws, msg) => {
      broadcast(
        'reaction.added',
        { participantId: ws.ctx.participantId, emoji: msg.payload.emoji },
        { requestId: msg.requestId },
      )
    },

    'metrics.report': () => {},
  }

  function onMessage(ws, data) {
    const raw = data.toString('utf8')
    if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) {
      sendError(ws, undefined, 'PAYLOAD_TOO_LARGE', 'Message is larger than 4 KB.')
      return
    }

    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      sendError(ws, undefined, 'VALIDATION_ERROR', 'Malformed JSON payload.')
      return
    }

    const echoId =
      isObject(msg) && typeof msg.requestId === 'string' && msg.requestId.length <= 64 && msg.requestId
        ? msg.requestId
        : undefined

    try {
      validateEnvelope(msg)
      const validate = PAYLOAD_VALIDATORS[msg.type]
      if (!validate) throw invalid('type', `Unknown message type '${msg.type}'.`)
      validate(msg.payload, msg)
      checkRate(ws.ctx.participantId, msg.type)
      HANDLERS[msg.type](ws, msg)
    } catch (error) {
      if (error instanceof ProtocolError) {
        sendError(ws, echoId, error.code, error.message, error.details)
      } else {
        console.error('Unexpected error in mock server:', error)
        sendError(ws, echoId, 'INTERNAL_ERROR', 'Internal server error.')
      }
    }
  }

  function onConnect(ws, request) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const token = url.searchParams.get('token')
    if (!token) {
      ws.close(1008, 'missing token')
      return
    }

    const identity = identityFromToken(token)
    ws.ctx = { participantId: identity.participantId }
    ws.on('error', () => {})
    ws.on('message', (data) => onMessage(ws, data))
    ws.on('close', () => onClose(ws))

    const previous = activeConnections.get(identity.participantId)
    activeConnections.set(identity.participantId, ws)

    if (previous && previous.readyState === WebSocket.OPEN) {
      // Same participant connected again: the old connection is replaced (ws-messages.md §1.2).
      // No participant.left and no change to `connected`.
      send(previous, 'session.ended', { reason: 'replaced' })
      previous.close()
      return
    }

    let participant = participants.get(identity.participantId)
    if (participant) {
      participant.connected = true
    } else {
      participant = {
        participantId: identity.participantId,
        displayName: identity.displayName,
        role: identity.role,
        playerStatus: 'unknown',
        connected: true,
        joinedAtMs: Date.now(),
      }
      participants.set(identity.participantId, participant)
    }
    broadcast(participant.role === 'host' ? 'participant.updated' : 'participant.joined', {
      participant: { ...participant },
    }, { excludeParticipantId: identity.participantId })
  }

  function onClose(ws) {
    const { participantId } = ws.ctx
    // A replaced connection is no longer the active one: ignore its close.
    if (activeConnections.get(participantId) !== ws) return
    activeConnections.delete(participantId)

    const participant = participants.get(participantId)
    if (!participant) return
    if (participant.role === 'host') {
      participant.connected = false
      broadcast('participant.updated', { participant: { ...participant } })
    } else {
      participants.delete(participantId)
      broadcast('participant.left', { participantId, reason: 'disconnected' })
    }
  }

  // Minimal REST so the frontend can run the whole join flow (openapi.yaml: joinRoom,
  // refreshSession, issueMediaCookies). Mock-only: "?role=" on join picks the role.
  function handleRest(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const origin = request.headers.origin
    const cors = {
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    }
    const json = (status, body) => {
      response.writeHead(status, { ...cors, 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(body))
    }
    const fail = (status, code, message) => json(status, { error: { code, message } })

    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors)
      response.end()
      return
    }

    const route = url.pathname.match(/^\/rooms\/([^/]+)\/(join|session\/refresh|media-cookies)$/)
    if (request.method === 'GET' && url.pathname === '/health') {
      json(200, { status: 'ok' })
      return
    }
    if (request.method !== 'POST' || !route) {
      response.writeHead(200, { ...cors, 'content-type': 'text/plain; charset=utf-8' })
      response.end('Watch Party mock server. REST: POST /rooms/{id}/join. WebSocket: /?token=host\n')
      return
    }
    if (route[1] !== ROOM_ID) {
      fail(404, 'NOT_FOUND', `Room '${route[1]}' not found. The mock only has '${ROOM_ID}'.`)
      return
    }

    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')
      if (route[2] === 'media-cookies') {
        if (!bearer) return fail(401, 'UNAUTHORIZED', 'Missing room token.')
        // The real backend sets CloudFront cookies here. The mock has nothing to protect.
        response.writeHead(204, cors)
        response.end()
        return
      }

      let identity
      if (route[2] === 'join') {
        let parsed
        try {
          parsed = JSON.parse(body || '{}')
        } catch {
          return fail(400, 'VALIDATION_ERROR', 'Body is not valid JSON.')
        }
        const name = typeof parsed.displayName === 'string' ? parsed.displayName.trim() : ''
        if (!name || name.length > 32 || Object.keys(parsed).some((key) => key !== 'displayName')) {
          return fail(400, 'VALIDATION_ERROR', 'displayName (1-32 chars) is required.')
        }
        const role = ROLES.includes(url.searchParams.get('role')) ? url.searchParams.get('role') : 'viewer'
        identity = { role, name: name.replaceAll('-', ' ') }
      } else {
        if (!bearer) return fail(401, 'UNAUTHORIZED', 'Missing room token.')
        const known = identityFromToken(bearer[1])
        identity = { role: known.role, name: known.displayName }
      }

      const roomToken = `${identity.role}-${identity.name}`
      const session = identityFromToken(roomToken)
      json(200, {
        roomId: ROOM_ID,
        participantId: session.participantId,
        displayName: session.displayName,
        role: session.role,
        roomToken,
        roomTokenExpiresAtMs: Date.now() + 4 * 60 * 60 * 1000,
        wsUrl: `ws://${request.headers.host ?? `localhost:${DEFAULT_PORT}`}`,
      })
    })
  }

  const httpServer = createServer(handleRest)
  const wss = new WebSocketServer({ server: httpServer })
  wss.on('connection', onConnect)

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, () => {
      resolve({
        port: httpServer.address().port,
        state: { playback, participants, chat },
        close: () =>
          new Promise((done) => {
            for (const client of wss.clients) client.terminate()
            wss.close(() => httpServer.close(() => done()))
          }),
      })
    })
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  const media = { ...DEFAULT_MEDIA }
  if (process.env.MOCK_PLAYBACK_URL) media.playbackUrl = process.env.MOCK_PLAYBACK_URL
  if (process.env.MOCK_DURATION_SEC) media.durationSec = Number(process.env.MOCK_DURATION_SEC)

  const server = await createMockServer({
    port,
    media,
    rateLimit: process.env.MOCK_RATE_LIMIT !== 'off',
  })

  console.log(`Mock WebSocket server running on ws://localhost:${server.port}/`)
  console.log('Connect with a token that sets the role:')
  console.log(`  ws://localhost:${server.port}/?token=host`)
  console.log(`  ws://localhost:${server.port}/?token=controller-dina`)
  console.log(`  ws://localhost:${server.port}/?token=viewer-bimo`)
  console.log('Send session.resume right after the connection opens.')
}
