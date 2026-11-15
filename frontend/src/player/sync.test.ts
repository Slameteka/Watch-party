import { describe, expect, it } from 'vitest'
import {
  computeDriftMs,
  driftAction,
  estimateClockOffset,
  expectedPositionSec,
  isNewerVersion,
  type PlaybackState,
} from './sync'

const baseState: PlaybackState = {
  roomId: 'aZ3kP9qL2mXw',
  mediaId: 'sintel',
  status: 'playing',
  positionSec: 100,
  playbackRate: 1.0,
  updatedAtServerMs: 1_000_000,
  version: 8,
}

describe('expectedPositionSec', () => {
  it('returns positionSec when paused, no matter how much time passed', () => {
    const state = { ...baseState, status: 'paused' as const, positionSec: 120 }
    expect(expectedPositionSec(state, 9_999_999, 0)).toBe(120)
  })

  it('adds elapsed time when playing', () => {
    // 5 seconds after the state was written -> 100 + 5 = 105
    expect(expectedPositionSec(baseState, 1_005_000, 0)).toBe(105)
  })

  it('uses the clock offset to convert client time to server time', () => {
    // Client clock is 500 ms behind the server (offset = +500).
    // Client now = 1_004_500 -> server now = 1_005_000 -> 105
    expect(expectedPositionSec(baseState, 1_004_500, 500)).toBe(105)
  })

  it('respects playbackRate', () => {
    const state = { ...baseState, playbackRate: 2 }
    // 5 s elapsed * 2 = 10 -> 110
    expect(expectedPositionSec(state, 1_005_000, 0)).toBe(110)
  })

  it('stops at the end of the movie', () => {
    // 800 s elapsed -> 100 + 800 = 900, which is past the 888 s duration.
    expect(expectedPositionSec(baseState, 1_800_000, 0, 888)).toBe(888)
  })

  it('never returns a negative position', () => {
    const state = { ...baseState, positionSec: 0 }
    // Client time slightly before the state was written (offset error).
    expect(expectedPositionSec(state, 999_900, 0)).toBe(0)
  })
})

describe('computeDriftMs', () => {
  it('is negative when the video is behind', () => {
    expect(computeDriftMs(118.5, 120)).toBeCloseTo(-1500)
  })

  it('is positive when the video is ahead', () => {
    expect(computeDriftMs(120.4, 120)).toBeCloseTo(400)
  })
})

describe('driftAction', () => {
  it('does nothing below 250 ms', () => {
    expect(driftAction(200, false)).toEqual({ kind: 'none' })
    expect(driftAction(-249, false)).toEqual({ kind: 'none' })
  })

  it('speeds up (1.05) when behind by 250 ms to 1 s', () => {
    expect(driftAction(-500, false)).toEqual({ kind: 'rate', rate: 1.05 })
    expect(driftAction(-250, false)).toEqual({ kind: 'rate', rate: 1.05 })
  })

  it('slows down (0.95) when ahead by 250 ms to 1 s', () => {
    expect(driftAction(500, false)).toEqual({ kind: 'rate', rate: 0.95 })
    expect(driftAction(1000, false)).toEqual({ kind: 'rate', rate: 0.95 })
  })

  it('seeks when the drift is more than 1 s', () => {
    expect(driftAction(1001, false)).toEqual({ kind: 'seek' })
    expect(driftAction(-1500, true)).toEqual({ kind: 'seek' })
  })

  it('keeps correcting between 100 and 250 ms once it started', () => {
    expect(driftAction(-150, true)).toEqual({ kind: 'rate', rate: 1.05 })
    expect(driftAction(150, true)).toEqual({ kind: 'rate', rate: 0.95 })
  })

  it('resets the rate below 100 ms when it was correcting', () => {
    expect(driftAction(-99, true)).toEqual({ kind: 'resetRate' })
    expect(driftAction(0, true)).toEqual({ kind: 'resetRate' })
  })
})

describe('estimateClockOffset', () => {
  it('returns null without samples', () => {
    expect(estimateClockOffset([])).toBeNull()
  })

  it('computes offset with the NTP formula', () => {
    // rtt = 1200 - 1000 = 200
    // offset = 1600 - (1000 + 200 / 2) = 500
    const result = estimateClockOffset([
      { clientSendMs: 1000, serverTimeMs: 1600, clientRecvMs: 1200 },
    ])
    expect(result).toEqual({ offsetMs: 500, rttMs: 200 })
  })

  it('picks the sample with the smallest RTT', () => {
    const result = estimateClockOffset([
      // slow sample: rtt 800, offset 2500 - (2000 + 400) = 100
      { clientSendMs: 2000, serverTimeMs: 2500, clientRecvMs: 2800 },
      // fast sample: rtt 200, offset 500
      { clientSendMs: 1000, serverTimeMs: 1600, clientRecvMs: 1200 },
    ])
    expect(result).toEqual({ offsetMs: 500, rttMs: 200 })
  })
})

describe('isNewerVersion', () => {
  it('accepts only a higher version', () => {
    expect(isNewerVersion(7, 8)).toBe(true)
    expect(isNewerVersion(8, 8)).toBe(false)
    expect(isNewerVersion(8, 7)).toBe(false)
  })
})
