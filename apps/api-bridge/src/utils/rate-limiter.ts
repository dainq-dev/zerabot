/**
 * Token Bucket rate limiter — O(1) per consume() call.
 *
 * Tokens refill continuously over time.
 * `capacity`    — max burst size.
 * `refillPerSec` — steady-state rate (tokens added per second).
 *
 * Usage:
 *   const bucket = new TokenBucket(10, 0.5)  // 10 burst, 1 req/2s
 *   if (!bucket.consume()) throw new Error("Rate limited")
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  /** Returns true if the request is allowed, false if rate-limited. */
  consume(n = 1): boolean {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1_000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec)
    this.lastRefill = now

    if (this.tokens < n) return false
    this.tokens -= n
    return true
  }

  /** Current available tokens (read-only diagnostic). */
  get available(): number {
    return Math.floor(this.tokens)
  }
}
