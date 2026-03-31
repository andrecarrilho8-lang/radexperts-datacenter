/**
 * In-memory store for Hotmart webhook purchase events (v2.0.0).
 * Persists across requests within the same Node.js process instance.
 *
 * ATTRIBUTION MAPPING (per business rules):
 *   utm_source   → origem
 *   utm_campaign → campanha
 *   utm_medium   → conjunto_de_anuncios
 *   utm_content  → anuncio
 *   utm_term     → extra ad identifier / ad metadata reference
 *
 * UTMs are extracted from the webhook payload via deep search —
 * we do NOT infer them from product names or campaign names.
 */

export type AttributionStatus = 'complete' | 'partial' | 'missing';

export type WebhookSale = {
  // Identifiers
  sale_id:      string;   // transaction ID
  event:        string;   // PURCHASE_APPROVED, PURCHASE_COMPLETE, etc.
  receivedAt:   number;   // unix ms when we received it

  // Product
  product_id:   string | number;
  product_name: string;

  // Buyer
  buyer_email:  string;
  buyer_name:   string;

  // Financial
  amount:        number;  // full price paid by buyer
  amountBrl:     number;  // best-effort BRL amount
  currency:      string;

  // Timestamps
  approvedDateMs: number;
  orderDate:      string;

  // Raw Hotmart origin fields (preserved as-is)
  raw_src:  string;
  raw_sck:  string;
  raw_xcod: string;

  // Normalised UTM attribution fields
  utm_source:   string | null;
  utm_campaign: string | null;
  utm_medium:   string | null;
  utm_content:  string | null;
  utm_term:     string | null;

  // Attribution quality
  attribution_status: AttributionStatus;

  // Derived dashboard fields
  origem:                 string | null; // = utm_source
  campanha:               string | null; // = utm_campaign
  conjunto_de_anuncios:   string | null; // = utm_medium
  anuncio:                string | null; // = utm_content

  // Raw payload (for auditability & reconciliation)
  raw_payload: any;
};

/** Module-level singleton – shared across requests in the same process */
const STORE = new Map<string, WebhookSale>();

export function storeWebhookSale(sale: WebhookSale): void {
  STORE.set(sale.sale_id, sale);
}

export function getWebhookSales(): WebhookSale[] {
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
}

/* ── Attribution status calculator ────────────────────────────────────────── */
export function calcAttributionStatus(
  utm_source: string | null,
  utm_campaign: string | null,
  utm_medium: string | null,
  utm_content: string | null,
  utm_term: string | null,
): AttributionStatus {
  const found = [utm_source, utm_campaign, utm_medium, utm_content, utm_term]
    .filter(v => v !== null && v !== '').length;
  if (found === 5) return 'complete';
  if (found > 0)  return 'partial';
  return 'missing';
}

/* ── Recursive UTM extractor ───────────────────────────────────────────────── */
/**
 * Searches the entire webhook payload recursively for utm_* fields.
 * Also inspects purchase.origin.{src, sck, xcod} as Hotmart's native tracking params.
 *
 * Per business rules:
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

  // Store Hotmart native fields as-is
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

  /* 2. Parse Hotmart origin fields as query strings if they contain utm_ params */
  function parseQS(s: string): Record<string, string> {
    if (!s || !s.includes('utm_')) return {};
    try {
      const qs = s.startsWith('?') ? s.slice(1) : s;
      const p = new URLSearchParams(decodeURIComponent(qs));
      const result: Record<string, string> = {};
      p.forEach((v, k) => { result[k.toLowerCase()] = v; });
      return result;
    } catch {
      return {};
    }
  }

  const srcParsed  = parseQS(raw_src);
  const sckParsed  = parseQS(raw_sck);
  const xcodParsed = parseQS(raw_xcod);

  // Fill in from parsed query strings (only if not already found via deep search)
  utm_source   = utm_source   || srcParsed.utm_source   || sckParsed.utm_source   || null;
  utm_campaign = utm_campaign || srcParsed.utm_campaign || sckParsed.utm_campaign || null;
  utm_medium   = utm_medium   || srcParsed.utm_medium   || sckParsed.utm_medium   || null;
  utm_content  = utm_content  || srcParsed.utm_content  || sckParsed.utm_content  || xcodParsed.utm_content || null;
  utm_term     = utm_term     || srcParsed.utm_term     || sckParsed.utm_term     || xcodParsed.utm_term    || null;

  /* 3. Last resort: use raw Hotmart src/sck/xcod as campaign/medium/content
     (only if they do NOT contain query string syntax and no UTMs found above)
     Per rules: do NOT infer. We use these as raw tracking codes, not campaign names.
     These are stored as raw_src/raw_sck/raw_xcod for auditability.
     We do NOT auto-assign them to utm_campaign unless they were explicitly in src field. */
  if (!utm_campaign && raw_src && !raw_src.includes('=')) utm_campaign = raw_src;
  if (!utm_medium   && raw_sck && !raw_sck.includes('='))  utm_medium   = raw_sck;
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
