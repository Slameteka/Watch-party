import { useState } from 'react'
import { LeftSidebar } from './components/LeftSidebar'
import { CenterTheater } from './components/CenterTheater'
import { RightSidebar } from './components/RightSidebar'

export function App() {
  const [activeRoomId, setActiveRoomId] = useState('malam-minggu')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  return (
    <div className="flex h-screen w-screen bg-[#0c0d11] text-gray-100 overflow-hidden font-sans">
      {/* 1. Left Navigation Sidebar with Icon Dock (width 280px) */}
      <LeftSidebar
        activeRoomId={activeRoomId}
        onSelectRoom={(id) => setActiveRoomId(id)}
        onCreateRoom={handleCreateRoom}
      />

      {/* 2. Center Main Theater Screen (flex-1) */}
      <CenterTheater onInvite={handleInvite} />

      {/* 3. Right Sidebar: Chat & Social Presence (width 330px) */}
      <RightSidebar />

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
