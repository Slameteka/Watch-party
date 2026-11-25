import {
  ConnectionQuality,
  RemoteParticipant,
  Room,
  RoomEvent,
} from 'livekit-client'
import { create } from 'zustand'

interface LiveKitState {
  room: Room | null
  isConnecting: boolean
  isConnected: boolean
  isCameraEnabled: boolean
  isMicEnabled: boolean
  error: string | null
  mediaError: string | null
  remoteParticipants: RemoteParticipant[]
  activeSpeakerIds: string[]
  qualityMap: Record<string, 'excellent' | 'good' | 'poor'>
  trackVersion: number

  connect: (url: string, token: string) => Promise<void>
  disconnect: () => void
  toggleCamera: () => Promise<boolean>
  toggleMicrophone: () => Promise<boolean>
  clearError: () => void
  clearMediaError: () => void
}

const mapQuality = (q: ConnectionQuality): 'excellent' | 'good' | 'poor' => {
  switch (q) {
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Good:
      return 'good'
    case ConnectionQuality.Poor:
      return 'poor'
    default:
      return 'excellent'
  }
}

function mapMediaDeviceError(err: unknown, deviceLabel: string): string {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return `Izin ${deviceLabel} ditolak oleh browser.`
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return `Perangkat ${deviceLabel} tidak ditemukan.`
    }
  }
  return `Gagal mengubah status ${deviceLabel}.`
}

export const useLiveKitStore = create<LiveKitState>((set, get) => ({
  room: null,
  isConnecting: false,
  isConnected: false,
  isCameraEnabled: false,
  isMicEnabled: false,
  error: null,
  mediaError: null,
  remoteParticipants: [],
  activeSpeakerIds: [],
  qualityMap: {},
  trackVersion: 0,

  connect: async (url: string, token: string) => {
    const currentRoom = get().room
    if (currentRoom) {
      currentRoom.disconnect()
    }

    set({ isConnecting: true, error: null, mediaError: null })

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 320, height: 240, frameRate: 15 },
      },
    })

    const syncTracks = () => {
      set((state) => ({
        remoteParticipants: Array.from(room.remoteParticipants.values()),
        isCameraEnabled: room.localParticipant.isCameraEnabled,
        isMicEnabled: room.localParticipant.isMicrophoneEnabled,
        trackVersion: state.trackVersion + 1,
      }))
    }

    try {
      room
        .on(RoomEvent.Connected, () => {
          set({
            isConnected: true,
            isConnecting: false,
            remoteParticipants: Array.from(room.remoteParticipants.values()),
          })
        })
        .on(RoomEvent.Disconnected, () => {
          set({
            room: null,
            isConnected: false,
            isConnecting: false,
            isCameraEnabled: false,
            isMicEnabled: false,
            remoteParticipants: [],
            activeSpeakerIds: [],
            trackVersion: 0,
          })
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
          set((state) => {
            const exists = state.remoteParticipants.some((p) => p.identity === participant.identity)
            if (exists) return state
            return { remoteParticipants: [...state.remoteParticipants, participant] }
          })
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          set((state) => ({
            remoteParticipants: state.remoteParticipants.filter(
              (p) => p.identity !== participant.identity
            ),
            activeSpeakerIds: state.activeSpeakerIds.filter((id) => id !== participant.identity),
          }))
        })
        .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          const key = participant ? participant.identity : 'local'
          set((state) => ({
            qualityMap: {
              ...state.qualityMap,
              [key]: mapQuality(quality),
            },
          }))
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          set({
            activeSpeakerIds: speakers.map((speaker) => speaker.identity),
          })
        })
        .on(RoomEvent.LocalTrackPublished, syncTracks)
        .on(RoomEvent.LocalTrackUnpublished, syncTracks)
        .on(RoomEvent.TrackPublished, syncTracks)
        .on(RoomEvent.TrackUnpublished, syncTracks)
        .on(RoomEvent.TrackSubscribed, syncTracks)
        .on(RoomEvent.TrackUnsubscribed, syncTracks)
        .on(RoomEvent.TrackMuted, syncTracks)
        .on(RoomEvent.TrackUnmuted, syncTracks)

      await room.connect(url, token)

      // Default camera & mic OFF on join (PRD AC-3.3.3).
      await room.localParticipant.setCameraEnabled(false)
      await room.localParticipant.setMicrophoneEnabled(false)

      set((state) => ({
        room,
        isConnected: true,
        isConnecting: false,
        isCameraEnabled: false,
        isMicEnabled: false,
        remoteParticipants: Array.from(room.remoteParticipants.values()),
        trackVersion: state.trackVersion + 1,
      }))
    } catch {
      // Graceful degradation (PRD §6.3): never expose raw connection URLs or tokens in UI state.
      set({
        room: null,
        isConnected: false,
        isConnecting: false,
        error: 'Video chat sedang tidak tersedia',
      })
    }
  },

  disconnect: () => {
    const { room } = get()
    if (room) {
      room.disconnect()
    }
    set({
      room: null,
      isConnected: false,
      isConnecting: false,
      isCameraEnabled: false,
      isMicEnabled: false,
      remoteParticipants: [],
      activeSpeakerIds: [],
      error: null,
      mediaError: null,
      trackVersion: 0,
    })
  },

  toggleCamera: async () => {
    const { room, isCameraEnabled } = get()
    if (!room) return false
    set({ mediaError: null })
    try {
      const next = !isCameraEnabled
      await room.localParticipant.setCameraEnabled(next)
      set((state) => ({ isCameraEnabled: next, trackVersion: state.trackVersion + 1 }))
      return next
    } catch (err) {
      set({ mediaError: mapMediaDeviceError(err, 'kamera') })
      return isCameraEnabled
    }
  },

  toggleMicrophone: async () => {
    const { room, isMicEnabled } = get()
    if (!room) return false
    set({ mediaError: null })
    try {
      const next = !isMicEnabled
      await room.localParticipant.setMicrophoneEnabled(next)
      set((state) => ({ isMicEnabled: next, trackVersion: state.trackVersion + 1 }))
      return next
    } catch (err) {
      set({ mediaError: mapMediaDeviceError(err, 'mikrofon') })
      return isMicEnabled
    }
  },

  clearError: () => set({ error: null }),
  clearMediaError: () => set({ mediaError: null }),
}))
