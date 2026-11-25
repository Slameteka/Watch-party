import React, { useState } from 'react'
import { AlertCircle, Send } from 'lucide-react'
import { usePlaybackStore } from '../player/usePlaybackStore'
import { wsClient } from '../services/websocket'
import { useSocialStore } from '../state/useSocialStore'

export const ChatInput: React.FC = () => {
  const [text, setText] = useState('')
  const connection = usePlaybackStore((s) => s.connection)
  const { canSendChat, recordChatSent, chatError, setChatError } = useSocialStore()

  const isConnected = connection === 'connected' && wsClient.isConnected

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return

    if (!isConnected) {
      setChatError('Belum terhubung ke ruang. Tunggu sebentar.')
      return
    }

    if (trimmed.length > 500) {
      setChatError('Pesan tidak boleh melebihi 500 karakter.')
      return
    }

    if (!canSendChat()) {
      setChatError('Batas pengiriman pesan tercapai (maks 5 per 10 detik). Harap tunggu.')
      setTimeout(() => setChatError(null), 3000)
      return
    }

    recordChatSent()
    wsClient.sendChat(trimmed)
    setText('')
    setChatError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="p-3 border-t border-[#1c1e26] bg-[#101115]">
      {chatError && (
        <div className="mb-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          <span>{chatError}</span>
        </div>
      )}

      <div className="relative flex items-center">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (chatError) setChatError(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? 'Tulis pesan... (Enter untuk kirim)' : 'Menunggu koneksi ruang…'}
          maxLength={500}
          className="w-full resize-none rounded-xl bg-[#161822] border border-[#242836] px-3.5 py-2.5 pr-20 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
        />

        <div className="absolute right-2 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">{text.length}/500</span>

          <button
            onClick={handleSend}
            disabled={!text.trim() || text.length > 500}
            className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Kirim Pesan"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
