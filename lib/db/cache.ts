/**
 * Two-layer cache for API routes:
 * 1. unstable_cache (Next.js / Vercel Data Cache) — persists across instances & cold starts
 * 2. In-process Map — instant hit within same warm instance
 *
 * Use withCache() for all API data fetching.
 */
import { unstable_cache } from 'next/cache'

// ── Layer 2: in-process fallback ────────────────────────────────────────────
interface CacheEntry { data: unknown; expiresAt: number }
const store = new Map<string, CacheEntry>()

export function getCached<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { store.delete(key); return null }
  return entry.data as T
}

export function setCached(key: string, data: unknown, ttlMs = 60_000) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// ── Layer 1: Vercel Data Cache via unstable_cache ────────────────────────────
/**
 * Wraps a data-fetching function with two-layer caching.
 * - First call per period: fetches from DB and stores in both layers
 * - Warm instance: returns from in-process Map (zero latency)
 * - Cold start / new instance: returns from Vercel Data Cache (< 50ms)
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 60_000
): Promise<{ data: T; cached: boolean }> {
  // Layer 2 hit: in-process
  const hit = getCached<T>(key)
  if (hit !== null) return { data: hit, cached: true }

  const ttlSec = Math.round(ttlMs / 1000)

  // Layer 1: Vercel Data Cache
  const cached = unstable_cache(
    fn,
    [key],
    { revalidate: ttlSec, tags: [key.split(':')[0]] }
  )

  const data = await cached()
  setCached(key, data, ttlMs) // populate in-process for subsequent requests
  return { data, cached: false }
}

/** Cache-Control header value for API responses (private browser cache). */
export function cacheHeaders(ttlSec = 60) {
  return {
    'Cache-Control': `private, max-age=${ttlSec}, stale-while-revalidate=${ttlSec * 2}`,
  }
}
