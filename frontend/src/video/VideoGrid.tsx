import React from 'react'
import { AlertCircle, X } from 'lucide-react'
import { useLiveKitStore } from '../state/useLiveKitStore'
import { useSocialStore } from '../state/useSocialStore'
import { VideoTile } from './VideoTile'

export const VideoGrid: React.FC = () => {
  const {
    room,
    isConnected,
    isConnecting,
    error,
    mediaError,
    remoteParticipants,
    qualityMap,
    clearMediaError,
  } = useLiveKitStore()
  const { participants, selfParticipantId, selfRole } = useSocialStore()

  // Graceful degradation alert (PRD §6.3)
  if (error) {
    return (
      <div className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>{error}. Film, obrolan, dan sinkronisasi tetap berfungsi normal.</span>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className="w-full py-6 flex flex-col items-center justify-center text-xs text-gray-400 gap-2">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <span>Menyambungkan ke ruang video chat...</span>
      </div>
    )
  }

  const visibleFallbackParticipants = participants.filter((p) => p.connected || p.role === 'host')

  const selfParticipant = participants.find((p) => p.participantId === selfParticipantId)
  const selfDisplayName = selfParticipant?.displayName || 'Saya'

  const participantsCount = isConnected
    ? (room ? 1 : 0) + remoteParticipants.length
    : visibleFallbackParticipants.length

  // Calculate dynamic grid columns for up to 10 participants
  const gridClasses =
    participantsCount <= 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : participantsCount <= 4
        ? 'grid-cols-2'
        : participantsCount <= 6
          ? 'grid-cols-2 md:grid-cols-3'
          : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'

  return (
    <div className="w-full space-y-2">
      {mediaError && (
        <div className="w-full px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{mediaError}</span>
          </div>
          <button
            onClick={clearMediaError}
            className="text-rose-300 hover:text-white p-0.5 cursor-pointer"
            title="Tutup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className={`grid ${gridClasses} gap-2.5 max-h-[360px] overflow-y-auto p-1`}>
        {/* Local Participant Tile */}
        {room && (
          <VideoTile
            participant={room.localParticipant}
            displayName={selfDisplayName}
            role={selfRole}
            isLocal={true}
            isHost={selfRole === 'host'}
            quality={qualityMap['local'] || 'good'}
          />
        )}

        {/* Remote Participant Tiles */}
        {remoteParticipants.map((remote) => {
          const matched = participants.find((p) => p.participantId === remote.identity)
          const displayName = matched?.displayName || remote.name || remote.identity
          const role = matched?.role || 'viewer'
          const quality = qualityMap[remote.identity] || 'good'

          return (
            <VideoTile
              key={remote.identity}
              participant={remote}
              displayName={displayName}
              role={role}
              isLocal={false}
              isHost={role === 'host'}
              quality={quality}
            />
          )
        })}

        {/* Fallback if LiveKit not connected yet but participants exist in room */}
        {!isConnected &&
          visibleFallbackParticipants.map((p) => (
            <div
              key={p.participantId}
              className={`relative flex flex-col items-center justify-center bg-[#14161f] rounded-xl border border-[#202432] aspect-video p-3 text-center ${
                !p.connected ? 'opacity-60' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[#1e2230] flex items-center justify-center text-gray-200 font-semibold mb-2 border border-white/10">
                {p.displayName.trim().charAt(0).toUpperCase() || '?'}
              </div>
              <span className="text-xs text-gray-200 font-medium truncate max-w-full">
                {p.displayName} {p.participantId === selfParticipantId && '(Anda)'}
              </span>
              <span className="text-[10px] text-gray-400 capitalize mt-0.5">
                {p.role}
                {!p.connected && ' · Offline'}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}
