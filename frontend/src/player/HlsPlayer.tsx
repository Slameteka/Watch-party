import Hls from 'hls.js'
import { useEffect, useRef } from 'react'

/** Local player status. Same values as the `player.status` WebSocket message. */
export type PlayerStatus = 'buffering' | 'ready'

type Props = {
  /** URL of the HLS playlist (master.m3u8). */
  src: string
  /** Called when the player starts or stops waiting for data. */
  onStatusChange?: (status: PlayerStatus) => void
  /** Called when playback cannot continue (fatal error). */
  onError?: (message: string) => void
}

/**
 * Plays an HLS stream in a <video> element.
 *
 * - Chrome, Firefox, Edge: use hls.js (Media Source Extensions).
 * - Safari: plays HLS natively, no hls.js needed.
 *
 * This component only plays video. Sync logic (follow room state) is added
 * later, on top of the <video> element.
 */
export function HlsPlayer({ src, onStatusChange, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Keep the latest callbacks without restarting the stream when they change.
  const statusRef = useRef(onStatusChange)
  const errorRef = useRef(onError)
  useEffect(() => {
    statusRef.current = onStatusChange
    errorRef.current = onError
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          errorRef.current?.(`${data.type}: ${data.details}`)
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else {
      errorRef.current?.('This browser cannot play HLS.')
    }

    const onWaiting = () => statusRef.current?.('buffering')
    const onPlayable = () => statusRef.current?.('ready')
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('canplay', onPlayable)
    video.addEventListener('playing', onPlayable)

    return () => {
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('canplay', onPlayable)
      video.removeEventListener('playing', onPlayable)
      hls?.destroy()
    }
  }, [src])

  return <video ref={videoRef} controls playsInline style={{ width: '100%', background: '#000' }} />
}
