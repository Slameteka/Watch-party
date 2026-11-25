import React, { useState } from 'react'
import { MessageSquare, Users, X } from 'lucide-react'
import { ParticipantList } from '../participants/ParticipantList'
import { useSocialStore } from '../state/useSocialStore'
import type { Role } from '../types'
import { ChatInput } from './ChatInput'
import { ChatMessageList } from './ChatMessageList'

interface ChatSidebarProps {
  onClose?: () => void
  onKickParticipant?: (participantId: string) => void | Promise<void>
  onToggleController?: (participantId: string, currentRole: Role) => void | Promise<void>
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  onClose,
  onKickParticipant,
  onToggleController,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat')
  const { messages, participants } = useSocialStore()

  const onlineParticipants = participants.filter((p) => p.connected)
  const visibleCount = participants.filter((p) => p.connected || p.role === 'host').length

  return (
    <aside className="w-[300px] lg:w-[320px] max-w-[85vw] shrink-0 h-full flex flex-col bg-[#101115] border-l border-[#1c1e26] text-[#8e929d] select-none">
      {/* 1. Header Tabs (Height 56px / h-14) */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#1c1e26] shrink-0">
        <div className="flex items-center gap-4 text-xs font-semibold flex-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'chat' ? 'text-white font-bold' : 'text-[#8e929d] hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Obrolan</span>
            {messages.length > 0 && (
              <span className="text-[10px] bg-white/10 text-gray-300 px-1.5 py-0.2 rounded-full">
                {messages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'participants'
                ? 'text-white font-bold'
                : 'text-[#8e929d] hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Anggota</span>
            <span className="text-[11px] text-[#5a5f6e] font-normal">{visibleCount}</span>
          </button>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 xl:hidden cursor-pointer"
            title="Tutup Obrolan"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Online Presence Summary Box */}
      <div className="px-4 py-3 bg-[#13151c] border-b border-[#1c1e26] flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-gray-200">Di sini bareng kamu</span>
          <div className="flex -space-x-1.5 overflow-hidden">
            {onlineParticipants.slice(0, 4).map((p) => (
              <span
                key={p.participantId}
                title={p.displayName}
                className="w-5 h-5 rounded-full ring-2 ring-[#13151c] bg-purple-600/80 text-white font-bold text-[8px] flex items-center justify-center"
              >
                {p.displayName.trim().slice(0, 2).toUpperCase() || '?'}
              </span>
            ))}
            {onlineParticipants.length === 0 && (
              <span className="text-[10px] text-gray-500">Menunggu peserta…</span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-xs text-gray-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px]">{onlineParticipants.length} online</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-0.5 leading-tight">
            Jauh, tapi satu layar
          </div>
        </div>
      </div>

      {/* 3. Body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'chat' ? (
          <>
            <ChatMessageList messages={messages} />
            <ChatInput />
          </>
        ) : (
          <ParticipantList
            onKickParticipant={onKickParticipant}
            onToggleController={onToggleController}
          />
        )}
      </div>
    </aside>
  )
}
