import { NextResponse } from 'next/server';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { convertToBRLOnDate } from '@/app/lib/currency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOTMART_API_HOST = 'developers.hotmart.com';

// Status que a Hotmart considera como venda confirmada no dashboard de vendas
const APPROVED_STATUSES = new Set([
  'APPROVED',
  'COMPLETE',
  'PRODUCER_CONFIRMED',
  'CONFIRMED',
]);

async function httpsGet(path: string, token: string): Promise<any> {
  const https = await import('https');
  return new Promise((resolve, reject) => {
    const req = https.default.request(
      { hostname: HOTMART_API_HOST, path, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let data = '';
        res.on('data', (c: any) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Busca TODAS as páginas de vendas de um produto específico pelo product_id
 * Usa o mesmo endpoint que o dashboard Hotmart usa
 */
async function fetchSalesByProductId(
  productId: string | number,
  startMs: number,
  endMs: number,
  token: string
) {
  const allItems: any[] = [];
  let pageToken = '';
  const maxIterations = 20; // segurança contra loop infinito

  for (let i = 0; i < maxIterations; i++) {
    let path = `/payments/api/v1/sales/history?product_id=${productId}&start_date=${startMs}&end_date=${endMs}&max_results=500`;
    if (pageToken) path += `&page_token=${pageToken}`;

    const data = await httpsGet(path, token);
    if (!data || !data.items || data.items.length === 0) break;

    allItems.push(...data.items);
    pageToken = data.page_info?.next_page_token || '';
    if (!pageToken) break;
  }

  return allItems;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom    = searchParams.get('dateFrom');
  const dateTo      = searchParams.get('dateTo');
  const product     = searchParams.get('product');     // nome exato
  const productId   = searchParams.get('productId');   // ID numérico (preferido)

  if (!dateFrom || !dateTo || (!product && !productId)) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const token   = await getHotmartToken();
    const startMs = new Date(`${dateFrom}T00:00:00-03:00`).getTime();
    const endMs   = new Date(`${dateTo}T23:59:59-03:00`).getTime();

    let targetProductId = productId;

    // Se não temos o productId, descobrimos fazendo uma busca por nome no período estendido
    if (!targetProductId && product) {
      const recentMs = new Date(Date.now() - 90 * 86400_000).getTime();
      const nowMs    = Date.now();

      // Busca sem filtro de produto para descobrir o ID
      let pPath = `/payments/api/v1/sales/history?start_date=${recentMs}&end_date=${nowMs}&max_results=500`;
      const pData = await httpsGet(pPath, token);
      const items: any[] = pData?.items || [];

      const productTrim = product.trim().toLowerCase();
      const found = items.find((s: any) => (s.product?.name || '').trim().toLowerCase() === productTrim);
      if (found?.product?.id) {
        targetProductId = String(found.product.id);
      }
    }

    if (!targetProductId) {
      // Fallback: busca sem product_id mas com match exato (menos preciso)
      return NextResponse.json({
        revenue: 0, purchases: 0, matchedProducts: [],
        currencyBreakdown: {}, _error: 'Product ID not found'
      });
    }

    // ── Busca todas as vendas deste produto pelo product_id ──
    const rawItems = await fetchSalesByProductId(targetProductId, startMs, endMs, token);

    const uniqueTxIds = new Set<string>();
    const matchedSales: { value: number; currency: string; dateIso: string }[] = [];

    for (const s of rawItems) {
      const purchase = s.purchase || {};
      const txId     = purchase.transaction;
      const status   = (purchase.status || '').toUpperCase();

      if (!APPROVED_STATUSES.has(status)) continue;
      if (uniqueTxIds.has(txId)) continue;
      uniqueTxIds.add(txId);

      // actual_value = valor real conforme mostrado no dashboard Hotmart
      const value = purchase.price?.actual_value ?? purchase.price?.value ?? 0;
      const currency = (purchase.price?.currency_code || 'BRL').toUpperCase();

      // Data: Hotmart dashboard usa approved_date para relatórios
      const dateIso = purchase.approved_date
        ? new Date(purchase.approved_date).toISOString().split('T')[0]
        : purchase.order_date
          ? new Date(purchase.order_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

      matchedSales.push({ value, currency, dateIso });
    }

    // Converte para BRL usando cotação histórica de cada venda
    const convertedValues = await Promise.all(
      matchedSales.map(s => convertToBRLOnDate(s.value, s.currency, s.dateIso))
    );

    const revenue       = convertedValues.reduce((a, b) => a + b, 0);
    const purchaseCount = matchedSales.length;

    // Breakdown por moeda
    const byCurrency: Record<string, { count: number; originalTotal: number; convertedTotal: number }> = {};
    matchedSales.forEach((s, i) => {
      if (!byCurrency[s.currency]) byCurrency[s.currency] = { count: 0, originalTotal: 0, convertedTotal: 0 };
      byCurrency[s.currency].count++;
      byCurrency[s.currency].originalTotal += s.value;
      byCurrency[s.currency].convertedTotal += convertedValues[i];
    });

    return NextResponse.json({
      revenue,
      purchases:         purchaseCount,
      matchedProducts:   [product || `product:${targetProductId}`],
      currencyBreakdown: byCurrency,
      _productId:        targetProductId,
    });

  } catch (error: any) {
    console.error('[/api/hotmart/sales-by-product]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
