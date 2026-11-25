import React, { useState } from 'react'
import { Camera, CameraOff, Mic, MicOff, Smile } from 'lucide-react'
import { useLiveKitStore } from '../state/useLiveKitStore'

interface MediaControlsProps {
  onToggleReactionPicker?: () => void
  variant?: 'floating' | 'inline'
}

export const MediaControls: React.FC<MediaControlsProps> = ({
  onToggleReactionPicker,
  variant = 'floating',
}) => {
  const { isConnected, isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useLiveKitStore()
  const [busy, setBusy] = useState(false)

  const handleCamera = async () => {
    if (busy || !isConnected) return
    setBusy(true)
    try {
      await toggleCamera()
    } finally {
      setBusy(false)
    }
  }

  const handleMic = async () => {
    if (busy || !isConnected) return
    setBusy(true)
    try {
      await toggleMicrophone()
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'inline') {
    const disabledTitle = 'Video chat belum tersambung'
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={handleMic}
          disabled={!isConnected || busy}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-all border ${
            !isConnected
              ? 'bg-[#151720] text-gray-500 border-[#252838] opacity-60 cursor-not-allowed'
              : isMicEnabled
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 cursor-pointer'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/30 cursor-pointer'
          }`}
          title={!isConnected ? disabledTitle : isMicEnabled ? 'Mute Mikrofon' : 'Nyalakan Mikrofon'}
        >
          {isMicEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isMicEnabled ? 'Mikrofon aktif' : 'Mikrofon mati'}</span>
          <span className="sm:hidden">{isMicEnabled ? 'Mic' : 'Mute'}</span>
        </button>

        <button
          onClick={handleCamera}
          disabled={!isConnected || busy}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-all border ${
            !isConnected
              ? 'bg-[#151720] text-gray-500 border-[#252838] opacity-60 cursor-not-allowed'
              : isCameraEnabled
                ? 'bg-purple-600 text-white border-purple-500 cursor-pointer'
                : 'bg-[#151720] text-gray-300 border-[#252838] hover:border-gray-600 cursor-pointer'
          }`}
          title={!isConnected ? disabledTitle : isCameraEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera'}
        >
          {isCameraEnabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isCameraEnabled ? 'Kamera aktif' : 'Kamera mati'}</span>
          <span className="sm:hidden">{isCameraEnabled ? 'Kamera' : 'Off'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-3 py-2 px-4 bg-gray-900/90 backdrop-blur-md rounded-2xl border border-gray-800 shadow-xl">
      {/* Mic toggle */}
      <button
        onClick={handleMic}
        disabled={!isConnected || busy}
        className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 cursor-pointer ${
          isMicEnabled
            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 shadow-lg'
            : 'bg-gray-800 hover:bg-gray-700 text-rose-400 border border-rose-500/30'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title={isMicEnabled ? 'Mute Mikrofon' : 'Nyalakan Mikrofon'}
      >
        {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {/* Camera toggle */}
      <button
        onClick={handleCamera}
        disabled={!isConnected || busy}
        className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 cursor-pointer ${
          isCameraEnabled
            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20 shadow-lg'
            : 'bg-gray-800 hover:bg-gray-700 text-rose-400 border border-rose-500/30'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title={isCameraEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera'}
      >
        {isCameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
      </button>

      {/* Reaction picker toggle */}
      {onToggleReactionPicker && (
        <button
          onClick={onToggleReactionPicker}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-gray-800 hover:bg-gray-700 text-amber-400 border border-amber-500/20 transition-all duration-200 cursor-pointer"
          title="Kirim Reaksi"
        >
          <Smile className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
