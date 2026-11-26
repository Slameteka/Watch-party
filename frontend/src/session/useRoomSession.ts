import { useEffect } from 'react'
import type { Role } from '../types'
import { apiBaseUrl } from './api'
import { startSession, stopSession } from './session'

const ROLES: Role[] = ['host', 'controller', 'viewer']

function isLocalMockApi(): boolean {
  const base = apiBaseUrl()
  return base.includes('localhost') || base.includes('127.0.0.1')
}

/**
 * Automatically join a room on page load only when `?room=` is explicitly provided,
 * or when running against the local mock server (outside `/r/:roomId` and `/callback`).
 * On production root `/`, stays idle so the interactive Lobby is shown cleanly.
 */
export function useRoomSession(): void {
  useEffect(() => {
    const path = window.location.pathname
    if (path.startsWith('/r/') || path === '/callback') {
      return stopSession
    }

    const params = new URLSearchParams(window.location.search)
    const explicitRoomId = params.get('room')
    if (!explicitRoomId && !isLocalMockApi()) {
      return stopSession
    }

    const role = params.get('role') as Role | null
    void startSession({
      roomId: explicitRoomId ?? 'MockRoom0001',
      displayName: params.get('name') ?? `Tamu ${Math.floor(Math.random() * 900 + 100)}`,
      mockRole: role && ROLES.includes(role) ? role : undefined,
    })
    return stopSession
  }, [])
}
