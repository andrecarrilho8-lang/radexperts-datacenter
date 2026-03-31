/**
 * In-memory store for Hotmart webhook purchase events (v2.0.0).
 * Persists across requests within the same Node.js process instance.
 *
 * UTM Field Mapping (Hotmart webhook v2):
 *   purchase.origin.src  → utm_campaign (or raw src identifier)
 *   purchase.origin.sck  → utm_medium   (checkout source)
 *   purchase.origin.xcod → utm_content  (custom code / ad identifier)
 *
 * If src contains a full querystring (e.g. "utm_campaign=NeuroNews&utm_source=facebook")
 * it is parsed and each utm_* is extracted individually.
 */

export type WebhookSale = {
  transaction: string;
  event: string;
  productName: string;
  productId: number | string;
  buyerEmail: string;
  buyerName: string;
  amount: number;       // purchase.full_price.value (buyer's currency)
  amountBrl: number;   // cleared BRL amount (best effort)
  currency: string;
  approvedDateMs: number; // Unix ms
  orderDate: string;

  // Raw Hotmart origin fields
  src: string;
  sck: string;
  xcod: string;

  // Parsed / normalised UTM fields
  utmSource: string;    // utm_source or placement
  utmMedium: string;    // utm_medium or adset name
  utmCampaign: string;  // utm_campaign or campaign name
  utmContent: string;   // utm_content or ad name
  utmTerm: string;      // utm_term or ad id
};

/** Module-level singleton — shared across requests in the same process */
const STORE = new Map<string, WebhookSale>();

export function storeWebhookSale(sale: WebhookSale): void {
  STORE.set(sale.transaction, sale);
}

export function getWebhookSales(): WebhookSale[] {
  return Array.from(STORE.values());
}

export function getWebhookSale(transaction: string): WebhookSale | undefined {
  return STORE.get(transaction);
}

export function getWebhookSalesCount(): number {
  return STORE.size;
}

export function clearWebhookStore(): void {
  STORE.clear();
}

/**
 * Parse Hotmart's purchase.origin object into structured UTM fields.
 *
 * Handles three cases:
 *  1. src contains a full querystring  → "utm_campaign=X&utm_source=Y"
 *  2. src is a plain identifier        → treated as utm_campaign
 *  3. fields are empty                 → returns empty strings
 */
export function parseHotmartOrigin(origin: any): {
  src: string; sck: string; xcod: string;
  utmSource: string; utmMedium: string; utmCampaign: string;
  utmContent: string; utmTerm: string;
} {
  const src  = (origin?.src  || '').trim();
  const sck  = (origin?.sck  || '').trim();
  const xcod = (origin?.xcod || '').trim();

  let utmSource   = '';
  let utmMedium   = '';
  let utmCampaign = '';
  let utmContent  = '';
  let utmTerm     = '';

  // Try to parse src as a query string (some setups encode all UTMs in src)
  if (src.includes('utm_') || src.includes('&') || src.includes('=')) {
    try {
      const qs = src.startsWith('?') ? src.slice(1) : src;
      const p = new URLSearchParams(decodeURIComponent(qs));
      utmSource   = p.get('utm_source')   || '';
      utmMedium   = p.get('utm_medium')   || '';
      utmCampaign = p.get('utm_campaign') || '';
      utmContent  = p.get('utm_content')  || '';
      utmTerm     = p.get('utm_term')     || '';
    } catch {
      // fall through to plain treatment
    }
  }

  // If no UTMs parsed, use raw fields as campaign/adset/ad indicators
  if (!utmCampaign) utmCampaign = src;
  if (!utmMedium)   utmMedium   = sck;
  if (!utmContent)  utmContent  = xcod;

  // Also check sck for UTM data
  if (sck.includes('utm_')) {
    try {
      const p = new URLSearchParams(decodeURIComponent(sck));
      if (!utmMedium)   utmMedium   = p.get('utm_medium')   || sck;
      if (!utmCampaign) utmCampaign = p.get('utm_campaign') || utmCampaign;
    } catch {}
  }

  return { src, sck, xcod, utmSource, utmMedium, utmCampaign, utmContent, utmTerm };
}
