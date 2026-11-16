// Core sync logic for the FE-Player role.
// Pure functions only (no DOM, no WebSocket), so they are easy to test.
// Source of truth: docs/architecture.md §3.2, §6.2, §6.3, §6.4, §6.5.

/** Playback state stored on the server (docs/contracts/ws-messages.md §4.1). */
export type PlaybackState = {
  roomId: string
  mediaId: string
  status: 'playing' | 'paused'
  /** Position (seconds) at `updatedAtServerMs`. */
  positionSec: number
  /** Room speed. v1 is always 1.0. */
  playbackRate: number
  /** Server time (epoch ms) when the state last changed. */
  updatedAtServerMs: number
  /** Increases by 1 on every change. Used for optimistic concurrency. */
  version: number
}

// Thresholds from docs/architecture.md §3.2. Do not add new magic numbers here.
export const DRIFT_IGNORE_MS = 250
export const DRIFT_RESET_MS = 100
export const DRIFT_HARD_SEEK_MS = 1000
export const RATE_CATCH_UP = 1.05
export const RATE_SLOW_DOWN = 0.95
export const RATE_NORMAL = 1.0

/**
 * Where the video should be right now (architecture.md §6.2).
 *
 * serverNowMs = nowMs + clockOffsetMs
 * paused  -> positionSec
 * playing -> positionSec + (serverNowMs - updatedAtServerMs) / 1000 * playbackRate
 *
 * If `durationSec` is given, the result never goes past the end of the movie.
 */
export function expectedPositionSec(
  state: PlaybackState,
  nowMs: number,
  clockOffsetMs: number,
  durationSec?: number,
): number {
  let position = state.positionSec

  if (state.status === 'playing') {
    const serverNowMs = nowMs + clockOffsetMs
    const elapsedSec = (serverNowMs - state.updatedAtServerMs) / 1000
    position = state.positionSec + elapsedSec * state.playbackRate
  }

  if (durationSec !== undefined && position > durationSec) {
    return durationSec
  }
  // A tiny negative value can appear if the clock offset is slightly off.
  return Math.max(0, position)
}

/**
 * driftMs = (actual - expected) * 1000 (architecture.md §6.4).
 * Positive = video is ahead. Negative = video is behind.
 */
export function computeDriftMs(
  actualPositionSec: number,
  expectedPositionSec: number,
): number {
  return (actualPositionSec - expectedPositionSec) * 1000
}

/** What the player must do after measuring the drift. */
export type DriftAction =
  | { kind: 'none' }
  | { kind: 'rate'; rate: number }
  | { kind: 'resetRate' }
  | { kind: 'seek' }

/**
 * Decide how to correct the drift (architecture.md §6.4).
 *
 * |drift| < 250 ms        -> do nothing
 * 250 ms .. 1 s           -> playbackRate 1.05 (behind) or 0.95 (ahead)
 * |drift| > 1 s           -> hard seek
 * back to 1.0 only when |drift| < 100 ms (so the rate does not flip-flop)
 *
 * @param isCorrecting true when the player is already running at a corrected rate
 */
export function driftAction(driftMs: number, isCorrecting: boolean): DriftAction {
  const abs = Math.abs(driftMs)

  if (abs > DRIFT_HARD_SEEK_MS) {
    return { kind: 'seek' }
  }

  const rate = driftMs < 0 ? RATE_CATCH_UP : RATE_SLOW_DOWN

  if (abs >= DRIFT_IGNORE_MS) {
    return { kind: 'rate', rate }
  }

  if (isCorrecting) {
    // Between 100 and 250 ms: keep correcting. Below 100 ms: stop.
    return abs >= DRIFT_RESET_MS ? { kind: 'rate', rate } : { kind: 'resetRate' }
  }

  return { kind: 'none' }
}

/** One clock.ping round trip (architecture.md §6.3). */
export type ClockSample = {
  clientSendMs: number
  serverTimeMs: number
  clientRecvMs: number
}

/**
 * Estimate how far the client clock is from the server clock (NTP style).
 *
 * rttMs    = clientRecvMs - clientSendMs
 * offsetMs = serverTimeMs - (clientSendMs + rttMs / 2)
 *
 * From several samples, use the one with the smallest RTT (most accurate).
 * Returns null if there are no samples.
 */
export function estimateClockOffset(
  samples: ClockSample[],
): { offsetMs: number; rttMs: number } | null {
  let best: { offsetMs: number; rttMs: number } | null = null

  for (const s of samples) {
    const rttMs = s.clientRecvMs - s.clientSendMs
    const offsetMs = s.serverTimeMs - (s.clientSendMs + rttMs / 2)
    if (best === null || rttMs < best.rttMs) {
      best = { offsetMs, rttMs }
    }
  }
  return best
}

/**
 * Ignore `playback.state` that is old or out of order (architecture.md §6.5).
 * Apply only when the incoming version is higher than the one already applied.
 */
export function isNewerVersion(appliedVersion: number, incomingVersion: number): boolean {
  return incomingVersion > appliedVersion
}
