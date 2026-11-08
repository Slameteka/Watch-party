import React, { useState } from 'react'
import {
  Bookmark,
  Check,
  Clapperboard,
  Crown,
  Info,
  Link2,
  Lock,
  Mic,
  MicOff,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Smile,
  UserPlus,
  VideoOff,
  Volume2,
} from 'lucide-react'
import {
  FullscreenIcon,
  LogoTv,
  PipIcon,
  RadioBroadcastIcon,
  SoundWaveIcon,
  SubtitlesIcon,
} from './Icons'

interface CenterTheaterProps {
  onInvite?: () => void
}

export const CenterTheater: React.FC<CenterTheaterProps> = ({ onInvite }) => {
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMicActive, setIsMicActive] = useState(true)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [volume, setVolume] = useState(70)

  // Floating reactions simulation
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([
    { id: 1, emoji: '❤️' },
    { id: 2, emoji: '🔥' },
  ])

  const addReaction = (emoji: string) => {
    const newId = Date.now()
    setReactions((prev) => [...prev, { id: newId, emoji }])
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== newId))
    }, 3200)
  }

  return (
    <main className="flex-1 flex flex-col h-full bg-[#0c0d10] overflow-hidden select-none text-[#8e929d]">
      {/* 1. Sub-header Breadcrumb Bar (Height 56px / h-14) */}
      <div className="h-14 px-6 flex items-center justify-between border-b border-[#1c1e26] shrink-0">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-white" />
          <span className="font-semibold text-white text-[13px]">Malam Minggu</span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 ml-1">
            <Lock className="w-3 h-3 text-gray-400" />
            Privat
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Tersinkron</span>
          </div>

          <button
            onClick={onInvite}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#151720] hover:bg-[#1e212d] text-xs font-medium text-white border border-[#252838] transition-all cursor-pointer shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Undang teman</span>
          </button>

          <button
            className="p-1 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Opsi"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Center Theater Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Title Header with Host Controller Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight font-sans">
              Beda tempat. Satu cerita.
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Ambil camilanmu, filmnya sudah dimulai. 🍿
            </p>
          </div>

          <div className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#151720] border border-[#252838] text-xs">
            <span className="w-4 h-4 rounded-full bg-[#d97757] text-white font-bold text-[8px] flex items-center justify-center shrink-0">
              RA
            </span>
            <span className="text-gray-300 font-medium text-[11px]">Raka mengontrol pemutaran</span>
          </div>
        </div>

        {/* 3. The Video Player Screen */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-[#1e222e] shadow-2xl group">
          {/* High-fidelity Sunset Roadtrip Camper Van Scene */}
          <img
            src="https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1600&q=80"
            alt="Film Scene"
            className="w-full h-full object-cover brightness-[0.88]"
          />

          {/* Vignette Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/35 pointer-events-none" />

          {/* Watermark Branding inside video */}
          <div className="absolute top-4 left-5 flex items-center gap-2 text-white/90 font-bold text-xs tracking-tight select-none">
            <LogoTv className="w-4 h-4 text-white" />
            <span>watch party</span>
          </div>

          <div className="absolute top-4 right-5 flex items-center gap-1.5 text-[11px] text-white/80 font-medium bg-black/40 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10">
            <RadioBroadcastIcon className="w-3.5 h-3.5 text-white mr-0.5" />
            <span>6 orang · satu momen</span>
          </div>

          {/* Subtitles centered near bottom */}
          <div className="absolute bottom-16 inset-x-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
            <p className="text-white text-sm md:text-base font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] max-w-xl leading-relaxed">
              Kita nggak harus tahu tujuannya,
              <br />
              asal perginya bareng.
            </p>
          </div>

          {/* Floating Reactions on video */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {reactions.map((r, i) => (
              <div
                key={r.id}
                className="absolute right-12 text-3xl animate-bounce"
                style={{
                  bottom: `${70 + i * 45}px`,
                  animation: 'floatUp 3s ease-out forwards',
                }}
              >
                {r.emoji}
              </div>
            ))}
          </div>

          {/* Video Player Controls Bar */}
          <div className="absolute bottom-0 inset-x-0 px-4 pb-2.5 pt-6 bg-gradient-to-t from-black/95 to-transparent flex flex-col gap-2">
            {/* Timeline Progress Bar */}
            <div className="relative w-full h-1 bg-white/20 rounded-full cursor-pointer group-hover:h-1.5 transition-all">
              <div className="absolute top-0 left-0 h-full w-[39%] bg-white rounded-full" />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between text-xs text-gray-300">
              {/* Left Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>

                <button
                  className="p-1 hover:text-white transition-colors cursor-pointer"
                  title="Putar balik 10 detik"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1.5 group/vol">
                  <Volume2 className="w-3.5 h-3.5 text-gray-400 group-hover/vol:text-white" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                </div>

                <span className="text-[11px] text-gray-400 font-mono">42:18 / 1:48:32</span>
              </div>

              {/* Right Controls */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-gray-300 bg-white/10 px-1.5 py-0.5 rounded">
                  1080p
                </span>
                <button
                  className="p-1 hover:text-white transition-colors cursor-pointer"
                  title="Subtitel"
                >
                  <SubtitlesIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  className="p-1 hover:text-white transition-colors cursor-pointer"
                  title="Picture-in-picture"
                >
                  <PipIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  className="p-1 hover:text-white transition-colors cursor-pointer"
                  title="Layar Penuh"
                >
                  <FullscreenIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Film Metadata & Actions Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
          <div>
            <h2 className="text-base md:text-lg font-bold text-white tracking-tight">
              Langit Setelah Hujan
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <span>2025</span>
              <span>·</span>
              <span>Drama, Petualangan</span>
              <span>·</span>
              <span className="border border-gray-600/80 px-1 py-0.2 rounded text-[10px] text-gray-300 font-medium">
                13+
              </span>
              <span>·</span>
              <span>Audio Indonesia</span>
              <span>·</span>
              <span>Subtitel Indonesia</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14161f] hover:bg-[#1d202c] text-gray-200 text-xs font-medium border border-[#252838] transition-all cursor-pointer">
              <Bookmark className="w-3.5 h-3.5 text-gray-400" />
              <span>Simpan</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14161f] hover:bg-[#1d202c] text-gray-200 text-xs font-medium border border-[#252838] transition-all cursor-pointer">
              <Info className="w-3.5 h-3.5 text-gray-400" />
              <span>Detail film</span>
            </button>
          </div>
        </div>

        {/* 5. Reactions Counter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-y border-[#181a22]">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => addReaction('❤️')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#151720] hover:bg-[#1d202c] border border-[#252838] text-xs font-medium text-gray-200 transition-all cursor-pointer active:scale-95"
            >
              <span>❤️</span>
              <span>8</span>
            </button>

            <button
              onClick={() => addReaction('🔥')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#151720] hover:bg-[#1d202c] border border-[#252838] text-xs font-medium text-gray-200 transition-all cursor-pointer active:scale-95"
            >
              <span>🔥</span>
              <span>6</span>
            </button>

            <button
              onClick={() => addReaction('😂')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#151720] hover:bg-[#1d202c] border border-[#252838] text-xs font-medium text-gray-200 transition-all cursor-pointer active:scale-95"
            >
              <span>😂</span>
              <span>4</span>
            </button>

            <button
              onClick={() => addReaction('😮')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#151720] hover:bg-[#1d202c] border border-[#252838] text-xs font-medium text-gray-200 transition-all cursor-pointer active:scale-95"
            >
              <span>😮</span>
              <span>2</span>
            </button>

            <button
              onClick={() => addReaction('👏')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#151720] hover:bg-[#1d202c] border border-[#252838] text-xs font-medium text-gray-200 transition-all cursor-pointer active:scale-95"
            >
              <span>👏</span>
              <span>3</span>
            </button>

            <button
              className="p-1 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Tambah Reaksi"
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-gray-500 italic">Rasakan bareng. Reaksiin bareng.</div>
        </div>

        {/* 6. Participant Cards Section ("Satu layar, enam cerita") */}
        <div className="space-y-2.5 pt-0.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Satu layar, enam cerita</h3>

            {/* Media Toggles */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMicActive(!isMicActive)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                  isMicActive
                    ? 'bg-[#151720] text-white border-[#252838]'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                }`}
              >
                {isMicActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{isMicActive ? 'Mikrofon aktif' : 'Mikrofon mati'}</span>
              </button>

              <button
                onClick={() => setIsCameraActive(!isCameraActive)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                  isCameraActive
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-[#151720] text-gray-300 border-[#252838]'
                }`}
              >
                <VideoOff className="w-3.5 h-3.5" />
                <span>{isCameraActive ? 'Kamera aktif' : 'Kamera mati'}</span>
              </button>
            </div>
          </div>

          {/* 6 Participant Tiles in One Row (Avatar on LEFT, text on RIGHT) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* 1. Raka (Host) */}
            <div className="p-3 rounded-2xl bg-[#14161f] border border-[#202432] flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-[#d97757] text-white font-bold text-xs flex items-center justify-center shrink-0">
                RA
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">Raka</div>
                <div className="flex items-center gap-1 text-[10px] text-amber-400 font-medium mt-0.5">
                  <Crown className="w-2.5 h-2.5" />
                  <span>Host</span>
                </div>
              </div>
            </div>

            {/* 2. Dinda (Berbicara) */}
            <div className="p-3 rounded-2xl bg-[#14161f] border border-emerald-500/30 ring-1 ring-emerald-500/20 flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-[#208b7e] text-white font-bold text-xs flex items-center justify-center shrink-0">
                DI
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">Dinda</div>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium mt-0.5">
                  <SoundWaveIcon className="w-2.5 h-2.5" />
                  <span>Berbicara</span>
                </div>
              </div>
            </div>

            {/* 3. Bimo (Menyimak) */}
            <div className="p-3 rounded-2xl bg-[#14161f] border border-[#202432] flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-[#4a58b8] text-white font-bold text-xs flex items-center justify-center shrink-0">
                BI
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">Bimo</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                  <MicOff className="w-2.5 h-2.5" />
                  <span>Menyimak</span>
                </div>
              </div>
            </div>

            {/* 4. Alya (Menyimak) */}
            <div className="p-3 rounded-2xl bg-[#14161f] border border-[#202432] flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-[#d69046] text-white font-bold text-xs flex items-center justify-center shrink-0">
                AL
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">Alya</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                  <MicOff className="w-2.5 h-2.5" />
                  <span>Menyimak</span>
                </div>
              </div>
            </div>

            {/* 5. Fajar (Menyimak) */}
            <div className="p-3 rounded-2xl bg-[#14161f] border border-[#202432] flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-[#414856] text-white font-bold text-xs flex items-center justify-center shrink-0">
                FA
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">Fajar</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                  <MicOff className="w-2.5 h-2.5" />
                  <span>Menyimak</span>
                </div>
              </div>
            </div>

            {/* 6. Naya (kamu - Terhubung) */}
            <div className="p-3 rounded-2xl bg-[#14161f] border border-gray-700/60 flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-[#2a2d39] text-white font-bold text-xs flex items-center justify-center shrink-0 border border-gray-600">
                NA
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">Naya (kamu)</div>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium mt-0.5">
                  <Check className="w-2.5 h-2.5" />
                  <span>Terhubung</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 7. Bottom Sync Bar */}
        <div className="flex items-center justify-between py-2 px-3.5 rounded-xl bg-[#12141c]/70 border border-[#1b1f2b] text-[11px] text-gray-400">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-gray-400" />
            <span>Pemutaran tersinkron untuk semua. Nggak ada yang ketinggalan cerita.</span>
          </div>

          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Sinkron otomatis</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.7);
          }
          20% {
            opacity: 1;
            transform: translateY(0) scale(1.1);
          }
          80% {
            opacity: 0.9;
            transform: translateY(-80px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-130px) scale(0.8);
          }
        }
      `}</style>
    </main>
  )
}
