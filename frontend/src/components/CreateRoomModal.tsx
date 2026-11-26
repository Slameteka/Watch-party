import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Film,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { createRoom, getCatalog } from '../session/api'
import {
  clearCognitoSession,
  getCognitoProfile,
  getStoredCognitoIdToken,
  isCognitoConfigured,
  startCognitoLogin,
} from '../session/auth'
import type { CreateRoomResponse, MediaItem } from '../types'

interface CreateRoomModalProps {
  isOpen: boolean
  onClose: () => void
  onRoomCreated: (created: CreateRoomResponse, inviteUrl: string) => void
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
  const cognitoReady = isCognitoConfigured()
  const [catalog, setCatalog] = useState<MediaItem[]>(FALLBACK_CATALOG)
  const [selectedMediaId, setSelectedMediaId] = useState<string>('sintel')
  const [displayName, setDisplayName] = useState<string>('Host')
  const [maxParticipants, setMaxParticipants] = useState<number>(6)
  const [manualToken, setManualToken] = useState<string>(() => getStoredCognitoIdToken() ?? '')
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => Boolean(getStoredCognitoIdToken()))
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const profile = isLoggedIn ? getCognitoProfile() : null

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

  const activeToken = getStoredCognitoIdToken() || manualToken.trim()
  const canCreateWithAuth = cognitoReady ? Boolean(activeToken) : true

  const handleCognitoLogin = async () => {
    setErrorMessage(null)
    try {
      await startCognitoLogin({ openCreateAfter: true })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memulai login Cognito.')
    }
  }

  const handleClearLogin = () => {
    clearCognitoSession()
    setManualToken('')
    setIsLoggedIn(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const trimmedName = displayName.trim()
    if (!trimmedName || trimmedName.length > 32) {
      setErrorMessage('Nama Host harus antara 1 sampai 32 karakter.')
      return
    }

    if (cognitoReady && !activeToken) {
      setErrorMessage('Silakan login sebagai Host lewat Cognito terlebih dahulu.')
      return
    }

    const tokenToUse = activeToken || 'dev-mock-host-token'

    setIsSubmitting(true)
    try {
      const response = await createRoom(tokenToUse, {
        mediaId: selectedMediaId,
        displayName: trimmedName,
        maxParticipants,
      })

      const inviteUrl =
        response.room.inviteUrl || `${window.location.origin}/r/${response.room.roomId}`
      onRoomCreated(response, inviteUrl)
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
              <p className="text-[11px] text-gray-400">
                Pilih film dari katalog dan tentukan kapasitas ruang
              </p>
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

          {/* 1. Host Cognito Authentication Status */}
          <div className="p-3.5 rounded-xl bg-[#161822] border border-[#232737] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`w-4 h-4 ${activeToken ? 'text-emerald-400' : 'text-amber-400'}`}
                />
                <span className="font-semibold text-white">Autentikasi Host (Cognito)</span>
              </div>
              {activeToken ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                  Sudah Login
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                  Wajib untuk Host
                </span>
              )}
            </div>

            {cognitoReady ? (
              activeToken ? (
                <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-gray-400">
                  <span className="truncate">
                    Akun: <strong className="text-gray-200">{profile?.email ?? 'Host Cognito'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleClearLogin}
                    className="flex items-center gap-1 text-rose-300 hover:text-rose-200 cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Keluar</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-gray-400">
                    Host perlu masuk atau mendaftar dengan akun Cognito sebelum membuat ruang nonton.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCognitoLogin()}
                    className="w-full py-2 px-3 rounded-xl bg-white text-black hover:bg-gray-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Login / Daftar sebagai Host</span>
                  </button>
                </div>
              )
            ) : (
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Token dev opsional (mode lokal tanpa Cognito)"
                className="w-full px-3 py-2 rounded-xl bg-[#11131b] border border-[#232737] text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 text-[11px] font-mono"
              />
            )}
          </div>

          {/* 2. Film Selector */}
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
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {durationMin} menit • HLS
                        </div>
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

          {/* 3. Display Name Input */}
          <div className="space-y-1.5">
            <label className="font-semibold text-gray-200 block">Nama Tampilan Host (Anda)</label>
            <input
              type="text"
              required
              maxLength={32}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Contoh: Luqman, Alice"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#161822] border border-[#232737] text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs transition-all"
            />
            <div className="text-[10px] text-gray-500 flex justify-between">
              <span>Akan ditampilkan ke semua peserta sebagai Host.</span>
              <span>{displayName.length}/32</span>
            </div>
          </div>

          {/* 4. Max Participants Selector */}
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
              <span>2 Orang (Privat)</span>
              <span>6 Orang (Rekomendasi)</span>
              <span>10 Orang (Maksimal)</span>
            </div>
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
              disabled={isSubmitting || !displayName.trim() || !canCreateWithAuth}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
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
