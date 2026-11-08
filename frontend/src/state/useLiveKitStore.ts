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
  remoteParticipants: RemoteParticipant[]
  qualityMap: Record<string, 'excellent' | 'good' | 'poor'>

  connect: (url: string, token: string) => Promise<void>
  disconnect: () => void
  toggleCamera: () => Promise<boolean>
  toggleMicrophone: () => Promise<boolean>
  clearError: () => void
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

export const useLiveKitStore = create<LiveKitState>((set, get) => ({
  room: null,
  isConnecting: false,
  isConnected: false,
  isCameraEnabled: false,
  isMicEnabled: false,
  error: null,
  remoteParticipants: [],
  qualityMap: {},

  connect: async (url: string, token: string) => {
    const currentRoom = get().room
    if (currentRoom) {
      currentRoom.disconnect()
    }

    set({ isConnecting: true, error: null })

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 320, height: 240, frameRate: 15 },
      },
    })

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
            isConnected: false,
            isConnecting: false,
            isCameraEnabled: false,
            isMicEnabled: false,
            remoteParticipants: [],
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
        .on(RoomEvent.TrackSubscribed, () => {
          set({
            remoteParticipants: Array.from(room.remoteParticipants.values()),
          })
        })
        .on(RoomEvent.TrackUnsubscribed, () => {
          set({
            remoteParticipants: Array.from(room.remoteParticipants.values()),
          })
        })

      await room.connect(url, token)

      await room.localParticipant.setCameraEnabled(false)
      await room.localParticipant.setMicrophoneEnabled(false)

      set({
        room,
        isConnected: true,
        isConnecting: false,
        isCameraEnabled: false,
        isMicEnabled: false,
        remoteParticipants: Array.from(room.remoteParticipants.values()),
      })
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Video chat sedang tidak tersedia'
      console.warn('LiveKit connection error:', errorMessage)
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
      error: null,
    })
  },

  toggleCamera: async () => {
    const { room, isCameraEnabled } = get()
    if (!room) return false
    try {
      const next = !isCameraEnabled
      await room.localParticipant.setCameraEnabled(next)
      set({ isCameraEnabled: next })
      return next
    } catch (err) {
      console.error('Failed to toggle camera:', err)
      return isCameraEnabled
    }
  },

  toggleMicrophone: async () => {
    const { room, isMicEnabled } = get()
    if (!room) return false
    try {
      const next = !isMicEnabled
      await room.localParticipant.setMicrophoneEnabled(next)
      set({ isMicEnabled: next })
      return next
    } catch (err) {
      console.error('Failed to toggle microphone:', err)
      return isMicEnabled
    }
  },

  clearError: () => set({ error: null }),
}))
