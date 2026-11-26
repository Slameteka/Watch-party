import { useCallback, useEffect, useState } from 'react'
import { ChatSidebar } from './chat/ChatSidebar'
import { CenterTheater } from './components/CenterTheater'
import { CreateRoomModal } from './components/CreateRoomModal'
import { JoinRoomModal } from './components/JoinRoomModal'
import { LeftSidebar } from './components/LeftSidebar'
import { apiBaseUrl } from './session/api'
import { getStoredCognitoIdToken, handleCognitoCallback } from './session/auth'
import {
  getActiveRoomId,
  kickRoomParticipant,
  startSession,
  toggleParticipantController,
} from './session/session'
import { useRoomSession } from './session/useRoomSession'
import type { CreateRoomResponse, Role } from './types'

function extractRoomId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const pathMatch = trimmed.match(/\/r\/([a-zA-Z0-9_-]+)/)
  if (pathMatch?.[1]) return pathMatch[1]
  const queryMatch = trimmed.match(/[?&]room=([a-zA-Z0-9_-]+)/)
  if (queryMatch?.[1]) return queryMatch[1]
  if (/^[a-zA-Z0-9_-]{4,64}$/.test(trimmed)) return trimmed
  return null
}

function initialRoomId(): string | null {
  const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9_-]+)/)
  if (pathMatch?.[1]) return pathMatch[1]
  const paramRoom = new URLSearchParams(window.location.search).get('room')
  if (paramRoom) return paramRoom
  const base = apiBaseUrl()
  if (base.includes('localhost') || base.includes('127.0.0.1')) return 'MockRoom0001'
  return null
}

