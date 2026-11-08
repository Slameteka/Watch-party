import { beforeEach, describe, expect, it } from 'vitest'
import { useSocialStore } from '../useSocialStore'
import type { Participant } from '../../types'

describe('useSocialStore', () => {
  beforeEach(() => {
    useSocialStore.setState({
      participants: [],
      selfParticipantId: 'p_test',
      selfRole: 'viewer',
      messages: [],
      activeReactions: [],
      chatError: null,
      reactionError: null,
      chatWindowCount: 0,
      reactionWindowCount: 0,
      lastChatWindowResetMs: Date.now(),
      lastReactionWindowResetMs: Date.now(),
    })
  })

  it('enforces chat rate limit (max 5 per 10s window)', () => {
    const store = useSocialStore.getState()

    for (let i = 0; i < 5; i++) {
      expect(store.canSendChat()).toBe(true)
      store.recordChatSent()
    }

    // 6th message should be rejected within the same window
    expect(useSocialStore.getState().canSendChat()).toBe(false)
  })

  it('enforces reaction rate limit (max 10 per 10s window)', () => {
    const store = useSocialStore.getState()

    for (let i = 0; i < 10; i++) {
      expect(store.canSendReaction()).toBe(true)
      store.recordReactionSent()
    }

    // 11th reaction should be rejected within the same window
    expect(useSocialStore.getState().canSendReaction()).toBe(false)
  })

  it('preserves host presence when disconnected but removes guests (BR-7 & AC-1.5.2)', () => {
    const host: Participant = {
      participantId: 'p_host',
      displayName: 'Alice (Host)',
      role: 'host',
      playerStatus: 'ready',
      connected: true,
      joinedAtMs: 1000,
    }

    const guest: Participant = {
      participantId: 'p_guest',
      displayName: 'Budi (Guest)',
      role: 'viewer',
      playerStatus: 'ready',
      connected: true,
      joinedAtMs: 2000,
    }

    useSocialStore.getState().onParticipantJoined(host)
    useSocialStore.getState().onParticipantJoined(guest)

    expect(useSocialStore.getState().participants.length).toBe(2)

    // Disconnect guest -> removed
    useSocialStore.getState().onParticipantLeft('p_guest', 'disconnected')
    expect(useSocialStore.getState().participants.some((p) => p.participantId === 'p_guest')).toBe(
      false
    )

    // Disconnect host -> remains in participant list
    useSocialStore.getState().onParticipantLeft('p_host', 'disconnected')
    expect(useSocialStore.getState().participants.some((p) => p.participantId === 'p_host')).toBe(
      true
    )
  })

  it('updates host connected status to false on participant.updated (PRD BR-7)', () => {
    const host: Participant = {
      participantId: 'p_host',
      displayName: 'Alice',
      role: 'host',
      playerStatus: 'ready',
      connected: true,
      joinedAtMs: 1000,
    }

    useSocialStore.getState().onParticipantJoined(host)

    useSocialStore.getState().onParticipantUpdated({
      ...host,
      connected: false,
    })

    const updatedHost = useSocialStore
      .getState()
      .participants.find((p) => p.participantId === 'p_host')
    expect(updatedHost?.connected).toBe(false)
  })
})
