import { NextResponse } from 'next/server';
import { getCache, setCache, parseMetrics, mapObjective } from '@/app/lib/metaApi';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/meta/historico?type=ADS_VENDAS|ADS_LEADS|PAGES_VENDAS|PAGES_LEADS&force=0|1
 *
 * Strategy:
 * 1. Fetch all campaigns → build objective map (campaignId → 'VENDAS'|'LEADS')
 * 2. Fetch ad-level insights for the whole account (no campaign filter — Graph API limitation)
 * 3. Filter client-side by campaign objective
 * 4. Enrich ads with creatives (thumbnail, body, IG link)
 * 5. For PAGES_*: extract landing page URLs from ad creatives, aggregate by URL
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type  = searchParams.get('type');
  const force = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  if (!type) return NextResponse.json({ error: 'Missing type param' }, { status: 400 });

  const cacheKey = `historico_v2|${type}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  const META_BASE = 'https://graph.facebook.com/v19.0';
  const rawAccountId = adAccountId.replace('act_', '');

  // Last 6 months
  const dSince = new Date();
  dSince.setMonth(dSince.getMonth() - 6);
  const since = dSince.toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];

  const targetObj = type.includes('LEADS') ? 'LEADS' : 'VENDAS';

  try {
    // ── Step 1: All campaigns → objective map ────────────────────────────────
    const campParams = new URLSearchParams({
      fields: 'id,objective',
      limit:  '1000',
      access_token: accessToken,
    });
    const campRes  = await fetch(`${META_BASE}/${adAccountId}/campaigns?${campParams}`,
                                 { signal: AbortSignal.timeout(20_000) });
    const campJson = await campRes.json();
    if (campJson.error) throw new Error(`Campaigns: ${campJson.error.message}`);

    const objMap: Record<string, string> = {}; // campId → 'VENDAS'|'LEADS'|'OUTROS'
    for (const c of (campJson.data || [])) {
      objMap[c.id] = mapObjective(c.objective || '');
    }

    // ── Step 2: Ad-level insights, account scope ─────────────────────────────
    const insFields = [
      'ad_id','ad_name','campaign_id','campaign_name',
      'spend','impressions','clicks','outbound_clicks',
      'cpc','ctr','actions','action_values',
    ].join(',');

    const insParams = new URLSearchParams({
      fields:     insFields,
      level:      'ad',
      time_range: JSON.stringify({ since, until }),
      sort:       'spend_descending',
      limit:      '500',
      access_token: accessToken,
    });
    const insRes  = await fetch(`${META_BASE}/${adAccountId}/insights?${insParams}`,
                                { signal: AbortSignal.timeout(30_000) });
    const insJson = await insRes.json();
    if (insJson.error) throw new Error(`Insights: ${insJson.error.message}`);

    // ── Step 3: Parse + filter by objective ──────────────────────────────────
    const allAds = (insJson.data || [])
      .filter((d: any) => objMap[d.campaign_id] === targetObj)
      .map((d: any) => {
        const m = parseMetrics(d);
        return {
          id:           d.ad_id         || '',
          name:         d.ad_name       || '',
          campaignId:   d.campaign_id   || '',
          campaignName: d.campaign_name || '',
          objective:    targetObj,
          adsManagerLink: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${rawAccountId}&selected_ad_ids=${d.ad_id}`,
          ...m,
        };
      })
      .filter((a: any) => a.id && a.spend > 0);

    // ── ADS_VENDAS / ADS_LEADS ────────────────────────────────────────────────
    if (type.startsWith('ADS_')) {
      const isVendas = type === 'ADS_VENDAS';
      const sorted   = allAds
        .filter((a: any) => isVendas ? a.purchases > 0 : a.leads > 0)
        .sort((a: any, b: any) => isVendas ? b.purchases - a.purchases : b.leads - a.leads)
        .slice(0, 10);

      // Enrich creatives
      if (sorted.length > 0) {
        try {
          const adIds = sorted.map((a: any) => a.id);
          const creativeParams = new URLSearchParams({
            fields:    'id,instagram_permalink_url,effective_instagram_story_id,preview_shareable_link,creative{id,object_story_id,thumbnail_url,image_url,body,object_story_spec,asset_feed_spec}',
            filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: adIds }]),
            limit:     '12',
            access_token: accessToken,
          });
          const crRes  = await fetch(`${META_BASE}/${adAccountId}/ads?${creativeParams}`,
                                     { signal: AbortSignal.timeout(15_000) });
          const crJson = await crRes.json();

          for (const ad of (crJson.data || [])) {
            const c      = ad.creative || {};
            const target = sorted.find((a: any) => a.id === ad.id);
            if (!target) continue;

            target.thumbnailUrl = c.image_url || c.thumbnail_url
              || c.object_story_spec?.video_data?.image_url
              || c.object_story_spec?.link_data?.image_url || '';

            target.body = c.body
              || c.object_story_spec?.link_data?.message
              || c.object_story_spec?.video_data?.message
              || c.asset_feed_spec?.bodies?.[0]?.text || '';

            let igLink = ad.instagram_permalink_url || ad.preview_shareable_link || '';
            if (!igLink && ad.effective_instagram_story_id)
              igLink = `https://www.instagram.com/reel/${ad.effective_instagram_story_id}/`;
            if (!igLink && c.object_story_id) {
              const parts = (c.object_story_id as string).split('_');
              if (parts.length === 2 && parts[1].length > 10)
                igLink = `https://www.instagram.com/p/${parts[1]}/`;
            }
            target.instagramPermalink = igLink
              || `https://www.facebook.com/ads/experience/preview/?ad_id=${ad.id}&platform=INSTAGRAM`;
          }
        } catch (e) {
          console.warn('[historico] Creative enrichment skipped:', (e as any).message);
        }
      }

      const res = { results: sorted };
      setCache(cacheKey, res);
      return NextResponse.json(res);
    }

    // ── PAGES_VENDAS / PAGES_LEADS ────────────────────────────────────────────
    if (type.startsWith('PAGES_')) {
      const isVendas = type === 'PAGES_VENDAS';

      // Filter relevant ads
      const candidates = allAds
        .filter((a: any) => isVendas ? a.landingPageViews >= 1 && a.purchases > 0 : a.leads > 0)
        .sort((a: any, b: any) => b.landingPageViews - a.landingPageViews)
        .slice(0, 60);

      // Fetch URLs for those ads
      const adUrls: Record<string, string> = {};
      if (candidates.length > 0) {
        try {
          const adIds = candidates.map((a: any) => a.id);
          const urlParams = new URLSearchParams({
            fields:    'id,creative{object_story_spec,object_url}',
            filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: adIds }]),
            limit:     '60',
            access_token: accessToken,
          });
          const urlRes  = await fetch(`${META_BASE}/${adAccountId}/ads?${urlParams}`,
                                      { signal: AbortSignal.timeout(15_000) });
          const urlJson = await urlRes.json();

          for (const ad of (urlJson.data || [])) {
            let link = ad.creative?.object_story_spec?.link_data?.link
                    || ad.creative?.object_story_spec?.video_data?.call_to_action?.value?.link
                    || ad.creative?.object_url || '';
            if (link) {
              try {
                const u = new URL(link);
                ['fbclid','utm_source','utm_medium','utm_campaign','utm_content'].forEach(p => u.searchParams.delete(p));
                link = u.origin + u.pathname;
              } catch {}
            }
            if (link && !link.includes('instagram.com') && !link.includes('facebook.com'))
              adUrls[ad.id] = link;
          }
        } catch (e) {
          console.warn('[historico] URL fetch skipped:', (e as any).message);
        }
      }

      const pagesMap: Record<string, any> = {};
      for (const ad of candidates) {
        const link = adUrls[ad.id];
        if (!link) continue;
        if (!pagesMap[link])
          pagesMap[link] = { url: link, spend: 0, landingPageViews: 0, purchases: 0, leads: 0, salesVolume: 0 };
        pagesMap[link].spend            += ad.spend;
        pagesMap[link].landingPageViews += ad.landingPageViews;
        pagesMap[link].purchases        += ad.purchases;
        pagesMap[link].leads            += ad.leads;
        pagesMap[link].salesVolume      += ad.revenue || 0;
      }

      let finalPages = Object.values(pagesMap).map((p: any) => ({
        ...p,
        salesConv: p.landingPageViews > 0 ? (p.purchases / p.landingPageViews) * 100 : 0,
        leadsConv: p.landingPageViews > 0 ? (p.leads    / p.landingPageViews) * 100 : 0,
        cpa:       p.purchases > 0 ? p.spend / p.purchases : 0,
        cpl:       p.leads     > 0 ? p.spend / p.leads     : 0,
      }));

      finalPages = isVendas
        ? finalPages.filter(p => p.purchases >= 1).sort((a, b) => b.salesConv - a.salesConv).slice(0, 10)
        : finalPages.filter(p => p.leads     >= 1).sort((a, b) => b.leadsConv  - a.leadsConv ).slice(0, 10);

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
