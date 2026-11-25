import React, { useEffect, useState } from 'react'
import { AlertCircle, Clapperboard, Crown, Loader2, LogIn, Users, X } from 'lucide-react'
import { getRoomSummary } from '../session/api'
import type { RoomSummary } from '../types'

interface JoinRoomModalProps {
  roomId: string | null
  isOpen: boolean
  onClose: () => void
  onJoin: (roomId: string, displayName: string) => void
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  roomId,
  isOpen,
  onClose,
  onJoin,
}) => {
  const [summary, setSummary] = useState<RoomSummary | null>(null)
  const [displayName, setDisplayName] = useState<string>(
    () => `Tamu ${Math.floor(Math.random() * 900 + 100)}`
  )
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRoomClosed, setIsRoomClosed] = useState<boolean>(false)

  useEffect(() => {
    if (!isOpen || !roomId) return

    let isMounted = true
    getRoomSummary(roomId)
      .then((data) => {
        if (!isMounted) return
        setSummary(data)
        if (data.status === 'closed') {
          setIsRoomClosed(true)
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        const msg = err instanceof Error ? err.message : 'Ruang tidak ditemukan atau sudah kadaluarsa.'
        setErrorMessage(msg)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, roomId])

  if (!isOpen || !roomId) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed || trimmed.length > 32) {
      setErrorMessage('Nama tampilan harus antara 1 sampai 32 karakter.')
      return
    }

    onJoin(roomId, trimmed)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#12141c] border border-[#212534] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1f2331] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Undangan Nonton Bersama</h2>
              <p className="text-[11px] text-gray-400">Masuk sebagai tamu tanpa perlu registrasi</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <span>Memeriksa ketersediaan ruang...</span>
            </div>
          ) : isRoomClosed ? (
            <div className="py-6 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Ruang Telah Ditutup</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Host telah mengakhiri sesi nonton bersama ini.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-3 px-5 py-2 rounded-xl bg-[#1b1e2b] hover:bg-[#25293a] text-white text-xs font-semibold cursor-pointer"
              >
                Kembali ke Beranda
              </button>
            </div>
          ) : errorMessage ? (
            <div className="py-6 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Ruang Tidak Ditemukan</h3>
                <p className="text-xs text-rose-300/90 mt-1">{errorMessage}</p>
              </div>
              <button
                onClick={onClose}
                className="mt-3 px-5 py-2 rounded-xl bg-[#1b1e2b] hover:bg-[#25293a] text-white text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-300">
              {/* Room Card Preview */}
              {summary && (
                <div className="p-3.5 rounded-xl bg-[#161824] border border-[#232738] space-y-2">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <Clapperboard className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="truncate">{summary.mediaTitle}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-[#1f2231]">
                    <div className="flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Host: <strong className="text-gray-200">{summary.hostDisplayName}</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-400" />
                      <span>{summary.participantCount} / {summary.maxParticipants} peserta</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Display Name Input */}
              <div className="space-y-1.5">
                <label className="font-semibold text-gray-200 block">
                  Nama Anda
                </label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Contoh: Budi, Cindy"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#161822] border border-[#232737] text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs transition-all"
                />
                <div className="text-[10px] text-gray-500 flex justify-between">
                  <span>Nama yang akan dilihat teman-teman di ruang nonton.</span>
                  <span>{displayName.length}/32</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-[#181a24] hover:bg-[#202432] text-gray-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={!displayName.trim()}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Gabung Nonton</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
