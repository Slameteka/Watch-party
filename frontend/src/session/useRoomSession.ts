import { useEffect } from 'react'
import type { Role } from '../types'
import { startSession, stopSession } from './session'

const ROLES: Role[] = ['host', 'controller', 'viewer']

/**
 * Join a room when the app opens, and leave when it closes.
 *
 * Temporary until the join page exists (invite link + name form). Until then the room and
 * the name come from the address: `?room=MockRoom0001&name=Raka&role=host`.
 * `role` only works on the mock server. The real backend decides the role itself.
 */
export function useRoomSession(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const role = params.get('role') as Role | null
    void startSession({
      roomId: params.get('room') ?? 'MockRoom0001',
      displayName: params.get('name') ?? `Tamu ${Math.floor(Math.random() * 900 + 100)}`,
      mockRole: role && ROLES.includes(role) ? role : undefined,
    })
    return stopSession
  }, [])
}
