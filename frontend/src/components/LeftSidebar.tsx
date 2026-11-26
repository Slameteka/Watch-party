import React, { useState } from 'react'
import {
  Clapperboard,
  Film,
  LogIn,
  LogOut,
  Plus,
  Users,
  X,
} from 'lucide-react'
import { usePlaybackStore } from '../player/usePlaybackStore'
import {
  getCognitoProfile,
  isCognitoConfigured,
  logoutCognito,
  startCognitoLogin,
} from '../session/auth'
import { useSocialStore } from '../state/useSocialStore'
import { LogoTv, PopcornIcon } from './Icons'

interface LeftSidebarProps {
  activeRoomId: string | null
  onCreateRoom: () => void
  onJoinByCode: (roomIdOrUrl: string) => void
  onClose?: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeRoomId,
  onCreateRoom,
  onJoinByCode,
  onClose,
}) => {
  const [quickRoomInput, setQuickRoomInput] = useState('')
  const media = usePlaybackStore((s) => s.media)
  const connection = usePlaybackStore((s) => s.connection)
  const participants = useSocialStore((s) => s.participants)
  const selfParticipantId = useSocialStore((s) => s.selfParticipantId)
  const selfRole = useSocialStore((s) => s.selfRole)

  const cognitoReady = isCognitoConfigured()
  const cognitoProfile = getCognitoProfile()
  const selfParticipant = participants.find((p) => p.participantId === selfParticipantId)
  const connectedParticipants = participants.filter((p) => p.connected)
  const inActiveRoom =
    Boolean(activeRoomId) &&
    (connection === 'connected' || connection === 'connecting' || connection === 'reconnecting')

  const profileName =
    selfParticipant?.displayName ?? cognitoProfile?.email ?? 'Tamu (Belum Masuk)'
  const profileInitial = profileName.trim().slice(0, 2).toUpperCase() || 'WP'

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = quickRoomInput.trim()
    if (!trimmed) return
    onJoinByCode(trimmed)
    setQuickRoomInput('')
  }

  return (
    <aside className="w-[260px] lg:w-[270px] max-w-[85vw] shrink-0 h-full flex flex-col bg-[#101115] border-r border-[#1c1e26] select-none text-[#8e929d]">
      {/* 1. Top Logo Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#1c1e26] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white">
            <LogoTv className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[15px] tracking-tight text-white font-sans">
            watch party
          </span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 xl:hidden cursor-pointer"
            title="Tutup Navigasi"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Body: Left Dock + Navigation Menu */}
      <div className="flex-1 flex overflow-hidden">
        {/* Leftmost Mini Icon Rail */}
        <div className="w-[52px] flex flex-col items-center py-4 justify-between border-r border-[#1c1e26] bg-[#0c0d10] shrink-0">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={onCreateRoom}
              className="w-9 h-9 rounded-2xl bg-[#2e1c18] border border-[#f97316]/40 flex items-center justify-center shadow-sm cursor-pointer hover:scale-105 transition-transform"
              title="Buat Ruang Watch Party"
            >
              <PopcornIcon className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={onCreateRoom}
            className="w-8 h-8 rounded-full border border-[#2b2e3b] text-[#8e929d] hover:text-white hover:border-gray-500 flex items-center justify-center transition-all cursor-pointer"
            title="Buat Ruang Baru"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Right Navigation Menu */}
        <div className="flex-1 flex flex-col justify-between p-3 overflow-y-auto gap-4">
          <div className="space-y-5">
            {/* Active Room Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-[10px] font-semibold text-[#5a5f6e] tracking-wider uppercase">
                <span>Ruang Saat Ini</span>
                <button
                  onClick={onCreateRoom}
                  className="hover:text-white transition-colors cursor-pointer"
                  title="Buat Ruang Baru"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {inActiveRoom ? (
                <div className="rounded-xl p-3 bg-[#171822] border border-[#252838] text-white space-y-2 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clapperboard className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="font-semibold text-xs truncate">
                        {media?.title ?? 'Menyiapkan Film…'}
                      </span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                      {connectedParticipants.length} online
                    </span>
                  </div>

                  <div className="text-[10px] text-gray-400 font-mono truncate select-text">
                    ID: {activeRoomId}
                  </div>

                  {connectedParticipants.length > 0 && (
                    <div className="pt-1 border-t border-white/5 space-y-1 text-[11px]">
                      {connectedParticipants.slice(0, 3).map((p) => (
                        <div key={p.participantId} className="flex items-center gap-1.5 text-gray-300">
                          <span className="w-4 h-4 rounded-full bg-purple-600/70 text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                            {p.displayName.trim().slice(0, 2).toUpperCase() || '?'}
                          </span>
                          <span className="truncate">
                            {p.displayName}
                            {p.role === 'host' ? ' · host' : ''}
                          </span>
                        </div>
                      ))}
                      {connectedParticipants.length > 3 && (
                        <div className="text-[10px] text-gray-500">
                          +{connectedParticipants.length - 3} peserta lainnya
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl p-3 bg-[#13151d] border border-[#1f2331] text-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-gray-200 font-medium">
                    <Film className="w-3.5 h-3.5 text-purple-400" />
                    <span>Belum ada ruang aktif</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Buat ruang baru dari katalog film atau masukkan link undangan teman.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Join Form */}
            <div className="space-y-2">
              <div className="px-1 text-[10px] font-semibold text-[#5a5f6e] tracking-wider uppercase flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                <span>Gabung via Kode / Link</span>
              </div>

              <form onSubmit={handleQuickJoin} className="space-y-2">
                <input
                  type="text"
                  value={quickRoomInput}
                  onChange={(e) => setQuickRoomInput(e.target.value)}
                  placeholder="Kode ruang / /r/…"
                  className="w-full px-3 py-2 rounded-xl bg-[#151722] border border-[#242838] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={!quickRoomInput.trim()}
                  className="w-full py-1.5 px-3 rounded-xl bg-[#1a1d2a] hover:bg-[#232738] disabled:opacity-40 text-gray-200 text-xs font-medium border border-[#282c3f] transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Masuk ke Ruang
                </button>
              </form>
            </div>
          </div>

          {/* Bottom Action & Real User Profile */}
          <div className="pt-3 border-t border-[#1c1e26] space-y-2.5">
            <button
              onClick={onCreateRoom}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-purple-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat ruang</span>
            </button>

            <div className="flex items-center justify-between px-1 py-1 text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#2a2d39] text-gray-200 font-bold text-[10px] flex items-center justify-center shrink-0 border border-gray-700/60">
                  {profileInitial}
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="font-semibold text-white text-xs truncate">{profileName}</div>
                  <div className="text-[10px] text-gray-400 flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        connection === 'connected'
                          ? 'bg-emerald-400'
                          : cognitoProfile
                            ? 'bg-purple-400'
                            : 'bg-gray-500'
                      }`}
                    />
                    <span className="truncate capitalize">
                      {connection === 'connected'
                        ? selfRole
                        : cognitoProfile
                          ? 'Host Login'
                          : 'Siap nonton'}
                    </span>
                  </div>
                </div>
              </div>

              {cognitoReady && (
                <button
                  onClick={() => {
                    if (cognitoProfile) {
                      logoutCognito()
                    } else {
                      void startCognitoLogin()
                    }
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                  title={cognitoProfile ? 'Keluar Akun Host' : 'Login Host Cognito'}
                >
                  {cognitoProfile ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
