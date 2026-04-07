import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/app/lib/metaApi';
import { fetchHotmartSales, parseHotmartMonthly } from '@/app/lib/hotmartApi';

export const dynamic         = 'force-dynamic';
export const runtime         = 'nodejs';
export const maxDuration     = 60;

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year  = searchParams.get('year') || '2026';
  const force = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `historico_mensal_v3|${year}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxMonth     = parseInt(year) === currentYear ? currentMonth : 12;

  const since = `${year}-01-01`;
  const until = parseInt(year) === currentYear
    ? now.toISOString().split('T')[0]
    : `${year}-12-31`;

  // ── Monthly accumulator ───────────────────────────────────────────────────
  const monthly: Record<number, { month: number; spend: number; hotmartRevenue: number }> = {};
  for (let i = 1; i <= maxMonth; i++) {
    monthly[i] = { month: i, spend: 0, hotmartRevenue: 0 };
  }

  // ── 1. Meta spend — via HTTP (monthly time_increment) ────────────────────
  let metaError: string | null = null;
  try {
    const META_BASE = 'https://graph.facebook.com/v19.0';
    const metaParams = new URLSearchParams({
      fields:         'spend,date_start',
      level:          'account',
      time_increment: 'monthly',
      time_range:     JSON.stringify({ since, until }),
      limit:          '50',
      access_token:   accessToken,
    });

    const metaRes = await fetch(
      `${META_BASE}/${adAccountId}/insights?${metaParams}`,
      { signal: AbortSignal.timeout(25_000) }
    );
    const metaJson = await metaRes.json();

    if (metaJson.error) {
      metaError = metaJson.error.message;
      console.error('[Mensal] Meta error:', metaJson.error);
    } else {
      for (const d of metaJson.data || []) {
        const m = parseInt(d.date_start.split('-')[1], 10);
        if (monthly[m]) {
          monthly[m].spend += parseFloat(d.spend || '0');
        }
      }
      console.log('[Mensal] Meta months fetched:', (metaJson.data || []).length);
    }
  } catch (e: any) {
    metaError = e.message;
    console.error('[Mensal] Meta fetch failed:', e.message);
  }

  // ── 2. Hotmart — monthly revenue ─────────────────────────────────────────
  let hotmartError: string | null = null;
  try {
    const hotmartSales = await fetchHotmartSales(
      `${since}T00:00:00-03:00`,
      `${until}T23:59:59-03:00`
    );
    console.log('[Mensal] Hotmart sales fetched:', hotmartSales.length);

    // parseHotmartMonthly may or may not exist — fallback to manual parse
    let hotmartMonthly: Record<number, { revenue: number }>;
    try {
      hotmartMonthly = parseHotmartMonthly(hotmartSales);
    } catch {
      // Manual fallback
      hotmartMonthly = {};
      const seenTx = new Set<string>();
      for (const s of hotmartSales) {
        const p  = s.purchase || {};
        const tx = p.transaction;
        if (!APPROVED.has(p.status) || !tx || seenTx.has(tx)) continue;
        seenTx.add(tx);
        const dateStr = p.approved_date || p.order_date;
        if (!dateStr) continue;
        const m = new Date(dateStr).getMonth() + 1;
        if (new Date(dateStr).getFullYear() !== parseInt(year)) continue;
        const net = p.producer_net_brl ?? p.producer_net;
        const val = net != null ? net : (p.price?.converted_value ?? p.price?.actual_value ?? p.price?.value ?? 0);
        if (!hotmartMonthly[m]) hotmartMonthly[m] = { revenue: 0 };
        hotmartMonthly[m].revenue += val;
      }
    }

    for (const [mStr, data] of Object.entries(hotmartMonthly)) {
      const m = parseInt(mStr);
      if (monthly[m]) {
        monthly[m].hotmartRevenue = data.revenue;
      }
    }
  } catch (e: any) {
    hotmartError = e.message;
    console.error('[Mensal] Hotmart failed:', e.message);
  }

  // ── 3. Build results + totals row ─────────────────────────────────────────
  const rows = Object.values(monthly).sort((a, b) => a.month - b.month);
  const totals = rows.reduce(
    (acc, r) => ({
      month:          0,
      spend:          acc.spend          + r.spend,
      hotmartRevenue: acc.hotmartRevenue + r.hotmartRevenue,
    }),
    { month: 0, spend: 0, hotmartRevenue: 0 }
  );

  const results  = [...rows, totals];
  const response = { results, metaError, hotmartError };
  setCache(cacheKey, response);
  return NextResponse.json(response);
}
