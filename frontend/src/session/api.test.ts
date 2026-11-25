import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  grantController,
  kickParticipant,
  requestRtcToken,
  revokeController,
} from './api'

describe('social & rtc REST api helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requestRtcToken calls POST /rooms/{id}/rtc-token with bearer roomToken', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ token: 'lk-jwt', url: 'wss://rtc.example.test', expiresAtMs: 12345 }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestRtcToken('Room/1', 'room-jwt')
    expect(result).toEqual({ token: 'lk-jwt', url: 'wss://rtc.example.test', expiresAtMs: 12345 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/rooms/Room%2F1/rtc-token',
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: 'Bearer room-jwt' },
      }),
    )
  })

  it('grantController and revokeController call PUT and DELETE /controllers/{pid}', async () => {
    const participantPayload = {
      participantId: 'p_2',
      displayName: 'Budi',
      role: 'controller',
      playerStatus: 'ready',
      connected: true,
      joinedAtMs: 100,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(participantPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...participantPayload, role: 'viewer' }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const granted = await grantController('Room1', 'p_2', 'host-jwt')
    expect(granted.role).toBe('controller')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8787/rooms/Room1/controllers/p_2',
      expect.objectContaining({ method: 'PUT', headers: { authorization: 'Bearer host-jwt' } }),
    )

    const revoked = await revokeController('Room1', 'p_2', 'host-jwt')
    expect(revoked.role).toBe('viewer')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8787/rooms/Room1/controllers/p_2',
      expect.objectContaining({ method: 'DELETE', headers: { authorization: 'Bearer host-jwt' } }),
    )
  })

  it('kickParticipant handles 204 No Content and surfaces ApiError on 403', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Host only' } }), {
          status: 403,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(kickParticipant('Room1', 'p_2', 'host-jwt')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/rooms/Room1/participants/p_2',
      expect.objectContaining({ method: 'DELETE', headers: { authorization: 'Bearer host-jwt' } }),
    )

    await expect(kickParticipant('Room1', 'p_2', 'viewer-jwt')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    } satisfies Partial<ApiError>)
  })
})

