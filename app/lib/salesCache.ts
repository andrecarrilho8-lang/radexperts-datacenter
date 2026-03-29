/**
 * Shared in-memory cache for ALL Hotmart Sales.
 * Persists across requests in the same Node.js process (Vercel serverless warm instance).
 * Both /api/cursos and /api/cursos/[courseName] share this cache — fetched ONCE, reused by all.
 */
import { fetchHotmartSales } from './hotmartApi';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

type SalesCache = {
  items: any[];
  fetchedAt: number;
  promise: Promise<any[]> | null; // in-flight dedupe
};

// Module-level singleton (shared across requests in the same process)
const STATE: SalesCache = {
  items:     [],
  fetchedAt: 0,
  promise:   null,
};

export async function getCachedAllSales(): Promise<any[]> {
  const now = Date.now();

  // Cache hit
  if (STATE.items.length > 0 && now - STATE.fetchedAt < CACHE_TTL_MS) {
    return STATE.items;
  }

  // In-flight: another request is already fetching — wait for it
  if (STATE.promise) {
    return STATE.promise;
  }

  // Cache miss — start fetching
  STATE.promise = (async () => {
    try {
      const since = new Date('2023-01-01').toISOString();
      const end   = new Date().toISOString();
      // Big chunks (60 days) + high concurrency for speed
      const items = await fetchHotmartSales(since, end, 60 * 24 * 60 * 60 * 1000, 10);
      STATE.items     = items;
      STATE.fetchedAt = Date.now();
      return items;
    } finally {
      STATE.promise = null;
    }
  })();

  return STATE.promise;
}

/** Force cache invalidation (call from a webhook or admin route if needed) */
export function invalidateSalesCache() {
  STATE.items     = [];
  STATE.fetchedAt = 0;
  STATE.promise   = null;
}
