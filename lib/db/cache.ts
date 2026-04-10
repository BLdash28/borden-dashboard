/**
 * Simple in-process cache for API routes.
 * Persists across requests within the same Vercel function instance (warm).
 * TTL default: 60 seconds.
 */

interface CacheEntry {
  data: unknown
  expiresAt: number
}

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

/** Wrap a data-fetching function with in-process + HTTP cache. */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 60_000
): Promise<{ data: T; cached: boolean }> {
  const cached = getCached<T>(key)
  if (cached !== null) return { data: cached, cached: true }
  const data = await fn()
  setCached(key, data, ttlMs)
  return { data, cached: false }
}

/** Cache-Control header value for API responses (private browser cache). */
export function cacheHeaders(ttlSec = 60) {
  return {
    'Cache-Control': `private, max-age=${ttlSec}, stale-while-revalidate=${ttlSec * 2}`,
  }
}
