import { NextResponse }                                                   from 'next/server';
import { getCache, setCache, initSDK, mapObjective,
         parseMetrics, AD_INSIGHT_FIELDS, INSIGHT_FIELDS }                from '@/app/lib/metaApi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom    = searchParams.get('dateFrom');
  const dateTo      = searchParams.get('dateTo');
  const campaignId  = searchParams.get('campaignId');
  const force       = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `chart|${dateFrom}|${dateTo}|${campaignId || 'all'}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const { AdAccount } = initSDK(accessToken);
    const account       = new AdAccount(adAccountId);
    const rawAccountId  = adAccountId.replace('act_', '');

    const dateRange = dateFrom && dateTo
      ? { time_range: { since: dateFrom, until: dateTo } }
      : { date_preset: 'last_30d' };

    const campaignFilter = campaignId
      ? [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]
      : undefined;

    const dailyParams: any = {
      level: campaignId ? 'campaign' : 'account',
      time_increment: 1,
      ...dateRange,
      ...(campaignFilter ? { filtering: campaignFilter } : {}),
    };
    // ── Fetch fast data in parallel ─────────────────────────────────────────
    const [dailyInsights, campaignSpends, campaignObjects] = await Promise.all([
      account.getInsights(INSIGHT_FIELDS, dailyParams),
      // Fetch top 50 campaigns by spend to constraint the ad queue
      !campaignId ? account.getInsights(['campaign_id', 'spend'], { level: 'campaign', limit: 50, sort: ['spend_descending'], ...dateRange }) : Promise.resolve([]),
      account.getCampaigns(['id', 'objective', 'effective_status'], { limit: 200 }),
    ]);

    // ── Campaign meta for ads ────────────────────────────────────────────────
    const campaignMeta: Record<string, any> = {};
    for (const c of campaignObjects) {
      campaignMeta[c.id] = {
        objective: mapObjective(c.objective || ''),
        status:    c.effective_status || '',
      };
    }
    
    // ── Fetch Ads filtered by Top Campaigns to avoid "Reduce amount of data" error 
    let adFilter: any[] = [];
    if (campaignFilter) {
      adFilter = campaignFilter;
    } else {
      const topIds = campaignSpends.map((c: any) => c.campaign_id).filter(Boolean);
      if (topIds.length > 0) {
        adFilter = [{ field: 'campaign.id', operator: 'IN', value: topIds }];
      }
    }

    const adParams: any = {
      level: 'ad', limit: 60,
      ...dateRange,
      sort: ['spend_descending'],
      ...(adFilter.length > 0 ? { filtering: adFilter } : {}),
    };

    let adInsights: any[] = [];
    if (adFilter.length > 0 || dateRange.date_preset) {
        try {
            adInsights = await account.getInsights(AD_INSIGHT_FIELDS, adParams);
        } catch(e: any) {
            console.warn('[chart] Fallback ad request err:', e?.response?.error || e.message);
        }
    }

    // ── Chart data (daily) ────────────────────────────────────────────────────
    const chartData = dailyInsights
      .sort((a: any, b: any) => (a.date_start || '').localeCompare(b.date_start || ''))
      .map((day: any) => {
        const m = parseMetrics(day);
        return {
          date:         new Date(day.date_start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          Investimento: m.spend,
          Faturamento:  m.revenue,
          Leads:        m.leads,
          Vendas:       m.purchases,
        };
      });

    // ── Parse ads ─────────────────────────────────────────────────────────────
    const parsedAds = adInsights
      .map((data: any) => {
        const meta = campaignMeta[data.campaign_id] || {};
        return {
          id:               data.ad_id         || '',
          name:             data.ad_name       || '',
          campaignId:       data.campaign_id   || '',
          campaignName:     data.campaign_name || '',
          objective:        meta.objective     || 'OUTROS',
          thumbnailUrl:     null as string | null,
          instagramPermalink: null as string | null,
          landingPageUrl: null as string | null,
          body: null as string | null,
          adsManagerLink:   `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${rawAccountId}&selected_ad_ids=${data.ad_id}`,
          ...parseMetrics(data),
        };
      })
      .filter((a: any) => a.id);

    // ── Identify top ads and fetch thumbnails ─────────────────────────────────
    const topSalesUnsorted = parsedAds
      .filter((a: any) => a.objective === 'VENDAS')
      .sort((a: any, b: any) => b.purchases - a.purchases)
      .slice(0, 3);
    const topLeadsUnsorted = parsedAds
      .filter((a: any) => a.objective === 'LEADS')
      .sort((a: any, b: any) => b.leads - a.leads)
      .slice(0, 3);

    const priorityIds = [...topSalesUnsorted, ...topLeadsUnsorted]
      .map((a: any) => a.id)
      .filter(Boolean);

    if (priorityIds.length > 0) {
      try {
        const adsWithCreative = await account.getAds(
          ['id', 'instagram_permalink_url', 'effective_instagram_story_id', 'preview_shareable_link', 'creative{id,object_story_id,thumbnail_url,image_url,body,object_story_spec,asset_feed_spec}'],
          { filtering: [{ field: 'id', operator: 'IN', value: priorityIds }], limit: 10 }
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
          
           const url = c.object_story_spec?.link_data?.link || 
                       c.asset_feed_spec?.ad_formats?.[0]?.link_data?.link ||
                       c.object_story_spec?.video_data?.call_to_action?.value?.link || '';
           if (url) urlMap[ad.id] = url;

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
        }
        for (const ad of parsedAds as any[]) {
          if (thumbMap[ad.id]) ad.thumbnailUrl      = thumbMap[ad.id];
          if (igMap[ad.id])    ad.instagramPermalink = igMap[ad.id];
          if (urlMap[ad.id])   ad.landingPageUrl     = urlMap[ad.id];
          if (bodyMap[ad.id])  ad.body               = bodyMap[ad.id];
        }
      } catch (e) {
        console.warn('[chart] Thumbnail fetch skipped:', (e as any).message);
      }
    }

    const topSalesAds = parsedAds
      .filter((a: any) => a.objective === 'VENDAS')
      .sort((a: any, b: any) => b.purchases - a.purchases)
      .slice(0, 3);
    const topLeadsAds = parsedAds
      .filter((a: any) => a.objective === 'LEADS')
      .sort((a: any, b: any) => b.leads - a.leads)
      .slice(0, 3);

    const result = { chartData, topSalesAds, topLeadsAds };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[/api/meta/chart] Error:', error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta chart API error' }, { status: 500 });
  }
}
