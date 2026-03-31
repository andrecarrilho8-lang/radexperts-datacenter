import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { parseMetrics, getCache, setCache } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const META_BASE = 'https://graph.facebook.com/v19.0';
const INSIGHT_F  = 'spend,impressions,clicks,outbound_clicks,ctr,cpc,actions,action_values,landing_page_view';

/* ── UTM parser — handles both object and query-string formats ──────────── */
function parseUTM(s: any) {
  // Format 1: purchase.tracking = { source, campaign, medium, content, term }
  const t: any = s.purchase?.tracking || {};
  // Format 2: purchase.tracking_parameters = "utm_source=...&utm_campaign=..."
  const qs = new URLSearchParams(typeof s.purchase?.tracking_parameters === 'string'
    ? s.purchase.tracking_parameters : '');

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = t[k] || qs.get(k);
      if (v) return v.trim();
    }
    return '';
  };
  return {
    source:   pick('utm_source',   'source')  .toLowerCase(),
    campaign: pick('utm_campaign', 'campaign'),
    medium:   pick('utm_medium',   'medium'),
    content:  pick('utm_content',  'content'),
    term:     pick('utm_term',     'term'),
  };
}

/* ── Meta Graph API fetch helper ────────────────────────────────────────── */
async function metaFetch(path: string): Promise<any> {
  const r = await fetch(`${META_BASE}${path}`);
  return r.json();
}

