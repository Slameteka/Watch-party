import { beforeEach, describe, expect, it } from 'vitest'
import type { MediaItem, PlaybackState } from '../types'
import { usePlaybackStore } from './usePlaybackStore'

const media: MediaItem = {
  mediaId: 'big-buck-bunny',
  title: 'Big Buck Bunny',
  durationSec: 596,
  posterUrl: 'https://example.com/poster.jpg',
  playbackUrl: 'https://example.com/master.m3u8',
  license: 'CC BY 3.0',
  attribution: 'Blender Foundation',
}

const state = (version: number, positionSec = 0): PlaybackState => ({
  roomId: 'MockRoom0001',
  mediaId: 'big-buck-bunny',
  status: 'paused',
  positionSec,
  playbackRate: 1,
  updatedAtServerMs: 1_000,
  version,
})

describe('usePlaybackStore', () => {
  beforeEach(() => usePlaybackStore.getState().reset())

  it('applies the first state', () => {
    expect(usePlaybackStore.getState().applyPlaybackState(state(1))).toBe(true)
    expect(usePlaybackStore.getState().state?.version).toBe(1)
  })

  it('ignores the same or an older version', () => {
    const store = usePlaybackStore.getState()
    store.applyPlaybackState(state(5, 50))
    expect(store.applyPlaybackState(state(5, 99))).toBe(false)
    expect(store.applyPlaybackState(state(4, 99))).toBe(false)
    expect(usePlaybackStore.getState().state?.positionSec).toBe(50)
  })

  it('applies a newer version', () => {
    const store = usePlaybackStore.getState()
    store.applyPlaybackState(state(5))
    expect(store.applyPlaybackState(state(6, 12))).toBe(true)
    expect(usePlaybackStore.getState().state?.positionSec).toBe(12)
  })

  it('a snapshot replaces the state even with a lower version', () => {
    const store = usePlaybackStore.getState()
    store.applyPlaybackState(state(9))
    store.applySnapshot(media, state(2, 7))
    expect(usePlaybackStore.getState().state?.version).toBe(2)
    expect(usePlaybackStore.getState().media?.mediaId).toBe('big-buck-bunny')
  })
})
