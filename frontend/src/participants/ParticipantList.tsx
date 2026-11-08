import React from 'react'
import { Crown, Loader2, UserX, WifiOff } from 'lucide-react'
import { useSocialStore } from '../state/useSocialStore'
import type { PlayerStatus, Role } from '../types'

interface ParticipantListProps {
  onKickParticipant?: (participantId: string) => void
  onToggleController?: (participantId: string, currentRole: Role) => void
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  onKickParticipant,
  onToggleController,
}) => {
  const { participants, selfParticipantId, selfRole } = useSocialStore()

  const getStatusBadge = (status: PlayerStatus, connected: boolean) => {
    if (!connected) {
      return (
        <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-800/80 px-2 py-0.5 rounded-full border border-gray-700">
          <WifiOff className="w-2.5 h-2.5" /> Offline
        </span>
      )
    }

    switch (status) {
      case 'ready':
        return (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
            Ready
          </span>
        )
      case 'syncing':
        return (
          <span className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 font-medium">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Syncing
          </span>
        )
      case 'buffering':
        return (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-medium">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Buffering
          </span>
        )
      default:
        return (
          <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
            Unknown
          </span>
        )
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
        Peserta Terhubung ({participants.filter((p) => p.connected).length}/{participants.length})
      </div>

      {participants.map((p) => {
        const isSelf = p.participantId === selfParticipantId
        const isHost = p.role === 'host'
        const canManage = selfRole === 'host' && !isSelf && !isHost

        return (
          <div
            key={p.participantId}
            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
              !p.connected
                ? 'bg-gray-900/40 border-gray-800/50 opacity-60'
                : 'bg-gray-800/60 border-gray-700/60 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  isHost
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                }`}
              >
                {p.displayName.charAt(0).toUpperCase()}
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-200 truncate">
                    {p.displayName}
                  </span>
                  {isSelf && <span className="text-[10px] text-purple-400 font-normal">(Anda)</span>}
                </div>

                <div className="flex items-center gap-1 mt-0.5">
                  {isHost ? (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-300">
                      <Crown className="w-2.5 h-2.5" /> Host
                    </span>
                  ) : p.role === 'controller' ? (
                    <span className="text-[10px] font-semibold text-blue-300">Controller</span>
                  ) : (
                    <span className="text-[10px] text-gray-500">Viewer</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {getStatusBadge(p.playerStatus, p.connected)}

              {canManage && (
                <div className="flex items-center gap-1 ml-1">
                  {onToggleController && (
                    <button
                      onClick={() => onToggleController(p.participantId, p.role)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                        p.role === 'controller'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                          : 'bg-gray-700/60 text-gray-400 border border-gray-600/50 hover:bg-gray-700'
                      }`}
                      title={
                        p.role === 'controller'
                          ? 'Cabut Izin Controller'
                          : 'Beri Izin Controller'
                      }
                    >
                      {p.role === 'controller' ? 'Revoke' : 'Make Ctrl'}
                    </button>
                  )}

                  {onKickParticipant && (
                    <button
                      onClick={() => onKickParticipant(p.participantId)}
                      className="p-1 rounded text-rose-400 hover:bg-rose-500/20 transition-all"
                      title="Keluarkan Peserta"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
