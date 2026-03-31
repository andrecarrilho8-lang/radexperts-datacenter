import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { parseMetrics, getCache, setCache } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const META_BASE = 'https://graph.facebook.com/v19.0';
const INSIGHT_FIELDS = [
  'spend', 'impressions', 'clicks', 'outbound_clicks',
  'ctr', 'cpc', 'actions', 'action_values', 'landing_page_view',
].join(',');

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function cleanStr(s: string) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isApproved(status: string) {
  return ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(status);
}

async function metaFetch(url: string): Promise<any> {
  const r = await fetch(url);
  return r.json();
}

async function metaAll(baseUrl: string): Promise<any[]> {
  let items: any[] = [];
  let url = baseUrl;
  while (url) {
    const j = await metaFetch(url);
    if (j.error) break;
    items = items.concat(j.data || []);
    url = j.paging?.next || '';
  }
  return items;
}

/* ── Campaign → Hotmart revenue match (same logic as /api/meta) ─────────── */
function buildHotmartMatcher(cleanSales: any[]) {
  return function matchCampaign(name: string) {
    const cleanCampaign = cleanStr(name);
    const campTokens = name.toLowerCase()
      .replace(/[\[\]\-\_\(\)]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3)
      .filter(t => !['vendas', 'leads', 'hybrid', 'paginas', 'campanha', 'oficial',
        'atual', 'anuncio', 'geral', '2025', '2026', 'hotmart', 'meta', 'ads',
        'auto', 'venda', 'frio', 'quente', 'v01', 'v02', 'v03', 'cbo', 'abo'].includes(t));

    let rev = 0, gross = 0, qty = 0;
    const products: string[] = [];

    cleanSales.forEach((s: any) => {
      const prodName    = s.product?.name || '';
      const cleanProd   = cleanStr(prodName);
      const isMatch = cleanProd.includes(cleanCampaign) ||
                      cleanCampaign.includes(cleanProd) ||
                      campTokens.some(tok => cleanProd.includes(cleanStr(tok)));
      if (isMatch) {
        const net = s.purchase?.producer_net_brl ?? s.purchase?.producer_net;
        const g   = s.purchase?.price?.converted_value || 0;
        rev   += net != null ? net : g;
        gross += g;
        qty   += 1;
        if (!products.includes(prodName)) products.push(prodName);
      }
    });
    return { revenue: rev, gross, sales: qty, products };
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');
  const force    = searchParams.get('force') === '1';

  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account)
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });

  const ck = `vpo2|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(ck);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    /* ── Time range ── */
    const tr = dateFrom && dateTo
      ? `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`
      : 'date_preset=last_30d';

    const hotStart = dateFrom ? `${dateFrom}T00:00:00-03:00` : '2026-01-01T00:00:00-03:00';
    const hotEnd   = dateTo   ? `${dateTo}T23:59:59-03:00`   : '2026-12-31T23:59:59-03:00';

    const INS = `${INSIGHT_FIELDS}&limit=500&access_token=${token}`;
    const Q   = `limit=500&access_token=${token}`;

    /* ── Parallel fetch ── */
    const [
      allSales,
      campIns, adsetIns, adIns,
      campList, adsetList, adList,
    ] = await Promise.all([
      getCachedAllSales(),
      /* Campaign insights */
      metaFetch(`${META_BASE}/${account}/insights?level=campaign&fields=campaign_id,campaign_name,${INS}&${tr}`),
      /* Adset insights */
      metaFetch(`${META_BASE}/${account}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      /* Ad insights */
      metaFetch(`${META_BASE}/${account}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      /* Entities (for status, budget, thumbnail) */
      metaAll(`${META_BASE}/${account}/campaigns?fields=id,name,status,effective_status,objective,daily_budget&${Q}`),
      metaAll(`${META_BASE}/${account}/adsets?fields=id,name,status,effective_status,campaign_id&${Q}`),
      metaAll(`${META_BASE}/${account}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url}&${Q}`),
    ]);

    /* ── Prepare Hotmart clean sales (period-filtered) ── */
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs   = dateTo   ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;
    const uniqueTx = new Set<string>();
    const cleanSales = (allSales as any[]).filter(s => {
      const tx = s.purchase?.transaction;
      if (!isApproved(s.purchase?.status) || !tx || uniqueTx.has(tx)) return false;
      const ts = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      if (ts < fromMs || ts > toMs) return false;
      uniqueTx.add(tx);
      return true;
    });

    const totalHotmartSales = cleanSales.length;
    const totalHotmartRevenue = cleanSales.reduce((acc, s) => {
      const net = s.purchase?.producer_net_brl ?? s.purchase?.producer_net;
      return acc + (net != null ? net : (s.purchase?.price?.converted_value || s.purchase?.price?.value || 0));
    }, 0);

    const matchCampaign = buildHotmartMatcher(cleanSales);

    /* ── Index entities ── */
    const campEntity = new Map<string, any>();
    campList.forEach((c: any) => campEntity.set(c.id, {
      id: c.id, name: c.name,
      status: (c.effective_status || c.status || 'UNKNOWN').toUpperCase(),
      objective: c.objective || '',
      dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
    }));

    const adsetEntity = new Map<string, any>();
    adsetList.forEach((a: any) => adsetEntity.set(a.id, {
      id: a.id, name: a.name, campaignId: a.campaign_id,
      status: (a.effective_status || a.status || 'UNKNOWN').toUpperCase(),
    }));

    const adEntity = new Map<string, any>();
    adList.forEach((a: any) => adEntity.set(a.id, {
      id: a.id, name: a.name, adsetId: a.adset_id, campaignId: a.campaign_id,
      status: (a.effective_status || a.status || 'UNKNOWN').toUpperCase(),
      thumbnail: a.creative?.thumbnail_url || null,
    }));

    /* ── Index insights ── */
    const campInsMap  = new Map<string, any>(); // campaign_id → metrics
    ((campIns.data || []) as any[]).forEach((d: any) => campInsMap.set(d.campaign_id, d));

    const adsetInsMap = new Map<string, any>(); // adset_id → metrics
    ((adsetIns.data || []) as any[]).forEach((d: any) => adsetInsMap.set(d.adset_id, d));

    const adInsMap    = new Map<string, any>(); // ad_id → metrics
    ((adIns.data || []) as any[]).forEach((d: any) => adInsMap.set(d.ad_id, d));

    /* ── Build rows ── */
    function buildRow(entity: any, insData: any, homart: { revenue: number; sales: number; products: string[] } | null) {
      const m = insData ? parseMetrics(insData) : null;
      const spend   = m?.spend   ?? 0;
      const revenue = homart?.revenue ?? 0;
      const sales   = homart?.sales   ?? 0;
      const roas    = spend > 0 ? revenue / spend : 0;
      const cac     = sales > 0 ? spend   / sales : 0;
      return {
        id:             entity?.id || null,
        name:           entity?.name || '—',
        status:         entity?.status || 'UNKNOWN',
        objective:      entity?.objective || '',
        dailyBudget:    entity?.dailyBudget ?? 0,
        thumbnail:      entity?.thumbnail || null,
        // Meta funnel
        spend,
        impressions:    m?.impressions    ?? 0,
        clicks:         m?.clicks        ?? 0,
        outboundClicks: m?.outboundClicks ?? 0,
        landingPageViews: m?.landingPageViews ?? 0,
        checkouts:      m?.checkouts     ?? 0,
        connectRate:    m?.connectRate   ?? 0,
        checkoutRate:   m?.checkoutRate  ?? 0,
        purchaseRate:   m?.purchaseRate  ?? 0,
        ctr:            m?.ctr           ?? 0,
        // Hotmart (matched by name)
        revenue, sales,
        matchedProducts: homart?.products ?? [],
        cac, roas,
      };
    }

    /* Campaigns — match Hotmart by name */
    const campaigns = campList
      .map((c: any) => {
        const e   = campEntity.get(c.id)!;
        const ins = campInsMap.get(c.id);
        const hm  = matchCampaign(c.name || '');
        return buildRow(e, ins, hm);
      })
      .filter((r: any) => r.spend > 0 || r.sales > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    /* Adsets */
    const adsets = adsetList
      .map((a: any) => {
        const e   = adsetEntity.get(a.id)!;
        const ins = adsetInsMap.get(a.id);
        return buildRow(e, ins, null);
      })
      .filter((r: any) => r.spend > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    /* Ads */
    const ads = adList
      .map((a: any) => {
        const e   = adEntity.get(a.id)!;
        const ins = adInsMap.get(a.id);
        return buildRow(e, ins, null);
      })
      .filter((r: any) => r.spend > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const result = {
      totalHotmartSales,
      totalHotmartRevenue,
      totalMetaSpend: campaigns.reduce((s: number, c: any) => s + c.spend, 0),
      campaigns, adsets, ads,
    };
    setCache(ck, result);
    return NextResponse.json(result);

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
