// End-to-end self-test for the mock server.
// Every message sent by the server is validated against docs/contracts/ws-messages.schema.json.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import WebSocket from 'ws'
import { createMockServer } from './server.mjs'

const schema = JSON.parse(
  readFileSync(new URL('../../docs/contracts/ws-messages.schema.json', import.meta.url), 'utf8'),
)
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const validateServerMessage = ajv.compile({
  $schema: schema.$schema,
  $defs: schema.$defs,
  $ref: '#/$defs/serverMessage',
})

const schemaErrors = []
let counter = 0

class TestClient {
  constructor(url, name) {
    this.name = name
    this.inbox = []
    this.waiters = []
    this.closed = false
    this.ws = new WebSocket(url)
    this.ws.on('message', (data) => this.#onMessage(JSON.parse(data.toString('utf8'))))
    this.ws.on('close', () => {
      this.closed = true
    })
  }

  #onMessage(msg) {
    if (!validateServerMessage(msg)) {
      schemaErrors.push({ client: this.name, msg, errors: validateServerMessage.errors })
    }
    const index = this.waiters.findIndex((w) => w.predicate(msg))
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1)
      clearTimeout(waiter.timer)
      waiter.resolve(msg)
    } else {
      this.inbox.push(msg)
    }
  }

  opened() {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
  }

  send(type, payload, requestId) {
    const envelope = {
      v: 1,
      type,
      ...(requestId ? { requestId } : {}),
      sentAtMs: Date.now(),
      payload,
    }
    this.ws.send(JSON.stringify(envelope))
  }

  sendRaw(text) {
    this.ws.send(text)
  }

  waitFor(predicate, timeoutMs = 1500) {
    const index = this.inbox.findIndex(predicate)
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0])
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve }
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error(`${this.name}: timeout waiting for message`))
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  type(type) {
    return this.waitFor((m) => m.type === type)
  }

  async expectNone(predicate, waitMs = 200) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    assert.equal(this.inbox.filter(predicate).length, 0, `${this.name}: unexpected message`)
  }

  waitClosed(timeoutMs = 1500) {
    if (this.closed) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: not closed`)), timeoutMs)
      this.ws.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  close() {
    this.ws.close()
  }
}

const server = await createMockServer({ port: 0 })
const baseUrl = `ws://127.0.0.1:${server.port}/`
const clients = []

async function connect(token, name = token) {
  const client = new TestClient(`${baseUrl}?token=${token}`, name)
  clients.push(client)
  await client.opened()
  return client
}

const rid = () => `req-${(counter += 1)}`
let failed = 0

async function step(name, fn) {
  try {
    await fn()
    console.log(`ok   - ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL - ${name}\n       ${error.message}`)
  }
}

const media = server.state.playback
let host
let viewer
let hostId
let viewerId

await step('host: session.resume returns a snapshot with version 1 and role host', async () => {
  host = await connect('host')
  host.send('session.resume', {}, 'r1')
  const snap = await host.type('room.snapshot')
  assert.equal(snap.requestId, 'r1')
  assert.equal(snap.payload.self.role, 'host')
  assert.equal(snap.payload.playback.version, 1)
  assert.equal(snap.payload.playback.status, 'paused')
  assert.equal(snap.payload.participants.length, 1)
  hostId = snap.payload.self.participantId
})

await step('clock.ping: 5 pings get 5 pongs that echo clientSendMs', async () => {
  const sent = []
  for (let i = 0; i < 5; i += 1) {
    const clientSendMs = Date.now() + i
    sent.push(clientSendMs)
    host.send('clock.ping', { clientSendMs })
  }
  for (const clientSendMs of sent) {
    const pong = await host.waitFor((m) => m.type === 'clock.pong' && m.payload.clientSendMs === clientSendMs)
    assert.ok(Number.isInteger(pong.payload.serverTimeMs))
  }
})

await step('viewer joins: host receives participant.joined, snapshot has 2 participants', async () => {
  viewer = await connect('viewer-bimo')
  const joined = await host.type('participant.joined')
  assert.equal(joined.payload.participant.displayName, 'Bimo')
  assert.equal(joined.payload.participant.role, 'viewer')
  viewerId = joined.payload.participant.participantId
  viewer.send('session.resume', {})
  const snap = await viewer.type('room.snapshot')
  assert.equal(snap.payload.participants.length, 2)
  assert.equal(snap.payload.self.role, 'viewer')
})

await step('viewer playback.command is FORBIDDEN and state does not change', async () => {
  viewer.send('playback.command', { action: 'play', positionSec: 10, baseVersion: 1 }, 'c-forbidden')
  const error = await viewer.type('error')
  assert.equal(error.payload.code, 'FORBIDDEN')
  assert.equal(error.payload.details.requiredRole, 'controller')
  assert.equal(error.requestId, 'c-forbidden')
  assert.equal(server.state.playback.version, 1)
})

await step('host play: both clients get playback.state version 2', async () => {
  host.send('playback.command', { action: 'play', positionSec: 10, baseVersion: 1 }, 'c-play')
  for (const client of [host, viewer]) {
    const msg = await client.type('playback.state')
    assert.equal(msg.payload.state.version, 2)
    assert.equal(msg.payload.state.status, 'playing')
    assert.equal(msg.payload.state.positionSec, 10)
    assert.equal(msg.payload.action, 'play')
    assert.equal(msg.payload.causedBy, hostId)
    assert.equal(msg.requestId, 'c-play')
  }
})

await step('stale baseVersion gets VERSION_CONFLICT with currentState', async () => {
  host.send('playback.command', { action: 'pause', positionSec: 12, baseVersion: 1 }, 'c-stale')
  const error = await host.type('error')
  assert.equal(error.payload.code, 'VERSION_CONFLICT')
  assert.equal(error.payload.details.currentState.version, 2)
  assert.equal(server.state.playback.version, 2)
})

await step('seek keeps status, pause sets paused, versions go 3 then 4', async () => {
  host.send('playback.command', { action: 'seek', positionSec: 100, baseVersion: 2 }, rid())
  const seek = await viewer.type('playback.state')
  assert.equal(seek.payload.state.version, 3)
  assert.equal(seek.payload.state.status, 'playing')
  assert.equal(seek.payload.state.positionSec, 100)

  host.send('playback.command', { action: 'pause', positionSec: 120, baseVersion: 3 }, rid())
  const pause = await viewer.type('playback.state')
  assert.equal(pause.payload.state.version, 4)
  assert.equal(pause.payload.state.status, 'paused')
  assert.equal(pause.payload.state.positionSec, 120)
})

await step('positionSec beyond the media duration is VALIDATION_ERROR', async () => {
  host.send(
    'playback.command',
    { action: 'seek', positionSec: media.positionSec + 99999, baseVersion: 4 },
    'c-far',
  )
  const error = await host.type('error')
  assert.equal(error.payload.code, 'VALIDATION_ERROR')
  assert.equal(error.payload.details.field, 'positionSec')
  assert.equal(server.state.playback.version, 4)
})

await step('chat.send reaches everyone with the sender name', async () => {
  viewer.send('chat.send', { text: 'halo' }, 'chat-1')
  for (const client of [host, viewer]) {
    const msg = await client.type('chat.message')
    assert.equal(msg.payload.message.text, 'halo')
    assert.equal(msg.payload.message.displayName, 'Bimo')
    assert.equal(msg.payload.message.participantId, viewerId)
  }
})

await step('reaction.send heart is broadcast, "fire" is rejected', async () => {
  viewer.send('reaction.send', { emoji: 'heart' })
  for (const client of [host, viewer]) {
    const msg = await client.type('reaction.added')
    assert.equal(msg.payload.emoji, 'heart')
    assert.equal(msg.payload.participantId, viewerId)
  }
  viewer.send('reaction.send', { emoji: 'fire' })
  const error = await viewer.type('error')
  assert.equal(error.payload.code, 'VALIDATION_ERROR')
  assert.equal(error.payload.details.field, 'emoji')
})

await step('player.status buffering is broadcast as participant.updated', async () => {
  viewer.send('player.status', { status: 'buffering' })
  const msg = await host.waitFor(
    (m) => m.type === 'participant.updated' && m.payload.participant.participantId === viewerId,
  )
  assert.equal(msg.payload.participant.playerStatus, 'buffering')
})

await step('bad input: invalid JSON, unknown field, wrong version, unknown type', async () => {
  viewer.sendRaw('not json')
  assert.equal((await viewer.type('error')).payload.code, 'VALIDATION_ERROR')

  viewer.sendRaw(
    JSON.stringify({ v: 1, type: 'chat.send', requestId: 'x1', sentAtMs: Date.now(), payload: { text: 'a', extra: 1 } }),
  )
  const extra = await viewer.type('error')
  assert.equal(extra.payload.code, 'VALIDATION_ERROR')
  assert.equal(extra.payload.details.field, 'extra')
  assert.equal(extra.requestId, 'x1')

  viewer.sendRaw(JSON.stringify({ v: 2, type: 'heartbeat', sentAtMs: Date.now(), payload: {} }))
  const version = await viewer.type('error')
  assert.equal(version.payload.code, 'UNSUPPORTED_VERSION')
  assert.deepEqual(version.payload.details.supported, [1])

  viewer.send('does.not.exist', {})
  assert.equal((await viewer.type('error')).payload.code, 'VALIDATION_ERROR')

  viewer.sendRaw(JSON.stringify({ v: 1, type: 'heartbeat', sentAtMs: Date.now(), payload: { pad: 'x'.repeat(5000) } }))
  assert.equal((await viewer.type('error')).payload.code, 'PAYLOAD_TOO_LARGE')
})

await step('chat rate limit: the 6th message in 10 s gets RATE_LIMITED', async () => {
  // One chat message was already sent above, so 4 more fit and the 5th extra is rejected.
  for (let i = 0; i < 5; i += 1) viewer.send('chat.send', { text: `m${i}` }, rid())
  const error = await viewer.type('error')
  assert.equal(error.payload.code, 'RATE_LIMITED')
  assert.ok(error.payload.details.retryAfterSec >= 1)
})

await step('same participant connects again: old connection gets "replaced", no participant.left', async () => {
  const second = await connect('viewer-bimo', 'viewer-bimo-2')
  const ended = await viewer.type('session.ended')
  assert.equal(ended.payload.reason, 'replaced')
  await viewer.waitClosed()
  await host.expectNone((m) => m.type === 'participant.left')
  second.send('session.resume', {})
  const snap = await second.type('room.snapshot')
  assert.equal(snap.payload.self.participantId, viewerId)
  viewer = second
})

let controller
let controllerId
await step('controller can control playback and appears as participant.joined', async () => {
  controller = await connect('controller-dina')
  const joined = await host.waitFor(
    (m) => m.type === 'participant.joined' && m.payload.participant.role === 'controller',
  )
  assert.equal(joined.payload.participant.displayName, 'Dina')
  controllerId = joined.payload.participant.participantId
  controller.send('session.resume', {})
  const snap = await controller.type('room.snapshot')
  assert.equal(snap.payload.playback.version, 4)
  controller.send('playback.command', { action: 'seek', positionSec: 50, baseVersion: 4 }, rid())
  // The host inbox still holds older playback.state messages, so wait for version 5 explicitly.
  const state = await host.waitFor((m) => m.type === 'playback.state' && m.payload.state.version === 5)
  assert.equal(state.payload.state.positionSec, 50)
  assert.equal(state.payload.causedBy, controllerId)
})

await step('guest disconnect: others get participant.left (disconnected)', async () => {
  viewer.close()
  const left = await host.type('participant.left')
  assert.equal(left.payload.participantId, viewerId)
  assert.equal(left.payload.reason, 'disconnected')
})

await step('host disconnect: others get participant.updated with connected=false, state is kept', async () => {
  host.close()
  const updated = await controller.waitFor(
    (m) => m.type === 'participant.updated' && m.payload.participant.role === 'host',
  )
  assert.equal(updated.payload.participant.connected, false)
  assert.equal(server.state.playback.version, 5)
})

await step('host reconnects: snapshot has the latest state, others see connected=true', async () => {
  host = await connect('host', 'host-2')
  host.send('session.resume', { lastVersion: 5 })
  const snap = await host.type('room.snapshot')
  assert.equal(snap.payload.playback.version, 5)
  assert.equal(snap.payload.playback.positionSec, 50)
  const updated = await controller.waitFor(
    (m) => m.type === 'participant.updated' && m.payload.participant.role === 'host',
  )
  assert.equal(updated.payload.participant.connected, true)
})

await step('connection without token is closed', async () => {
  const client = new TestClient(baseUrl, 'no-token')
  clients.push(client)
  await client.waitClosed()
})

await step('REST: join returns RoomSession, the token works on the WebSocket', async () => {
  const httpUrl = `http://localhost:${server.port}`
  const response = await fetch(`${httpUrl}/rooms/MockRoom0001/join?role=controller`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({ displayName: 'Dina' }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
  const session = await response.json()
  assert.deepEqual(Object.keys(session).sort(), [
    'displayName', 'participantId', 'role', 'roomId', 'roomToken', 'roomTokenExpiresAtMs', 'wsUrl',
  ])
  assert.equal(session.role, 'controller')
  assert.equal(session.displayName, 'Dina')

  const client = await connect(session.roomToken)
  client.send('session.resume', {})
  const snapshot = await client.waitFor((m) => m.type === 'room.snapshot')
  assert.equal(snapshot.payload.self.participantId, session.participantId)
  assert.equal(snapshot.payload.self.role, 'controller')
})

await step('REST: validation, unknown room, media-cookies, refresh', async () => {
  const httpUrl = `http://localhost:${server.port}`
  const post = (path, init = {}) => fetch(`${httpUrl}${path}`, { method: 'POST', ...init })

  const empty = await post('/rooms/MockRoom0001/join', { body: '{}' })
  assert.equal(empty.status, 400)
  const unknown = await post('/rooms/Nope/join', { body: JSON.stringify({ displayName: 'A' }) })
  assert.equal(unknown.status, 404)

  assert.equal((await post('/rooms/MockRoom0001/media-cookies')).status, 401)
  const cookies = await post('/rooms/MockRoom0001/media-cookies', {
    headers: { authorization: 'Bearer viewer-bimo' },
  })
  assert.equal(cookies.status, 204)

  const refreshed = await post('/rooms/MockRoom0001/session/refresh', {
    headers: { authorization: 'Bearer host-raka' },
  })
  assert.equal(refreshed.status, 200)
  assert.equal((await refreshed.json()).role, 'host')
})

await step('every server message matched ws-messages.schema.json', async () => {
  assert.equal(
    schemaErrors.length,
    0,
    `schema errors:\n${JSON.stringify(schemaErrors.slice(0, 3), null, 2)}`,
  )
})

for (const client of clients) client.close()
await server.close()

if (failed > 0) {
  console.log(`\n${failed} step(s) failed`)
  process.exit(1)
}
console.log('\nAll steps passed')
