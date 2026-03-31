/**
 * Persistent webhook store for Hotmart purchase events.
 *
 * PERSISTENCE STRATEGY (in order of reliability):
 *  1. `global.__hotmartWebhookSales` — survives module re-imports within the same
 *     Node.js process (works in dev, works on self-hosted, partially on Vercel).
 *  2. `/tmp/hotmart-webhook-sales.json` — survives across module re-imports within
 *     the SAME Vercel Lambda container lifetime (typically hours).
 *     Both the webhook endpoint and the dashboard API try to read this file.
 *
 * For full cross-instance persistence, add Vercel KV (Redis) in the future.
 *
 * ATTRIBUTION MAPPING (per business rules):
 *   utm_source   → origem
 *   utm_campaign → campanha
 *   utm_medium   → conjunto_de_anuncios
 *   utm_content  → anuncio
 *   utm_term     → extra ad identifier
 */

import fs   from 'fs';
import path from 'path';

const TMP_FILE = '/tmp/hotmart-webhook-sales.json';

export type AttributionStatus = 'complete' | 'partial' | 'missing';

export type WebhookSale = {
  sale_id:      string;
  event:        string;
  receivedAt:   number;
  product_id:   string | number;
  product_name: string;
  buyer_email:  string;
  buyer_name:   string;
  amount:       number;
  amountBrl:    number;
  currency:     string;
  approvedDateMs: number;
  orderDate:      string;
  raw_src:  string;
  raw_sck:  string;
  raw_xcod: string;
  utm_source:   string | null;
  utm_campaign: string | null;
  utm_medium:   string | null;
  utm_content:  string | null;
  utm_term:     string | null;
  attribution_status: AttributionStatus;
  origem:               string | null;
  campanha:             string | null;
  conjunto_de_anuncios: string | null;
  anuncio:              string | null;
  raw_payload: any;
};

/* ── Global store (shared across module imports in the same Node process) ── */
type GlobalWithStore = typeof globalThis & {
  __hotmartWebhookSales?: Map<string, WebhookSale>;
};
const g = global as GlobalWithStore;
if (!g.__hotmartWebhookSales) {
  g.__hotmartWebhookSales = new Map<string, WebhookSale>();
  // Populate from file on first load
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, 'utf8');
      const arr: WebhookSale[] = JSON.parse(raw);
      arr.forEach(s => g.__hotmartWebhookSales!.set(s.sale_id, s));
      console.log(`[webhookStore] Carregados ${arr.length} registros do arquivo /tmp`);
    }
  } catch (e) {
    console.warn('[webhookStore] Não foi possível carregar arquivo de persistência:', e);
  }
}

const STORE: Map<string, WebhookSale> = g.__hotmartWebhookSales!;

/* ── Write to /tmp for cross-import persistence ─────────────────────────── */
function persist(): void {
  try {
    const arr = Array.from(STORE.values())
      .map(s => ({ ...s, raw_payload: undefined })); // strip raw_payload to save space
    fs.writeFileSync(TMP_FILE, JSON.stringify(arr));
  } catch (e) {
    console.warn('[webhookStore] Não foi possível gravar arquivo de persistência:', e);
  }
}

/* ── Public API ─────────────────────────────────────────────────────────── */
export function storeWebhookSale(sale: WebhookSale): void {
  STORE.set(sale.sale_id, sale);
  persist();
}

export function getWebhookSales(): WebhookSale[] {
  // Also try to refresh from file in case we're in a different process instance
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, 'utf8');
      const arr: WebhookSale[] = JSON.parse(raw);
      // Merge: prefer in-memory values (newer) but add any from file not in memory
      arr.forEach(s => {
        if (!STORE.has(s.sale_id)) STORE.set(s.sale_id, s);
      });
    }
  } catch {}
  return Array.from(STORE.values());
}

export function getWebhookSale(saleId: string): WebhookSale | undefined {
  return STORE.get(saleId);
}

export function getWebhookSalesCount(): number {
  return STORE.size;
}

export function clearWebhookStore(): void {
  STORE.clear();
  try { fs.unlinkSync(TMP_FILE); } catch {}
}

