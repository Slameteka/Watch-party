import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaybackStore } from '../player/usePlaybackStore'
import { wsClient } from '../services/websocket'
import { useLiveKitStore } from '../state/useLiveKitStore'
import { useSocialStore } from '../state/useSocialStore'
import type { MediaItem, Participant, PlaybackState, WsEnvelope } from '../types'
import {
  handleServerMessage,
  kickRoomParticipant,
  reportPlayerStatus,
  sendPlaybackCommand,
  startSession,
  stopSession,
  toggleParticipantController,
} from './session'

const media: MediaItem = {
  mediaId: 'big-buck-bunny',
  title: 'Big Buck Bunny',
  durationSec: 596,
  posterUrl: 'https://example.com/poster.jpg',
  playbackUrl: 'https://example.com/master.m3u8',
  license: 'CC BY 3.0',
  attribution: 'Blender Foundation',
}

const playbackState = (version: number, positionSec = 0): PlaybackState => ({
  roomId: 'MockRoom0001',
  mediaId: 'big-buck-bunny',
  status: 'paused',
  positionSec,
  playbackRate: 1,
  updatedAtServerMs: 1_000,
  version,
})

const participant = (id: string, role: Participant['role'] = 'viewer'): Participant => ({
  participantId: id,
  displayName: id,
  role,
  playerStatus: 'unknown',
  connected: true,
  joinedAtMs: 1,
})

const message = (type: string, payload: unknown, requestId?: string): WsEnvelope<unknown> => ({
  v: 1,
  type,
  sentAtMs: Date.now(),
  ...(requestId ? { requestId } : {}),
  payload,
})

function snapshot(role: Participant['role'], version = 1) {
  handleServerMessage(
    message('room.snapshot', {
      room: { expiresAtMs: Date.now() + 3_600_000 },
      media,
      playback: playbackState(version),
      participants: [participant('p_self', role), participant('p_other')],
      recentChat: [],
      self: { participantId: 'p_self', role },
    }),
  )
}

