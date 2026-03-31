/**
 * Webhook Store — in-memory + /tmp file fallback.
 *
 * PERSISTENCE STRATEGY:
 *  1. `global.__hotmartWebhookSales` — survives module re-imports within the same Node.js process
 *  2. `/tmp/hotmart-webhook-sales.json` — survives across invocations of the same Lambda container
 *
 * NOTE: Data resets on new Vercel deploys or cold starts.
 */

import fs from 'fs';

const TMP_FILE = '/tmp/hotmart-webhook-sales.json';

declare global {
  var __hotmartWebhookSales: Map<string, WebhookSale> | undefined;
}

function getStore(): Map<string, WebhookSale> {
  if (!global.__hotmartWebhookSales) {
    global.__hotmartWebhookSales = new Map();
    // Try to restore from /tmp
    try {
      if (fs.existsSync(TMP_FILE)) {
        const raw = fs.readFileSync(TMP_FILE, 'utf-8');
        const arr: WebhookSale[] = JSON.parse(raw);
        arr.forEach(s => global.__hotmartWebhookSales!.set(s.sale_id, s));
      }
    } catch {}
  }
  return global.__hotmartWebhookSales;
}

function persist() {
  try {
    const arr = Array.from(getStore().values());
    fs.writeFileSync(TMP_FILE, JSON.stringify(arr));
  } catch {}
}

/* ── Types ──────────────────────────────────────────────────────────────── */
export type WebhookSale = {
  sale_id:      string;
  event:        string;
  receivedAt:   number;
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

/* ── Attribution status ─────────────────────────────────────────────────── */
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

  const raw_src  = origin.src  || '';
  const raw_sck  = origin.sck  || '';
  const raw_xcod = origin.xcod || '';

  if (raw_src.includes('utm_') || raw_src.includes('=')) {
    const parsed = parseQueryString(raw_src);
    if (parsed?.utm_campaign || parsed?.utm_source) {
      return { ...parsed, raw_src, raw_sck, raw_xcod };
    }
  }

  return {
    utm_source:   null,
    utm_campaign: raw_src  || null,
    utm_medium:   raw_sck  || null,
    utm_content:  raw_xcod || null,
    utm_term:     null,
    raw_src, raw_sck, raw_xcod,
  };
}

/* ── Store operations (sync) ────────────────────────────────────────────── */
export function storeWebhookSale(sale: WebhookSale): void {
  getStore().set(sale.sale_id, sale);
  persist();
}

export function storeHistoricalSales(sales: WebhookSale[]): void {
  const STORE = getStore();
  let changed = false;
  for (const sale of sales) {
    const existing = STORE.get(sale.sale_id);
    if (!existing) {
      STORE.set(sale.sale_id, sale);
      changed = true;
    } else if (existing.source === 'webhook') {
      continue;
    } else {
      const prev = [existing.utm_source, existing.utm_campaign, existing.utm_medium, existing.utm_content, existing.utm_term].filter(Boolean).length;
      const next = [sale.utm_source,     sale.utm_campaign,     sale.utm_medium,     sale.utm_content,     sale.utm_term    ].filter(Boolean).length;
      if (next > prev) { STORE.set(sale.sale_id, sale); changed = true; }
    }
  }
  if (changed) persist();
}

export function getWebhookSales(): WebhookSale[] {
  return Array.from(getStore().values());
}

export function clearWebhookStore(): void {
  getStore().clear();
  try { fs.unlinkSync(TMP_FILE); } catch {}
}

export function getWebhookSalesCount(): number {
  return getStore().size;
}