/* ── Attribution helpers ────────────────────────────────────────────────── */
export function calcAttributionStatus(
  utm_source:   string | null,
  utm_campaign: string | null,
  utm_medium:   string | null,
  utm_content:  string | null,
  utm_term:     string | null,
): AttributionStatus {
  const found = [utm_source, utm_campaign, utm_medium, utm_content, utm_term]
    .filter(v => v !== null && v !== '').length;
  if (found === 5) return 'complete';
  if (found > 0)  return 'partial';
  return 'missing';
}

/* ── Recursive UTM extractor ────────────────────────────────────────────── */
/**
 * Searches the ENTIRE webhook payload recursively for utm_* fields.
 * Also inspects purchase.origin.{src, sck, xcod} as Hotmart's native tracking params.
 *
 * Rules:
 *  - Trust webhook payload values exactly as received
 *  - Never transform, rename, or reinterpret source fields before storing
 *  - Return null (not empty string) for missing fields
 */
export function extractUTMsFromPayload(payload: any): {
  raw_src: string; raw_sck: string; raw_xcod: string;
  utm_source:   string | null;
  utm_campaign: string | null;
  utm_medium:   string | null;
  utm_content:  string | null;
  utm_term:     string | null;
} {
  let utm_source:   string | null = null;
  let utm_campaign: string | null = null;
  let utm_medium:   string | null = null;
  let utm_content:  string | null = null;
  let utm_term:     string | null = null;

  const origin = payload?.data?.purchase?.origin || {};
  const raw_src  = (origin.src  || '').trim();
  const raw_sck  = (origin.sck  || '').trim();
  const raw_xcod = (origin.xcod || '').trim();

  /* 1. Deep search the entire payload for utm_* fields (highest priority) */
  function deepSearch(obj: any, depth = 0): void {
    if (depth > 8 || !obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) {
        const k = key.toLowerCase();
        if (k === 'utm_source'   && !utm_source)   utm_source   = val.trim();
        if (k === 'utm_campaign' && !utm_campaign)  utm_campaign = val.trim();
        if (k === 'utm_medium'   && !utm_medium)    utm_medium   = val.trim();
        if (k === 'utm_content'  && !utm_content)   utm_content  = val.trim();
        if (k === 'utm_term'     && !utm_term)       utm_term     = val.trim();
      }
      if (val && typeof val === 'object') deepSearch(val, depth + 1);
    }
  }
  deepSearch(payload);

  /* 2. Try to parse native Hotmart fields as query strings */
  function parseQS(s: string): Record<string, string> {
    if (!s || !s.includes('utm_')) return {};
    try {
      const qs = s.startsWith('?') ? s.slice(1) : s;
      const p = new URLSearchParams(decodeURIComponent(qs));
      const out: Record<string, string> = {};
      p.forEach((v, k) => { out[k.toLowerCase()] = v; });
      return out;
    } catch { return {}; }
  }

  const srcQ  = parseQS(raw_src);
  const sckQ  = parseQS(raw_sck);
  const xcodQ = parseQS(raw_xcod);

  utm_source   = utm_source   || srcQ.utm_source   || sckQ.utm_source   || null;
  utm_campaign = utm_campaign || srcQ.utm_campaign || sckQ.utm_campaign || null;
  utm_medium   = utm_medium   || srcQ.utm_medium   || sckQ.utm_medium   || null;
  utm_content  = utm_content  || srcQ.utm_content  || sckQ.utm_content  || xcodQ.utm_content || null;
  utm_term     = utm_term     || srcQ.utm_term     || sckQ.utm_term     || xcodQ.utm_term    || null;

  /* 3. Hotmart native fields as raw campaign/medium/content identifiers
     (only when no UTM structure found and field is a plain string, not a query string) */
  if (!utm_campaign && raw_src  && !raw_src.includes('='))  utm_campaign = raw_src;
  if (!utm_medium   && raw_sck  && !raw_sck.includes('='))  utm_medium   = raw_sck;
  if (!utm_content  && raw_xcod && !raw_xcod.includes('=')) utm_content  = raw_xcod;

  return {
    raw_src, raw_sck, raw_xcod,
    utm_source:   utm_source   || null,
    utm_campaign: utm_campaign || null,
    utm_medium:   utm_medium   || null,
    utm_content:  utm_content  || null,
    utm_term:     utm_term     || null,
  };
}
