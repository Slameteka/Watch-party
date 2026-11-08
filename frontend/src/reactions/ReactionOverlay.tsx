import React from 'react'
import { useSocialStore } from '../state/useSocialStore'
import { EMOJI_MAP } from '../types'

export const ReactionOverlay: React.FC = () => {
  const { activeReactions, participants } = useSocialStore()

  if (activeReactions.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {activeReactions.map((reaction) => {
        const emojiChar = EMOJI_MAP[reaction.emoji] || '❤️'
        const hash = reaction.id
          .split('')
          .reduce((acc, char) => acc + char.charCodeAt(0), 0)
        const leftPercent = 15 + (hash % 70)

        const sender = participants.find((p) => p.participantId === reaction.participantId)
        const senderName = sender?.displayName || ''

        return (
          <div
            key={reaction.id}
            className="absolute bottom-10 flex flex-col items-center animate-reaction-float transition-all"
            style={{
              left: `${leftPercent}%`,
              animation: 'reactionFloat 3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
            }}
          >
            <span className="text-4xl md:text-5xl select-none filter drop-shadow-lg transform hover:scale-125 transition-transform">
              {emojiChar}
            </span>
            {senderName && (
              <span className="text-[10px] bg-black/60 text-white font-medium px-2 py-0.5 rounded-full mt-1 border border-white/10 shadow-sm truncate max-w-[100px]">
                {senderName}
              </span>
            )}
          </div>
        )
      })}

      <style>{`
        @keyframes reactionFloat {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.6);
          }
          15% {
            opacity: 1;
            transform: translateY(0) scale(1.1);
          }
          30% {
            transform: translateY(-40px) scale(1);
          }
          70% {
            opacity: 0.9;
            transform: translateY(-160px) scale(0.95);
          }
          100% {
            opacity: 0;
            transform: translateY(-240px) scale(0.8);
          }
        }
      `}</style>
    </div>
  )
}
