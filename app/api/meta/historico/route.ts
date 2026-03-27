import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, mapObjective, parseMetrics, AD_INSIGHT_FIELDS } from '@/app/lib/metaApi';

export async function GET(request: Request) {
  const { searchParams }   = new URL(request.url);
  const type               = searchParams.get('type'); // ADS_VENDAS, ADS_LEADS, PAGES_VENDAS, PAGES_LEADS, ALL
  const force              = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `historico|last_6_months_v2|${type || 'ALL'}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const { AdAccount } = initSDK(accessToken);
    const account       = new AdAccount(adAccountId);
    const rawAccountId  = adAccountId.replace('act_', '');

    // Calcula 6 meses rigorosamente via time_range para não dar tilt no Facebook API
    const dSince = new Date();
    dSince.setMonth(dSince.getMonth() - 6);
    const timeRange = { time_range: { since: dSince.toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] } };

    if (!type || type === 'ALL') {
       // Should not happen anymore, but just return empty if called
       return NextResponse.json({ results: [] });
    }

    // 1. Pega RÁPIDO apenas 1000 campanhas ativas para poder mapear os objetivos de longe!
    const campaignsObj = await account.getCampaigns(['id', 'objective'], { limit: 1000 });
    
    // Filtra IDs de campanhas por objetivo
    const targetObj = type.includes('LEADS') ? 'LEADS' : 'VENDAS';
    const validCampIds = campaignsObj
      .filter((c: any) => mapObjective(c.objective || '') === targetObj)
      .map((c: any) => c.id);

    if (validCampIds.length === 0) {
       return NextResponse.json({ results: [] });
    }

    // Se houverem campanhas demais, cortamos em 50 para garantir velocidade na API Graph
    const safeCampIds = validCampIds.slice(0, 50);

    const adParams: any = {
      level: 'ad', 
      limit: 100, // Limite baixo! Apenas 100 melhores anúncios do histórico inteiro, ordenados nativamente
      ...timeRange,
      sort: ['spend_descending'],
      filtering: [{ field: 'campaign.id', operator: 'IN', value: safeCampIds }]
    };

    const rawAdInsights = await account.getInsights(AD_INSIGHT_FIELDS, adParams);

    const parsedAds = rawAdInsights.map((data: any) => {
      const m = parseMetrics(data);
      return {
        id: data.ad_id || '',
        name: data.ad_name || '',
        campaignId: data.campaign_id || '',
        campaignName: data.campaign_name || '',
        objective: targetObj,
        adsManagerLink: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${rawAccountId}&selected_ad_ids=${data.ad_id}`,
        ...m,
      };
    }).filter((a: any) => a.id);

    if (type.startsWith('ADS_')) {
      let finalAds = [];
      if (type === 'ADS_VENDAS') {
        finalAds = parsedAds.filter((a: any) => a.purchases > 0).sort((a: any, b: any) => b.purchases - a.purchases).slice(0, 10);
      } else {
        finalAds = parsedAds.filter((a: any) => a.leads > 0).sort((a: any, b: any) => b.leads - a.leads).slice(0, 10);
      }
      
      if (finalAds.length > 0) {
        try {
          const finalIds = finalAds.map((a: any) => a.id);
          const adsWithCreative = await account.getAds(
            ['id', 'instagram_permalink_url', 'effective_instagram_story_id', 'preview_shareable_link', 'creative{id,object_story_id,thumbnail_url,image_url,body,object_story_spec,asset_feed_spec}'],
            { filtering: [{ field: 'id', operator: 'IN', value: finalIds }], limit: 12 }
          );
          
          const thumbMap: Record<string, string> = {};
          const igMap:    Record<string, string> = {};
          const urlMap:   Record<string, string> = {};
          const bodyMap:  Record<string, string> = {};
          
          for (const ad of adsWithCreative) {
            const c = ad.creative || {};
            const thumb = c.image_url || c.thumbnail_url || c.object_story_spec?.video_data?.image_url || c.object_story_spec?.link_data?.image_url || '';
            if (thumb) thumbMap[ad.id] = thumb;
            
            const body = c.body || 
                         c.object_story_spec?.link_data?.message || 
                         c.object_story_spec?.video_data?.message || 
                         c.asset_feed_spec?.bodies?.[0]?.text || 
                         c.object_story_spec?.link_data?.description || '';
            if (body) bodyMap[ad.id] = body;
            
            let igLink = ad.instagram_permalink_url || ad.preview_shareable_link;
            if (!igLink && ad.effective_instagram_story_id) {
               igLink = `https://www.instagram.com/reels/${ad.effective_instagram_story_id}/`;
            }
            if (!igLink && c.object_story_id) {
               const parts = c.object_story_id.split('_');
               if (parts.length === 2 && parts[1].length > 10) {
                  igLink = `https://www.instagram.com/p/${parts[1]}/`;
               }
            }
            if (!igLink) {
               igLink = `https://www.facebook.com/ads/experience/preview/?ad_id=${ad.id}&platform=INSTAGRAM`;
            }
            if (igLink) igMap[ad.id] = igLink;

            // Extração da Página de Destino Real
            let lpUrl = '';
            const spec = c.object_story_spec || {};
            if (spec.link_data?.link) lpUrl = spec.link_data.link;
            else if (spec.video_data?.call_to_action?.value?.link) lpUrl = spec.video_data.call_to_action.value.link;
            else if (spec.link_data?.call_to_action?.value?.link) lpUrl = spec.link_data.call_to_action.value.link;
            else if (spec.link_data?.child_attachments?.[0]?.link) lpUrl = spec.link_data.child_attachments[0].link;
            else if (c.object_url) lpUrl = c.object_url;

            if (lpUrl) {
              try {
                const u = new URL(lpUrl);
                u.searchParams.delete('fbclid');
                u.searchParams.delete('utm_source');
                u.searchParams.delete('utm_medium');
                u.searchParams.delete('utm_campaign');
                lpUrl = u.origin + u.pathname;
              } catch (e) {}
              urlMap[ad.id] = lpUrl;
            }
          }
          
          for (const ad of finalAds) {
            if (thumbMap[ad.id]) ad.thumbnailUrl = thumbMap[ad.id];
            if (igMap[ad.id])    ad.instagramPermalink = igMap[ad.id];
            if (urlMap[ad.id])   ad.landingPageUrl = urlMap[ad.id];
            if (bodyMap[ad.id])  ad.body = bodyMap[ad.id];
          }
        } catch (e) {
          console.warn('[/historico] Thumbnail fetch skipped:', (e as any).message);
        }
      }

      const res = { results: finalAds };
      setCache(cacheKey, res);
      return NextResponse.json(res);
    }

    if (type.startsWith('PAGES_')) {
      const isVendasPage = type === 'PAGES_VENDAS';
      const pagesCandidates = parsedAds
        .filter((a: any) => {
          if (isVendasPage) return a.landingPageViews >= 1 && a.purchases > 0;
          // For LEADS: include ads with leads even if no landingPageViews
          return a.leads > 0 || (a.landingPageViews >= 1 && a.purchases > 0);
        })
        .sort((a: any, b: any) => b.landingPageViews - a.landingPageViews)
        .slice(0, 40);

      const candidateIds = pagesCandidates.map((a: any) => a.id);
      const adUrls: Record<string, string> = {};

      if (candidateIds.length > 0) {
        try {
          const adsWithCreative = await account.getAds(
            ['id', 'creative{object_story_spec, object_url}'],
            { filtering: [{ field: 'id', operator: 'IN', value: candidateIds }], limit: 40 }
          );

          for (const ad of adsWithCreative) {
            let link = '';
            if (ad.creative) {
              link = ad.creative.object_story_spec?.link_data?.link || 
                     ad.creative.object_story_spec?.video_data?.call_to_action?.value?.link || 
                     ad.creative.object_url || '';
            }
            if (link) {
              try {
                const u = new URL(link);
                u.searchParams.delete('fbclid');
                u.searchParams.delete('utm_source');
                u.searchParams.delete('utm_medium');
                u.searchParams.delete('utm_campaign');
                link = u.origin + u.pathname;
              } catch (e) {}
            }
            if (link && !link.includes('instagram.com') && !link.includes('facebook.com')) {
              adUrls[ad.id] = link;
            }
          }
        } catch (e) {
          console.warn('[/historico] Creative fetch skipped:', (e as any).message);
        }
      }

      const pagesMap: Record<string, any> = {};
      for (const ad of pagesCandidates) {
        const link = adUrls[ad.id];
        if (!link) continue;
        
        if (!pagesMap[link]) {
          pagesMap[link] = { url: link, spend: 0, landingPageViews: 0, purchases: 0, leads: 0, salesVolume: 0 };
        }
        
        const p = pagesMap[link];
        p.spend += ad.spend;
        p.landingPageViews += ad.landingPageViews;
        p.purchases += ad.purchases;
        p.leads += ad.leads;
        p.salesVolume += ad.revenue || 0;
      }

      const pagesArr = Object.values(pagesMap).map((p: any) => {
        p.salesConv = p.landingPageViews > 0 ? (p.purchases / p.landingPageViews) * 100 : 0;
        p.leadsConv = p.landingPageViews > 0 ? (p.leads / p.landingPageViews) * 100 : 0;
        p.cpa = p.purchases > 0 ? p.spend / p.purchases : 0;
        p.cpl = p.leads > 0 ? p.spend / p.leads : 0;
        return p;
      });

      let finalPages = [];
      if (type === 'PAGES_VENDAS') {
        finalPages = pagesArr.filter((p: any) => p.purchases >= 1).sort((a: any, b: any) => b.salesConv - a.salesConv).slice(0, 10);
      } else {
        finalPages = pagesArr.filter((p: any) => p.leads >= 1).sort((a: any, b: any) => b.leadsConv - a.leadsConv).slice(0, 10);
      }

      const res = { results: finalPages };
      setCache(cacheKey, res);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });

  } catch (error: any) {
    console.error('[/api/meta/historico] Error:', error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta historico API error' }, { status: 500 });
  }
}
