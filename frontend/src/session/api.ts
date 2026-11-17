// REST calls used by the player and session layer (docs/contracts/openapi.yaml).

import type { ErrorPayload, Role } from '../types'

/** Response of POST /rooms/{roomId}/join and /session/refresh (schema RoomSession). */
export interface RoomSession {
  roomId: string
  participantId: string
  displayName: string
  role: Role
  roomToken: string
  roomTokenExpiresAtMs: number
  wsUrl: string
}

/** REST error. `code` is the error code from the contract (ROOM_FULL, UNAUTHORIZED, ...). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Base URL of the REST API. Set VITE_API_URL in frontend/.env.local.
 * Default is the local mock server (frontend/mock-server).
 */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787'
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, init)
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.')
  }
  if (response.ok) return response

  let error: Partial<ErrorPayload> = {}
  try {
    const body = (await response.json()) as { error?: Partial<ErrorPayload> }
    error = body.error ?? {}
  } catch {
    // The body is not JSON. Use the status only.
  }
  throw new ApiError(response.status, error.code ?? 'UNKNOWN', error.message ?? response.statusText)
}

/**
 * Join a room as guest (or host when `role` is set; role is read by the mock server only,
 * the real backend ignores unknown query parameters).
 */
export async function joinRoom(
  roomId: string,
  displayName: string,
  mockRole?: Role,
): Promise<RoomSession> {
  const query = mockRole ? `?role=${encodeURIComponent(mockRole)}` : ''
  const response = await request(`/rooms/${encodeURIComponent(roomId)}/join${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName }),
  })
  return (await response.json()) as RoomSession
}

/** Get a fresh room token, or learn why connecting failed (ws-messages.md §5.3). */
export async function refreshSession(roomId: string, roomToken: string): Promise<RoomSession> {
  const response = await request(`/rooms/${encodeURIComponent(roomId)}/session/refresh`, {
    method: 'POST',
    headers: { authorization: `Bearer ${roomToken}` },
  })
  return (await response.json()) as RoomSession
}

/**
 * Ask for the CloudFront signed cookies. They are needed before HLS segments can load.
 * Must be called with `credentials: 'include'`, and again every 90 minutes.
 */
export async function requestMediaCookies(roomId: string, roomToken: string): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/media-cookies`, {
    method: 'POST',
    headers: { authorization: `Bearer ${roomToken}` },
    credentials: 'include',
  })
}
