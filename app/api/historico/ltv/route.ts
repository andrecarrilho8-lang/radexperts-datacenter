import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { fetchHotmartSales, fetchHotmartCommissions } from '@/app/lib/hotmartApi';
import { convertToBRLOnDate } from '@/app/lib/currency';
import { getCache, setCache } from '@/app/lib/metaApi';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/**
 * GET /api/historico/ltv?force=0|1
 *
 * Top 100 clientes por receita acumulada (Hotmart + manuais).
 * Para LATAM: usa producerNet USD (comissões) → convertToBRLOnDate
 * Para BRL:   usa producerNet BRL (comissões) ou price.actual_value como fallback
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  const cacheKey = 'ltv_combinado_v3';
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
    if (!key || amount <= 0) return;
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
    if (name && name.length > c.name.length) c.name = (name || '').toUpperCase().trim();
    if (phone && !c.phone) c.phone = phone;
    c.totalRevenue  += amount;
    c.purchaseCount += 1;
    if (product) c.products.add(product);
    if (source)  c.sources.add(source);
    if (pm)      c.paymentMethods.add(pm);
  }

  // ── 1. Hotmart sales (all-time) ───────────────────────────────────────────
  try {
    const since = '2023-01-01T00:00:00-03:00';
    const until = new Date().toISOString();

    // Fetch sales + commissions in parallel
    const [sales, commMap] = await Promise.all([
      fetchHotmartSales(since, until, 60 * 24 * 60 * 60 * 1000, 8),
      fetchHotmartCommissions(since, until).catch(() => new Map()),
    ]);

    // Collect LATAM pending conversions (USD → BRL)
    type LatamPending = {
      email: string; name: string; phone: string;
      netUSD: number; product: string; pm: string; dateIso: string;
    };
    const latamPending: LatamPending[] = [];

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

      const dateStr = p.approved_date || p.order_date;
      if (!dateStr) continue;
      const saleDate = new Date(dateStr);
      const dateIso  = saleDate.toISOString().split('T')[0];

      const cur   = (p.price?.currency_code || 'BRL').toUpperCase();
      const isBRL = cur === 'BRL';
      const comm  = commMap.get(tx);
      const name  = buyer.name  || '';
      const phone = buyer.phone || '';
      const pm    = p.payment?.type || '';

      if (isBRL) {
        // BRL: use producerNet (commission) or actual_value (gross fallback)
        const net = comm?.producerNet ?? p.price?.actual_value ?? p.price?.value ?? 0;
        upsert(email, name, phone, Number(net), product.name || '', 'Hotmart', pm);

      } else {
        // LATAM: use producerNet USD (from commissions) → convert to BRL
        if (comm?.producerNet != null) {
          // Commission net is in USD — queue for batch conversion
          latamPending.push({ email, name, phone, netUSD: comm.producerNet, product: product.name || '', pm, dateIso });
        } else {
          // No commission data — convert local currency value, with safety cap
          const localVal = p.price?.actual_value ?? p.price?.value ?? 0;
          try {
            const brl = await convertToBRLOnDate(localVal, cur, dateIso);
            // Safety cap: skip if result is absurd (> R$25k without commission data)
            if (brl > 0 && brl <= 25_000) {
              upsert(email, name, phone, brl, product.name || '', 'Hotmart', pm);
            }
          } catch { /* skip */ }
        }
      }
    }

    // Batch convert LATAM pending (USD → BRL by sale date)
    const BATCH = 8;
    for (let i = 0; i < latamPending.length; i += BATCH) {
      const batch = latamPending.slice(i, i + BATCH);
      await Promise.all(batch.map(async ({ email, name, phone, netUSD, product, pm, dateIso }) => {
        try {
          const brl = await convertToBRLOnDate(netUSD, 'USD', dateIso);
          if (brl > 0) upsert(email, name, phone, brl, product, 'Hotmart', pm);
        } catch { /* skip */ }
      }));
    }

    console.log(`[LTV] Hotmart: ${seenTx.size} sales, LATAM pending: ${latamPending.length}`);

  } catch (e: any) {
    console.error('[LTV] Hotmart error:', e.message);
  }

  // ── 2. Manual students from DB ────────────────────────────────────────────
  try {
    const sql  = neon(process.env.POSTGRES_URL!);
    const rows = await sql`
      SELECT name, phone, email, course_name, payment_method, total_amount
      FROM manual_students
      WHERE total_amount IS NOT NULL AND total_amount > 0
    `;
    for (const r of rows) {
      const email = (r.email || '').toLowerCase().trim();
      if (!email) continue;
      upsert(email, r.name || '', r.phone || '', Number(r.total_amount),
             r.course_name || '', 'Manual', r.payment_method || 'PIX');
    }
  } catch (e: any) {
    console.error('[LTV] Manual students error:', e.message);
  }

  // ── 3. Build sorted result ────────────────────────────────────────────────
  // studentId = base64url(email) — same encoding used by /alunos/[id]/page.tsx
  function toStudentId(email: string): string {
    return Buffer.from(email).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  const results = Array.from(customerMap.values())
    .map(c => {
      const rev   = c.totalRevenue;
      const score: 'TOP' | 'BOM' | 'OK' =
        rev >= 10_000 || (rev >= 6_000 && c.purchaseCount >= 3) ? 'TOP' :
        rev >= 3_000  || c.purchaseCount >= 2                   ? 'BOM' : 'OK';
      return {
        name:           c.name,
        email:          c.email,
        phone:          c.phone,
        studentId:      toStudentId(c.email),
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
