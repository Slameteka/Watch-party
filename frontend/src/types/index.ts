export type Role = 'host' | 'controller' | 'viewer'

export type PlayerStatus = 'unknown' | 'buffering' | 'syncing' | 'ready'

export interface Participant {
  participantId: string
  displayName: string
  role: Role
  playerStatus: PlayerStatus
  connected: boolean
  joinedAtMs: number
}

export interface ChatMessage {
  messageId: string
  participantId: string
  displayName: string
  text: string
  createdAtMs: number
}

export type EmojiType = 'thumbsUp' | 'heart' | 'laugh' | 'wow' | 'sad'

export const EMOJI_MAP: Record<EmojiType, string> = {
  thumbsUp: '👍',
  heart: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
}

export interface PlaybackState {
  roomId: string
  mediaId: string
  status: 'playing' | 'paused'
  positionSec: number
  playbackRate: number
  updatedAtServerMs: number
  version: number
}

export interface RoomInfo {
  roomId: string
  mediaId: string
  mediaTitle: string
  status: 'open' | 'closed'
  hostDisplayName: string
  participantCount: number
  maxParticipants: number
  createdAtMs: number
  expiresAtMs: number
  inviteUrl: string
}

export interface MediaItem {
  mediaId: string
  title: string
  description?: string
  durationSec: number
  posterUrl: string
  playbackUrl: string
  license: string
  attribution: string
}

export interface WsEnvelope<T = Record<string, unknown>> {
  v: 1
  type: string
  requestId?: string
  sentAtMs: number
  payload: T
}

export interface ErrorPayload {
  code: string
  message: string
  details?: Record<string, unknown>
}
