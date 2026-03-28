import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  
  if (!campaignId) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `daily|${campaignId}|${dateFrom}|${dateTo}`;
  const cached = getCache(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const { AdAccount } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);

    const dateRange = dateFrom && dateTo
      ? { time_range: { since: dateFrom, until: dateTo } }
      : { date_preset: 'last_30d' };

    const dailyParams: any = {
      level: 'campaign',
      time_increment: 1,
      ...dateRange,
      filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
    };

    const dailyInsights = await account.getInsights(INSIGHT_FIELDS, dailyParams);

    if (!dailyInsights || dailyInsights.length === 0) {
      const empty = { bestDay: null, bestDayLeads: null, totalSpend: 0, totalResults: 0, daysWithData: 0 };
      setCache(cacheKey, empty);
      return NextResponse.json(empty);
    }

    const salesByDow  = [0,0,0,0,0,0,0];
    const cntSalesDow = [0,0,0,0,0,0,0];
    const leadsByDow  = [0,0,0,0,0,0,0];
    const cntLeadsDow = [0,0,0,0,0,0,0];

    let totalSpend   = 0;
    let totalResults = 0;
    let daysWithData = 0;

    for (const day of dailyInsights) {
      const parsed = parseMetrics(day);
      const dow = new Date(day.date_start + 'T12:00:00Z').getUTCDay();

      const spend = parsed.spend || 0;
      totalSpend += spend;
      if (spend > 0) daysWithData++;
      totalResults += (parsed.purchases || 0) + (parsed.leads || 0);

      if ((parsed.purchases || 0) > 0) {
        salesByDow[dow]  += parsed.purchases;
        cntSalesDow[dow] += 1;
      }
      if ((parsed.leads || 0) > 0) {
        leadsByDow[dow]  += parsed.leads;
        cntLeadsDow[dow] += 1;
      }
    }

    const dayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    let bestSalesIdx = 0, bestSalesAvg = -1;
    let bestLeadsIdx = 0, bestLeadsAvg = -1;

    for (let i = 0; i < 7; i++) {
      const avgS = cntSalesDow[i] > 0 ? salesByDow[i] / cntSalesDow[i] : 0;
      if (avgS > bestSalesAvg) { bestSalesAvg = avgS; bestSalesIdx = i; }
      const avgL = cntLeadsDow[i] > 0 ? leadsByDow[i] / cntLeadsDow[i] : 0;
      if (avgL > bestLeadsAvg) { bestLeadsAvg = avgL; bestLeadsIdx = i; }
    }

    const result = {
      bestDay:      bestSalesAvg > 0 ? dayNames[bestSalesIdx] : null,
      bestDayLeads: bestLeadsAvg > 0 ? dayNames[bestLeadsIdx] : null,
      totalSpend,
      totalResults,
      daysWithData,
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[/api/meta/campaign/[id]/daily] Error:', error?.response?.error || error.message);
    return NextResponse.json({ bestDay: null, bestDayLeads: null, totalSpend: 0, totalResults: 0, daysWithData: 0 }, { status: 200 });
  }
}