/* ── Collect all pages ──────────────────────────────────────────────────── */
async function metaAll(path: string): Promise<any[]> {
  let items: any[] = [];
  let url = `${META_BASE}${path}`;
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) break;
    items = items.concat(j.data || []);
    url = j.paging?.next || '';
  }
  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');
  const force    = searchParams.get('force') === '1';

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const cacheKey = `vendas_origem|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    /* ── Time range ── */
    const tr = dateFrom && dateTo
      ? `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`
      : 'date_preset=last_30d';
    const hotStart = dateFrom ? `${dateFrom}T00:00:00-03:00` : '2026-01-01T00:00:00-03:00';
    const hotEnd   = dateTo   ? `${dateTo}T23:59:59-03:00`   : '2026-12-31T23:59:59-03:00';

    /* ── Parallel: Hotmart sales + Meta insights at 3 levels + entity lists ── */
    const FIELDS = `${INSIGHT_F}&limit=500&access_token=${accessToken}`;
    const [
      allSales,
      campInsights,
      adsetInsights,
      adInsights,
      adsList,
      campList,
      adsetList,
    ] = await Promise.all([
      getCachedAllSales(),
      metaFetch(`/${adAccountId}/insights?level=campaign&${FIELDS}&${tr}`),
      metaFetch(`/${adAccountId}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,${INSIGHT_F}&limit=500&access_token=${accessToken}&${tr}`),
      metaFetch(`/${adAccountId}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${INSIGHT_F}&limit=500&access_token=${accessToken}&${tr}`),
      metaAll(`/${adAccountId}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative%7Bthumbnail_url,object_story_spec%7D&limit=500&access_token=${accessToken}`),
      metaAll(`/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget&limit=500&access_token=${accessToken}`),
      metaAll(`/${adAccountId}/adsets?fields=id,name,status,effective_status,campaign_id&limit=500&access_token=${accessToken}`),
    ]);

    /* ── Build Meta lookup maps ── */
    // campaign_name → { metrics, status, id, objective, dailyBudget }
    const campMap = new Map<string, any>();
    const campById = new Map<string, any>();
    campList.forEach((c: any) => {
      const entry = {
        id: c.id, name: c.name,
        status: (c.effective_status || c.status || 'UNKNOWN').toUpperCase(),
        objective: c.objective || '',
        dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
      };
      campMap.set((c.name || '').toLowerCase(), entry);
      campById.set(c.id, entry);
    });

    // adset_name → { metrics, status, id, campaign_id }
    const adsetMap = new Map<string, any>();
    const adsetById = new Map<string, any>();
    adsetList.forEach((a: any) => {
      const entry = {
        id: a.id, name: a.name, campaignId: a.campaign_id,
        status: (a.effective_status || a.status || 'UNKNOWN').toUpperCase(),
      };
      adsetMap.set((a.name || '').toLowerCase(), entry);
      adsetById.set(a.id, entry);
    });

    // ad_id → { model, thumbnail }
    const adEntityById = new Map<string, any>();
    adsList.forEach((a: any) => {
      adEntityById.set(a.id, {
        id: a.id, name: a.name,
        adsetId: a.adset_id, campaignId: a.campaign_id,
        status: (a.effective_status || a.status || 'UNKNOWN').toUpperCase(),
        thumbnail: a.creative?.thumbnail_url || null,
      });
    });

    /* ── Index insights ── */
    type Metrics = ReturnType<typeof parseMetrics>;
    const campInsMap = new Map<string, Metrics>();  // campaign_id → metrics
    ((campInsights.data || []) as any[]).forEach((d: any) => {
      campInsMap.set(d.campaign_id, parseMetrics(d));
    });

    const adsetInsMap = new Map<string, Metrics>(); // adset_id → metrics (from insights)
    const adsetInsNameMap = new Map<string, Metrics>(); // adset_name.lower → metrics
    ((adsetInsights.data || []) as any[]).forEach((d: any) => {
      const m = parseMetrics(d);
      adsetInsMap.set(d.adset_id, m);
      adsetInsNameMap.set((d.adset_name || '').toLowerCase(), m);
    });

    const adInsById  = new Map<string, Metrics>(); // ad_id → metrics
    const adInsName  = new Map<string, Metrics>(); // ad_name.lower → metrics
    ((adInsights.data || []) as any[]).forEach((d: any) => {
      const m = parseMetrics(d);
      adInsById.set(d.ad_id, m);
      adInsName.set((d.ad_name || '').toLowerCase(), m);
    });

    /* ── Filter Hotmart sales in period + parse UTMs ── */
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs   = dateTo   ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;

    const sales = (allSales as any[]).filter(s => {
      if (!APPROVED.has(s.purchase?.status)) return false;
      const ts = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      return ts >= fromMs && ts <= toMs;
    });

    const totalSales = sales.length;

    /* ── Group sales by UTM dimension ── */
    type Row = {
      key: string;
      sales: number;
      revenue: number;
      /**spend, impressions… come from Meta join */
    };

    const srcMap   = new Map<string, Row>(); // by utm_source
    const campSales= new Map<string, Row>(); // by utm_campaign  (matches meta campaign name)
    const adsetSales= new Map<string, Row>();// by utm_medium   (matches meta adset name)
    const adSales  = new Map<string, Row>(); // by utm_term     (= ad_id) or utm_content

    let parametrized = 0;

    for (const s of sales) {
      const price   = s.purchase?.price?.converted_value
        ?? s.purchase?.price?.actual_value
        ?? s.purchase?.price?.value
        ?? 0;
      const utm = parseUTM(s);

      // A sale is "parametrized" if it has at least utm_campaign
      const hasUTM = !!utm.campaign;
      if (hasUTM) parametrized++;

      const add = (map: Map<string, Row>, key: string) => {
        if (!key) return;
        const r = map.get(key) || { key, sales: 0, revenue: 0 };
        r.sales++;
        r.revenue += price;
        map.set(key, r);
      };

      add(srcMap,    utm.source   || '(sem origem)');
      add(campSales, utm.campaign);
      add(adsetSales,utm.medium);
      // For ad, prefer utm_term (= ad_id) else fall back to utm_content
      add(adSales,   utm.term || utm.content);
    }

    /* ── Build final rows helper ── */
    function buildRow(key: string, { sales, revenue }: Row,
      metaMetrics: Metrics | null, entity: any): any {
      const m       = metaMetrics;
      const spend   = m?.spend   ?? 0;
      const roas    = spend > 0 ? revenue / spend : 0;
      const cac     = sales > 0 ? spend   / sales : 0;
      return {
        key,
        name:           entity?.name || key,
        id:             entity?.id || null,
        status:         entity?.status || 'UNKNOWN',
        objective:      entity?.objective || '',
        dailyBudget:    entity?.dailyBudget ?? 0,
        thumbnail:      entity?.thumbnail || null,
        sales,
        revenue,
        spend,
        impressions:    m?.impressions    ?? 0,
        clicks:         m?.clicks        ?? 0,
        outboundClicks: m?.outboundClicks ?? 0,
        connectRate:    m?.connectRate    ?? 0,
        checkoutRate:   m?.checkoutRate   ?? 0,
        purchaseRate:   m?.purchaseRate   ?? 0,
        cac, roas,
      };
    }

    /* ── Sources ── (no Meta entity, just UTM grouping) */
    const sources = Array.from(srcMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map(r => buildRow(r.key, r, null, { name: r.key, status: 'ACTIVE', id: null }));

    /* ── Campaigns ── */
    const campaigns = Array.from(campSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map(r => {
        const entity  = campMap.get(r.key.toLowerCase()) || null;
        const metrics = entity ? campInsMap.get(entity.id) ?? null : null;
        return buildRow(r.key, r, metrics, entity);
      });

    /* ── Adsets ── */
    const adsets = Array.from(adsetSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map(r => {
        const entity  = adsetMap.get(r.key.toLowerCase()) || null;
        const metrics = entity ? adsetInsMap.get(entity.id) ?? adsetInsNameMap.get(r.key.toLowerCase()) ?? null : adsetInsNameMap.get(r.key.toLowerCase()) ?? null;
        return buildRow(r.key, r, metrics, entity);
      });

    /* ── Ads ── */
    const ads = Array.from(adSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map(r => {
        // utm_term = ad_id (most reliable)
        const entity  = adEntityById.get(r.key) || null;
        const metrics = adInsById.get(r.key) ?? adInsName.get(r.key.toLowerCase()) ?? null;
        return buildRow(r.key, r, metrics, entity);
      });

    const result = {
      totalSales,
      parametrized,
      parametrizedPct: totalSales > 0 ? Math.round((parametrized / totalSales) * 100) : 0,
      sources,
      campaigns,
      adsets,
      ads,
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
