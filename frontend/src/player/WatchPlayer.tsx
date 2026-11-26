import { Film, LogIn, Pause, Play, Plus, RotateCcw, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FullscreenIcon, PipIcon } from '../components/Icons'
import { reportPlayerStatus, sendPlaybackCommand } from '../session/session'
import { useSocialStore } from '../state/useSocialStore'
import { formatTime } from './format'
import { HlsPlayer, type PlayerStatus } from './HlsPlayer'
import { expectedPositionSec } from './sync'
import { usePlaybackStore, type ConnectionStatus } from './usePlaybackStore'
import { useVideoSync } from './useVideoSync'

const REWIND_SEC = 10

// Send cookies with HLS requests only where CloudFront signed cookies are used.
const HLS_WITH_CREDENTIALS = import.meta.env.VITE_HLS_WITH_CREDENTIALS === 'true'

const CONNECTION_TEXT: Partial<Record<ConnectionStatus, string>> = {
  connecting: 'Menghubungkan ke ruang…',
  reconnecting: 'Koneksi terputus. Mencoba menyambung lagi…',
}

const END_TEXT: Record<string, string> = {
  kicked: 'Kamu dikeluarkan dari ruang oleh host.',
  roomClosed: 'Ruang ditutup oleh host.',
  expired: 'Waktu ruang sudah habis.',
  replaced: 'Kamu membuka ruang ini di tab atau perangkat lain.',
  KICKED: 'Kamu tidak boleh masuk ke ruang ini.',
  ROOM_FULL: 'Ruang sudah penuh.',
  ROOM_CLOSED: 'Ruang ini sudah ditutup.',
  ROOM_NOT_FOUND: 'Ruang tidak ditemukan.',
  UNAUTHORIZED: 'Sesi tidak valid. Masuk ulang lewat link undangan.',
  NETWORK_ERROR: 'Tidak bisa menghubungi server.',
}

interface WatchPlayerProps {
  onCreateRoom?: () => void
  onJoinByCode?: (roomIdOrUrl: string) => void
}

/**
 * The video area: renders an interactive Lobby when idle, plays the room's HLS movie
 * in sync when connected, and offers quick recovery actions if a session fails/ends.
 */
