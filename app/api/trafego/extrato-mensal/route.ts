import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * GET /api/trafego/extrato-mensal?year=2025
 * Returns month-by-month: Meta spend, Hotmart net revenue, ROAS
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || '2026', 10);

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  }

  const META_BASE = 'https://graph.facebook.com/v19.0';

  try {
    // ── 1. Fetch Meta spend per month (monthly breakdown) ────────────────────
    // Use time_increment=monthly with date_range for the full year
    const since = `${year}-01-01`;
    const until = `${year}-12-31`;

    const metaParams = new URLSearchParams({
      fields: 'spend,date_start,date_stop',
      level: 'account',
      time_increment: 'monthly',
      time_range: JSON.stringify({ since, until }),
      limit: '50',
      access_token: accessToken,
    });

    // ── 2. Fetch Hotmart sales for the full year ──────────────────────────────
    const hotStart = `${year}-01-01T00:00:00-03:00`;
    const hotEnd   = `${year}-12-31T23:59:59-03:00`;

    const [metaRes, hotmartSales] = await Promise.all([
      fetch(`${META_BASE}/${adAccountId}/insights?${metaParams}`).then(r => r.json()),
      fetchHotmartSales(hotStart, hotEnd).catch(() => [] as any[]),
    ]);

    // ── 3. Process Meta monthly spend ─────────────────────────────────────────
    const metaByMonth: Record<number, number> = {}; // month index 0-11 → spend
    for (const d of (metaRes.data || [])) {
      const dt = new Date(d.date_start);
      const m  = dt.getMonth(); // 0-indexed
      metaByMonth[m] = (metaByMonth[m] || 0) + parseFloat(d.spend || '0');
    }

    // ── 4. Process Hotmart monthly net revenue ────────────────────────────────
    const hotByMonth: Record<number, number> = {};
    const seenTx = new Set<string>();

    for (const s of hotmartSales) {
      const p  = s.purchase || {};
      const tx = p.transaction;
      if (!APPROVED.has(p.status) || !tx || seenTx.has(tx)) continue;
      seenTx.add(tx);

      const dateStr = p.approved_date || p.order_date;
      if (!dateStr) continue;

      const dt = new Date(dateStr);
      if (dt.getFullYear() !== year) continue;
      const m = dt.getMonth();

      // Use producer_net_brl (net after fees+co-producers) if available, else gross BRL
      const net = p.producer_net_brl ?? p.producer_net;
      const val = net != null
        ? net
        : (p.price?.converted_value ?? p.price?.actual_value ?? p.price?.value ?? 0);

      hotByMonth[m] = (hotByMonth[m] || 0) + val;
    }

    // ── 5. Build result rows ──────────────────────────────────────────────────
    const now   = new Date();
    const rows  = MONTHS_PT.map((label, m) => {
      const isCurrentYear  = now.getFullYear() === year;
      const isFuture       = isCurrentYear && m > now.getMonth();
      const spend          = metaByMonth[m] || 0;
      const revenue        = hotByMonth[m]  || 0;
      const roas           = spend > 0 ? revenue / spend : null;

      return {
        month:   m + 1,       // 1-12
        label,                // 'Jan' … 'Dez'
        spend,                // Meta ad spend (BRL)
        revenue,              // Hotmart net (BRL)
        roas,                 // revenue / spend, or null when no spend
        isFuture,
      };
    });

    // ── 6. Totals ─────────────────────────────────────────────────────────────
    const totalSpend   = rows.reduce((s, r) => s + r.spend,   0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalRoas    = totalSpend > 0 ? totalRevenue / totalSpend : null;

    return NextResponse.json({ year, rows, totalSpend, totalRevenue, totalRoas });

  } catch (err: any) {
    console.error('[extrato-mensal]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
