import React, { useState } from 'react'
import { Camera, CameraOff, Mic, MicOff, Smile } from 'lucide-react'
import { useLiveKitStore } from '../state/useLiveKitStore'

interface MediaControlsProps {
  onToggleReactionPicker?: () => void
}

export const MediaControls: React.FC<MediaControlsProps> = ({ onToggleReactionPicker }) => {
  const { isConnected, isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useLiveKitStore()
  const [busy, setBusy] = useState(false)

  const handleCamera = async () => {
    if (busy) return
    setBusy(true)
    try {
      await toggleCamera()
    } finally {
      setBusy(false)
    }
  }

  const handleMic = async () => {
    if (busy) return
    setBusy(true)
    try {
      await toggleMicrophone()
    } finally {
      setBusy(false)
    }
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
