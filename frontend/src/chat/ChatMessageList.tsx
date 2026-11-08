import React, { useEffect, useRef } from 'react'
import { Shield } from 'lucide-react'
import { useSocialStore } from '../state/useSocialStore'
import type { ChatMessage, Role } from '../types'

interface ChatMessageListProps {
  messages: ChatMessage[]
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages }) => {
  const { participants, selfParticipantId } = useSocialStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const formatTime = (epochMs: number) => {
    const d = new Date(epochMs)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getRole = (participantId: string): Role => {
    const found = participants.find((p) => p.participantId === participantId)
    return found?.role || 'viewer'
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs">
          <p>Belum ada pesan obrolan.</p>
          <p className="mt-1 text-[11px] text-gray-600">Jadilah yang pertama mengirim pesan!</p>
        </div>
      ) : (
        messages.map((msg) => {
          const isSelf = msg.participantId === selfParticipantId
          const role = getRole(msg.participantId)

          return (
            <div
              key={msg.messageId}
              className={`flex flex-col text-xs ${isSelf ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className={`font-semibold ${isSelf ? 'text-purple-300' : 'text-gray-300'}`}>
                  {msg.displayName} {isSelf && '(Anda)'}
                </span>

                {role === 'host' && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" /> Host
                  </span>
                )}
                {role === 'controller' && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Ctrl
                  </span>
                )}

                <span className="text-[10px] text-gray-500">{formatTime(msg.createdAtMs)}</span>
              </div>

              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 break-words leading-relaxed whitespace-pre-wrap ${
                  isSelf
                    ? 'bg-purple-600 text-white rounded-tr-none'
                    : 'bg-gray-800 text-gray-200 border border-gray-700/60 rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
