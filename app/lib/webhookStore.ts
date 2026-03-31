/**
 * Webhook Store — Upstash Redis (KV) backed persistent storage.
 *
 * ARCHITECTURE:
 *  - PRIMARY: Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN)
 *    → Persists across Vercel deploys, cold starts, and scaling events
 *  - FALLBACK: In-memory Map (for local dev without Redis, or Redis unavailable)
 *
 * All webhook sales are stored as a Redis Hash:
 *   HSET hotmart:sales <sale_id> <json>
 *
 * Functions are async to support the Redis client.
 */

import { Redis } from '@upstash/redis';

const REDIS_KEY = 'hotmart:sales:v1';

/* ── Redis client (lazy init) ───────────────────────────────────────────── */
let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

/* ── Types ──────────────────────────────────────────────────────────────── */
export type WebhookSale = {
  sale_id:      string;
  event:        string;
  receivedAt:   number;
  /** Where this record originated */
  source:       'webhook' | 'api' | 'report';
  product_id:   string | number;
  product_name: string;
  buyer_email:  string;
  buyer_name:   string;
  amount:       number;
  amountBrl:    number;
  currency:     string;
  approvedDateMs: number;
  orderDate:    string;
  raw_src:      string;
  raw_sck:      string;
  raw_xcod:     string;
  utm_source:   string | null;
  utm_campaign: string | null;
  utm_medium:   string | null;
  utm_content:  string | null;
  utm_term:     string | null;
  attribution_status: 'complete' | 'partial' | 'missing';
  origem:               string | null;
  campanha:             string | null;
  conjunto_de_anuncios: string | null;
  anuncio:              string | null;
  raw_payload?: any;
};

/* ── Attribution status calculator ─────────────────────────────────────── */
export function calcAttributionStatus(
  utm_source:   string | null,
  utm_campaign: string | null,
  utm_medium:   string | null,
  utm_content:  string | null,
  utm_term:     string | null,
): 'complete' | 'partial' | 'missing' {
  const present = [utm_source, utm_campaign, utm_medium, utm_content, utm_term].filter(Boolean).length;
  if (present === 5) return 'complete';
  if (present > 0)  return 'partial';
  return 'missing';
}

/* ── UTM extractor ──────────────────────────────────────────────────────── */
export function extractUTMsFromPayload(payload: any): {
  utm_source: string | null; utm_campaign: string | null;
  utm_medium:  string | null; utm_content:  string | null;
  utm_term:    string | null; raw_src: string; raw_sck: string; raw_xcod: string;
} {
  const data     = payload?.data || payload || {};
  const purchase = data.purchase || {};
  const origin   = purchase.origin || {};

  function parseQueryString(qs: string) {
    try {
      const p = new URLSearchParams(decodeURIComponent(qs));
      return {
        utm_source:   p.get('utm_source')   || null,
        utm_campaign: p.get('utm_campaign') || null,
        utm_medium:   p.get('utm_medium')   || null,
        utm_content:  p.get('utm_content')  || null,
        utm_term:     p.get('utm_term')     || null,
      };
    } catch { return null; }
  }

  function deepSearch(obj: any, key: string): string | null {
    if (!obj || typeof obj !== 'object') return null;
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === key && typeof v === 'string' && v) return v;
      const found = deepSearch(v, key);
      if (found) return found;
    }
    return null;
  }

  // Direct UTMs (top level or in purchase)
  const directSource   = purchase.utm_source   || deepSearch(data, 'utm_source')   || null;
  const directCampaign = purchase.utm_campaign || deepSearch(data, 'utm_campaign') || null;
  const directMedium   = purchase.utm_medium   || deepSearch(data, 'utm_medium')   || null;
  const directContent  = purchase.utm_content  || deepSearch(data, 'utm_content')  || null;
  const directTerm     = purchase.utm_term     || deepSearch(data, 'utm_term')     || null;

  if (directCampaign || directSource || directMedium) {
    return {
      utm_source: directSource, utm_campaign: directCampaign,
      utm_medium: directMedium, utm_content:  directContent, utm_term: directTerm,
      raw_src: origin.src || '', raw_sck: origin.sck || '', raw_xcod: origin.xcod || '',
    };
  }

  // Parse from origin.src (may contain full query string)
  const raw_src  = origin.src  || '';
  const raw_sck  = origin.sck  || '';
  const raw_xcod = origin.xcod || '';

  if (raw_src.includes('utm_') || raw_src.includes('=')) {
    const parsed = parseQueryString(raw_src);
    if (parsed?.utm_campaign || parsed?.utm_source) {
      return { ...parsed, raw_src, raw_sck, raw_xcod };
    }
  }

  // Fallback: treat raw fields as UTM values
  return {
    utm_source:   null,
    utm_campaign: raw_src  || null,
    utm_medium:   raw_sck  || null,
    utm_content:  raw_xcod || null,
    utm_term:     null,
    raw_src, raw_sck, raw_xcod,
  };
}

