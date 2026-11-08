import React from 'react'
import {
  Bookmark,
  Clapperboard,
  Compass,
  Film,
  Headphones,
  Home,
  MessageSquare,
  Mic,
  Plus,
  Settings,
} from 'lucide-react'
import { GamepadIcon, LogoTv, MoonIcon, PopcornIcon } from './Icons'

interface LeftSidebarProps {
  activeRoomId?: string
  onSelectRoom?: (roomId: string) => void
  onCreateRoom?: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeRoomId = 'malam-minggu',
  onSelectRoom,
  onCreateRoom,
}) => {
  return (
    <aside className="w-[260px] lg:w-[270px] shrink-0 h-full flex flex-col bg-[#101115] border-r border-[#1c1e26] select-none text-[#8e929d]">
      {/* 1. Top Logo Header */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#1c1e26] shrink-0">
        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white">
          <LogoTv className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-[15px] tracking-tight text-white font-sans">
          watch party
        </span>
      </div>

      {/* 2. Body: Left Dock + Navigation Menu */}
      <div className="flex-1 flex overflow-hidden">
        {/* Leftmost Mini Icon Rail */}
        <div className="w-[52px] flex flex-col items-center py-4 justify-between border-r border-[#1c1e26] bg-[#0c0d10] shrink-0">
          <div className="flex flex-col items-center gap-3">
            {/* Popcorn active badge */}
            <button
              className="w-9 h-9 rounded-2xl bg-[#2e1c18] border border-[#f97316]/40 flex items-center justify-center shadow-sm cursor-pointer hover:scale-105 transition-transform"
              title="Watch Party"
            >
              <PopcornIcon className="w-5 h-5" />
            </button>

            {/* Moon icon */}
            <button
              className="w-9 h-9 rounded-2xl bg-[#14151c] flex items-center justify-center hover:bg-[#1a1c26] transition-colors cursor-pointer"
              title="Mode Malam"
            >
              <MoonIcon className="w-4 h-4" />
            </button>

            {/* Gamepad icon */}
            <button
              className="w-9 h-9 rounded-2xl bg-[#14151c] text-[#8e929d] hover:text-white hover:bg-[#1a1c26] flex items-center justify-center transition-colors cursor-pointer"
              title="Game"
            >
              <GamepadIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Plus icon */}
          <button
            onClick={onCreateRoom}
            className="w-8 h-8 rounded-full border border-[#2b2e3b] text-[#8e929d] hover:text-white hover:border-gray-500 flex items-center justify-center transition-all cursor-pointer"
            title="Tambah"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Right Navigation Menu */}
        <div className="flex-1 flex flex-col justify-between p-3 overflow-y-auto">
          <div className="space-y-4">
            {/* Main Links */}
            <nav className="space-y-0.5 text-xs font-medium">
              <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
                <Home className="w-3.5 h-3.5 text-[#8e929d]" />
                <span>Beranda</span>
              </button>
              <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
                <Compass className="w-3.5 h-3.5 text-[#8e929d]" />
                <span>Jelajahi</span>
              </button>
              <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
                <Bookmark className="w-3.5 h-3.5 text-[#8e929d]" />
                <span>Koleksiku</span>
              </button>
            </nav>

            {/* RUANG KITA Section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 text-[10px] font-semibold text-[#5a5f6e] tracking-wider">
                <span>RUANG KITA</span>
                <button
                  onClick={onCreateRoom}
                  className="hover:text-white transition-colors cursor-pointer"
                  title="Buat Ruang"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-0.5 pt-0.5 text-xs">
                {/* Ruang santai */}
                <button
                  onClick={() => onSelectRoom?.('ruang-santai')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[#8e929d]" />
                    <span>Ruang santai</span>
                  </div>
                  <span className="text-[11px] text-[#5a5f6e]">3</span>
                </button>

                {/* Malam Minggu (ACTIVE ROOM CARD) */}
                <div
                  onClick={() => onSelectRoom?.('malam-minggu')}
                  className={`rounded-xl p-2 transition-all cursor-pointer border ${
                    activeRoomId === 'malam-minggu'
                      ? 'bg-[#171822] border-[#252838] text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/5 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2">
                      <Clapperboard className="w-3.5 h-3.5 text-white" />
                      <span className="font-semibold text-xs text-white">Malam Minggu</span>
                    </div>
                    <span className="text-[11px] text-gray-400">6</span>
                  </div>

                  {/* Indented Sub-members */}
                  <div className="mt-2 pl-4 space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <span className="w-4 h-4 rounded-full bg-[#d97757] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                        RA
                      </span>
                      <span className="truncate">Raka · host</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <span className="w-4 h-4 rounded-full bg-[#208b7e] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                        DI
                      </span>
                      <span className="truncate">Dinda</span>
                    </div>
                    <div className="text-[10px] text-[#6b7280] pl-0.5">+4 lagi di dalam</div>
                  </div>
                </div>

                {/* Senja & Suara */}
                <button
                  onClick={() => onSelectRoom?.('senja-suara')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Headphones className="w-3.5 h-3.5 text-[#8e929d]" />
                    <span>Senja & Suara</span>
                  </div>
                  <span className="text-[11px] text-[#5a5f6e]">4</span>
                </button>

                {/* Film tengah malam */}
                <button
                  onClick={() => onSelectRoom?.('film-tengah-malam')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Film className="w-3.5 h-3.5 text-[#8e929d]" />
                    <span>Film tengah malam</span>
                  </div>
                </button>
              </div>
            </div>

            {/* TEMAN ONLINE Section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 text-[10px] font-semibold text-[#5a5f6e] tracking-wider">
                <span>TEMAN ONLINE</span>
                <span className="text-[10px] text-[#5a5f6e]">8</span>
              </div>

              <div className="space-y-1.5 pt-0.5">
                {/* Alya */}
                <div className="flex items-center gap-2 px-2 py-0.5">
                  <span className="w-5 h-5 rounded-full bg-[#d69046] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                    AL
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="text-xs font-medium text-gray-200">Alya</div>
                    <div className="text-[10px] text-[#6b7280] truncate">Mendengarkan musik</div>
                  </div>
                </div>

                {/* Fajar */}
                <div className="flex items-center gap-2 px-2 py-0.5">
                  <span className="w-5 h-5 rounded-full bg-[#414856] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                    FA
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="text-xs font-medium text-gray-200">Fajar</div>
                    <div className="text-[10px] text-[#6b7280] truncate">Siap untuk nonton</div>
                  </div>
                </div>

                {/* Bimo */}
                <div className="flex items-center gap-2 px-2 py-0.5">
                  <span className="w-5 h-5 rounded-full bg-[#4a58b8] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                    BI
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="text-xs font-medium text-gray-200">Bimo</div>
                    <div className="text-[10px] text-[#6b7280] truncate">Di Malam Minggu</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action & User Profile */}
          <div className="pt-2 space-y-2">
            <button
              onClick={onCreateRoom}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#161821] hover:bg-[#1d202c] text-white text-xs font-semibold border border-[#262938] transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat ruang</span>
            </button>

            {/* Profile: Naya */}
            <div className="flex items-center justify-between px-1 py-1 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-[#2a2d39] text-gray-200 font-bold text-[9px] flex items-center justify-center shrink-0 border border-gray-700/60">
                  NA
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="font-semibold text-white text-xs truncate">Naya</div>
                  <div className="text-[10px] text-[#10b981] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    <span>Lagi online</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[#8e929d]">
                <button className="p-1 hover:text-white transition-colors cursor-pointer" title="Mikrofon">
                  <Mic className="w-3.5 h-3.5" />
                </button>
                <button className="p-1 hover:text-white transition-colors cursor-pointer" title="Pengaturan">
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
