import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  if (!campaignId) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `lifetime_daily|${campaignId}`;
  const cached = getCache(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const { AdAccount } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);

    const dailyParams: any = {
      level: 'campaign',
      time_increment: 1,
      date_preset: 'lifetime',
      filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
    };

    const dailyInsights = await account.getInsights(INSIGHT_FIELDS, dailyParams);

    if (dailyInsights.length === 0) {
      const empty = { avgSpend: 0, avgSales: 0, bestDay: 'N/A' };
      setCache(cacheKey, empty);
      return NextResponse.json(empty);
    }

    let totalSpend = 0;
    let totalSales = 0;
    const daysWithSpend = dailyInsights.filter((d: any) => parseFloat(d.spend || '0') > 0);
    const activeDaysCount = daysWithSpend.length || 1;

    const salesByDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    const countByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];

    for (const day of dailyInsights) {
      const parsed = parseMetrics(day);
      if (parsed.spend === 0 && parsed.purchases === 0) continue; // skip completely inactive days
      
      totalSpend += parsed.spend;
      totalSales += parsed.purchases;

      const dateObj = new Date(day.date_start + 'T12:00:00Z'); // force midday UTC to avoid local timezone offset shifts
      const dow = dateObj.getUTCDay();
      salesByDayOfWeek[dow] += parsed.purchases;
      countByDayOfWeek[dow] += 1;
    }

    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    let bestDowIndex = 0;
    let bestAvg = -1;

    for (let i = 0; i < 7; i++) {
      const avg = countByDayOfWeek[i] > 0 ? (salesByDayOfWeek[i] / countByDayOfWeek[i]) : 0;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestDowIndex = i;
      }
    }

    const result = {
      avgSpend: totalSpend / activeDaysCount,
      avgSales: totalSales / activeDaysCount,
      bestDay: bestAvg > 0 ? dayNames[bestDowIndex] : 'Sem dados suficientes',
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[/api/meta/campaign/[id]/lifetime] Error:', error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta lifetime API error' }, { status: 500 });
  }
}
