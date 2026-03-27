import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const force = searchParams.get('force') === '1';

  if (!campaignId) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `adsets|${campaignId}|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const { AdAccount } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);

    const dateRange = dateFrom && dateTo
      ? { time_range: { since: dateFrom, until: dateTo } }
      : { date_preset: 'last_30d' };

    const adsetParams: any = {
      level: 'adset',
      limit: 50,
      ...dateRange,
      filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
    };

    const fields = [
      'adset_id', 
      'adset_name', 
      'spend', 
      'impressions', 
      'clicks', 
      'outbound_clicks', 
      'cpc', 
      'ctr', 
      'actions', 
      'action_values'
    ];

    const adsetInsights = await account.getInsights(fields, adsetParams);

    const results = adsetInsights.map((data: any) => {
      const m = parseMetrics(data);
      return {
        id:   data.adset_id || '',
        name: data.adset_name || '',
        ...m,
      };
    });

    const body = { adsets: results };
    setCache(cacheKey, body);
    return NextResponse.json(body);

  } catch (error: any) {
    console.error('[/api/meta/campaign/[id]/adsets] Error:', error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta adsets API error' }, { status: 500 });
  }
}
