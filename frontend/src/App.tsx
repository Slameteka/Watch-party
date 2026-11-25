import { useCallback, useEffect, useState } from 'react'
import { LeftSidebar } from './components/LeftSidebar'
import { CenterTheater } from './components/CenterTheater'
import { RightSidebar } from './components/RightSidebar'
import { CreateRoomModal } from './components/CreateRoomModal'
import { JoinRoomModal } from './components/JoinRoomModal'
import { useRoomSession } from './session/useRoomSession'
import { startSession } from './session/session'
import type { RoomSummary } from './types'

export function App() {
  useRoomSession()
  const [activeRoomId, setActiveRoomId] = useState('malam-minggu')
  const [currentInviteUrl, setCurrentInviteUrl] = useState<string>('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Modals state
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false)
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false)
  const [deepLinkRoomId, setDeepLinkRoomId] = useState<string | null>(null)

  // Mobile/tablet drawer state (only used below xl breakpoint)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)

  // Parse Cognito ID token from URL hash if redirected back from Hosted UI
  useEffect(() => {
    if (window.location.hash.includes('id_token=')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const idToken = hashParams.get('id_token')
      if (idToken) {
        sessionStorage.setItem('cognito_id_token', idToken)
        window.history.replaceState(null, '', window.location.pathname)
        setTimeout(() => {
          setToastMessage('Berhasil login sebagai Host!')
          setTimeout(() => setToastMessage(null), 3000)
        }, 0)
      }
    }

    // Check for deep-link /r/:roomId in pathname
    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9_-]+)/)
    if (pathMatch && pathMatch[1]) {
      const targetId = pathMatch[1]
      setTimeout(() => {
        setDeepLinkRoomId(targetId)
        setIsJoinRoomOpen(true)
      }, 0)
    }
  }, [])

  const handleInvite = () => {
    const inviteUrl =
      currentInviteUrl ||
      `${window.location.origin}/r/${activeRoomId === 'malam-minggu' ? '8J3GuXNOz0at' : activeRoomId}`
    navigator.clipboard.writeText(inviteUrl)
    setToastMessage('Link undangan tersalin ke clipboard!')
    setTimeout(() => setToastMessage(null), 2500)
  }

  const handleOpenCreateRoom = () => {
    setIsCreateRoomOpen(true)
  }

  const handleRoomCreated = (room: RoomSummary, inviteUrl: string) => {
    setActiveRoomId(room.roomId)
    setCurrentInviteUrl(inviteUrl)
    void startSession({
      roomId: room.roomId,
      displayName: room.hostDisplayName,
      mockRole: 'host',
    })
    navigator.clipboard.writeText(inviteUrl)
    setToastMessage(`Ruang "${room.mediaTitle}" dibuat! Link tersalin ke clipboard.`)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleJoinRoom = (roomId: string, displayName: string) => {
    setActiveRoomId(roomId)
    setCurrentInviteUrl(`${window.location.origin}/r/${roomId}`)
    void startSession({
      roomId,
      displayName,
    })
    setToastMessage('Bergabung ke ruang nonton!')
    setTimeout(() => setToastMessage(null), 2500)
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

  // Close drawers on Escape key
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
    <div className="flex h-full w-full bg-[#0c0d11] text-gray-100 overflow-hidden font-sans">
      {/* ===== Left Sidebar — always visible on xl+, drawer below xl ===== */}
      <div className="hidden xl:flex">
        <LeftSidebar
          activeRoomId={activeRoomId}
          onSelectRoom={(id) => setActiveRoomId(id)}
          onCreateRoom={handleOpenCreateRoom}
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
              onSelectRoom={(id) => {
                setActiveRoomId(id)
                closeLeftSidebar()
              }}
              onCreateRoom={() => {
                handleOpenCreateRoom()
                closeLeftSidebar()
              }}
              onClose={closeLeftSidebar}
            />
          </div>
        </div>
      )}

      {/* ===== Center Main Theater Screen (flex-1) ===== */}
      <CenterTheater
        onInvite={handleInvite}
        onToggleLeftSidebar={toggleLeftSidebar}
        onToggleRightSidebar={toggleRightSidebar}
        isRightSidebarOpen={isRightSidebarOpen}
      />

      {/* ===== Right Sidebar — always visible on xl+, drawer below xl ===== */}
      <div className="hidden xl:flex">
        <RightSidebar />
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
            <RightSidebar onClose={closeRightSidebar} />
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
