import { NextResponse } from 'next/server';
import { mapObjective } from '@/app/lib/metaApi';

export const dynamic         = 'force-dynamic';
export const runtime         = 'nodejs';

/**
 * GET /api/meta/analise-campaigns?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Dedicated endpoint for Tráfego > Análise > Step 2.
 * Fetches ALL campaigns (ACTIVE + PAUSED + ARCHIVED) plus their spend
 * for the given period — independent of the main /api/meta route.
 *
 * Why a separate endpoint?
 * The main /api/meta route fetches the full dashboard (Hotmart + Meta summary).
 * That route must stay untouched to avoid breaking existing pages.
 * This endpoint is leaner: only campaigns list + campaign-level insights.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  try {
    const BASE = 'https://graph.facebook.com/v19.0';

    // ── 1. List ALL campaigns (ACTIVE + PAUSED + ARCHIVED) ────────────────────
    // Without effective_status, Meta defaults to ACTIVE only — that's why paused
    // campaigns appeared in the list but with spend="—".
    const campParams = new URLSearchParams({
      fields:           'id,name,status,effective_status,created_time,objective',
      effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']),
      limit:            '1000',
      access_token:     accessToken,
    });

    // ── 2. Campaign-level insights for the period ──────────────────────────────
    // Meta WILL return spend for paused campaigns that had delivery in the period.
    // We do NOT add effective_status here — it's not a valid top-level param for
    // the insights endpoint (adding it previously caused the dashboard to go blank).
    const insightFields = [
      'spend','impressions','clicks','actions','action_values',
      'ctr','cpc','outbound_clicks',
      'campaign_id','campaign_name',
      'cost_per_action_type',
      'landing_page_view_rate','unique_outbound_clicks',
    ].join(',');

    const insightParams = new URLSearchParams({
      fields:       insightFields,
      level:        'campaign',
      limit:        '1000',
      access_token: accessToken,
    });
    if (dateFrom && dateTo) {
      insightParams.set('time_range', JSON.stringify({ since: dateFrom, until: dateTo }));
    } else {
      insightParams.set('date_preset', 'last_30d');
    }

    // Fetch both in parallel
    const [campaignsRes, insightsRes] = await Promise.all([
      fetch(`${BASE}/${adAccountId}/campaigns?${campParams}`).then(r => r.json()),
      fetch(`${BASE}/${adAccountId}/insights?${insightParams}`).then(r => r.json()),
    ]);

    if (campaignsRes.error) throw new Error(JSON.stringify(campaignsRes.error));
    // Insights errors are non-fatal — we'll just have zero spend for all campaigns
    const insightsError = insightsRes.error
      ? `[Meta insights warning: ${JSON.stringify(insightsRes.error)}]`
      : null;

    const allCampaigns: any[] = campaignsRes.data || [];
    const allInsights:  any[] = insightsRes.data  || [];

    // Build spend lookup keyed by campaign_id
    const spendMap: Record<string, number> = {};
    for (const ins of allInsights) {
      const id    = ins.campaign_id;
      const spend = parseFloat(ins.spend || '0');
      spendMap[id] = (spendMap[id] || 0) + spend;
    }

    // Build actions lookup for leads/purchases
    const actionsMap: Record<string, { leads: number; purchases: number }> = {};
    for (const ins of allInsights) {
      const id      = ins.campaign_id;
      let leads     = 0;
      let purchases = 0;
      for (const a of ins.actions || []) {
        if (['lead', 'complete_registration'].includes(a.action_type)) leads     += Number(a.value || 0);
        if (['purchase', 'omni_purchase'    ].includes(a.action_type)) purchases += Number(a.value || 0);
      }
      actionsMap[id] = {
        leads:     (actionsMap[id]?.leads     || 0) + leads,
        purchases: (actionsMap[id]?.purchases || 0) + purchases,
      };
    }

    const campaigns = allCampaigns.map((c: any) => {
      const spend    = spendMap[c.id]    || 0;
      const actions  = actionsMap[c.id]  || { leads: 0, purchases: 0 };
      return {
        id:          c.id,
        name:        c.name,
        status:      c.effective_status || c.status,
        createdTime: c.created_time,
        objective:   mapObjective(c.objective || ''),
        spend,
        leads:       actions.leads,
        purchases:   actions.purchases,
      };
    }).sort((a: any, b: any) => {
      // Active first, then by spend descending
      const aActive = a.status === 'ACTIVE';
      const bActive = b.status === 'ACTIVE';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return  1;
      return b.spend - a.spend;
    });

    return NextResponse.json({
      campaigns,
      insightsError,
      dateFrom,
      dateTo,
    });

  } catch (err: any) {
    console.error('[analise-campaigns]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
