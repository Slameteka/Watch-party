import { describe, expect, it } from 'vitest'
import { backoffDelayMs } from './backoff'

describe('backoffDelayMs', () => {
  it('follows 1, 2, 4, 8, 16, 30 s without jitter', () => {
    const mid = () => 0.5
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, mid))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000,
    ])
  })

  it('stays at 30 s after the sixth attempt', () => {
    expect(backoffDelayMs(20, () => 0.5)).toBe(30000)
  })

  it('applies at most ±20% jitter', () => {
    expect(backoffDelayMs(2, () => 0)).toBe(3200)
    expect(backoffDelayMs(2, () => 0.999999)).toBe(4800)
  })

  it('treats a negative attempt as the first one', () => {
    expect(backoffDelayMs(-3, () => 0.5)).toBe(1000)
  })
})
