// Reconnect delay (docs/contracts/ws-messages.md §5.2): 1, 2, 4, 8, 16, then 30 s, jitter ±20%.

const BASE_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000]
const JITTER = 0.2

/**
 * Delay before reconnect attempt number `attempt` (0 = first retry).
 * `random` returns a number in [0, 1); it is a parameter so tests are deterministic.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 0), BASE_DELAYS_MS.length - 1)
  const jitterFactor = 1 + (random() * 2 - 1) * JITTER
  return Math.round(BASE_DELAYS_MS[index] * jitterFactor)
}