describe('session message router', () => {
  let send: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    send = vi.spyOn(wsClient, 'send').mockImplementation(() => {})
    vi.spyOn(wsClient, 'sendClockPing').mockImplementation(() => {})
    vi.spyOn(wsClient, 'sendPlayerStatus').mockImplementation(() => {})
    useSocialStore.setState({ participants: [], messages: [], selfParticipantId: null, selfRole: 'viewer' })
  })

  afterEach(() => {
    stopSession()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('room.snapshot fills both stores and marks the connection as connected', () => {
    snapshot('host', 3)
    const playback = usePlaybackStore.getState()
    expect(playback.connection).toBe('connected')
    expect(playback.state?.version).toBe(3)
    expect(playback.media?.mediaId).toBe('big-buck-bunny')
    const social = useSocialStore.getState()
    expect(social.participants).toHaveLength(2)
    expect(social.selfParticipantId).toBe('p_self')
    expect(social.selfRole).toBe('host')
  })

  it('playback.state ignores an old version', () => {
    snapshot('host', 5)
    handleServerMessage(message('playback.state', { state: playbackState(4, 99) }))
    expect(usePlaybackStore.getState().state?.version).toBe(5)
    handleServerMessage(message('playback.state', { state: playbackState(6, 42) }))
    expect(usePlaybackStore.getState().state?.positionSec).toBe(42)
  })

  it('routes participants, chat and reactions to the social store', () => {
    snapshot('viewer')
    handleServerMessage(message('participant.joined', { participant: participant('p_new') }))
    expect(useSocialStore.getState().participants.map((p) => p.participantId)).toContain('p_new')

    handleServerMessage(
      message('chat.message', {
        message: { messageId: 'm1', participantId: 'p_new', displayName: 'New', text: 'halo', createdAtMs: 1 },
      }),
    )
    expect(useSocialStore.getState().messages.at(-1)?.text).toBe('halo')

    handleServerMessage(message('reaction.added', { participantId: 'p_new', emoji: 'heart' }))
    expect(useSocialStore.getState().activeReactions.at(-1)?.emoji).toBe('heart')

    handleServerMessage(message('participant.left', { participantId: 'p_new', reason: 'disconnected' }))
    expect(useSocialStore.getState().participants.map((p) => p.participantId)).not.toContain('p_new')
  })

  it('updates our own role when the host changes it', () => {
    snapshot('viewer')
    handleServerMessage(
      message('participant.updated', { participant: participant('p_self', 'controller') }),
    )
    expect(useSocialStore.getState().selfRole).toBe('controller')
  })

  it('clock.pong sets the clock offset from the best sample', () => {
    snapshot('viewer')
    // Sent at 1000 (their clock), server 1600, received 1200: rtt 200, offset 500.
    vi.setSystemTime(1_200)
    handleServerMessage(message('clock.pong', { clientSendMs: 1_000, serverTimeMs: 1_600 }))
    expect(usePlaybackStore.getState().clockOffsetMs).toBe(500)
  })

  it('session.ended stops the session with the reason', () => {
    snapshot('viewer')
    handleServerMessage(message('session.ended', { reason: 'kicked' }))
    const playback = usePlaybackStore.getState()
    expect(playback.connection).toBe('ended')
    expect(playback.connectionReason).toBe('kicked')
  })

  it('reports player status once, and drops repeats', () => {
    snapshot('viewer')
    reportPlayerStatus('buffering')
    reportPlayerStatus('buffering')
    reportPlayerStatus('ready')
    expect(wsClient.sendPlayerStatus).toHaveBeenCalledTimes(2)
  })

  describe('playback commands', () => {
    it('a viewer cannot send', () => {
      snapshot('viewer')
      expect(sendPlaybackCommand('play', 0)).toBe('forbidden')
      expect(send).not.toHaveBeenCalled()
    })

    it('does nothing before the first snapshot', () => {
      useSocialStore.setState({ selfRole: 'host' })
      expect(sendPlaybackCommand('play', 0)).toBe('not-ready')
    })

    it('sends with baseVersion and clamps the position to the movie length', () => {
      snapshot('host', 7)
      expect(sendPlaybackCommand('seek', 9_999)).toBe('sent')
      const [type, payload, requestId] = send.mock.calls[0]
      expect(type).toBe('playback.command')
      expect(payload).toEqual({ action: 'seek', positionSec: 596, baseVersion: 7 })
      expect(typeof requestId).toBe('string')

      vi.advanceTimersByTime(3_001)
      expect(sendPlaybackCommand('seek', -5)).toBe('sent')
      expect(send.mock.calls[1][1]).toMatchObject({ positionSec: 0 })
    })

    it('waits for the answer before sending the next command', () => {
      snapshot('controller')
      expect(sendPlaybackCommand('play', 1)).toBe('sent')
      expect(sendPlaybackCommand('pause', 2)).toBe('busy')
      const requestId = send.mock.calls[0][2] as string
      handleServerMessage(message('playback.state', { state: playbackState(2, 1) }, requestId))
      expect(usePlaybackStore.getState().commandPending).toBe(false)
      expect(sendPlaybackCommand('pause', 2)).toBe('sent')
    })

    it('VERSION_CONFLICT applies the current state and shows a message', () => {
      snapshot('host', 1)
      sendPlaybackCommand('play', 0)
      const requestId = send.mock.calls[0][2] as string
      handleServerMessage(
        message(
          'error',
          {
            code: 'VERSION_CONFLICT',
            message: 'Stale baseVersion.',
            details: { currentState: playbackState(4, 30) },
          },
          requestId,
        ),
      )
      const playback = usePlaybackStore.getState()
      expect(playback.state?.version).toBe(4)
      expect(playback.commandPending).toBe(false)
      expect(playback.commandError).toContain('Coba lagi')
    })

    it('stops at 10 commands per 10 seconds', () => {
      snapshot('host', 1)
      for (let i = 0; i < 10; i += 1) {
        expect(sendPlaybackCommand('seek', i)).toBe('sent')
        const requestId = send.mock.calls[i][2] as string
        handleServerMessage(message('playback.state', { state: playbackState(i + 2) }, requestId))
      }
      expect(sendPlaybackCommand('seek', 11)).toBe('rate-limited')
      vi.advanceTimersByTime(10_001)
      expect(sendPlaybackCommand('seek', 11)).toBe('sent')
    })
  })

  describe('LiveKit lifecycle and role management', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('requests rtc-token and connects LiveKit on room.snapshot, then disconnects on session.ended', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/join')) {
          return new Response(
            JSON.stringify({
              roomId: 'Room12345678',
              participantId: 'p_host',
              displayName: 'Alice',
              role: 'host',
              roomToken: 'secret-room-jwt',
              roomTokenExpiresAtMs: Date.now() + 10_000_000,
              wsUrl: 'wss://ws.example.test',
            }),
            { status: 200 },
          )
        }
        if (url.endsWith('/media-cookies')) {
          return new Response(null, { status: 204 })
        }
        if (url.endsWith('/rtc-token')) {
          return new Response(
            JSON.stringify({
              token: 'lk-jwt',
              url: 'wss://rtc.example.test',
              expiresAtMs: Date.now() + 600_000,
            }),
            { status: 200 },
          )
        }
        return new Response(null, { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(wsClient, 'connect').mockResolvedValue()
      const lkConnect = vi.spyOn(useLiveKitStore.getState(), 'connect').mockResolvedValue()
      const lkDisconnect = vi.spyOn(useLiveKitStore.getState(), 'disconnect')

      await startSession({ roomId: 'Room12345678', displayName: 'Alice' })
      snapshot('host', 1)

      await vi.waitFor(() => {
        expect(lkConnect).toHaveBeenCalledWith('wss://rtc.example.test', 'lk-jwt')
      })

      handleServerMessage(message('session.ended', { reason: 'roomClosed' }))
      expect(lkDisconnect).toHaveBeenCalled()
    })

    it('degrades gracefully when rtc-token fails without breaking playback session', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/join')) {
          return new Response(
            JSON.stringify({
              roomId: 'Room12345678',
              participantId: 'p_viewer',
              displayName: 'Bob',
              role: 'viewer',
              roomToken: 'viewer-jwt',
              roomTokenExpiresAtMs: Date.now() + 10_000_000,
              wsUrl: 'wss://ws.example.test',
            }),
            { status: 200 },
          )
        }
        if (url.endsWith('/media-cookies')) return new Response(null, { status: 204 })
        if (url.endsWith('/rtc-token')) {
          return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'down' } }), {
            status: 500,
          })
        }
        return new Response(null, { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(wsClient, 'connect').mockResolvedValue()

      await startSession({ roomId: 'Room12345678', displayName: 'Bob' })
      snapshot('viewer', 1)

      await vi.waitFor(() => {
        expect(useLiveKitStore.getState().error).toBe('Video chat sedang tidak tersedia')
      })
      expect(usePlaybackStore.getState().connection).toBe('connected')
    })

    it('toggles controller and kicks participant using active session token', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/join')) {
          return new Response(
            JSON.stringify({
              roomId: 'Room12345678',
              participantId: 'p_host',
              displayName: 'Alice',
              role: 'host',
              roomToken: 'host-secret-jwt',
              roomTokenExpiresAtMs: Date.now() + 10_000_000,
              wsUrl: 'wss://ws.example.test',
            }),
            { status: 200 },
          )
        }
        if (url.endsWith('/media-cookies')) return new Response(null, { status: 204 })
        if (url.endsWith('/controllers/p_guest') && init?.method === 'PUT') {
          return new Response(JSON.stringify(participant('p_guest', 'controller')), { status: 200 })
        }
        if (url.endsWith('/participants/p_guest') && init?.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        return new Response(null, { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(wsClient, 'connect').mockResolvedValue()

      await startSession({ roomId: 'Room12345678', displayName: 'Alice' })
      useSocialStore.setState({ participants: [participant('p_host', 'host'), participant('p_guest', 'viewer')] })

      const updated = await toggleParticipantController('p_guest', 'viewer')
      expect(updated.role).toBe('controller')
      expect(useSocialStore.getState().participants.find((p) => p.participantId === 'p_guest')?.role).toBe(
        'controller',
      )

      await kickRoomParticipant('p_guest')
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/rooms/Room12345678/participants/p_guest'),
        expect.objectContaining({
          method: 'DELETE',
          headers: { authorization: 'Bearer host-secret-jwt' },
        }),
      )
    })

    it('rejects role changes cleanly when no session is active', async () => {
      await expect(toggleParticipantController('p_guest', 'viewer')).rejects.toThrow('Belum terhubung')
      await expect(kickRoomParticipant('p_guest')).rejects.toThrow('Belum terhubung')
    })
  })
})
