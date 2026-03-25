/**
 * Generic LRU Cache backed by Map insertion-order.
 *
 * get / set / delete — all O(1) amortised.
 * Eviction: removes the least-recently-used (oldest) entry when capacity is exceeded.
 * TTL: optional per-entry TTL in ms; expired entries are evicted lazily on get().
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt: number | null }>()

  constructor(
    private readonly maxSize: number,
    private readonly defaultTtlMs?: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined

    // Lazy TTL eviction
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return undefined
    }

    // Move to end (most recently used) — O(1)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: K, value: V, ttlMs?: number): void {
    const expiresAt =
      ttlMs !== undefined      ? Date.now() + ttlMs :
      this.defaultTtlMs !== undefined ? Date.now() + this.defaultTtlMs :
      null

    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxSize) {
      // Evict LRU (first entry in Map) — O(1)
      this.map.delete(this.map.keys().next().value!)
    }
    this.map.set(key, { value, expiresAt })
  }

  has(key: K): boolean {
    const entry = this.map.get(key)
    if (!entry) return false
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return false
    }
    return true
  }

  delete(key: K): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
