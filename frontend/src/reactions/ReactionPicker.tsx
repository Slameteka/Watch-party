import React from 'react'
import { useSocialStore } from '../state/useSocialStore'
import type { EmojiType } from '../types'
import { EMOJI_MAP } from '../types'
import { wsClient } from '../services/websocket'

const EMOJI_LIST: { type: EmojiType; label: string }[] = [
  { type: 'thumbsUp', label: 'Jempol' },
  { type: 'heart', label: 'Cinta' },
  { type: 'laugh', label: 'Tertawa' },
  { type: 'wow', label: 'Kaget' },
  { type: 'sad', label: 'Sedih' },
]

export const ReactionPicker: React.FC = () => {
  const {
    canSendReaction,
    recordReactionSent,
    triggerReaction,
    selfParticipantId,
    reactionError,
    setReactionError,
  } = useSocialStore()

  const handleSend = (emoji: EmojiType) => {
    if (!canSendReaction()) {
      setReactionError('Batas reaksi tercapai (maks 10 per 10 detik). Harap tunggu.')
      setTimeout(() => setReactionError(null), 3000)
      return
    }

    recordReactionSent()
    if (selfParticipantId) {
      triggerReaction(selfParticipantId, emoji)
    }

    wsClient.sendReaction(emoji)
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2 bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-800 shadow-lg">
        {EMOJI_LIST.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => handleSend(type)}
            className="text-xl md:text-2xl hover:scale-130 active:scale-95 transition-all p-1 cursor-pointer select-none"
            title={label}
          >
            {EMOJI_MAP[type]}
          </button>
        ))}
      </div>
      {reactionError && (
        <span className="text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
          {reactionError}
        </span>
      )}
    </div>
  )
}
