import { NextResponse } from 'next/server';
import { getCache, setCache, parseMetrics } from '@/app/lib/metaApi';

const BASE = 'https://graph.facebook.com/v19.0';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');
  const force    = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN!;
  const adAccountId = process.env.META_AD_ACCOUNT_ID!;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `adsets|${campaignId}|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const timeRange = dateFrom && dateTo ? { since: dateFrom, until: dateTo } : undefined;
    const fields = 'adset_id,adset_name,spend,impressions,clicks,outbound_clicks,cpc,ctr,actions,action_values';

    const p = new URLSearchParams({
      access_token: accessToken,
      fields,
      level: 'adset',
      limit: '50',
      filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
      ...(timeRange ? { time_range: JSON.stringify(timeRange) } : { date_preset: 'last_30d' }),
    });

    const res = await fetch(`${BASE}/${adAccountId}/insights?${p}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const adsets = (json.data || []).map((d: any) => ({
      id:   d.adset_id || '',
      name: d.adset_name || '',
      ...parseMetrics(d),
    }));

    const body = { adsets };
    setCache(cacheKey, body);
    return NextResponse.json(body);

  } catch (error: any) {
    console.error('[adsets] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
