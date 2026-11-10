export type {
  Role,
  PlayerStatus,
  Participant,
  ChatMessage,
  ChatReaction,
  EmojiType,
  PlaybackState,
  RoomItem,
  FriendItem,
} from './watchparty'

export { EMOJI_MAP } from './watchparty'

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
