import { NextResponse } from 'next/server';
import { getCache, setCache, mapObjective, parseMetrics } from '@/app/lib/metaApi';

const BASE = 'https://graph.facebook.com/v19.0';

const INSIGHT_FIELDS = [
  'campaign_name','campaign_id','spend','impressions',
  'clicks','outbound_clicks','cpc','ctr',
  'actions','action_values','date_start',
].join(',');

const AD_INSIGHT_FIELDS = [
  'ad_id','ad_name','campaign_id','campaign_name','spend','impressions',
  'clicks','outbound_clicks','cpc','ctr','actions','action_values',
].join(',');

async function gql(path: string, params: Record<string, any>, token: string) {
  const p = new URLSearchParams({ access_token: token, ...params });
  // Stringify objects/arrays
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'object') p.set(k, JSON.stringify(v));
  }
  const res = await fetch(`${BASE}/${path}?${p}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom   = searchParams.get('dateFrom');
  const dateTo     = searchParams.get('dateTo');
  const campaignId = searchParams.get('campaignId');
  const force      = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN!;
  const adAccountId = process.env.META_AD_ACCOUNT_ID!;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `chart|${dateFrom}|${dateTo}|${campaignId || 'all'}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const rawAccountId = adAccountId.replace('act_', '');
    const timeRange = dateFrom && dateTo ? { since: dateFrom, until: dateTo } : undefined;

    const baseInsightParams: Record<string, any> = {
      fields: INSIGHT_FIELDS,
      ...(timeRange ? { time_range: timeRange } : { date_preset: 'last_30d' }),
    };

    // 1. Daily insights for chart
    const dailyRes = await gql(`${adAccountId}/insights`, {
      ...baseInsightParams,
      level: campaignId ? 'campaign' : 'account',
      time_increment: '1',
      limit: '90',
      ...(campaignId ? { filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }] } : {}),
    }, accessToken);
    const dailyInsights: any[] = dailyRes.data || [];

    // 2. Top campaigns by spend (for ad filter)
    let topCampaignIds: string[] = [];
    if (!campaignId) {
      const campSpendRes = await gql(`${adAccountId}/insights`, {
        fields: 'campaign_id,spend',
        level: 'campaign',
        limit: '50',
        sort: '["spend_descending"]',
        ...(timeRange ? { time_range: timeRange } : { date_preset: 'last_30d' }),
      }, accessToken);
      topCampaignIds = (campSpendRes.data || []).map((c: any) => c.campaign_id).filter(Boolean);
    }

    // 3. Campaign objectives
    const campObjRes = await gql(`${adAccountId}/campaigns`, {
      fields: 'id,objective,effective_status',
      limit: '200',
    }, accessToken);
    const campaignMeta: Record<string, any> = {};
    for (const c of (campObjRes.data || [])) {
      campaignMeta[c.id] = { objective: mapObjective(c.objective || ''), status: c.effective_status || '' };
    }

    // 4. Ad-level insights
    const adFilter = campaignId
      ? [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]
      : topCampaignIds.length > 0
        ? [{ field: 'campaign.id', operator: 'IN', value: topCampaignIds }]
        : [];

    let adInsights: any[] = [];
    if (adFilter.length > 0 || !campaignId) {
      const adRes = await gql(`${adAccountId}/insights`, {
        fields: AD_INSIGHT_FIELDS,
        level: 'ad',
        limit: '60',
        sort: '["spend_descending"]',
        ...(timeRange ? { time_range: timeRange } : { date_preset: 'last_30d' }),
        ...(adFilter.length > 0 ? { filtering: adFilter } : {}),
      }, accessToken).catch(() => ({ data: [] }));
      adInsights = adRes.data || [];
    }

    // 5. Build chartData
    const chartData = dailyInsights
      .sort((a: any, b: any) => (a.date_start || '').localeCompare(b.date_start || ''))
      .map((day: any) => {
        const m = parseMetrics(day);
        return {
          date: new Date(day.date_start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          Investimento: m.spend,
          Leads:  m.leads,
          Vendas: m.purchases,
        };
      });

    // 6. Parse ads
    const parsedAds = adInsights.map((d: any) => {
      const meta = campaignMeta[d.campaign_id] || {};
      return {
        id: d.ad_id || '',
        name: d.ad_name || '',
        campaignId: d.campaign_id || '',
        campaignName: d.campaign_name || '',
        objective: meta.objective || 'OUTROS',
        thumbnailUrl: null as string | null,
        instagramPermalink: null as string | null,
        landingPageUrl: null as string | null,
        body: null as string | null,
        adsManagerLink: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${rawAccountId}&selected_ad_ids=${d.ad_id}`,
        ...parseMetrics(d),
      };
    }).filter((a: any) => a.id);

    const topSalesUnsorted = parsedAds.filter((a: any) => a.objective === 'VENDAS').sort((a: any, b: any) => b.purchases - a.purchases).slice(0, 3);
    const topLeadsUnsorted = parsedAds.filter((a: any) => a.objective === 'LEADS').sort((a: any, b: any) => b.leads - a.leads).slice(0, 3);
    const priorityIds = [...topSalesUnsorted, ...topLeadsUnsorted].map((a: any) => a.id).filter(Boolean);

    // 7. Fetch creative thumbnails
    if (priorityIds.length > 0) {
      try {
        const creativeFields = 'id,instagram_permalink_url,preview_shareable_link,effective_instagram_story_id,creative{id,thumbnail_url,image_url,body,object_story_id,object_story_spec,asset_feed_spec}';
        const filterParam = JSON.stringify([{ field: 'id', operator: 'IN', value: priorityIds }]);
        const adsRes = await gql(`${adAccountId}/ads`, {
          fields: creativeFields,
          filtering: filterParam,
          limit: '10',
        }, accessToken);

        const thumbMap: Record<string, string> = {};
        const igMap:    Record<string, string> = {};
        const urlMap:   Record<string, string> = {};
        const bodyMap:  Record<string, string> = {};

        for (const ad of (adsRes.data || [])) {
          const c = ad.creative || {};
          const thumb = c.image_url || c.thumbnail_url || c.object_story_spec?.video_data?.image_url || c.object_story_spec?.link_data?.image_url || '';
          if (thumb) thumbMap[ad.id] = thumb;
          const body = c.body || c.object_story_spec?.link_data?.message || c.object_story_spec?.video_data?.message || c.asset_feed_spec?.bodies?.[0]?.text || '';
          if (body) bodyMap[ad.id] = body;
          const url = c.object_story_spec?.link_data?.link || c.object_story_spec?.video_data?.call_to_action?.value?.link || '';
          if (url) urlMap[ad.id] = url;
          let igLink = ad.instagram_permalink_url || ad.preview_shareable_link;
          if (!igLink && ad.effective_instagram_story_id) igLink = `https://www.instagram.com/reels/${ad.effective_instagram_story_id}/`;
          if (!igLink && c.object_story_id) { const parts = c.object_story_id.split('_'); if (parts.length === 2) igLink = `https://www.instagram.com/p/${parts[1]}/`; }
          if (!igLink) igLink = `https://www.facebook.com/ads/experience/preview/?ad_id=${ad.id}&platform=INSTAGRAM`;
          if (igLink) igMap[ad.id] = igLink;
        }

        for (const ad of parsedAds as any[]) {
          if (thumbMap[ad.id]) ad.thumbnailUrl = thumbMap[ad.id];
          if (igMap[ad.id])    ad.instagramPermalink = igMap[ad.id];
          if (urlMap[ad.id])   ad.landingPageUrl = urlMap[ad.id];
          if (bodyMap[ad.id])  ad.body = bodyMap[ad.id];
        }
      } catch (e) {
        console.warn('[chart] Thumbnail fetch skipped:', (e as any).message);
      }
    }

    const topSalesAds = parsedAds.filter((a: any) => a.objective === 'VENDAS').sort((a: any, b: any) => b.purchases - a.purchases).slice(0, 3);
    const topLeadsAds = parsedAds.filter((a: any) => a.objective === 'LEADS').sort((a: any, b: any) => b.leads - a.leads).slice(0, 3);

    const result = { chartData, topSalesAds, topLeadsAds };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[/api/meta/chart] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