export function App() {
  useRoomSession()
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => initialRoomId())
  const [currentInviteUrl, setCurrentInviteUrl] = useState<string>('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Modals state
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false)
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false)
  const [deepLinkRoomId, setDeepLinkRoomId] = useState<string | null>(null)

  // Mobile/tablet drawer state (only used below xl breakpoint)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)

  const showToast = useCallback((message: string, durationMs = 3000) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), durationMs)
  }, [])

  // Handle Cognito OAuth2 PKCE /callback and /r/:roomId deep links on mount
  useEffect(() => {
    void handleCognitoCallback().then((result) => {
      if (!result.handled) return
      if (result.ok) {
        showToast(
          result.email ? `Login Host berhasil (${result.email})!` : 'Berhasil login sebagai Host!',
        )
        if (result.openCreateAfter) {
          setIsCreateRoomOpen(true)
        }
      } else {
        showToast(result.error ?? 'Gagal login Cognito.', 4000)
      }
    })

    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9_-]+)/)
    if (pathMatch?.[1]) {
      const targetId = pathMatch[1]
      setTimeout(() => {
        setDeepLinkRoomId(targetId)
        setIsJoinRoomOpen(true)
      }, 0)
    }
  }, [showToast])

  const handleInvite = () => {
    const roomId = getActiveRoomId() ?? activeRoomId
    if (!roomId) {
      showToast('Buat atau gabung ruang terlebih dahulu untuk mengundang teman.')
      return
    }
    const inviteUrl = currentInviteUrl || `${window.location.origin}/r/${roomId}`
    void navigator.clipboard.writeText(inviteUrl)
    showToast('Link undangan tersalin ke clipboard!', 2500)
  }

  const handleOpenCreateRoom = () => {
    setIsCreateRoomOpen(true)
  }

  const handleJoinByCode = (roomIdOrUrl: string) => {
    const parsedId = extractRoomId(roomIdOrUrl)
    if (!parsedId) {
      showToast('Masukkan kode ruang atau link undangan /r/… yang valid.')
      return
    }
    setDeepLinkRoomId(parsedId)
    setIsJoinRoomOpen(true)
  }

  const handleRoomCreated = (created: CreateRoomResponse, inviteUrl: string) => {
    const { room, session } = created
    setActiveRoomId(room.roomId)
    setCurrentInviteUrl(inviteUrl)
    window.history.replaceState(null, '', `/r/${room.roomId}`)

    // Reuse Host RoomSession returned by POST /rooms without calling /join again.
    void startSession({
      roomId: room.roomId,
      displayName: room.hostDisplayName,
      initialSession: session,
    })

    void navigator.clipboard.writeText(inviteUrl)
    showToast(`Ruang "${room.mediaTitle}" dibuat! Link tersalin ke clipboard.`, 3500)
  }

  const handleJoinRoom = (roomId: string, displayName: string) => {
    setActiveRoomId(roomId)
    setCurrentInviteUrl(`${window.location.origin}/r/${roomId}`)
    window.history.replaceState(null, '', `/r/${roomId}`)
    void startSession({
      roomId,
      displayName,
      cognitoToken: getStoredCognitoIdToken() ?? undefined,
    })
    showToast('Bergabung ke ruang nonton!', 2500)
  }

  const handleToggleController = async (participantId: string, currentRole: Role) => {
    try {
      const updated = await toggleParticipantController(participantId, currentRole)
      showToast(
        updated.role === 'controller'
          ? `${updated.displayName} sekarang menjadi Controller.`
          : `Izin Controller ${updated.displayName} dicabut.`,
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gagal mengubah peran peserta.')
    }
  }

  const handleKickParticipant = async (participantId: string) => {
    try {
      await kickRoomParticipant(participantId)
      showToast('Peserta dikeluarkan dari ruang.')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gagal mengeluarkan peserta.')
    }
  }

  const closeLeftSidebar = useCallback(() => setIsLeftSidebarOpen(false), [])
  const closeRightSidebar = useCallback(() => setIsRightSidebarOpen(false), [])
  const toggleLeftSidebar = useCallback(() => {
    setIsLeftSidebarOpen((prev) => !prev)
    setIsRightSidebarOpen(false)
  }, [])
  const toggleRightSidebar = useCallback(() => {
    setIsRightSidebarOpen((prev) => !prev)
    setIsLeftSidebarOpen(false)
  }, [])

  // Close drawers when resizing to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const handler = () => {
      if (mq.matches) {
        setIsLeftSidebarOpen(false)
        setIsRightSidebarOpen(false)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Close drawers and modals on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLeftSidebarOpen(false)
        setIsRightSidebarOpen(false)
        setIsCreateRoomOpen(false)
        setIsJoinRoomOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-dvh w-screen bg-[#0c0d11] text-gray-100 overflow-hidden font-sans">
      {/* ===== Left Sidebar — always visible on xl+, drawer below xl ===== */}
      <div className="hidden xl:flex">
        <LeftSidebar
          activeRoomId={activeRoomId}
          onCreateRoom={handleOpenCreateRoom}
          onJoinByCode={handleJoinByCode}
        />
      </div>
      {/* Mobile/Tablet: slide-over drawer */}
      {isLeftSidebarOpen && (
        <div className="fixed inset-0 z-40 xl:hidden flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeLeftSidebar}
            aria-label="Tutup navigasi"
          />
          <div className="relative h-full z-10 animate-slide-in-left">
            <LeftSidebar
              activeRoomId={activeRoomId}
              onCreateRoom={() => {
                handleOpenCreateRoom()
                closeLeftSidebar()
              }}
              onJoinByCode={(val) => {
                handleJoinByCode(val)
                closeLeftSidebar()
              }}
              onClose={closeLeftSidebar}
            />
          </div>
        </div>
      )}

      {/* ===== Center Main Theater Screen (flex-1) ===== */}
      <CenterTheater
        activeRoomId={activeRoomId}
        onInvite={handleInvite}
        onCreateRoom={handleOpenCreateRoom}
        onJoinByCode={handleJoinByCode}
        onToggleLeftSidebar={toggleLeftSidebar}
        onToggleRightSidebar={toggleRightSidebar}
        isRightSidebarOpen={isRightSidebarOpen}
      />

      {/* ===== Right Sidebar — always visible on xl+, drawer below xl ===== */}
      <div className="hidden xl:flex">
        <ChatSidebar
          onToggleController={handleToggleController}
          onKickParticipant={handleKickParticipant}
        />
      </div>
      {/* Mobile/Tablet: slide-over drawer from right */}
      {isRightSidebarOpen && (
        <div className="fixed inset-0 z-40 xl:hidden flex justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeRightSidebar}
            aria-label="Tutup obrolan"
          />
          <div className="relative h-full z-10 animate-slide-in-right">
            <ChatSidebar
              onClose={closeRightSidebar}
              onToggleController={handleToggleController}
              onKickParticipant={handleKickParticipant}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateRoomModal
        isOpen={isCreateRoomOpen}
        onClose={() => setIsCreateRoomOpen(false)}
        onRoomCreated={handleRoomCreated}
      />

      <JoinRoomModal
        isOpen={isJoinRoomOpen}
        roomId={deepLinkRoomId}
        onClose={() => setIsJoinRoomOpen(false)}
        onJoin={handleJoinRoom}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#1c202d] border border-gray-700 text-white text-xs font-medium shadow-2xl flex items-center gap-2">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}

export default App
