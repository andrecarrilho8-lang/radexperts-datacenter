import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';
import { fetchHotmartSales, parseHotmartMonthly } from '@/app/lib/hotmartApi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || '2026';
  const force = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `historico_consolidado_v2|${year}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  // Current month cap — don't show future months as zero
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxMonth = parseInt(year) === currentYear ? currentMonth : 12;

  try {
    const { AdAccount } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);

    // Meta API expects YYYY-MM-DD (no timezone suffix)
    const since = `${year}-01-01`;
    const until = parseInt(year) === currentYear
      ? now.toISOString().split('T')[0]  // today
      : `${year}-12-31`;

    // Monthly accumulator
    const monthly: Record<number, {
      month: number;
      spend: number;
      metaRevenue: number;
      hotmartRevenue: number;
    }> = {};
    for (let i = 1; i <= maxMonth; i++) {
      monthly[i] = { month: i, spend: 0, metaRevenue: 0, hotmartRevenue: 0 };
    }

    // ── Meta Insights (daily breakdown → aggregate by month) ──
    try {
      const rawInsights = await account.getInsights(INSIGHT_FIELDS, {
        level: 'account',
        time_increment: 1,
        time_range: { since, until },
        limit: 500,
      });

      rawInsights.forEach((data: any) => {
        const m = parseMetrics(data);
        const month = parseInt(data.date_start.split('-')[1], 10);
        if (monthly[month]) {
          monthly[month].spend += m.spend;
          monthly[month].metaRevenue += m.revenue || 0;
        }
      });
    } catch (metaErr: any) {
      console.error('[Mensal Meta Error]', metaErr.message);
    }

    // ── Hotmart ──
    let hotmartError: string | null = null;
    try {
      const hotmartSales = await fetchHotmartSales(
        `${since}T00:00:00-03:00`,
        `${until}T23:59:59-03:00`
      );
      const hotmartMonthly = parseHotmartMonthly(hotmartSales);

      Object.keys(hotmartMonthly).forEach((mStr) => {
        const m = parseInt(mStr);
        if (monthly[m]) {
          monthly[m].hotmartRevenue = hotmartMonthly[m].revenue;
        }
      });
    } catch (hErr: any) {
      console.error('[Mensal Hotmart Error]', hErr.message);
      hotmartError = hErr.message;
    }

    // ── Build results + totals row ──
    const rows = Object.values(monthly).sort((a, b) => a.month - b.month);

    const totals = rows.reduce(
      (acc, r) => ({
        month: 0, // 0 = totals marker
        spend: acc.spend + r.spend,
        metaRevenue: acc.metaRevenue + r.metaRevenue,
        hotmartRevenue: acc.hotmartRevenue + r.hotmartRevenue,
      }),
      { month: 0, spend: 0, metaRevenue: 0, hotmartRevenue: 0 }
    );

    const results = [...rows, totals];
    const response = { results, hotmartError };
    setCache(cacheKey, response);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[/api/meta/historico/mensal] Error:', error.message);
    return NextResponse.json({ error: 'Data consolidation error' }, { status: 500 });
  }
}
