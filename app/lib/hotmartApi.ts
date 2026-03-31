import https from 'https';
import { getCache, setCache } from './metaApi';

export function isOfficialProduct(product: { id: number, name: string }) {
  const name = (product.name || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const officialBrands = [
    'EXPERT', 'NEUROEXPERT', 'BODYEXPERT', 'CEP EXPERT', 'WEXPERT', 'CEP HIGHLIGHTS',
    'SKELETAL EXPERT', 'NEUROPASS', 'RADIOPASS', 'NEURONEWS', 'RADEXPERTS', 'POSGRADO'
  ];
  if (officialBrands.some(k => name.includes(k))) return true;

  const officialKeywords = [
    'NEURORRADIOLOGIA', 'NEURORADIOLOGIA', 'RADIOLOGIA', 'ALZHEIMER', 'NEUROFTALMOLOGIA',
    'PELVE FEMININA', 'CABEZA Y CUELLO', 'CABECA E PESCOCO', 'MEDICINA INTERNA',
    'ANA FONSECA', '100 CASOS', 'NEURORRADIO'
  ];
  if (officialKeywords.some(k => name.includes(k))) return true;

  return false;
}

// ── Helpers https ───────────────────────────────────────────────────────────
function httpsRequest(
  method: 'GET' | 'POST',
  hostname: string,
  path: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Auth ────────────────────────────────────────────────────────────────────
const HOTMART_TOKEN_CACHE_KEY = 'hotmart_token';
const HOTMART_AUTH_HOST = 'api-sec-vlc.hotmart.com';
const HOTMART_API_HOST  = 'developers.hotmart.com';

export async function getHotmartToken() {
  const cached = getCache(HOTMART_TOKEN_CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) return cached.access_token;

  const clientId     = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  const basicToken   = process.env.HOTMART_BASIC_TOKEN;
  if (!clientId || !clientSecret || !basicToken) throw new Error('Credenciais Hotmart ausentes');

  const authHeader = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;
  const path = `/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;

  const result = await httpsRequest('POST', HOTMART_AUTH_HOST, path, { 'Authorization': authHeader });

  let data: any;
  try { data = JSON.parse(result.body); } catch { throw new Error('Resposta inválida do auth Hotmart'); }

  if (data.access_token) {
    setCache(HOTMART_TOKEN_CACHE_KEY, { ...data, expires_at: Date.now() + (data.expires_in * 1000) - 60000 });
    return data.access_token as string;
  }
  throw new Error('Falha no Token Hotmart');
}

// ── Subscriptions ────────────────────────────────────────────────────────────
// Returns: Map<productName, Set<subscriberEmail>> for ACTIVE subscriptions only.
// Paginates automatically through all results.
export async function fetchActiveSubscriptionsByProduct(): Promise<Map<string, Set<string>>> {
  const CACHE_KEY = 'hotmart_active_subs_v1';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour

  const cached = getCache(CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) return cached.data;

  const token = await getHotmartToken();
  const productMap = new Map<string, Set<string>>();

  let pageToken = '';
  do {
    const qs = `/payments/api/v1/subscriptions?status=ACTIVE&max_results=500${pageToken ? `&page_token=${pageToken}` : ''}`;
    const resp = await httpsRequest('GET', HOTMART_API_HOST, qs, { Authorization: `Bearer ${token}` });
    if (resp.status !== 200) break;

    let data: any;
    try { data = JSON.parse(resp.body); } catch { break; }

    const items: any[] = data.items || [];
    for (const item of items) {
      const productName  = item.product?.name  || 'Desconhecido';
      const subscriberEmail = (item.subscriber?.email || '').toLowerCase();
      if (!subscriberEmail) continue;
      if (!productMap.has(productName)) productMap.set(productName, new Set());
      productMap.get(productName)!.add(subscriberEmail);
    }

    pageToken = data.page_info?.next_page_token || '';
  } while (pageToken);

  setCache(CACHE_KEY, { data: productMap, expires_at: Date.now() + CACHE_TTL });
  return productMap;
}

// ── Fetch Sales ─────────────────────────────────────────────────────────────
export async function fetchHotmartSales(startDate: string, endDate: string, customChunkSize?: number, concurrency = 4) {
  const token = await getHotmartToken();
  const startMs = new Date(startDate).getTime();
  const endMs   = new Date(endDate).getTime();
  const CHUNK_SIZE = customChunkSize || (15 * 24 * 60 * 60 * 1000);

  const chunks: { start: number; end: number }[] = [];
  let cur = startMs;
  while (cur < endMs) {
    chunks.push({ start: cur, end: Math.min(cur + CHUNK_SIZE, endMs) });
    cur += CHUNK_SIZE + 1;
  }

  let allItems: any[] = [];

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch   = chunks.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (chunk) => {
      let chunkItems: any[] = [];
      let pageToken = '';
      try {
        do {
          const path = `/payments/api/v1/sales/history?start_date=${chunk.start}&end_date=${chunk.end}${pageToken ? `&page_token=${pageToken}` : ''}`;
          const resp = await httpsRequest('GET', HOTMART_API_HOST, path, { 'Authorization': `Bearer ${token}` });
          if (resp.status !== 200) break;
          const data = JSON.parse(resp.body);
          if (data.items) chunkItems = [...chunkItems, ...data.items.filter((it: any) => isOfficialProduct(it.product))];
          pageToken = data.page_info?.next_page_token || '';
        } while (pageToken && chunkItems.length < 1000);
      } catch (e) { console.error('Hotmart chunk error:', e); }
      return chunkItems;
    }));
    results.forEach(r => { allItems = [...allItems, ...r]; });
  }

  return allItems;
}

// ── Commissions ──────────────────────────────────────────────────────────────
// Confirmado via debug HP3970815852:
//   source:"PRODUCER"   commission.value = R$2161.50 = "Você recebeu" no painel Hotmart
//   source:"COPRODUCER" commission.value = R$2161.50 = comissão do co-produtor (Guinel Hernandez Filho)
export type CommissionData = {
  producerNet: number;
  coProducers: { name: string; amount: number }[];
};

export async function fetchHotmartCommissions(
  startDate: string,
  endDate: string,
  concurrency = 4
): Promise<Map<string, CommissionData>> {
  const token   = await getHotmartToken();
  const startMs = new Date(startDate).getTime();
  const endMs   = new Date(endDate).getTime();
  const CHUNK   = 15 * 24 * 60 * 60 * 1000;

  const chunks: { start: number; end: number }[] = [];
  let cur = startMs;
  while (cur < endMs) {
    chunks.push({ start: cur, end: Math.min(cur + CHUNK, endMs) });
    cur += CHUNK + 1;
  }

  const commMap = new Map<string, CommissionData>();

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    await Promise.all(batch.map(async (chunk) => {
      let pageToken = '';
      try {
        do {
          const path = `/payments/api/v1/sales/commissions?start_date=${chunk.start}&end_date=${chunk.end}${pageToken ? `&page_token=${pageToken}` : ''}`;
          const resp = await httpsRequest('GET', HOTMART_API_HOST, path, { 'Authorization': `Bearer ${token}` });
          if (resp.status !== 200) break;
          const data = JSON.parse(resp.body);
          const items: any[] = data.items || [];
          items.forEach((item: any) => {
            const tx = item.transaction;
            if (!tx) return;
            const comms: any[] = item.commissions || [];
            const producerEntry  = comms.find((c: any) => c.source === 'PRODUCER');
            const coProducers    = comms
              .filter((c: any) => c.source === 'COPRODUCER')
              .map((c: any) => ({ name: c.user?.name || 'Co-produtor', amount: c.commission?.value ?? 0 }));
            if (producerEntry?.commission?.value != null) {
              commMap.set(tx, { producerNet: producerEntry.commission.value, coProducers });
            }
          });
          pageToken = data.page_info?.next_page_token || '';
        } while (pageToken);
      } catch (e) { console.error('Hotmart commissions chunk error:', e); }
    }));
  }

  return commMap;
}

// ── Top Customers ───────────────────────────────────────────────────────────
export async function fetchHotmartTopCustomers() {
  const CACHE_KEY = 'hotmart_top_customers_v7';
  const cached = getCache(CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) return cached.data;

  const now         = new Date();
  const historyDate = new Date('2023-01-01');
  const sales = await fetchHotmartSales(historyDate.toISOString(), now.toISOString(), 60 * 24 * 60 * 60 * 1000, 8);

  const customerMap = new Map<string, any>();
  sales.forEach(s => {
    const purchase = s.purchase || {};
    const buyer    = s.buyer   || {};
    const product  = s.product || {};
    if (!['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(purchase.status)) return;

    const email = buyer.email?.toLowerCase();
    if (!email) return;

    if (!customerMap.has(email)) {
      customerMap.set(email, {
        name: buyer.name || 'Sem Nome', email, phone: buyer.phone || 'Sem Telefone',
        products: new Set<string>(), totalRevenue: 0, purchaseCount: 0, paymentMethods: new Set<string>()
      });
    }
    const customer = customerMap.get(email);
    const price = purchase.price?.actual_value || purchase.price?.value || 0;
    customer.totalRevenue += price;
    customer.purchaseCount += 1;
    if (product.name) customer.products.add(product.name);
    customer.paymentMethods.add(purchase.payment?.type || 'OUTRO');
  });

  const final = Array.from(customerMap.values())
    .map(c => {
      const pms = Array.from(c.paymentMethods);
      let score: 'TOP' | 'BOM' | 'OK' = 'OK';
      if (c.totalRevenue >= 8000 || (c.totalRevenue >= 5000 && c.purchaseCount >= 3)) score = 'TOP';
      else if (c.totalRevenue >= 2000 || c.purchaseCount >= 2) score = 'BOM';
      if (score === 'OK' && c.totalRevenue > 1500) score = 'BOM';
      return { ...c, products: Array.from(c.products), paymentMethods: pms, score };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .filter(c => c.purchaseCount > 1 || c.totalRevenue > 1000)
    .slice(0, 100);

  setCache(CACHE_KEY, { data: final, expires_at: Date.now() + (60 * 60 * 1000) });
  return final;
}

// ── Monthly Parser ──────────────────────────────────────────────────────────
export function parseHotmartMonthly(sales: any[]) {
  const monthly: Record<number, { spend: number; revenue: number }> = {};
  for (let i = 1; i <= 12; i++) monthly[i] = { spend: 0, revenue: 0 };
  const uniqueTxIds = new Set<string>();
  sales.forEach(s => {
    const purchase = s.purchase || {};
    if (['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(purchase.status) && !uniqueTxIds.has(purchase.transaction)) {
      uniqueTxIds.add(purchase.transaction);
      const date  = new Date(purchase.approved_date || purchase.order_date);
      const month = date.getMonth() + 1;
      if (monthly[month]) monthly[month].revenue += (purchase.price?.actual_value || purchase.price?.value || 0);
    }
  });
  return monthly;
}

// ── Historical Attribution Fetch ─────────────────────────────────────────────
/**
 * FLOW 2 — HISTORICAL SALES ATTRIBUTION
 *
 * Fetches approved Hotmart sales for a period and extracts whatever tracking/UTM
 * data is available via the History API.
 *
 * Hotmart History API exposes: purchase.tracking.{source_sck, source, xcod, ...}
 * These fields are Hotmart's native tracking codes and may map to UTMs when the
 * user configures their links with utm_* params.
 *
 * EXPLICIT STATEMENT (per business rules):
 *   The Hotmart public Sales History API does NOT expose full utm_* parameters.
 *   It exposes a `purchase.tracking` object with partial tracking data only.
 *   If tracking is absent → attribution_status = "missing".
 *
 * Returns structured sales with source = "api" for reconciliation.
 */
export async function fetchSalesForAttribution(
  startDate: string,
  endDate:   string,
): Promise<import('./webhookStore').WebhookSale[]> {
  const CACHE_KEY = `hotmart_attr_v1|${startDate}|${endDate}`;
  const CACHE_TTL = 30 * 60 * 1000; // 30 min

  const cached = getCache(CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) return cached.data;

  const APPROVED = new Set(['APPROVED', 'COMPLETE', 'CONFIRMED', 'PRODUCER_CONFIRMED']);
  const rawSales = await fetchHotmartSales(startDate, endDate);

  // Lazy-import to avoid circular dep
  const { calcAttributionStatus } = await import('./webhookStore');

  function parseTrackingField(val: string | null | undefined): Record<string, string | null> {
    if (!val) return {};
    if (val.includes('utm_')) {
      try {
        const p = new URLSearchParams(decodeURIComponent(val));
        return {
          utm_source:   p.get('utm_source')   || null,
          utm_campaign: p.get('utm_campaign') || null,
          utm_medium:   p.get('utm_medium')   || null,
          utm_content:  p.get('utm_content')  || null,
          utm_term:     p.get('utm_term')     || null,
        };
      } catch { return {}; }
    }
    return {};
  }

  const result: import('./webhookStore').WebhookSale[] = [];

  for (const item of rawSales) {
    const purchase = item.purchase || {};
    if (!APPROVED.has(purchase.status || '')) continue;

    const product = item.product || {};
    const buyer   = item.buyer   || {};

    // Hotmart History API tracking fields
    const tracking = purchase.tracking || {};
    const raw_src  = (tracking.source      || tracking.src   || '').toString().trim();
    const raw_sck  = (tracking.source_sck  || tracking.sck   || '').toString().trim();
    const raw_xcod = (tracking.xcod        || tracking.source_xcod || '').toString().trim();

    // Try to parse UTMs from tracking fields
    const srcParsed  = parseTrackingField(raw_src);
    const sckParsed  = parseTrackingField(raw_sck);

    let utm_source   = srcParsed.utm_source   || sckParsed.utm_source   || null;
    let utm_campaign = srcParsed.utm_campaign || sckParsed.utm_campaign || (!raw_src.includes('=')  && raw_src  ? raw_src  : null) || null;
    let utm_medium   = srcParsed.utm_medium   || sckParsed.utm_medium   || (!raw_sck.includes('=') && raw_sck  ? raw_sck  : null) || null;
    let utm_content  = srcParsed.utm_content  || sckParsed.utm_content  || (!raw_xcod.includes('=') && raw_xcod ? raw_xcod : null) || null;
    let utm_term     = srcParsed.utm_term     || sckParsed.utm_term     || null;

    const attribution_status = calcAttributionStatus(utm_source, utm_campaign, utm_medium, utm_content, utm_term);

    const amount   = purchase.price?.actual_value || purchase.price?.value || 0;
    const currency = purchase.price?.currency_code || 'BRL';
    const saleId   = purchase.transaction || `API_${Date.now()}`;

    console.log(
      `[HistAttr] ${saleId} | src="${raw_src}" sck="${raw_sck}" xcod="${raw_xcod}"` +
      ` | status=${attribution_status}` +
      ` | utm_campaign="${utm_campaign}" utm_medium="${utm_medium}"`,
    );

    result.push({
      sale_id:      saleId,
      event:        'PURCHASE_APPROVED',
      receivedAt:   Date.now(),
      source:       'api',
      product_id:   product.id   ?? 0,
      product_name: product.name || '',
      buyer_email:  buyer.email  || '',
      buyer_name:   buyer.name   || '',
      amount,
      amountBrl:    currency === 'BRL' ? amount : 0,
      currency,
      approvedDateMs: purchase.approved_date || purchase.order_date || Date.now(),
      orderDate:    new Date(purchase.order_date || purchase.approved_date || Date.now()).toISOString(),
      raw_src, raw_sck, raw_xcod,
      utm_source,   utm_campaign, utm_medium, utm_content, utm_term,
      attribution_status,
      origem:               utm_source,
      campanha:             utm_campaign,
      conjunto_de_anuncios: utm_medium,
      anuncio:              utm_content,
      raw_payload: item,
    });
  }

  setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });
  return result;
}

