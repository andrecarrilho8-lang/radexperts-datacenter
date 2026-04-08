import { NextResponse } from 'next/server';
import { initSDK, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { AdAccount } = initSDK(process.env.META_ACCESS_TOKEN!);
    const account = new AdAccount(process.env.META_AD_ACCOUNT_ID!);

    // Test 1: Try last 7 days (hardcoded Apr 1-7)
    const since = searchParams.get('since') || '2026-04-01';
    const until = searchParams.get('until') || '2026-04-07';

    const insights = await account.getInsights(
      [...INSIGHT_FIELDS, 'cpm', 'campaign_name', 'campaign_id'],
      {
        time_range: { since, until },
        level: 'campaign',
        limit: 20,
      }
    );

    const rows: any[] = [];
    for (const row of insights) {
      const r = row as any;
      rows.push({
        campaign_id:   r.campaign_id,
        campaign_name: r.campaign_name,
        spend:         r.spend,
        impressions:   r.impressions,
        clicks:        r.clicks,
        raw_keys:      Object.keys(r),
      });
    }

    // Test 2: Try date_preset last_7d
    const insightsPreset = await account.getInsights(
      ['campaign_id', 'campaign_name', 'spend', 'impressions'],
      { date_preset: 'last_7d', level: 'campaign', limit: 20 }
    );

    const rows2: any[] = [];
    for (const row of insightsPreset) {
      const r = row as any;
      rows2.push({ campaign_id: r.campaign_id, campaign_name: r.campaign_name, spend: r.spend });
    }

    return NextResponse.json({
      account_id: process.env.META_AD_ACCOUNT_ID,
      date_range: { since, until },
      time_range_results: rows,
      last_7d_preset_results: rows2,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
