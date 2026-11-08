import React, { useState } from 'react'
import {
  Headphones,
  MessageSquare,
  Mic,
  Plus,
  Send,
  Smile,
} from 'lucide-react'
import { SoundWaveIcon } from './Icons'

interface MessageItem {
  id: string
  avatar: string
  avatarColor: string
  sender: string
  time: string
  role?: string
  text: string
  reactions?: { emoji: string; count: number }[]
}

const DEFAULT_MESSAGES: MessageItem[] = [
  {
    id: 'm1',
    avatar: 'RA',
    avatarColor: 'bg-[#d97757]',
    sender: 'Raka',
    time: '20.41',
    role: 'HOST',
    text: 'Oke, semua udah siap? Kita lanjut ya 🍿',
  },
  {
    id: 'm2',
    avatar: 'DI',
    avatarColor: 'bg-[#208b7e]',
    sender: 'Dinda',
    time: '20.42',
    text: 'Pemandangannya cantik banget 😍',
    reactions: [{ emoji: '❤️', count: 4 }],
  },
  {
    id: 'm3',
    avatar: 'BI',
    avatarColor: 'bg-[#4a58b8]',
    sender: 'Bimo',
    time: '20.42',
    text: 'Ini sih definisi healing yang sesungguhnya.',
  },
  {
    id: 'm4',
    avatar: 'NA',
    avatarColor: 'bg-[#2a2d39]',
    sender: 'Naya',
    time: '20.43',
    text: 'Jadi pengen road trip bareng kalian 🚙',
    reactions: [{ emoji: '🔥', count: 3 }],
  },
  {
    id: 'm5',
    avatar: 'AL',
    avatarColor: 'bg-[#d69046]',
    sender: 'Alya',
    time: '20.43',
    text: 'Boleh, tapi jangan aku yang baca peta 😂',
  },
  {
    id: 'm6',
    avatar: 'RA',
    avatarColor: 'bg-[#d97757]',
    sender: 'Raka',
    time: '20.44',
    role: 'HOST',
    text: 'Ssst, habis ini bagian favoritku 👀',
  },
]

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat')
  const [messages, setMessages] = useState<MessageItem[]>(DEFAULT_MESSAGES)
  const [inputText, setInputText] = useState('')

  const handleSend = () => {
    const trimmed = inputText.trim()
    if (!trimmed) return

    const newMsg: MessageItem = {
      id: `msg-${Date.now()}`,
      avatar: 'NA',
      avatarColor: 'bg-[#2a2d39]',
      sender: 'Naya',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: trimmed,
    }

    setMessages((prev) => [...prev, newMsg])
    setInputText('')
  }

  return (
    <aside className="w-[300px] lg:w-[320px] shrink-0 h-full flex flex-col bg-[#101115] border-l border-[#1c1e26] text-[#8e929d] select-none">
      {/* 1. Header Tabs (Height 56px / h-14) */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#1c1e26] shrink-0">
        <div className="flex items-center gap-6 text-xs font-semibold w-full justify-between">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'chat' ? 'text-white font-bold' : 'text-[#8e929d] hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Obrolan</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'members'
                ? 'text-white font-bold'
                : 'text-[#8e929d] hover:text-white'
            }`}
          >
            <span>Anggota</span>
            <span className="text-[11px] text-[#5a5f6e] font-normal">6</span>
          </button>
        </div>
      </div>

      {/* 2. "Di sini bareng kamu" Box */}
      <div className="px-4 py-3 bg-[#13151c] border-b border-[#1c1e26] flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-gray-200">Di sini bareng kamu</span>
          <div className="flex -space-x-1.5 overflow-hidden">
            <span className="inline-block w-5 h-5 rounded-full ring-2 ring-[#13151c] bg-[#d97757] text-white font-bold text-[8px] flex items-center justify-center">
              RA
            </span>
            <span className="inline-block w-5 h-5 rounded-full ring-2 ring-[#13151c] bg-[#208b7e] text-white font-bold text-[8px] flex items-center justify-center">
              DI
            </span>
            <span className="inline-block w-5 h-5 rounded-full ring-2 ring-[#13151c] bg-[#4a58b8] text-white font-bold text-[8px] flex items-center justify-center">
              BI
            </span>
            <span className="inline-block w-5 h-5 rounded-full ring-2 ring-[#13151c] bg-[#d69046] text-white font-bold text-[8px] flex items-center justify-center">
              AL
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-xs text-gray-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px]">6 online</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-0.5 leading-tight">
            Jauh, tapi satu layar
            <br />
            Bawa camilanmu 🍿
          </div>
        </div>
      </div>

      {/* 3. Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Date Divider */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-full border-t border-[#1c1e26]" />
          <span className="absolute bg-[#101115] px-2 text-[10px] text-[#5a5f6e]">Hari ini</span>
        </div>

        {/* Welcome Announcement Card */}
        <div className="p-3 rounded-xl bg-[#14161f] border border-[#212433] text-xs text-gray-300 space-y-1">
          <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
            <span>🍿</span> Selamat datang di Malam Minggu!
          </div>
          <p className="text-[11px] text-[#8e929d] leading-relaxed">
            Film diputar serentak untuk semua. Nikmati ceritanya, bareng-bareng.
          </p>
        </div>

        {/* Chat Messages */}
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-1 text-xs">
            {/* Header: Avatar, Name, Time, Role */}
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full ${msg.avatarColor} text-white font-bold text-[8px] flex items-center justify-center shrink-0`}
              >
                {msg.avatar}
              </span>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-200">{msg.sender}</span>
                <span className="text-[10px] text-[#5a5f6e]">{msg.time}</span>
                {msg.role && (
                  <span className="text-[9px] font-bold text-gray-400 bg-white/10 px-1 py-0.2 rounded uppercase tracking-wider">
                    {msg.role}
                  </span>
                )}
              </div>
            </div>

            {/* Message Body */}
            <div className="pl-7 text-gray-300 leading-relaxed break-words text-xs">
              {msg.text}
            </div>

            {/* Reactions attached to message */}
            {msg.reactions && msg.reactions.length > 0 && (
              <div className="pl-7 pt-0.5 flex items-center gap-1.5">
                {msg.reactions.map((rc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#161822] border border-[#242836] text-[10px] text-gray-300"
                  >
                    <span>{rc.emoji}</span>
                    <span>{rc.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 4. Chat Input Section */}
      <div className="p-3 border-t border-[#1c1e26] bg-[#101115]">
        {/* Typing indicator */}
        <div className="text-[10px] text-[#6b7280] mb-1.5 pl-1 italic">
          Dinda sedang mengetik...
        </div>

        {/* Pill input container */}
        <div className="flex items-center gap-2 bg-[#14161f] border border-[#232635] rounded-full px-3 py-1.5 focus-within:border-gray-500 transition-all">
          <button className="text-gray-400 hover:text-white transition-colors cursor-pointer" title="Tambah">
            <Plus className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Kirim pesan..."
            className="flex-1 bg-transparent text-xs text-white placeholder-[#6b7280] focus:outline-none"
          />

          <button className="text-gray-400 hover:text-amber-400 transition-colors cursor-pointer" title="Emoji">
            <Smile className="w-4 h-4" />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Kirim"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5. Bottom Voice Status Bar ("Suara terhubung") */}
      <div className="px-4 py-2.5 bg-[#0d0e12] border-t border-[#1c1e26] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {/* Animated audio equalizer wave */}
          <SoundWaveIcon className="w-3.5 h-3" />

          <div>
            <div className="font-semibold text-gray-200 text-xs">Suara terhubung</div>
            <div className="text-[10px] text-[#6b7280]">Malam Minggu · 24 ms</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-gray-400">
          <button className="p-1 hover:text-white transition-colors cursor-pointer" title="Headset">
            <Headphones className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:text-white transition-colors cursor-pointer" title="Mikrofon">
            <Mic className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
