import { getCache, setCache } from './metaApi';

// Whitelist precisamente definida para os 119 produtos oficiais do ADVOGADO 10X
export function isOfficialProduct(product: { id: number, name: string }) {
  const name = (product.name || '').toUpperCase();
  const officialBrands = ['ADVOGADO 10X', 'ADV10X', 'A NOVA ADVOCACIA', '10X', 'ADVOGADO10X', 'IADVOGADO'];
  if (officialBrands.some(k => name.includes(k))) return true;

  const officialProducts = [
    'COCO BAMBU', 'HONORÁRIOS', 'PENSÃO ALIMENTÍCIA', 'DIREITO DE FAMÍLIA', 'SUCESSÕES', 
    'DIREITO POSSESSÓRIO', 'PLANEJAMENTO SUCESSÓRIO', 'VIOLÊNCIA DOMÉSTICA', 'GOOGLE ADS', 
    'MÁQUINA DE VENDAS', 'BRADING', 'MAESTRIA EM VENDAS', 'NEGÓCIOS', 'MAPEAMENTO',
    'PETIÇÃO INICIAL', 'ATUALIZAÇÕES CÍVEIS', 'PROCESSO CIVIL', 'BRANDING', 'VENDAS E INTELIGÊNCIA'
  ];
  if (officialProducts.some(k => name.includes(k))) return true;

  const personalBlacklist = [
    'KIT DE PEÇAS CRIMINAIS', 'DEFESA ESTRATÉGIA', 'INVENTÁRIOS 2.0',
    'PROCLUB', 'TONE ACADEMY', 'COPILOTO CRIMINALISTA', 'RISOTO', 'RECEITA'
  ];
  if (personalBlacklist.some(k => name.includes(k))) return false;

  const genericPatterns = ['IMERSÃO', 'DESAFIO', 'E-BOOK', 'MENTORIA', 'MASTERCLASS', 'WORKSHOP', 'PLANO DE AÇÃO'];
  if (genericPatterns.some(k => name.includes(k)) && (name.includes('ADV') || name.includes('10X') || name.includes('IA'))) return true;

  return false;
}

const HOTMART_TOKEN_CACHE_KEY = 'hotmart_token';
const HOTMART_AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API_BASE = 'https://developers.hotmart.com/payments/api/v1';

export async function getHotmartToken() {
  const cached = getCache(HOTMART_TOKEN_CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) return cached.access_token;

  const clientId = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  const basicToken = process.env.HOTMART_BASIC_TOKEN;

  if (!clientId || !clientSecret || !basicToken) throw new Error('Credenciais Hotmart ausentes');

  const authHeaderValue = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

  const resp = await fetch(`${HOTMART_AUTH_URL}?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeaderValue }
  });

  if (!resp.ok) throw new Error(`Erro Hotmart Auth: ${resp.status}`);

  const data = await resp.json();
  if (data.access_token) {
    setCache(HOTMART_TOKEN_CACHE_KEY, { ...data, expires_at: Date.now() + (data.expires_in * 1000) - 60000 });
    return data.access_token;
  }
  throw new Error('Falha no Token');
}

export async function fetchHotmartSales(startDate: string, endDate: string, customChunkSize?: number, concurrency = 4) {
  const token = await getHotmartToken();
  const startMs_init = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const CHUNK_SIZE = customChunkSize || (30 * 24 * 60 * 60 * 1000);
  
  const chunks: {start: number, end: number}[] = [];
  let cur = startMs_init;
  while (cur < endMs) {
    chunks.push({ start: cur, end: Math.min(cur + CHUNK_SIZE, endMs) });
    cur += CHUNK_SIZE + 1;
  }

  let allItems: any[] = [];
  // Batch processing
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (chunk) => {
      let chunkItems: any[] = [];
      let pageToken = '';
      try {
        do {
          const url = `${HOTMART_API_BASE}/sales/history?start_date=${chunk.start}&end_date=${chunk.end}${pageToken ? `&page_token=${pageToken}` : ''}&max_results=100`;
          const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
          if (!resp.ok) break;
          const data = await resp.json() as any;
          if (data.items) chunkItems = [...chunkItems, ...data.items.filter((it: any) => isOfficialProduct(it.product))];
          pageToken = data.page_info?.next_page_token || '';
        } while (pageToken && chunkItems.length < 1000);
      } catch (e) { console.error("Hotmart error:", e); }
      return chunkItems;
    }));
    results.forEach(res => { allItems = [...allItems, ...res]; });
  }

  return allItems;
}

export async function fetchHotmartTopCustomers() {
  const CACHE_KEY = 'hotmart_top_customers_v6';
  const cached = getCache(CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) return cached.data;

  const now = new Date();
  // 2023 onwards captures all relevant LTV history while being much faster
  const historyDate = new Date('2023-01-01');
  
  // Higher concurrency for faster parallel fetching
  const sales = await fetchHotmartSales(historyDate.toISOString(), now.toISOString(), 60 * 24 * 60 * 60 * 1000, 12);
  
  const customerMap = new Map<string, any>();
  sales.forEach(s => {
    const purchase = s.purchase || {};
    const buyer = s.buyer || {};
    const product = s.product || {};
    if (!['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED', 'ACTIVE'].includes(purchase.status)) return;
    
    const email = buyer.email?.toLowerCase();
    if (!email) return;

    if (!customerMap.has(email)) {
      customerMap.set(email, {
        name: buyer.name || 'Sem Nome',
        email: email,
        phone: buyer.phone || 'Sem Telefone',
        products: new Set<string>(),
        totalRevenue: 0,
        purchaseCount: 0,
        paymentMethods: new Set<string>()
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

  setCache(CACHE_KEY, { data: final, expires_at: Date.now() + (60 * 60 * 1000) }); // Cache for 1 hour
  return final;
}

export function parseHotmartMonthly(sales: any[]) {
  const monthly: Record<number, { spend: number, revenue: number }> = {};
  for (let i = 1; i <= 12; i++) monthly[i] = { spend: 0, revenue: 0 };
  const uniqueTxIds = new Set();
  sales.forEach(s => {
    const purchase = s.purchase || {};
    if (['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED', 'ACTIVE'].includes(purchase.status) && !uniqueTxIds.has(purchase.transaction)) {
      uniqueTxIds.add(purchase.transaction);
      const date = new Date(purchase.approved_date || purchase.order_date);
      const month = date.getMonth() + 1;
      if (monthly[month]) monthly[month].revenue += (purchase.price?.actual_value || purchase.price?.value || 0);
    }
  });
  return monthly;
}
