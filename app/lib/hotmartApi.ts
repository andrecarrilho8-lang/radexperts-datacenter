import https from 'https';
import { getCache, setCache } from './metaApi';

// ── Whitelist produtos RadExperts ──────────────────────────────────────────
export function isOfficialProduct(product: { id: number, name: string }) {
  const name = (product.name || '').toUpperCase();

  const officialBrands = [
    'EXPERT', 'NEUROEXPERT', 'BODYEXPERT', 'CEP EXPERT', 'WEXPERT', 'CEP HIGHLIGHTS',
    'SKELETAL EXPERT', 'NEUROPASS', 'RADIOPASS', 'NEURONEWS', 'RADEXPERTS'
  ];
  if (officialBrands.some(k => name.includes(k))) return true;

  const officialKeywords = [
    'NEURORRADIOLOGIA', 'RADIOLOGIA', 'ALZHEIMER', 'NEUROFTALMOLOGIA',
    'PELVE FEMININA', 'CABEZA Y CUELLO', 'CABEÇA E PESCOÇO', 'MEDICINA INTERNA',
    'ANA FONSECA', '100 CASOS', 'NEURORRÁDIO'
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

// ── Fetch Sales ─────────────────────────────────────────────────────────────
export async function fetchHotmartSales(startDate: string, endDate: string, customChunkSize?: number, concurrency = 4) {
  const token = await getHotmartToken();
  const startMs = new Date(startDate).getTime();
  const endMs   = new Date(endDate).getTime();
  // Chunks de 15 dias para não exceder limites da API
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
    if (!['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED', 'ACTIVE'].includes(purchase.status)) return;

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
    if (['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED', 'ACTIVE'].includes(purchase.status) && !uniqueTxIds.has(purchase.transaction)) {
      uniqueTxIds.add(purchase.transaction);
      const date  = new Date(purchase.approved_date || purchase.order_date);
      const month = date.getMonth() + 1;
      if (monthly[month]) monthly[month].revenue += (purchase.price?.actual_value || purchase.price?.value || 0);
    }
  });
  return monthly;
}
