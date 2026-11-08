import React, { useState } from 'react'
import { MessageSquare, Users, X } from 'lucide-react'
import { useSocialStore } from '../state/useSocialStore'
import type { Role } from '../types'
import { ParticipantList } from '../participants/ParticipantList'
import { ChatInput } from './ChatInput'
import { ChatMessageList } from './ChatMessageList'

interface ChatSidebarProps {
  onClose?: () => void
  onKickParticipant?: (participantId: string) => void
  onToggleController?: (participantId: string, currentRole: Role) => void
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  onClose,
  onKickParticipant,
  onToggleController,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat')
  const { messages, participants } = useSocialStore()

  return (
    <aside className="w-80 md:w-88 flex flex-col h-full bg-gray-900/95 backdrop-blur-md border-l border-gray-800 text-gray-200 shadow-2xl">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-800">
        <div className="flex items-center gap-1 bg-gray-800/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Obrolan</span>
            {messages.length > 0 && (
              <span className="ml-1 text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full">
                {messages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'participants'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Peserta</span>
            <span className="ml-1 text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full">
              {participants.length}
            </span>
          </button>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
            title="Tutup Sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

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
