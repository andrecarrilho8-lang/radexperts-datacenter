import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/app/lib/metaApi';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { convertToBRLOnDate } from '@/app/lib/currency';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year  = searchParams.get('year') || '2026';
  const force = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `historico_mensal_v5|${year}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const now         = new Date();
  const currentYear = now.getFullYear();
  const maxMonth    = parseInt(year) === currentYear ? now.getMonth() + 1 : 12;

  const since = `${year}-01-01`;
  const until = parseInt(year) === currentYear
    ? now.toISOString().split('T')[0]
    : `${year}-12-31`;

  // ── Monthly accumulator ───────────────────────────────────────────────────
  type MonthData = {
    month: number; spend: number;
    revenueBRL: number; revenueLATAM: number;
    txCountBRL: number; txCountLATAM: number;
  };
  const monthly: Record<number, MonthData> = {};
  for (let i = 1; i <= maxMonth; i++) {
    monthly[i] = { month: i, spend: 0, revenueBRL: 0, revenueLATAM: 0, txCountBRL: 0, txCountLATAM: 0 };
  }

  // ── 1. Meta spend — HTTP fetch (monthly breakdown) ───────────────────────
  let metaError: string | null = null;
  try {
    const META_BASE  = 'https://graph.facebook.com/v19.0';
    const metaParams = new URLSearchParams({
      fields:         'spend,date_start',
      level:          'account',
      time_increment: 'monthly',
      time_range:     JSON.stringify({ since, until }),
      limit:          '50',
      access_token:   accessToken,
    });
    const metaRes  = await fetch(`${META_BASE}/${adAccountId}/insights?${metaParams}`,
                                 { signal: AbortSignal.timeout(25_000) });
    const metaJson = await metaRes.json();
    if (metaJson.error) {
      metaError = metaJson.error.message;
    } else {
      for (const d of metaJson.data || []) {
        const m = parseInt(d.date_start.split('-')[1], 10);
        if (monthly[m]) monthly[m].spend += parseFloat(d.spend || '0');
      }
    }
  } catch (e: any) {
    metaError = e.message;
    console.error('[Mensal] Meta error:', e.message);
  }

  // ── 2. Hotmart — BRL vs LATAM ─────────────────────────────────────────────
  let hotmartError: string | null = null;
  try {
    const sales  = await fetchHotmartSales(`${since}T00:00:00-03:00`, `${until}T23:59:59-03:00`);
    const seenTx = new Set<string>();

    // Collect LATAM sales that need conversion first
    const latamPending: { sale: any; m: number; rawValue: number; cur: string; dateIso: string }[] = [];

    for (const s of sales) {
      const p   = s.purchase || {};
      const tx  = p.transaction;
      if (!APPROVED.has(p.status) || !tx || seenTx.has(tx)) continue;
      seenTx.add(tx);

      const dateStr = p.approved_date || p.order_date;
      if (!dateStr) continue;
      const saleDate = new Date(dateStr);
      if (saleDate.getFullYear() !== parseInt(year)) continue;
      const m = saleDate.getMonth() + 1;
      if (!monthly[m]) continue;

      const cur = (p.price?.currency_code || 'BRL').toUpperCase();

      if (cur === 'BRL') {
        // BRL: use actual_value (gross) or value as fallback — net not available without commission API
        const val = p.price?.actual_value ?? p.price?.value ?? 0;
        monthly[m].revenueBRL  += Number(val);
        monthly[m].txCountBRL  += 1;
      } else {
        // LATAM: raw value in local currency (USD, COP, etc.) — must convert
        const rawValue = p.price?.actual_value ?? p.price?.value ?? 0;
        const dateIso  = saleDate.toISOString().split('T')[0];
        latamPending.push({ sale: s, m, rawValue, cur, dateIso });
      }
    }

    // Convert LATAM in parallel batches (like main meta API)
    if (latamPending.length > 0) {
      const BATCH = 8;
      for (let i = 0; i < latamPending.length; i += BATCH) {
        const batch = latamPending.slice(i, i + BATCH);
        await Promise.all(batch.map(async ({ m, rawValue, cur, dateIso }) => {
          try {
            const brlValue = await convertToBRLOnDate(rawValue, cur, dateIso);
            monthly[m].revenueLATAM += brlValue;
            monthly[m].txCountLATAM += 1;
          } catch {
            // Skip if conversion fails for a specific sale
          }
        }));
      }
    }

    console.log(`[Mensal] BRL sales: ${Object.values(monthly).reduce((a, r) => a + r.txCountBRL, 0)}, LATAM: ${latamPending.length}`);

  } catch (e: any) {
    hotmartError = e.message;
    console.error('[Mensal] Hotmart error:', e.message);
  }

  // ── 3. Build rows + totals ────────────────────────────────────────────────
  const rows = Object.values(monthly).sort((a, b) => a.month - b.month).map(r => ({
    ...r,
    revenueTotal: r.revenueBRL + r.revenueLATAM,
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      month: 0, spend: acc.spend + r.spend,
      revenueBRL:   acc.revenueBRL   + r.revenueBRL,
      revenueLATAM: acc.revenueLATAM + r.revenueLATAM,
      revenueTotal: acc.revenueTotal + r.revenueTotal,
      txCountBRL:   acc.txCountBRL   + r.txCountBRL,
      txCountLATAM: acc.txCountLATAM + r.txCountLATAM,
    }),
    { month: 0, spend: 0, revenueBRL: 0, revenueLATAM: 0, revenueTotal: 0, txCountBRL: 0, txCountLATAM: 0 }
  );

  const results  = [...rows, totals];
  const response = { results, metaError, hotmartError };
  setCache(cacheKey, response);
  return NextResponse.json(response);
}
