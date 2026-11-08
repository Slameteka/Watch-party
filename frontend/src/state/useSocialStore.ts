import { create } from 'zustand'
import type { ChatMessage, EmojiType, Participant, Role } from '../types'

export interface ActiveReaction {
  id: string
  emoji: EmojiType
  participantId: string
  timestamp: number
}

interface SocialState {
  participants: Participant[]
  selfParticipantId: string | null
  selfRole: Role
  messages: ChatMessage[]
  activeReactions: ActiveReaction[]
  chatError: string | null
  reactionError: string | null

  // Rate limit tracking (local feedback)
  chatWindowCount: number
  reactionWindowCount: number
  lastChatWindowResetMs: number
  lastReactionWindowResetMs: number

  // Actions
  setSelf: (participantId: string, role: Role) => void
  setInitialSnapshot: (
    participants: Participant[],
    recentChat: ChatMessage[],
    self: { participantId: string; role: Role }
  ) => void
  addChatMessage: (message: ChatMessage) => void
  onParticipantJoined: (participant: Participant) => void
  onParticipantUpdated: (participant: Participant) => void
  onParticipantLeft: (participantId: string, reason: string) => void
  triggerReaction: (participantId: string, emoji: EmojiType) => void
  removeReaction: (id: string) => void
  setChatError: (error: string | null) => void
  setReactionError: (error: string | null) => void

  // Rate limit check helpers
  canSendChat: () => boolean
  recordChatSent: () => void
  canSendReaction: () => boolean
  recordReactionSent: () => void
}

export const useSocialStore = create<SocialState>((set, get) => ({
  participants: [],
  selfParticipantId: null,
  selfRole: 'viewer',
  messages: [],
  activeReactions: [],
  chatError: null,
  reactionError: null,

  chatWindowCount: 0,
  reactionWindowCount: 0,
  lastChatWindowResetMs: Date.now(),
  lastReactionWindowResetMs: Date.now(),

  setSelf: (participantId, role) => set({ selfParticipantId: participantId, selfRole: role }),

  setInitialSnapshot: (participants, recentChat, self) =>
    set({
      participants,
      messages: recentChat,
      selfParticipantId: self.participantId,
      selfRole: self.role,
    }),

  addChatMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message].slice(-100),
      chatError: null,
    })),

  onParticipantJoined: (participant) =>
    set((state) => {
      const exists = state.participants.some((p) => p.participantId === participant.participantId)
      if (exists) {
        return {
          participants: state.participants.map((p) =>
            p.participantId === participant.participantId ? participant : p
          ),
        }
      }
      return { participants: [...state.participants, participant] }
    }),

  onParticipantUpdated: (participant) =>
    set((state) => ({
      participants: state.participants.map((p) =>
        p.participantId === participant.participantId ? participant : p
      ),
    })),

  onParticipantLeft: (participantId, _reason) =>
    set((state) => ({
      participants: state.participants.filter(
        (p) => p.participantId !== participantId || p.role === 'host'
      ),
    })),

  triggerReaction: (participantId, emoji) => {
    const id = `${participantId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newReaction: ActiveReaction = {
      id,
      emoji,
      participantId,
      timestamp: Date.now(),
    }
    set((state) => ({
      activeReactions: [...state.activeReactions, newReaction],
    }))

    setTimeout(() => {
      get().removeReaction(id)
    }, 3200)
  },

  removeReaction: (id) =>
    set((state) => ({
      activeReactions: state.activeReactions.filter((r) => r.id !== id),
    })),

  setChatError: (error) => set({ chatError: error }),
  setReactionError: (error) => set({ reactionError: error }),

  canSendChat: () => {
    const now = Date.now()
    const { lastChatWindowResetMs, chatWindowCount } = get()
    if (now - lastChatWindowResetMs >= 10000) {
      set({ lastChatWindowResetMs: now, chatWindowCount: 0 })
      return true
    }
    return chatWindowCount < 5
  },

  recordChatSent: () => {
    set((state) => ({ chatWindowCount: state.chatWindowCount + 1 }))
  },

  canSendReaction: () => {
    const now = Date.now()
    const { lastReactionWindowResetMs, reactionWindowCount } = get()
    if (now - lastReactionWindowResetMs >= 10000) {
      set({ lastReactionWindowResetMs: now, reactionWindowCount: 0 })
      return true
    }
    return reactionWindowCount < 10
  },

  recordReactionSent: () => {
    set((state) => ({ reactionWindowCount: state.reactionWindowCount + 1 }))
  },
}))
