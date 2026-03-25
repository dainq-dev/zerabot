/**
 * In-memory URL deduplication for crawl runs.
 *
 * Uses a Set<string> with normalised URL keys — O(1) check & insert.
 * Acts as a "Bloom filter lite": fast in-process dedup within a run or day.
 * The DB UNIQUE index on crawled_items.url is the safety net for cross-restart dedup.
 *
 * Reset daily via resetDedupCache() called from cron-scheduler.
 */

const seenUrls = new Set<string>()

/**
 * Normalise URL for stable comparison:
 * - Lowercase scheme + host + path
 * - Strip fragment (#)
 * - Sort query params (canonical order)
 * - Remove trailing slash
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ""
    u.searchParams.sort()
    return (u.origin + u.pathname + (u.search || ""))
      .toLowerCase()
      .replace(/\/$/, "")
  } catch {
    return url.toLowerCase().replace(/\/$/, "")
  }
}

/**
 * Returns true if the URL has already been seen this session.
 * Adds the URL to the seen set as a side-effect.
 */
export function isDuplicate(url: string): boolean {
  const key = normalizeUrl(url)
  if (seenUrls.has(key)) return true
  seenUrls.add(key)
  return false
}

/** Clear the dedup cache (call daily from cron). */
export function resetDedupCache(): void {
  seenUrls.clear()
}

export function dedupCacheSize(): number {
  return seenUrls.size
}
