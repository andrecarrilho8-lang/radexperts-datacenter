import { NextResponse } from 'next/server';
import { getCache, setCache, parseMetrics } from '@/app/lib/metaApi';

const BASE = 'https://graph.facebook.com/v19.0';
const FIELDS = 'campaign_id,spend,impressions,clicks,outbound_clicks,cpc,ctr,actions,action_values,date_start';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const campaignId = p?.id;
  if (!campaignId) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

  const accessToken = process.env.META_ACCESS_TOKEN!;
  const adAccountId = process.env.META_AD_ACCOUNT_ID!;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `campaign_chart_v4|${campaignId}|${today}`;
  const cached = getCache(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    // 1. Get campaign creation date via HTTP
    const infoRes = await fetch(`${BASE}/${campaignId}?fields=created_time&access_token=${accessToken}`);
    const info = await infoRes.json();
    if (info.error) throw new Error(info.error.message);
    const createdDate = info.created_time ? info.created_time.split('T')[0] : '2024-01-01';

    // 2. Fetch daily insights via HTTP (paginate manually)
    let allInsights: any[] = [];
    let nextUrl: string | null = null;

    const firstParams = new URLSearchParams({
      access_token: accessToken,
      fields: FIELDS,
      level: 'campaign',
      time_increment: '1',
      limit: '720',
      time_range: JSON.stringify({ since: createdDate, until: today }),
      filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
    });
    nextUrl = `${BASE}/${adAccountId}/insights?${firstParams}`;

    while (nextUrl && allInsights.length < 1500) {
      const res: Response = await fetch(nextUrl);
      const json: any = await res.json();
      if (json.error) throw new Error(json.error.message);
      allInsights = allInsights.concat(json.data || []);
      nextUrl = json.paging?.next || null;
    }

    if (allInsights.length === 0) {
      return NextResponse.json({ chartData: [], createdDate });
    }

    const chartData = allInsights.map((day: any) => {
      const m = parseMetrics(day);
      return { date: day.date_start, spend: m.spend, purchases: m.purchases, leads: m.leads, revenue: m.revenue };
    }).sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

    const result = { chartData, createdDate };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[campaign/chart] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
