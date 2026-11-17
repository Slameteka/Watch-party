import { create } from 'zustand'
import type { MediaItem, PlaybackState } from '../types'
import { isNewerVersion } from './sync'

/** State of the connection to the room, shown in the UI. */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed'

interface PlaybackStore {
  media: MediaItem | null
  /** Last playback state applied (highest version seen). */
  state: PlaybackState | null
  /** serverNowMs = Date.now() + clockOffsetMs. */
  clockOffsetMs: number
  connection: ConnectionStatus
  /** Why the connection ended or failed (error code or session.ended reason). */
  connectionReason: string | null
  /** Short message for the last rejected playback command. */
  commandError: string | null
  /** True while a playback.command waits for the server answer. */
  commandPending: boolean

  /** room.snapshot: replace everything, whatever the version (ws-messages.md §5.2). */
  applySnapshot: (media: MediaItem, playback: PlaybackState) => void
  /** playback.state: ignore old or out-of-order versions. Returns true if applied. */
  applyPlaybackState: (incoming: PlaybackState) => boolean
  setClockOffset: (offsetMs: number) => void
  setConnection: (status: ConnectionStatus, reason?: string | null) => void
  setCommandError: (message: string | null) => void
  setCommandPending: (pending: boolean) => void
  reset: () => void
}

const initial = {
  media: null,
  state: null,
  clockOffsetMs: 0,
  connection: 'idle' as ConnectionStatus,
  connectionReason: null,
  commandError: null,
  commandPending: false,
}

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  ...initial,

  applySnapshot: (media, playback) => set({ media, state: playback }),

  applyPlaybackState: (incoming) => {
    const current = get().state
    if (current && !isNewerVersion(current.version, incoming.version)) return false
    set({ state: incoming })
    return true
  },

  setClockOffset: (offsetMs) => set({ clockOffsetMs: offsetMs }),

  setConnection: (status, reason = null) => set({ connection: status, connectionReason: reason }),

  setCommandError: (message) => set({ commandError: message }),

  setCommandPending: (pending) => set({ commandPending: pending }),

  reset: () => set({ ...initial }),
}))
