import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const campaignId = p?.id;
  if (!campaignId) return NextResponse.json({ error: 'Missing campaign id', receivedParams: p }, { status: 400 });

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `campaign_chart_v3|${campaignId}|${today}`;
  const cached = getCache(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const { AdAccount, Campaign } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);

    // 1. Get campaign creation date to define the "lifetime" range explicitly
    // This avoids the "(#100) lifetime is not a valid date_preset" error when using time_increment
    const campaign = new Campaign(campaignId);
    const campMeta = await campaign.get(['created_time']);
    const createdDate = campMeta.created_time ? campMeta.created_time.split('T')[0] : '2024-01-01';
    const dailyParams: any = {
      level: 'campaign',
      time_increment: 1,
      limit: 720,
      time_range: { since: createdDate, until: today },
      filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
    };

    // Fetch all pages to ensure we get ALL days the campaign ran
    let allInsights: any[] = [];
    let cursor = await account.getInsights(INSIGHT_FIELDS, dailyParams);
    allInsights = allInsights.concat([...cursor]);
    while (cursor && typeof cursor.next === 'function') {
      try {
        cursor = await cursor.next();
        if (!cursor || !cursor.length) break;
        allInsights = allInsights.concat([...cursor]);
      } catch {
        break;
      }
    }

    if (allInsights.length === 0) {
      return NextResponse.json({ chartData: [], createdDate });
    }

    const chartData = allInsights.map((day: any) => {
      const m = parseMetrics(day);
      return {
        date: day.date_start,
        spend: m.spend,
        purchases: m.purchases,
        leads: m.leads,
        revenue: m.revenue
      };
    }).sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

    const result = { chartData, createdDate };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    const errorMsg = error?.response?.error?.message || error?.message || 'Unknown error';
    console.error('[/api/meta/campaign/[id]/chart] Error:', errorMsg);
    return NextResponse.json({ error: 'Meta campaign chart API error', details: errorMsg }, { status: 500 });
  }
}
