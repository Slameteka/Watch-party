import React from 'react'
import { AlertCircle } from 'lucide-react'
import { useLiveKitStore } from '../state/useLiveKitStore'
import { useSocialStore } from '../state/useSocialStore'
import { VideoTile } from './VideoTile'

export const VideoGrid: React.FC = () => {
  const { room, isConnected, isConnecting, error, remoteParticipants, qualityMap } =
    useLiveKitStore()
  const { participants, selfParticipantId, selfRole } = useSocialStore()

  // Graceful degradation alert
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

  // Find self participant info
  const selfParticipant = participants.find((p) => p.participantId === selfParticipantId)
  const selfDisplayName = selfParticipant?.displayName || 'Saya'

  // Map remote participants with social store participant info
  const participantsCount = (room ? 1 : 0) + remoteParticipants.length

  // Calculate dynamic grid columns for up to 10 participants
  // 1-2 participants: 1 or 2 cols
  // 3-4 participants: 2 cols
  // 5-6 participants: 3 cols
  // 7-10 participants: 4-5 cols
  const gridClasses =
    participantsCount <= 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : participantsCount <= 4
        ? 'grid-cols-2'
        : participantsCount <= 6
          ? 'grid-cols-2 md:grid-cols-3'
          : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'

  return (
    <div className="w-full">
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
          // Identify participant in social store by participantId (matching identity)
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
          participants.map((p) => (
            <div
              key={p.participantId}
              className="relative flex flex-col items-center justify-center bg-gray-900/60 rounded-xl border border-gray-800 aspect-video p-3 text-center"
            >
              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 font-semibold mb-2">
                {p.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-gray-300 font-medium truncate max-w-full">
                {p.displayName}
              </span>
              <span className="text-[10px] text-gray-500 capitalize">{p.role}</span>
            </div>
          ))}
      </div>
    </div>
  )
}
