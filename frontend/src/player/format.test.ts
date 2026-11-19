import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75)).toBe('1:15')
    expect(formatTime(596)).toBe('9:56')
  })

  it('adds hours when needed', () => {
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('drops the fraction and survives bad input', () => {
    expect(formatTime(59.9)).toBe('0:59')
    expect(formatTime(-4)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
  })
})
