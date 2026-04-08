import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/**
 * GET /api/historico/ltv
 * Top 100 clientes por receita acumulada (Hotmart + manuais)
 * Retorna: name, email, phone, totalRevenue, purchaseCount, products[], sources[]
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  const cacheKey = 'ltv_combinado_v2';
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const customerMap = new Map<string, {
    name: string; email: string; phone: string;
    totalRevenue: number; purchaseCount: number;
    products: Set<string>; sources: Set<string>;
    paymentMethods: Set<string>;
  }>();

  function upsert(email: string, name: string, phone: string, amount: number, product: string, source: string, pm?: string) {
    const key = email.toLowerCase().trim();
    if (!key) return;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        name: (name || '').toUpperCase().trim(),
        email: key,
        phone: phone || '',
        totalRevenue: 0,
        purchaseCount: 0,
        products: new Set(),
        sources: new Set(),
        paymentMethods: new Set(),
      });
    }
    const c = customerMap.get(key)!;
    // Keep longest/best name
    if (name && name.length > c.name.length) c.name = (name || '').toUpperCase().trim();
    if (phone && !c.phone) c.phone = phone;
    c.totalRevenue  += amount;
    c.purchaseCount += 1;
    if (product) c.products.add(product);
    if (source)  c.sources.add(source);
    if (pm)      c.paymentMethods.add(pm);
  }

  // ── 1. Hotmart sales ──────────────────────────────────────────────────────
  try {
    // All-time: from 2023-01-01 to today
    const since = '2023-01-01T00:00:00-03:00';
    const until = new Date().toISOString();
    const sales  = await fetchHotmartSales(since, until, 60 * 24 * 60 * 60 * 1000, 8);
    const seenTx = new Set<string>();

    for (const s of sales) {
      const p  = s.purchase || {};
      const tx = p.transaction;
      if (!APPROVED.has(p.status) || !tx || seenTx.has(tx)) continue;
      seenTx.add(tx);

      const buyer   = s.buyer   || {};
      const product = s.product || {};
      const email   = (buyer.email || '').toLowerCase().trim();
      if (!email) continue;

      // Use actual_value (BRL) or value as fallback — gross amount
      const amount = p.price?.actual_value ?? p.price?.value ?? 0;
      const pm     = p.payment?.type || p.payment_type || '';

      upsert(email, buyer.name || '', buyer.phone || '', Number(amount), product.name || '', 'Hotmart', pm);
    }
  } catch (e: any) {
    console.error('[LTV] Hotmart error:', e.message);
  }

  // ── 2. Manual students ────────────────────────────────────────────────────
  try {
    const sql = neon(process.env.POSTGRES_URL!);
    const rows = await sql`
      SELECT
        name, phone, email,
        course_name,
        payment_method,
        total_amount
      FROM manual_students
      WHERE total_amount IS NOT NULL AND total_amount > 0
    `;

    for (const r of rows) {
      const email = (r.email || '').toLowerCase().trim();
      if (!email) continue;
      upsert(email, r.name || '', r.phone || '', Number(r.total_amount), r.course_name || '', 'Manual', r.payment_method || 'PIX');
    }
  } catch (e: any) {
    console.error('[LTV] Manual students error:', e.message);
  }

  // ── 3. Build sorted result ────────────────────────────────────────────────
  const results = Array.from(customerMap.values())
    .map(c => {
      const rev = c.totalRevenue;
      const score: 'TOP' | 'BOM' | 'OK' =
        rev >= 10_000 || (rev >= 6_000 && c.purchaseCount >= 3) ? 'TOP' :
        rev >= 3_000  || c.purchaseCount >= 2                   ? 'BOM' : 'OK';
      return {
        name:           c.name,
        email:          c.email,
        phone:          c.phone,
        totalRevenue:   Math.round(rev * 100) / 100,
        purchaseCount:  c.purchaseCount,
        products:       Array.from(c.products),
        sources:        Array.from(c.sources),
        paymentMethods: Array.from(c.paymentMethods),
        score,
      };
    })
    .filter(c => c.purchaseCount >= 1 && c.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 100);

  const res = { results, total: results.length };
  setCache(cacheKey, res);
  return NextResponse.json(res);
}
