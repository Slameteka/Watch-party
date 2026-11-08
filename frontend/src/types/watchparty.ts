export type Role = 'host' | 'controller' | 'viewer'

export type PlayerStatus = 'unknown' | 'buffering' | 'syncing' | 'ready'

export interface Participant {
  participantId: string
  displayName: string
  role: Role
  playerStatus: PlayerStatus
  connected: boolean
  joinedAtMs: number
  avatarText: string
  avatarColor: string
  activityStatus?: string // e.g. "Berbicara", "Menyimak", "Terhubung"
  isSpeaking?: boolean
}

export interface ChatReaction {
  emoji: string
  count: number
}

export interface ChatMessage {
  messageId: string
  participantId: string
  displayName: string
  avatarText?: string
  avatarColor?: string
  role?: Role
  text: string
  createdAtMs: number
  reactions?: ChatReaction[]
}

export type EmojiType = 'thumbsUp' | 'heart' | 'laugh' | 'wow' | 'sad' | 'fire' | 'clap'

export const EMOJI_MAP: Record<string, string> = {
  thumbsUp: '👍',
  heart: '❤️',
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
  clap: '👏',
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

export interface RoomItem {
  id: string
  name: string
  type: 'public' | 'private'
  count: number
  icon: 'coffee' | 'film' | 'headphones' | 'moon'
  isActive?: boolean
  members?: { name: string; role?: string; avatar: string; color: string }[]
}

export interface FriendItem {
  id: string
  name: string
  avatar: string
  color: string
  status: string
}
