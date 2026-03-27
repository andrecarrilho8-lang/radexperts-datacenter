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
      const empty = { avgSpend: 0, avgSales: 0, bestDay: 'Sem dados diarios' };
      setCache(cacheKey, empty);
      return NextResponse.json(empty);
    }

    const salesByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    const countSalesByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    const leadsByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    const countLeadsByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];

    for (const day of dailyInsights) {
      const parsed = parseMetrics(day);
      
      const dateObj = new Date(day.date_start + 'T12:00:00Z');
      const dow = dateObj.getUTCDay();
      
      if (parsed.purchases > 0) {
        salesByDayOfWeek[dow] += parsed.purchases;
        countSalesByDayOfWeek[dow] += 1;
      }
      if (parsed.leads > 0) {
        leadsByDayOfWeek[dow] += parsed.leads;
        countLeadsByDayOfWeek[dow] += 1;
      }
    }

    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    let bestSalesDowIndex = 0;
    let bestSalesAvg = -1;
    let bestLeadsDowIndex = 0;
    let bestLeadsAvg = -1;

    for (let i = 0; i < 7; i++) {
      const avgSales = countSalesByDayOfWeek[i] > 0 ? (salesByDayOfWeek[i] / countSalesByDayOfWeek[i]) : 0;
      if (avgSales > bestSalesAvg) {
        bestSalesAvg = avgSales;
        bestSalesDowIndex = i;
      }
      
      const avgLeads = countLeadsByDayOfWeek[i] > 0 ? (leadsByDayOfWeek[i] / countLeadsByDayOfWeek[i]) : 0;
      if (avgLeads > bestLeadsAvg) {
        bestLeadsAvg = avgLeads;
        bestLeadsDowIndex = i;
      }
    }

    const result = {
      bestDay: bestSalesAvg > 0 ? dayNames[bestSalesDowIndex] : 'Sem vendas',
      bestDayLeads: bestLeadsAvg > 0 ? dayNames[bestLeadsDowIndex] : 'Sem leads',
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[/api/meta/campaign/[id]/daily] Error:', error?.response?.error || error.message);
    return NextResponse.json({ bestDay: 'Erro', error: error.message }, { status: 200 });
  }
}
