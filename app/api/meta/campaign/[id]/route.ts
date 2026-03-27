import { NextResponse } from 'next/server';
import { initSDK, INSIGHT_FIELDS, parseMetrics, mapObjective } from '@/app/lib/metaApi';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(request.url);
  const { id } = await params;
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) 
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
    
  try {
    const { AdAccount, Campaign } = initSDK(accessToken);
    const campaign = new Campaign(id);
    const account = new AdAccount(adAccountId);

    const dateRange = dateFrom && dateTo
      ? { time_range: { since: dateFrom, until: dateTo } }
      : { date_preset: 'last_30d' };

    const [info, insights] = await Promise.all([
      campaign.get(['id', 'name', 'status', 'effective_status', 'created_time', 'objective']),
      account.getInsights(INSIGHT_FIELDS, {
        level: 'campaign',
        ...dateRange,
        filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: id }],
      })
    ]);
    
    const metrics = insights.length > 0 ? parseMetrics(insights[0]) : { spend: 0, revenue: 0, roas: 0, cpa: 0, purchases: 0, leads: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, outboundClicks: 0, connectRate: 0, costPerLead: 0, checkoutRate: 0, checkouts: 0, landingPageViews: 0 };
    
    return NextResponse.json({
      id: info.id,
      name: info.name,
      status: info.effective_status || info.status,
      createdTime: info.created_time,
      objective: mapObjective(info.objective),
      ...metrics
    });
    
  } catch (error: any) {
    console.error(`[/api/meta/campaign/${id}] Error:`, error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta API error' }, { status: 500 });
  }
}
