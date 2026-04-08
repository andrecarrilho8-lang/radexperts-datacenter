import { NextResponse } from 'next/server';
import { getCache, setCache, AD_INSIGHT_FIELDS, parseMetrics, mapObjective } from '@/app/lib/metaApi';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/meta/historico?type=ADS_VENDAS|ADS_LEADS|PAGES_VENDAS|PAGES_LEADS&force=0|1
 *
 * Rewritten to use direct HTTP fetch (no Meta Business SDK) to avoid timeouts.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type  = searchParams.get('type'); // ADS_VENDAS | ADS_LEADS | PAGES_VENDAS | PAGES_LEADS
  const force = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  if (!type) return NextResponse.json({ error: 'Missing type param' }, { status: 400 });

  const cacheKey = `historico_http|${type}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  const META_BASE = 'https://graph.facebook.com/v19.0';

  // Last 6 months range
  const dSince = new Date();
  dSince.setMonth(dSince.getMonth() - 6);
  const since = dSince.toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];

  try {
    const targetObj = type.includes('LEADS') ? 'LEADS' : 'VENDAS';

    // ── Step 1: Get campaigns and filter by objective ──────────────────────
    const campParams = new URLSearchParams({
      fields:       'id,objective',
      limit:        '1000',
      access_token: accessToken,
    });
    const campRes  = await fetch(`${META_BASE}/${adAccountId}/campaigns?${campParams}`,
                                 { signal: AbortSignal.timeout(20_000) });
    const campJson = await campRes.json();
    if (campJson.error) throw new Error(campJson.error.message);

    const allCampaigns: any[] = campJson.data || [];
    const validCampIds = allCampaigns
      .filter((c: any) => mapObjective(c.objective || '') === targetObj)
      .map((c: any) => c.id)
      .slice(0, 50); // limit for API safety

    if (validCampIds.length === 0)
      return NextResponse.json({ results: [] });

    // ── Step 2: Get ad-level insights filtered by campaign ─────────────────
    const insightFields = AD_INSIGHT_FIELDS.join(',');
    const insightParams = new URLSearchParams({
      fields:    insightFields,
      level:     'ad',
      limit:     '100',
      time_range: JSON.stringify({ since, until }),
      sort:      'spend_descending',
      filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: validCampIds }]),
      access_token: accessToken,
    });
    const insightRes  = await fetch(`${META_BASE}/${adAccountId}/insights?${insightParams}`,
                                    { signal: AbortSignal.timeout(30_000) });
    const insightJson = await insightRes.json();
    if (insightJson.error) throw new Error(insightJson.error.message);

    const rawAds: any[] = insightJson.data || [];
    const parsedAds = rawAds.map((d: any) => {
      const m = parseMetrics(d);
      const rawAccountId = adAccountId.replace('act_', '');
      return {
        id:            d.ad_id    || '',
        name:          d.ad_name  || '',
        campaignId:    d.campaign_id   || '',
        campaignName:  d.campaign_name || '',
        objective:     targetObj,
        adsManagerLink: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${rawAccountId}&selected_ad_ids=${d.ad_id}`,
        ...m,
      };
    }).filter((a: any) => a.id);

    // ── ADS_* types ────────────────────────────────────────────────────────
    if (type.startsWith('ADS_')) {
      let finalAds: any[];
      if (type === 'ADS_VENDAS') {
        finalAds = parsedAds.filter((a: any) => a.purchases > 0)
          .sort((a: any, b: any) => b.purchases - a.purchases).slice(0, 10);
      } else {
        finalAds = parsedAds.filter((a: any) => a.leads > 0)
          .sort((a: any, b: any) => b.leads - a.leads).slice(0, 10);
      }

      // ── Enrich with creatives ────────────────────────────────────────────
      if (finalAds.length > 0) {
        try {
          const adIds = finalAds.map((a: any) => a.id);
          const creativeFields = 'id,instagram_permalink_url,effective_instagram_story_id,preview_shareable_link,creative{id,object_story_id,thumbnail_url,image_url,body,object_story_spec,asset_feed_spec}';
          const creativeParams = new URLSearchParams({
            fields:    creativeFields,
            filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: adIds }]),
            limit:     '12',
            access_token: accessToken,
          });
          const creativeRes  = await fetch(`${META_BASE}/${adAccountId}/ads?${creativeParams}`,
                                           { signal: AbortSignal.timeout(15_000) });
          const creativeJson = await creativeRes.json();
          const rawAccountId = adAccountId.replace('act_', '');

          for (const ad of creativeJson.data || []) {
            const c = ad.creative || {};
            const target = finalAds.find((a: any) => a.id === ad.id);
            if (!target) continue;

            const thumb = c.image_url || c.thumbnail_url
              || c.object_story_spec?.video_data?.image_url
              || c.object_story_spec?.link_data?.image_url || '';
            if (thumb) target.thumbnailUrl = thumb;

            const body = c.body
              || c.object_story_spec?.link_data?.message
              || c.object_story_spec?.video_data?.message
              || c.asset_feed_spec?.bodies?.[0]?.text || '';
            if (body) target.body = body;

            let igLink = ad.instagram_permalink_url || ad.preview_shareable_link;
            if (!igLink && ad.effective_instagram_story_id)
              igLink = `https://www.instagram.com/reels/${ad.effective_instagram_story_id}/`;
            if (!igLink && c.object_story_id) {
              const parts = c.object_story_id.split('_');
              if (parts.length === 2 && parts[1].length > 10)
                igLink = `https://www.instagram.com/p/${parts[1]}/`;
            }
            if (!igLink)
              igLink = `https://www.facebook.com/ads/experience/preview/?ad_id=${ad.id}&platform=INSTAGRAM`;
            target.instagramPermalink = igLink;
          }
        } catch (e) {
          console.warn('[historico] Creative fetch skipped:', (e as any).message);
        }
      }

      const res = { results: finalAds };
      setCache(cacheKey, res);
      return NextResponse.json(res);
    }

    // ── PAGES_* types ──────────────────────────────────────────────────────
    if (type.startsWith('PAGES_')) {
      const isVendas = type === 'PAGES_VENDAS';
      const candidates = parsedAds
        .filter((a: any) => isVendas
          ? (a.landingPageViews >= 1 && a.purchases > 0)
          : (a.leads > 0 || (a.landingPageViews >= 1 && a.purchases > 0)))
        .sort((a: any, b: any) => b.landingPageViews - a.landingPageViews)
        .slice(0, 40);

      const candidateIds = candidates.map((a: any) => a.id);
      const adUrls: Record<string, string> = {};

      if (candidateIds.length > 0) {
        try {
          const urlParams = new URLSearchParams({
            fields:    'id,creative{object_story_spec,object_url}',
            filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: candidateIds }]),
            limit:     '40',
            access_token: accessToken,
          });
          const urlRes  = await fetch(`${META_BASE}/${adAccountId}/ads?${urlParams}`,
                                      { signal: AbortSignal.timeout(15_000) });
          const urlJson = await urlRes.json();

          for (const ad of urlJson.data || []) {
            let link = '';
            if (ad.creative) {
              link = ad.creative.object_story_spec?.link_data?.link
                  || ad.creative.object_story_spec?.video_data?.call_to_action?.value?.link
                  || ad.creative.object_url || '';
            }
            if (link) {
              try {
                const u = new URL(link);
                ['fbclid','utm_source','utm_medium','utm_campaign'].forEach(p => u.searchParams.delete(p));
                link = u.origin + u.pathname;
              } catch {}
            }
            if (link && !link.includes('instagram.com') && !link.includes('facebook.com'))
              adUrls[ad.id] = link;
          }
        } catch {}
      }

      const pagesMap: Record<string, any> = {};
      for (const ad of candidates) {
        const link = adUrls[ad.id];
        if (!link) continue;
        if (!pagesMap[link])
          pagesMap[link] = { url: link, spend: 0, landingPageViews: 0, purchases: 0, leads: 0, salesVolume: 0 };
        const p = pagesMap[link];
        p.spend            += ad.spend;
        p.landingPageViews += ad.landingPageViews;
        p.purchases        += ad.purchases;
        p.leads            += ad.leads;
        p.salesVolume      += ad.revenue || 0;
      }

      const pagesArr = Object.values(pagesMap).map((p: any) => ({
        ...p,
        salesConv: p.landingPageViews > 0 ? (p.purchases / p.landingPageViews) * 100 : 0,
        leadsConv: p.landingPageViews > 0 ? (p.leads    / p.landingPageViews) * 100 : 0,
        cpa:       p.purchases > 0 ? p.spend / p.purchases : 0,
        cpl:       p.leads     > 0 ? p.spend / p.leads     : 0,
      }));

      let finalPages: any[];
      if (isVendas)
        finalPages = pagesArr.filter((p: any) => p.purchases >= 1)
          .sort((a: any, b: any) => b.salesConv - a.salesConv).slice(0, 10);
      else
        finalPages = pagesArr.filter((p: any) => p.leads >= 1)
          .sort((a: any, b: any) => b.leadsConv - a.leadsConv).slice(0, 10);

      const res = { results: finalPages };
      setCache(cacheKey, res);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });

  } catch (err: any) {
    console.error('[historico] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
