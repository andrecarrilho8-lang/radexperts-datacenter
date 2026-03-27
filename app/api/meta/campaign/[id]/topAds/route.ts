import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, parseMetrics, AD_INSIGHT_FIELDS } from '@/app/lib/metaApi';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const objective = searchParams.get('objective') || 'VENDAS';
  
  if (!campaignId) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `topAds|${campaignId}|${dateFrom}|${dateTo}`;
  const force = searchParams.get('force') === '1';
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const { AdAccount } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);
    const rawAccountId = adAccountId.replace('act_', '');

    const dateRange = dateFrom && dateTo
      ? { time_range: { since: dateFrom, until: dateTo } }
      : { date_preset: 'last_30d' };

    const adParams: any = {
      level: 'ad',
      limit: 100,
      ...dateRange,
      filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
    };

    const adInsights = await account.getInsights(AD_INSIGHT_FIELDS, adParams);

    const parsedAds = adInsights.map((data: any) => {
      const m = parseMetrics(data);
      return {
        id: data.ad_id || '',
        name: data.ad_name || '',
        campaignId,
        adsManagerLink: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${adAccountId.replace('act_', '')}&selected_ad_ids=${data.ad_id}`,
        ...m,
      };
    });

    let topAds = [];
    if (objective === 'LEADS') {
      topAds = parsedAds.sort((a: any, b: any) => b.leads - a.leads).slice(0, 10);
    } else {
      // Vendas or Outros (default to purchases)
      topAds = parsedAds.sort((a: any, b: any) => b.purchases - a.purchases).slice(0, 10);
    }

    const priorityIds = topAds.map((a: any) => a.id).filter(Boolean);
    if (priorityIds.length > 0) {
      try {
        const adsWithCreative = await account.getAds(
          ['id', 'effective_status', 'instagram_permalink_url', 'effective_instagram_story_id', 'preview_shareable_link', 'creative{id,object_story_id,thumbnail_url,image_url,body,object_story_spec,asset_feed_spec}'],
          { filtering: [{ field: 'id', operator: 'IN', value: priorityIds }], limit: 12 }
        );
        const thumbMap: Record<string, string> = {};
        const igMap: Record<string, string> = {};
        const urlMap: Record<string, string> = {};
        const bodyMap: Record<string, string> = {};
        const statusMap: Record<string, string> = {};

        for (const ad of adsWithCreative) {
          const c = ad.creative || {};
          if (ad.effective_status) statusMap[ad.id] = ad.effective_status;
          const thumb = c.image_url || c.thumbnail_url || c.object_story_spec?.video_data?.image_url || c.object_story_spec?.link_data?.image_url || '';
          if (thumb) thumbMap[ad.id] = thumb;
          
          const body = c.body || 
                       c.object_story_spec?.link_data?.message || 
                       c.object_story_spec?.video_data?.message || 
                       c.asset_feed_spec?.bodies?.[0]?.text || 
                       c.object_story_spec?.link_data?.description || '';
          if (body) bodyMap[ad.id] = body;
          
          // Ordem de preferência para link do Instagram
          let igLink = ad.instagram_permalink_url || ad.preview_shareable_link;
          if (!igLink && ad.effective_instagram_story_id) igLink = `https://www.instagram.com/reels/${ad.effective_instagram_story_id}/`;
          
          if (!igLink && c.object_story_id) {
             const parts = c.object_story_id.split('_');
             if (parts.length === 2 && parts[1].length > 10) igLink = `https://www.instagram.com/p/${parts[1]}/`;
          }
          if (!igLink) igLink = `https://www.facebook.com/ads/experience/preview/?ad_id=${ad.id}&platform=INSTAGRAM`;
          if (igLink) igMap[ad.id] = igLink;

          // Extração da Página de Destino (Landing Page) Real
          let lpUrl = '';
          const spec = c.object_story_spec || {};
          
          // 1. Link Data (Imagens/Carrossel)
          if (spec.link_data?.link) {
            lpUrl = spec.link_data.link;
          } 
          // 2. Video Data / Call to Action
          else if (spec.video_data?.call_to_action?.value?.link) {
            lpUrl = spec.video_data.call_to_action.value.link;
          }
          // 3. Fallback Link Data Call to Action
          else if (spec.link_data?.call_to_action?.value?.link) {
            lpUrl = spec.link_data.call_to_action.value.link;
          }
          // 4. Se for carrossel antigo
          else if (spec.link_data?.child_attachments?.[0]?.link) {
            lpUrl = spec.link_data.child_attachments[0].link;
          }

          if (lpUrl) urlMap[ad.id] = lpUrl;
        }

        for (const ad of topAds as any[]) {
          if (thumbMap[ad.id])  ad.thumbnailUrl = thumbMap[ad.id];
          if (igMap[ad.id])     ad.instagramPermalink = igMap[ad.id];
          if (urlMap[ad.id])    ad.landingPageUrl = urlMap[ad.id];
          if (bodyMap[ad.id])   ad.body = bodyMap[ad.id];
          if (statusMap[ad.id]) ad.adStatus = statusMap[ad.id];
        }
      } catch (e) {
        console.warn('[/topAds] Instagram link fetch skipped:', (e as any).message);
      }
    }

    const result = { topAds };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[/api/meta/campaign/[id]/topAds] Error:', error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta topAds API error' }, { status: 500 });
  }
}
