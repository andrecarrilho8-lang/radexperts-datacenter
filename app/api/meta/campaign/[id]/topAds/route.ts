import { NextResponse } from 'next/server';
import { getCache, setCache, parseMetrics } from '@/app/lib/metaApi';

const BASE = 'https://graph.facebook.com/v19.0';
const AD_FIELDS = 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,outbound_clicks,cpc,ctr,actions,action_values';
const CREATIVE_FIELDS = 'id,effective_status,instagram_permalink_url,effective_instagram_story_id,preview_shareable_link,creative{id,object_story_id,thumbnail_url,image_url,body,object_story_spec,asset_feed_spec}';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const { searchParams } = new URL(request.url);
  const dateFrom   = searchParams.get('dateFrom');
  const dateTo     = searchParams.get('dateTo');
  const objective  = searchParams.get('objective') || 'VENDAS';
  const force      = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN!;
  const adAccountId = process.env.META_AD_ACCOUNT_ID!;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `topAds|${campaignId}|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const rawAccountId = adAccountId.replace('act_', '');
    const timeRange = dateFrom && dateTo ? { since: dateFrom, until: dateTo } : undefined;

    // Ad insights
    const p = new URLSearchParams({
      access_token: accessToken,
      fields: AD_FIELDS,
      level: 'ad',
      limit: '100',
      sort: '["spend_descending"]',
      filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
      ...(timeRange ? { time_range: JSON.stringify(timeRange) } : { date_preset: 'last_30d' }),
    });

    const insRes = await fetch(`${BASE}/${adAccountId}/insights?${p}`);
    const insJson = await insRes.json();
    if (insJson.error) throw new Error(insJson.error.message);

    const parsedAds = (insJson.data || []).map((d: any) => ({
      id: d.ad_id || '',
      name: d.ad_name || '',
      campaignId,
      adsManagerLink: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${rawAccountId}&selected_ad_ids=${d.ad_id}`,
      ...parseMetrics(d),
    })).filter((a: any) => a.id);

    let topAds = objective === 'LEADS'
      ? parsedAds.sort((a: any, b: any) => b.leads - a.leads).slice(0, 10)
      : parsedAds.sort((a: any, b: any) => b.purchases - a.purchases).slice(0, 10);

    // Fetch creatives
    const priorityIds = topAds.map((a: any) => a.id).filter(Boolean);
    if (priorityIds.length > 0) {
      try {
        const cp = new URLSearchParams({
          access_token: accessToken,
          fields: CREATIVE_FIELDS,
          filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: priorityIds }]),
          limit: '12',
        });
        const crRes = await fetch(`${BASE}/${adAccountId}/ads?${cp}`);
        const crJson = await crRes.json();

        const thumbMap: Record<string, string> = {};
        const igMap:    Record<string, string> = {};
        const urlMap:   Record<string, string> = {};
        const bodyMap:  Record<string, string> = {};
        const statusMap:Record<string, string> = {};

        for (const ad of (crJson.data || [])) {
          const c = ad.creative || {};
          if (ad.effective_status) statusMap[ad.id] = ad.effective_status;
          const thumb = c.image_url || c.thumbnail_url || c.object_story_spec?.video_data?.image_url || c.object_story_spec?.link_data?.image_url || '';
          if (thumb) thumbMap[ad.id] = thumb;
          const body = c.body || c.object_story_spec?.link_data?.message || c.object_story_spec?.video_data?.message || c.asset_feed_spec?.bodies?.[0]?.text || '';
          if (body) bodyMap[ad.id] = body;
          const spec = c.object_story_spec || {};
          const lpUrl = spec.link_data?.link || spec.video_data?.call_to_action?.value?.link || spec.link_data?.call_to_action?.value?.link || spec.link_data?.child_attachments?.[0]?.link || '';
          if (lpUrl) urlMap[ad.id] = lpUrl;
          let igLink = ad.instagram_permalink_url || ad.preview_shareable_link;
          if (!igLink && ad.effective_instagram_story_id) igLink = `https://www.instagram.com/reels/${ad.effective_instagram_story_id}/`;
          if (!igLink && c.object_story_id) { const parts = c.object_story_id.split('_'); if (parts.length === 2) igLink = `https://www.instagram.com/p/${parts[1]}/`; }
          if (!igLink) igLink = `https://www.facebook.com/ads/experience/preview/?ad_id=${ad.id}&platform=INSTAGRAM`;
          if (igLink) igMap[ad.id] = igLink;
        }

        for (const ad of topAds as any[]) {
          if (thumbMap[ad.id])  ad.thumbnailUrl = thumbMap[ad.id];
          if (igMap[ad.id])     ad.instagramPermalink = igMap[ad.id];
          if (urlMap[ad.id])    ad.landingPageUrl = urlMap[ad.id];
          if (bodyMap[ad.id])   ad.body = bodyMap[ad.id];
          if (statusMap[ad.id]) ad.adStatus = statusMap[ad.id];
        }
      } catch (e) { console.warn('[topAds] creatives skipped:', (e as any).message); }
    }

    const result = { topAds };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[topAds] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
