import React from 'react'

export const LogoTv: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {/* Retro TV with V-antennas */}
    <path d="M8 3l4 4 4-4" />
    <rect x="2" y="7" width="20" height="14" rx="4" />
    <circle cx="17" cy="11" r="1" fill="currentColor" />
    <circle cx="17" cy="15" r="1" fill="currentColor" />
    <line x1="5" y1="10" x2="13" y2="10" />
    <line x1="5" y1="14" x2="13" y2="14" />
  </svg>
)

export const PopcornIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    {/* Popcorn bucket with fluffy popcorn */}
    <path d="M6 10L8 21H16L18 10H6Z" fill="#e11d48" stroke="#be123c" strokeWidth="1.2" />
    <path d="M10 10L10.5 21H13.5L14 10H10Z" fill="#ffffff" />
    <path d="M8 10L9 21H10.5L10 10H8Z" fill="#e11d48" />
    <path d="M14 10L13.5 21H15L16 10H14Z" fill="#e11d48" />
    {/* Popcorn puffs */}
    <circle cx="8" cy="8" r="2.5" fill="#fef08a" stroke="#f59e0b" strokeWidth="0.8" />
    <circle cx="12" cy="7" r="3" fill="#fef08a" stroke="#f59e0b" strokeWidth="0.8" />
    <circle cx="16" cy="8" r="2.5" fill="#fef08a" stroke="#f59e0b" strokeWidth="0.8" />
    <circle cx="10" cy="9.5" r="2" fill="#fef9c3" />
    <circle cx="14" cy="9.5" r="2" fill="#fef9c3" />
  </svg>
)

export const MoonIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="#eab308" className={className}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

export const GamepadIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="6" y1="12" x2="10" y2="12" />
    <line x1="8" y1="10" x2="8" y2="14" />
    <line x1="15" y1="13" x2="15.01" y2="13" />
    <line x1="18" y1="11" x2="18.01" y2="11" />
    <rect x="2" y="6" width="20" height="12" rx="6" />
  </svg>
)

export const RadioBroadcastIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
  </svg>
)

export const SoundWaveIcon: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <div className={`flex items-center gap-0.5 ${className}`}>
    <span className="w-0.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
    <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse delay-75" />
    <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-pulse delay-150" />
    <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse delay-100" />
  </div>
)

export const SubtitlesIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <line x1="7" y1="15" x2="11" y2="15" />
    <line x1="13" y1="15" x2="17" y2="15" />
    <line x1="7" y1="11" x2="17" y2="11" />
  </svg>
)

export const PipIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="3" />
    <rect x="13" y="11" width="7" height="6" rx="1.5" fill="currentColor" fillOpacity="0.2" />
  </svg>
)

export const FullscreenIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
)
