import { useCallback, useEffect, useState } from 'react'
import { LeftSidebar } from './components/LeftSidebar'
import { CenterTheater } from './components/CenterTheater'
import { RightSidebar } from './components/RightSidebar'

export function App() {
  const [activeRoomId, setActiveRoomId] = useState('malam-minggu')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Mobile/tablet drawer state (only used below xl breakpoint)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)

  const handleInvite = () => {
    const inviteUrl = 'https://watchparty.chescloud.my.id/r/8J3GuXNOz0at'
    navigator.clipboard.writeText(inviteUrl)
    setToastMessage('Link undangan tersalin ke clipboard!')
    setTimeout(() => setToastMessage(null), 2500)
  }

  const handleCreateRoom = () => {
    setToastMessage('Fitur buat ruang baru (Cognito Host)')
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
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-full w-full bg-[#0c0d11] text-gray-100 overflow-hidden font-sans">
      {/* ===== Left Sidebar — always visible on xl+, drawer below xl ===== */}
      {/* Desktop: static in flow */}
      <div className="hidden xl:flex">
        <LeftSidebar
          activeRoomId={activeRoomId}
          onSelectRoom={(id) => setActiveRoomId(id)}
          onCreateRoom={handleCreateRoom}
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
                handleCreateRoom()
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
      {/* Desktop: static in flow */}
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