export function WatchPlayer({ onCreateRoom, onJoinByCode }: WatchPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const media = usePlaybackStore((s) => s.media)
  const state = usePlaybackStore((s) => s.state)
  const connection = usePlaybackStore((s) => s.connection)
  const connectionReason = usePlaybackStore((s) => s.connectionReason)
  const commandError = usePlaybackStore((s) => s.commandError)
  const commandPending = usePlaybackStore((s) => s.commandPending)
  const role = useSocialStore((s) => s.selfRole)

  const { needsGesture, resume } = useVideoSync(videoRef)
  const [currentSec, setCurrentSec] = useState(0)
  const [volume, setVolume] = useState(70)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [lobbyCodeInput, setLobbyCodeInput] = useState('')

  const canControl = role === 'host' || role === 'controller'
  const isPlaying = state?.status === 'playing'
  const durationSec = media?.durationSec ?? 0
  const isIdleLobby = connection === 'idle' && !media
  const isTerminalError = connection === 'ended' || connection === 'failed'

  // Show the playback time on screen.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => setCurrentSec(video.currentTime)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('seeked', onTime)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('seeked', onTime)
    }
  }, [media?.playbackUrl])

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume / 100
  }, [volume, media?.playbackUrl])

  function handleStatus(status: PlayerStatus) {
    setVideoError(null)
    reportPlayerStatus(status)
  }

  function expectedNow(): number {
    const { state: current, clockOffsetMs } = usePlaybackStore.getState()
    return current ? expectedPositionSec(current, Date.now(), clockOffsetMs, durationSec) : 0
  }

  function togglePlay() {
    const video = videoRef.current
    if (!canControl || !state || !video) return
    sendPlaybackCommand(isPlaying ? 'pause' : 'play', isPlaying ? video.currentTime : state.positionSec)
  }

  function seekBy(deltaSec: number) {
    if (!canControl) return
    sendPlaybackCommand('seek', expectedNow() + deltaSec)
  }

  function seekFromBar(event: React.MouseEvent<HTMLDivElement>) {
    if (!canControl || durationSec <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    sendPlaybackCommand('seek', fraction * durationSec)
  }

  function handleLobbyJoin(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = lobbyCodeInput.trim()
    if (!trimmed || !onJoinByCode) return
    onJoinByCode(trimmed)
    setLobbyCodeInput('')
  }

  const waitingText = isTerminalError
    ? (END_TEXT[connectionReason ?? ''] ?? 'Koneksi ke ruang berakhir.')
    : !media && !isIdleLobby
      ? (CONNECTION_TEXT[connection] ?? 'Menunggu data ruang…')
      : null
  const banner = media && connection === 'reconnecting' ? CONNECTION_TEXT.reconnecting : null
  const lockedTitle = 'Hanya host atau controller yang bisa mengatur pemutaran'
  const controlClass = (enabled: boolean) =>
    enabled ? 'cursor-pointer hover:text-white' : 'opacity-40 cursor-not-allowed'
  const progress = durationSec > 0 ? Math.min(currentSec / durationSec, 1) * 100 : 0

  return (
    <div ref={boxRef} className="absolute inset-0 bg-gradient-to-br from-[#0e1017] via-[#0a0b10] to-[#13111c]">
      {media && (
        <HlsPlayer
          src={media.playbackUrl}
          videoRef={videoRef}
          controls={false}
          withCredentials={HLS_WITH_CREDENTIALS}
          className="w-full h-full object-contain bg-black"
          onStatusChange={handleStatus}
          onError={setVideoError}
        />
      )}

      {media && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/35 pointer-events-none" />
      )}

      {/* Interactive Lobby when idle (no room joined yet) */}
      {isIdleLobby && (
        <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 z-20">
          <div className="w-full max-w-md rounded-2xl bg-[#131520]/90 backdrop-blur-md border border-[#24283b] p-5 sm:p-6 text-center space-y-4 shadow-2xl">
            <div className="w-11 h-11 mx-auto rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-white">
                Nonton Bareng Tersinkron
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                Buat ruang nonton dari katalog film atau gabung memakai link undangan temanmu.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {onCreateRoom && (
                <button
                  onClick={onCreateRoom}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/25 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Ruang Nonton</span>
                </button>
              )}

              {onJoinByCode && (
                <form onSubmit={handleLobbyJoin} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={lobbyCodeInput}
                    onChange={(e) => setLobbyCodeInput(e.target.value)}
                    placeholder="Kode ruang / link /r/…"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#0d0f16] border border-[#25293c] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={!lobbyCodeInput.trim()}
                    className="px-3.5 py-2 rounded-xl bg-[#1d2030] hover:bg-[#272c42] disabled:opacity-40 text-white text-xs font-semibold border border-[#2e334a] flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Gabung</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {(waitingText || videoError || banner) && !isIdleLobby && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-20 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-white/10 space-y-3 pointer-events-auto max-w-sm">
            <p className="text-sm text-white">
              {waitingText ?? (videoError ? `Video tidak bisa diputar (${videoError})` : banner)}
            </p>
            {isTerminalError && onCreateRoom && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={onCreateRoom}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Buat Ruang Baru
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {needsGesture && !waitingText && !isIdleLobby && (
        <button
          onClick={resume}
          className="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer z-20"
        >
          <span className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold">
            <Play className="w-4 h-4" /> Klik untuk ikut menonton
          </span>
        </button>
      )}

      {commandError && (
        <div className="absolute top-14 inset-x-0 flex justify-center pointer-events-none z-20">
          <span className="text-xs text-white bg-red-600/85 px-3 py-1.5 rounded-lg">
            {commandError}
          </span>
        </div>
      )}

      {/* Controls bar (only shown when media is loaded) */}
      {media && (
        <div className="absolute bottom-0 inset-x-0 px-4 pb-2.5 pt-6 bg-gradient-to-t from-black/95 to-transparent flex flex-col gap-2">
          <div
            onClick={seekFromBar}
            title={canControl ? undefined : lockedTitle}
            className={`relative w-full h-1 bg-white/20 rounded-full ${canControl ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          >
            <div
              className="absolute top-0 left-0 h-full bg-white rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={togglePlay}
                disabled={!canControl || !state || commandPending}
                title={canControl ? (isPlaying ? 'Jeda' : 'Putar') : lockedTitle}
                className={`w-8 h-8 sm:w-6 sm:h-6 shrink-0 rounded-md bg-white/10 text-white flex items-center justify-center transition-all ${controlClass(canControl && !!state && !commandPending)}`}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>

              <button
                onClick={() => seekBy(-REWIND_SEC)}
                disabled={!canControl || !state || commandPending}
                title={canControl ? `Putar balik ${REWIND_SEC} detik` : lockedTitle}
                className={`p-1 transition-colors ${controlClass(canControl && !!state && !commandPending)}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <div className="hidden sm:flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <span className="text-[10px] sm:text-[11px] text-gray-400 font-mono shrink-0">
                {formatTime(currentSec)} / {formatTime(durationSec)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => void videoRef.current?.requestPictureInPicture?.()}
                className="hidden sm:block p-1 hover:text-white transition-colors cursor-pointer"
                title="Picture-in-picture"
              >
                <PipIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  document.fullscreenElement
                    ? void document.exitFullscreen()
                    : void boxRef.current?.requestFullscreen()
                }
                className="p-1 hover:text-white transition-colors cursor-pointer"
                title="Layar penuh"
              >
                <FullscreenIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
