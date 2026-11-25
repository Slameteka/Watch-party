import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Participant, Role } from '../../types'

const mockSocialState: {
  participants: Participant[]
  selfParticipantId: string | null
  selfRole: Role
} = {
  participants: [],
  selfParticipantId: null,
  selfRole: 'viewer',
}

vi.mock('../../state/useSocialStore', () => ({
  useSocialStore: () => mockSocialState,
}))

import { ParticipantList } from '../../participants/ParticipantList'
import { ChatMessageList } from '../ChatMessageList'

describe('social UI rendering and security', () => {
  beforeEach(() => {
    mockSocialState.participants = []
    mockSocialState.selfParticipantId = null
    mockSocialState.selfRole = 'viewer'
  })

  it('escapes XSS payloads in chat text and participant display names', () => {
    mockSocialState.selfParticipantId = 'p_host'
    mockSocialState.selfRole = 'host'
    mockSocialState.participants = [
      {
        participantId: 'p_host',
        displayName: '<img src=x onerror=alert(1)>',
        role: 'host',
        playerStatus: 'ready',
        connected: true,
        joinedAtMs: 1,
      },
    ]

    const html = renderToStaticMarkup(
      React.createElement(ChatMessageList, {
        messages: [
          {
            messageId: 'm1',
            participantId: 'p_host',
            displayName: '<img src=x onerror=alert(1)>',
            text: '<script>alert("xss")</script>',
            createdAtMs: 1_700_000_000_000,
          },
        ],
      }),
    )

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  it('shows host management buttons only to host for non-host connected participants', () => {
    mockSocialState.selfParticipantId = 'p_host'
    mockSocialState.selfRole = 'host'
    mockSocialState.participants = [
      {
        participantId: 'p_host',
        displayName: 'HostUser',
        role: 'host',
        playerStatus: 'ready',
        connected: false,
        joinedAtMs: 1,
      },
      {
        participantId: 'p_viewer',
        displayName: 'GuestViewer',
        role: 'viewer',
        playerStatus: 'ready',
        connected: true,
        joinedAtMs: 2,
      },
      {
        participantId: 'p_ctrl',
        displayName: 'CtrlUser',
        role: 'controller',
        playerStatus: 'syncing',
        connected: true,
        joinedAtMs: 3,
      },
    ]

    const hostView = renderToStaticMarkup(
      React.createElement(ParticipantList, {
        onToggleController: () => {},
        onKickParticipant: () => {},
      }),
    )
    expect(hostView).toContain('Make Ctrl')
    expect(hostView).toContain('Revoke')
    expect(hostView).toContain('Offline')

    mockSocialState.selfParticipantId = 'p_viewer'
    mockSocialState.selfRole = 'viewer'
    const viewerView = renderToStaticMarkup(
      React.createElement(ParticipantList, {
        onToggleController: () => {},
        onKickParticipant: () => {},
      }),
    )
    expect(viewerView).not.toContain('Make Ctrl')
    expect(viewerView).not.toContain('Revoke')
  })
})
