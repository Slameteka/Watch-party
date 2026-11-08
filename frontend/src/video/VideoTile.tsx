import React, { useEffect, useRef } from 'react'
import type { Participant as LKParticipant } from 'livekit-client'
import { Track } from 'livekit-client'
import { Mic, MicOff, Shield, VideoOff, Wifi } from 'lucide-react'
import type { Role } from '../types'

interface VideoTileProps {
  participant?: LKParticipant
  displayName: string
  role?: Role
  isLocal?: boolean
  isHost?: boolean
  quality?: 'excellent' | 'good' | 'poor'
}

export const VideoTile: React.FC<VideoTileProps> = ({
  participant,
  displayName,
  role = 'viewer',
  isLocal = false,
  isHost = false,
  quality = 'good',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!participant) return

    const videoEl = videoRef.current
    const audioEl = audioRef.current

    const videoPub = participant.getTrackPublication(Track.Source.Camera)
    if (videoPub && videoPub.track && videoEl) {
      videoPub.track.attach(videoEl)
    }

    if (!isLocal && audioEl) {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone)
      if (audioPub && audioPub.track) {
        audioPub.track.attach(audioEl)
      }
    }

    return () => {
      if (videoPub && videoPub.track && videoEl) {
        videoPub.track.detach(videoEl)
      }
      if (!isLocal && audioEl) {
        const audioPub = participant.getTrackPublication(Track.Source.Microphone)
        if (audioPub && audioPub.track) {
          audioPub.track.detach(audioEl)
        }
      }
    }
  }, [participant, isLocal])

  const isCameraEnabled = participant?.isCameraEnabled ?? false
  const isMicEnabled = participant?.isMicrophoneEnabled ?? false

  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  const qualityColor =
    quality === 'excellent'
      ? 'text-emerald-400'
      : quality === 'good'
        ? 'text-yellow-400'
        : 'text-rose-400'

  return (
    <div className="relative group flex items-center justify-center bg-gray-900/80 rounded-xl overflow-hidden border border-gray-800 shadow-md aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${!isCameraEnabled ? 'hidden' : ''} ${
          isLocal ? '-scale-x-100' : ''
        }`}
      />

      {!isLocal && <audio ref={audioRef} autoPlay />}

      {!isCameraEnabled && (
        <div className="flex flex-col items-center justify-center select-none">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-bold text-lg md:text-xl shadow-lg border border-purple-400/30">
            {initial}
          </div>
          <span className="text-xs text-gray-400 mt-2 flex items-center gap-1 font-medium">
            <VideoOff className="w-3.5 h-3.5" /> Kamera Nonaktif
          </span>
        </div>
      )}

      <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-xs font-medium border border-white/10">
        <Wifi className={`w-3.5 h-3.5 ${qualityColor}`} />
        {isMicEnabled ? (
          <Mic className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <MicOff className="w-3.5 h-3.5 text-rose-400" />
        )}
      </div>

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs text-white bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10">
        <span className="truncate max-w-[120px] md:max-w-[150px] font-medium">
          {displayName} {isLocal && <span className="text-purple-300">(Anda)</span>}
        </span>
        <div className="flex items-center gap-1">
          {isHost || role === 'host' ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
              <Shield className="w-2.5 h-2.5" /> Host
            </span>
          ) : role === 'controller' ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Controller
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] text-gray-400">Viewer</span>
          )}
        </div>
      </div>
    </div>
  )
}
