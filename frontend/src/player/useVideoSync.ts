import { useEffect, useRef, useState, type RefObject } from 'react'
import { reportPlayerStatus } from '../session/session'
import { computeDriftMs, driftAction, expectedPositionSec, RATE_NORMAL } from './sync'
import { usePlaybackStore } from './usePlaybackStore'

const DRIFT_CHECK_MS = 1000
// A paused video is put at the exact position when it is off by more than this.
const PAUSED_SEEK_TOLERANCE_SEC = 0.25

/**
 * Make the <video> follow the room state (architecture.md §6.4):
 * apply every new playback state, and correct drift once per second while playing.
 *
 * Returns `needsGesture`: the browser blocked autoplay, so the user must click once.
 * Call `resume()` from that click.
 */
export function useVideoSync(videoRef: RefObject<HTMLVideoElement | null>) {
  const state = usePlaybackStore((s) => s.state)
  // The <video> only exists once the room data (and so the movie URL) has arrived.
  const mediaUrl = usePlaybackStore((s) => s.media?.playbackUrl)
  const [metadataLoaded, setMetadataLoaded] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const correctingRef = useRef(false)
  // True while we seek on purpose, so 'seeking' is reported as player status "syncing".
  const seekingByUsRef = useRef(false)

  function expected(): number {
    const { state: current, clockOffsetMs, media } = usePlaybackStore.getState()
    if (!current) return 0
    return expectedPositionSec(current, Date.now(), clockOffsetMs, media?.durationSec)
  }

  function seekTo(video: HTMLVideoElement, sec: number) {
    seekingByUsRef.current = true
    reportPlayerStatus('syncing')
    video.currentTime = sec
  }

  function play(video: HTMLVideoElement) {
    video.play().then(
      () => setNeedsGesture(false),
      (error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') setNeedsGesture(true)
      },
    )
  }

  // Listen to the video: metadata, and seek progress for the status report.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setMetadataLoaded(false)
    const onMetadata = () => setMetadataLoaded(true)
    const onSeeked = () => {
      if (seekingByUsRef.current) {
        seekingByUsRef.current = false
        reportPlayerStatus('ready')
      }
    }
    if (video.readyState >= 1) onMetadata()
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('seeked', onSeeked)
    return () => {
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('seeked', onSeeked)
    }
  }, [videoRef, mediaUrl])

  // Apply a new room state (first snapshot, play, pause, seek, reconnect snapshot).
  useEffect(() => {
    const video = videoRef.current
    if (!video || !state || !metadataLoaded) return

    correctingRef.current = false
    video.playbackRate = RATE_NORMAL

    if (state.status === 'paused') {
      video.pause()
      if (Math.abs(video.currentTime - state.positionSec) > PAUSED_SEEK_TOLERANCE_SEC) {
        seekTo(video, state.positionSec)
      }
      return
    }

    const target = expected()
    const drift = computeDriftMs(video.currentTime, target)
    if (driftAction(drift, false).kind === 'seek') seekTo(video, target)
    play(video)
  }, [state, metadataLoaded, videoRef])

  // Drift correction while playing: ignore < 250 ms, change speed up to 1 s, seek above.
  useEffect(() => {
    if (state?.status !== 'playing' || !metadataLoaded) return
    const id = setInterval(() => {
      const video = videoRef.current
      const current = usePlaybackStore.getState().state
      if (!video || !current || current.status !== 'playing') return
      // Buffering or seeking: the position is not reliable now. Do not "correct" it.
      if (video.seeking || video.readyState < 3) return
      if (video.paused) {
        if (!needsGesture) play(video)
        return
      }

      const action = driftAction(computeDriftMs(video.currentTime, expected()), correctingRef.current)
      if (action.kind === 'rate') {
        video.playbackRate = action.rate
        correctingRef.current = true
      } else if (action.kind === 'resetRate') {
        video.playbackRate = current.playbackRate
        correctingRef.current = false
      } else if (action.kind === 'seek') {
        video.playbackRate = current.playbackRate
        correctingRef.current = false
        seekTo(video, expected())
      }
    }, DRIFT_CHECK_MS)
    return () => clearInterval(id)
  }, [state?.status, metadataLoaded, needsGesture, videoRef])

  /** Call from a click when `needsGesture` is true. */
  function resume() {
    const video = videoRef.current
    if (!video) return
    const current = usePlaybackStore.getState().state
    if (current?.status === 'playing') {
      seekTo(video, expected())
      play(video)
    } else {
      setNeedsGesture(false)
    }
  }

  return { needsGesture, resume }
}