/* ── Store operations ───────────────────────────────────────────────────── */

/**
 * Store a single webhook sale permanently in Redis (+ memory fallback).
 */
export async function storeWebhookSale(sale: WebhookSale): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      await r.hset(REDIS_KEY, { [sale.sale_id]: JSON.stringify(sale) });
    } catch (e: any) {
      console.error('[webhookStore] Redis write error:', e.message);
    }
  }
  // Always update in-memory too for fast reads in the same request
  _memStore.set(sale.sale_id, sale);
}

/**
 * Store multiple historical/report sales.
 * Webhook data always wins over report/api data for the same sale_id.
 */
export async function storeHistoricalSales(sales: WebhookSale[]): Promise<void> {
  if (sales.length === 0) return;
  const existing = await getWebhookSales();
  const existingMap = new Map(existing.map(s => [s.sale_id, s]));

  const toWrite: Record<string, string> = {};
  for (const sale of sales) {
    const prev = existingMap.get(sale.sale_id);
    if (!prev) {
      toWrite[sale.sale_id] = JSON.stringify(sale);
      _memStore.set(sale.sale_id, sale);
    } else if (prev.source === 'webhook') {
      continue; // webhook wins
    } else {
      const prevUtms = [prev.utm_source, prev.utm_campaign, prev.utm_medium, prev.utm_content, prev.utm_term].filter(Boolean).length;
      const newUtms  = [sale.utm_source, sale.utm_campaign, sale.utm_medium, sale.utm_content, sale.utm_term].filter(Boolean).length;
      if (newUtms > prevUtms) {
        toWrite[sale.sale_id] = JSON.stringify(sale);
        _memStore.set(sale.sale_id, sale);
      }
    }
  }

  if (Object.keys(toWrite).length > 0) {
    const r = getRedis();
    if (r) {
      try { await r.hset(REDIS_KEY, toWrite); } catch (e: any) {
        console.error('[webhookStore] Redis batch write error:', e.message);
      }
    }
  }
}

// In-memory fallback / cache
const _memStore = new Map<string, WebhookSale>();
let _memLoaded = false;

/**
 * Get all stored sales. Loads from Redis on first call, then uses memory cache.
 */
export async function getWebhookSales(): Promise<WebhookSale[]> {
  if (!_memLoaded) {
    const r = getRedis();
    if (r) {
      try {
        const all = await r.hgetall(REDIS_KEY);
        if (all) {
          for (const [id, val] of Object.entries(all)) {
            try {
              const sale: WebhookSale = typeof val === 'string' ? JSON.parse(val) : val as WebhookSale;
              _memStore.set(id, sale);
            } catch {}
          }
        }
        _memLoaded = true;
      } catch (e: any) {
        console.error('[webhookStore] Redis read error:', e.message);
      }
    }
  }
  return Array.from(_memStore.values());
}

/**
 * Clear all sales (used by test endpoint or admin).
 */
export async function clearWebhookStore(): Promise<void> {
  _memStore.clear();
  _memLoaded = false;
  const r = getRedis();
  if (r) {
    try { await r.del(REDIS_KEY); } catch {}
  }
}

/**
 * Get count of stored sales without loading all data.
 */
export async function getWebhookSalesCount(): Promise<number> {
  const r = getRedis();
  if (r) {
    try {
      const count = await r.hlen(REDIS_KEY);
      return count;
    } catch {}
  }
  return _memStore.size;
}
