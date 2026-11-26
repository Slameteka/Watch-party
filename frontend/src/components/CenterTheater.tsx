import React from 'react'
import {
  Clapperboard,
  Link2,
  Lock,
  Menu,
  MessageSquare,
  MoreHorizontal,
  UserPlus,
} from 'lucide-react'
import { formatTime } from '../player/format'
import { usePlaybackStore } from '../player/usePlaybackStore'
import { WatchPlayer } from '../player/WatchPlayer'
import { ReactionOverlay } from '../reactions/ReactionOverlay'
import { ReactionPicker } from '../reactions/ReactionPicker'
import { useSocialStore } from '../state/useSocialStore'
import { MediaControls } from '../video/MediaControls'
import { VideoGrid } from '../video/VideoGrid'
import { LogoTv, RadioBroadcastIcon } from './Icons'

interface CenterTheaterProps {
  activeRoomId: string | null
  onInvite?: () => void
  onCreateRoom?: () => void
  onJoinByCode?: (roomIdOrUrl: string) => void
  onToggleLeftSidebar?: () => void
  onToggleRightSidebar?: () => void
  isRightSidebarOpen?: boolean
}

export const CenterTheater: React.FC<CenterTheaterProps> = ({
  activeRoomId,
  onInvite,
  onCreateRoom,
  onJoinByCode,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  isRightSidebarOpen = false,
}) => {
  const media = usePlaybackStore((s) => s.media)
  const connection = usePlaybackStore((s) => s.connection)
  const participants = useSocialStore((s) => s.participants)

  const connectedParticipants = participants.filter((p) => p.connected)
  const controllers = participants.filter((p) => p.role === 'host' || p.role === 'controller')
  const controllerBadgeInitial =
    controllers[0]?.displayName.trim().slice(0, 2).toUpperCase() || 'WP'
  const controllerSummary =
    connection === 'idle'
      ? 'Belum masuk ruang'
      : controllers.length > 0
        ? `${controllers.map((c) => c.displayName).join(', ')} mengontrol pemutaran`
        : 'Menunggu host…'

  const movieTitle = media?.title ?? 'Watch Party'
  const isConnected = connection === 'connected'
  const isConnecting = connection === 'connecting' || connection === 'reconnecting'

  return (
    <main className="flex-1 flex flex-col h-full bg-[#0c0d10] overflow-hidden text-[#8e929d]">
      {/* 1. Sub-header Breadcrumb Bar (Height 56px / h-14) */}
      <div className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-[#1c1e26] shrink-0 gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleLeftSidebar}
            className="p-1.5 -ml-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 xl:hidden cursor-pointer shrink-0"
            title="Buka Navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Clapperboard className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="font-semibold text-white text-[13px] truncate">{movieTitle}</span>
          {activeRoomId && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 ml-1 shrink-0 font-mono">
              <Lock className="w-3 h-3 text-gray-400" />
              {activeRoomId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              isConnected
                ? 'text-emerald-400'
                : isConnecting
                  ? 'text-amber-400'
                  : 'text-gray-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 animate-pulse'
                  : isConnecting
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-gray-500'
              }`}
            />
            <span className="hidden md:inline">
              {isConnected
                ? 'Tersinkron'
                : connection === 'reconnecting'
                  ? 'Menyambung ulang…'
                  : connection === 'connecting'
                    ? 'Menghubungkan…'
                    : 'Siap'}
            </span>
          </div>

          <button
            onClick={onInvite}
            disabled={!activeRoomId}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-[#151720] hover:bg-[#1e212d] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white border border-[#252838] transition-all cursor-pointer shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undang teman</span>
          </button>

          {/* Toggle Right Sidebar (Chat & Anggota) for Mobile & Tablet */}
          <button
            onClick={onToggleRightSidebar}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer xl:hidden ${
              isRightSidebarOpen
                ? 'bg-purple-600/30 text-purple-200 border-purple-500/50'
                : 'bg-[#151720] hover:bg-[#1e212d] text-gray-300 border-[#252838]'
            }`}
            title="Buka Obrolan & Anggota"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Obrolan</span>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          </button>

          <button
            onClick={onCreateRoom}
            className="p-1 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Buat Ruang Baru"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Center Theater Content */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Title Header with Host Controller Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight font-sans">
              Beda tempat. Satu cerita.
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Ambil camilanmu, tonton bersama secara serentak.
            </p>
          </div>

          <div className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#151720] border border-[#252838] text-xs select-none">
            <span className="w-4 h-4 rounded-full bg-[#d97757] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
              {controllerBadgeInitial}
            </span>
            <span className="text-gray-300 font-medium text-[11px] truncate max-w-[220px]">
              {controllerSummary}
            </span>
          </div>
        </div>

        {/* 3. The Video Player Screen */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-[#1e222e] shadow-2xl group">
          <WatchPlayer onCreateRoom={onCreateRoom} onJoinByCode={onJoinByCode} />

          {/* Watermark Branding inside video */}
          <div className="absolute top-4 left-5 flex items-center gap-2 text-white/90 font-bold text-xs tracking-tight select-none pointer-events-none">
            <LogoTv className="w-4 h-4 text-white" />
            <span>watch party</span>
          </div>

          {isConnected && (
            <div className="absolute top-4 right-5 flex items-center gap-1.5 text-[11px] text-white/80 font-medium bg-black/40 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10 pointer-events-none select-none">
              <RadioBroadcastIcon className="w-3.5 h-3.5 text-white mr-0.5" />
              <span>{connectedParticipants.length} orang · satu momen</span>
            </div>
          )}

          <ReactionOverlay />
        </div>

        {/* 4. Film Metadata Row (Dynamic from usePlaybackStore) */}
        <div className="flex flex-col gap-1 pt-0.5">
          <h2 className="text-base md:text-lg font-bold text-white tracking-tight">
            {media?.title ?? (connection === 'idle' ? 'Siap untuk menonton' : 'Menunggu film…')}
          </h2>
          {media ? (
            <>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400">
                <span>{formatTime(media.durationSec)}</span>
                <span>·</span>
                <span className="border border-gray-600/80 px-1.5 py-0.2 rounded text-[10px] text-gray-300 font-medium">
                  {media.license}
                </span>
                <span>·</span>
                <span>{media.attribution}</span>
              </div>
              {media.description && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{media.description}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">
              {connection === 'idle'
                ? 'Pilih "Buat Ruang Nonton" atau masukkan kode undangan teman untuk mulai menonton.'
                : 'Menghubungkan ke ruang nonton…'}
            </p>
          )}
        </div>

        {/* 5. Reactions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-y border-[#181a22]">
          <ReactionPicker layout="inline" />
          <div className="text-xs text-gray-500 italic select-none">
            Rasakan bareng. Reaksiin bareng.
          </div>
        </div>

        {/* 6. LiveKit Video Chat & Participant Tiles */}
        <div className="space-y-2.5 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-white">
              Satu layar, {connectedParticipants.length} peserta
            </h3>

            <MediaControls variant="inline" />
          </div>

          <VideoGrid />
        </div>

        {/* 7. Bottom Sync Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 px-3.5 rounded-xl bg-[#12141c]/70 border border-[#1b1f2b] text-[11px] text-gray-400 select-none">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Pemutaran tersinkron untuk semua. Nggak ada yang ketinggalan cerita.</span>
          </div>

          <div className="flex items-center gap-1.5 text-emerald-400 font-medium shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Sinkron otomatis</span>
          </div>
        </div>
      </div>
    </main>
  )
}
