import Hls from 'hls.js'
import { useEffect, useRef, type RefObject } from 'react'

/** Local player status. Same values as the `player.status` WebSocket message. */
export type PlayerStatus = 'buffering' | 'ready'

type Props = {
  /** URL of the HLS playlist (master.m3u8). */
  src: string
  /** Called when the player starts or stops waiting for data. */
  onStatusChange?: (status: PlayerStatus) => void
  /** Called when playback cannot continue (fatal error). */
  onError?: (message: string) => void
  /** Give access to the <video> element (the sync code needs it). */
  videoRef?: RefObject<HTMLVideoElement | null>
  /** Show the browser's own controls. Turn off when the room controls playback. Default true. */
  controls?: boolean
  /**
   * Send cookies with segment requests. Needed for CloudFront signed cookies.
   * Needs CORS Allow-Credentials on the server, so keep it off for public test streams.
   */
  withCredentials?: boolean
  /** Replaces the default full-width style. */
  className?: string
}

/**
 * Plays an HLS stream in a <video> element.
 *
 * - Chrome, Firefox, Edge: use hls.js (Media Source Extensions).
 * - Safari: plays HLS natively, no hls.js needed.
 *
 * This component only plays video. The sync logic (follow room state) lives in
 * useVideoSync and works on the <video> element through `videoRef`.
 */
export function HlsPlayer({
  src,
  onStatusChange,
  onError,
  videoRef: externalRef,
  controls = true,
  withCredentials = false,
  className,
}: Props) {
  const ownRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalRef ?? ownRef

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
      hls = new Hls(
        withCredentials
          ? {
              xhrSetup: (xhr) => {
                xhr.withCredentials = true
              },
              fetchSetup: (context, init) => new Request(context.url, { ...init, credentials: 'include' }),
            }
          : {},
      )
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
  }, [src, withCredentials, videoRef])

  return (
    <video
      ref={videoRef}
      controls={controls}
      playsInline
      className={className}
      style={className ? undefined : { width: '100%', background: '#000' }}
    />
  )
}
