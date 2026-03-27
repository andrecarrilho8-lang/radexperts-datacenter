import { NextResponse } from 'next/server';
import { parseMetrics, mapObjective } from '@/app/lib/metaApi';

const BASE = 'https://graph.facebook.com/v19.0';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');

  const accessToken = process.env.META_ACCESS_TOKEN!;
  const adAccountId = process.env.META_AD_ACCOUNT_ID!;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  try {
    const timeRange = dateFrom && dateTo ? { since: dateFrom, until: dateTo } : undefined;

    const fields = 'campaign_name,campaign_id,spend,impressions,clicks,outbound_clicks,cpc,ctr,actions,action_values,date_start';

    // Campaign info
    const infoRes = await fetch(`${BASE}/${id}?fields=id,name,status,effective_status,created_time,objective&access_token=${accessToken}`);
    const info = await infoRes.json();
    if (info.error) throw new Error(info.error.message);

    // Campaign insights
    const insightParams = new URLSearchParams({
      access_token: accessToken,
      fields,
      level: 'campaign',
      filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: id }]),
      ...(timeRange ? { time_range: JSON.stringify(timeRange) } : { date_preset: 'last_30d' }),
    });
    const insightRes = await fetch(`${BASE}/${adAccountId}/insights?${insightParams}`);
    const insightJson = await insightRes.json();
    const insights: any[] = insightJson.data || [];

    const metrics = insights.length > 0 ? parseMetrics(insights[0]) : {
      spend: 0, revenue: 0, roas: 0, cpa: 0, purchases: 0, leads: 0,
      impressions: 0, clicks: 0, ctr: 0, cpc: 0, outboundClicks: 0,
      connectRate: 0, costPerLead: 0, checkoutRate: 0, checkouts: 0, landingPageViews: 0,
    };

    return NextResponse.json({
      id: info.id,
      name: info.name,
      status: info.effective_status || info.status,
      createdTime: info.created_time,
      objective: mapObjective(info.objective),
      ...metrics,
    });

  } catch (error: any) {
    console.error(`[/api/meta/campaign/${id}] Error:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
