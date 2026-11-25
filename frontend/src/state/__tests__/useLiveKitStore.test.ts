import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
const mockSetCameraEnabled = vi.fn(async (_enabled: boolean) => {})
const mockSetMicrophoneEnabled = vi.fn(async (_enabled: boolean) => {})
const mockRoomConnect = vi.fn(async () => {})
const mockRoomDisconnect = vi.fn(() => {})

const mockLocalParticipant = {
  identity: 'p_local',
  isCameraEnabled: false,
  isMicrophoneEnabled: false,
  setCameraEnabled: async (enabled: boolean) => {
    await mockSetCameraEnabled(enabled)
    mockLocalParticipant.isCameraEnabled = enabled
  },
  setMicrophoneEnabled: async (enabled: boolean) => {
    await mockSetMicrophoneEnabled(enabled)
    mockLocalParticipant.isMicrophoneEnabled = enabled
  },
}

vi.mock('livekit-client', () => {
  class MockRoom {
    localParticipant = mockLocalParticipant
    remoteParticipants = new Map()
    on(event: string, cb: (...args: unknown[]) => void) {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(cb)
      return this
    }
    connect = mockRoomConnect
    disconnect = mockRoomDisconnect
  }

  return {
    Room: MockRoom,
    RoomEvent: {
      Connected: 'connected',
      Disconnected: 'disconnected',
      ParticipantConnected: 'participantConnected',
      ParticipantDisconnected: 'participantDisconnected',
      ConnectionQualityChanged: 'connectionQualityChanged',
      ActiveSpeakersChanged: 'activeSpeakersChanged',
      LocalTrackPublished: 'localTrackPublished',
      LocalTrackUnpublished: 'localTrackUnpublished',
      TrackPublished: 'trackPublished',
      TrackUnpublished: 'trackUnpublished',
      TrackSubscribed: 'trackSubscribed',
      TrackUnsubscribed: 'trackUnsubscribed',
      TrackMuted: 'trackMuted',
      TrackUnmuted: 'trackUnmuted',
    },
    ConnectionQuality: {
      Excellent: 'excellent',
      Good: 'good',
      Poor: 'poor',
    },
  }
})

import { useLiveKitStore } from '../useLiveKitStore'

describe('useLiveKitStore', () => {
  beforeEach(() => {
    for (const key of Object.keys(handlers)) delete handlers[key]
    mockLocalParticipant.isCameraEnabled = false
    mockLocalParticipant.isMicrophoneEnabled = false
    mockSetCameraEnabled.mockReset().mockResolvedValue(undefined)
    mockSetMicrophoneEnabled.mockReset().mockResolvedValue(undefined)
    mockRoomConnect.mockReset().mockResolvedValue(undefined)
    mockRoomDisconnect.mockReset()
    useLiveKitStore.getState().disconnect()
  })

  it('connects with camera and mic disabled by default and tracks active speakers', async () => {
    await useLiveKitStore.getState().connect('wss://rtc.example.test', 'token-123')

    const state = useLiveKitStore.getState()
    expect(mockRoomConnect).toHaveBeenCalledWith('wss://rtc.example.test', 'token-123')
    expect(mockSetCameraEnabled).toHaveBeenCalledWith(false)
    expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(false)
    expect(state.isConnected).toBe(true)
    expect(state.isCameraEnabled).toBe(false)
    expect(state.isMicEnabled).toBe(false)
    expect(state.trackVersion).toBe(1)

    handlers.activeSpeakersChanged?.forEach((cb) => cb([{ identity: 'p_remote_1' }]))
    expect(useLiveKitStore.getState().activeSpeakerIds).toEqual(['p_remote_1'])

    handlers.trackMuted?.forEach((cb) => cb())
    expect(useLiveKitStore.getState().trackVersion).toBe(2)
  })

  it('toggles camera/mic and handles device permission errors gracefully', async () => {
    await useLiveKitStore.getState().connect('wss://rtc.example.test', 'token-123')

    const camOn = await useLiveKitStore.getState().toggleCamera()
    expect(camOn).toBe(true)
    expect(useLiveKitStore.getState().isCameraEnabled).toBe(true)

    const denied = new Error('Permission denied')
    denied.name = 'NotAllowedError'
    mockSetMicrophoneEnabled.mockRejectedValueOnce(denied)

    const micOn = await useLiveKitStore.getState().toggleMicrophone()
    expect(micOn).toBe(false)
    expect(useLiveKitStore.getState().mediaError).toContain('Izin mikrofon ditolak')
  })

  it('sets sanitized error message when LiveKit connection fails', async () => {
    mockRoomConnect.mockRejectedValueOnce(new Error('wss://secret-internal.invalid rejected'))

    await useLiveKitStore.getState().connect('wss://rtc.example.test', 'secret-token')

    const state = useLiveKitStore.getState()
    expect(state.isConnected).toBe(false)
    expect(state.error).toBe('Video chat sedang tidak tersedia')
  })

  it('disconnects cleanly and clears speakers and track state', async () => {
    await useLiveKitStore.getState().connect('wss://rtc.example.test', 'token-123')
    handlers.activeSpeakersChanged?.forEach((cb) => cb([{ identity: 'p_1' }]))

    useLiveKitStore.getState().disconnect()

    const state = useLiveKitStore.getState()
    expect(mockRoomDisconnect).toHaveBeenCalled()
    expect(state.room).toBeNull()
    expect(state.isConnected).toBe(false)
    expect(state.activeSpeakerIds).toEqual([])
    expect(state.trackVersion).toBe(0)
  })
})
