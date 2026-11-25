import React, { useEffect, useState } from 'react'
import { AlertCircle, Check, Film, Loader2, Sparkles, Users, X } from 'lucide-react'
import { createRoom, getCatalog } from '../session/api'
import type { MediaItem, RoomSummary } from '../types'

interface CreateRoomModalProps {
  isOpen: boolean
  onClose: () => void
  onRoomCreated: (room: RoomSummary, inviteUrl: string) => void
}

const FALLBACK_CATALOG: MediaItem[] = [
  {
    mediaId: 'sintel',
    title: 'Sintel',
    description: 'Animasi pendek open-source oleh Blender Foundation.',
    durationSec: 888,
    posterUrl: 'https://watchparty.chescloud.my.id/posters/sintel.jpg',
    playbackUrl: 'https://watchparty.chescloud.my.id/media/sintel/master.m3u8',
    license: 'CC BY 3.0',
    attribution: '(c) copyright Blender Foundation | durian.blender.org',
  },
]

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onRoomCreated,
}) => {
  const [catalog, setCatalog] = useState<MediaItem[]>(FALLBACK_CATALOG)
  const [selectedMediaId, setSelectedMediaId] = useState<string>('sintel')
  const [displayName, setDisplayName] = useState<string>('Host')
  const [maxParticipants, setMaxParticipants] = useState<number>(6)
  const [idToken, setIdToken] = useState<string>(() => sessionStorage.getItem('cognito_id_token') ?? '')
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Load catalog when modal opens
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    getCatalog()
      .then((res) => {
        if (!isMounted) return
        if (res.items && res.items.length > 0) {
          setCatalog(res.items)
          setSelectedMediaId(res.items[0].mediaId)
        }
      })
      .catch((err) => {
        console.warn('Gagal mengambil katalog dari server, memakai fallback:', err)
      })
      .finally(() => {
        if (isMounted) setIsLoadingCatalog(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCognitoLogin = () => {
    const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined

    if (!domain || !clientId) {
      setErrorMessage(
        'Konfigurasi Cognito belum diset di environment (VITE_COGNITO_DOMAIN & VITE_COGNITO_CLIENT_ID). Masukkan token manual untuk pengujian.'
      )
      return
    }

    const redirectUri = encodeURIComponent(window.location.origin)
    const loginUrl = `https://${domain}/login?client_id=${clientId}&response_type=token&scope=openid+email&redirect_uri=${redirectUri}`
    window.location.href = loginUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const trimmedName = displayName.trim()
    if (!trimmedName || trimmedName.length > 32) {
      setErrorMessage('Nama Host harus antara 1 sampai 32 karakter.')
      return
    }

    // Use entered token, saved token, or mock token in dev
    const tokenToUse = idToken.trim() || sessionStorage.getItem('cognito_id_token') || 'dev-mock-host-token'

    setIsSubmitting(true)
    try {
      const response = await createRoom(tokenToUse, {
        mediaId: selectedMediaId,
        displayName: trimmedName,
        maxParticipants,
      })

      // Remember token if provided
      if (idToken.trim()) {
        sessionStorage.setItem('cognito_id_token', idToken.trim())
      }

      const inviteUrl = response.room.inviteUrl || `${window.location.origin}/r/${response.room.roomId}`
      onRoomCreated(response.room, inviteUrl)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat ruang baru.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#12141c] border border-[#212534] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1f2331] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Buat Ruang Nonton Baru</h2>
              <p className="text-[11px] text-gray-400">Pilih film dari katalog dan tentukan kapasitas ruang</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs text-gray-300">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Film Selector */}
          <div className="space-y-2">
            <label className="font-semibold text-gray-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-purple-400" />
                Pilih Film dari Katalog
              </span>
              {isLoadingCatalog && (
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Memuat...
                </span>
              )}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {catalog.map((movie) => {
                const isSelected = selectedMediaId === movie.mediaId
                const durationMin = Math.round(movie.durationSec / 60)

                return (
                  <div
                    key={movie.mediaId}
                    onClick={() => setSelectedMediaId(movie.mediaId)}
                    className={`relative p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-purple-600/15 border-purple-500 text-white shadow-lg'
                        : 'bg-[#161822] border-[#222636] hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate text-white">{movie.title}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{durationMin} menit • HLS</div>
                      </div>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    {movie.description && (
                      <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                        {movie.description}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2. Display Name Input */}
          <div className="space-y-1.5">
            <label className="font-semibold text-gray-200 block">
              Nama Tampilan Host (Anda)
            </label>
            <input
              type="text"
              required
              maxLength={32}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Contoh: Raka, Alice"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#161822] border border-[#232737] text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs transition-all"
            />
            <div className="text-[10px] text-gray-500 flex justify-between">
              <span>Akan ditampilkan ke semua peserta sebagai Host.</span>
              <span>{displayName.length}/32</span>
            </div>
          </div>

          {/* 3. Max Participants Selector */}
          <div className="space-y-1.5">
            <label className="font-semibold text-gray-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                Kapasitas Peserta (Termasuk Host)
              </span>
              <span className="text-purple-400 font-bold">{maxParticipants} Orang</span>
            </label>
            <input
              type="range"
              min={2}
              max={10}
              step={1}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="w-full h-1.5 bg-[#222636] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>2 Orang (Private)</span>
              <span>6 Orang (Rekomendasi)</span>
              <span>10 Orang (Maksimal)</span>
            </div>
          </div>

          {/* 4. Cognito Host Auth (Optional/Token helper) */}
          <div className="pt-2 border-t border-[#1f2331] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-gray-300">Autentikasi Host Cognito</span>
              <button
                type="button"
                onClick={handleCognitoLogin}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-medium underline cursor-pointer"
              >
                Login via Hosted UI
              </button>
            </div>
            <input
              type="password"
              value={idToken}
              onChange={(e) => setIdToken(e.target.value)}
              placeholder="Cognito ID Token (opsional di dev / mock)"
              className="w-full px-3 py-2 rounded-xl bg-[#161822] border border-[#232737] text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 text-[11px] font-mono"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-[#181a24] hover:bg-[#202432] text-gray-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !displayName.trim()}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Membuat Ruang...</span>
                </>
              ) : (
                <span>Mulai Watch Party</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
