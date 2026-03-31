import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getWebhookSales, type WebhookSale } from '@/app/lib/webhookStore';
import { parseMetrics, getCache, setCache } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const META_BASE = 'https://graph.facebook.com/v19.0';
const INSIGHT_FIELDS = [
  'spend', 'impressions', 'clicks', 'outbound_clicks',
  'ctr', 'cpc', 'actions', 'action_values', 'landing_page_view',
].join(',');

/* ── String helpers ─────────────────────────────────────────────────────────── */
function cleanStr(s: string) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Fuzzy match: does the UTM identifier reference this entity name?
 * Tries exact, contains, and then token overlap.
 */
function utmMatchesName(utmVal: string, entityName: string): boolean {
  if (!utmVal || !entityName) return false;

  // 1. Direct / cleaned exact match
  const cleanUtm    = cleanStr(utmVal);
  const cleanEntity = cleanStr(entityName);
  if (cleanUtm === cleanEntity)              return true;
  if (cleanEntity.includes(cleanUtm))        return true;
  if (cleanUtm.includes(cleanEntity))        return true;

  // 2. Token overlap (words > 3 chars)
  const tokensOf = (s: string) =>
    s.toLowerCase()
     .replace(/[_\-\[\]\(\)]/g, ' ')
     .split(/\s+/)
     .filter(t => t.length > 3);
  const utmToks    = tokensOf(utmVal);
  const entityToks = tokensOf(entityName);
  return utmToks.some(t => entityToks.includes(t)) ||
         entityToks.some(t => utmToks.includes(t));
}

/* ── Meta API helpers ────────────────────────────────────────────────────────── */
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

/* ── Sale helpers ────────────────────────────────────────────────────────────── */
function isApproved(status: string) {
  return ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(
    (status || '').toUpperCase(),
  );
}

/* ── Build entity row ────────────────────────────────────────────────────────── */
function buildRow(
  entity: any,
  insData: any,
  webhookSales: WebhookSale[],   // UTM-matched
  fallbackRevenue: number,       // name-matched from history API (fallback)
  fallbackSales: number,
) {
  const m       = insData ? parseMetrics(insData) : null;
  const spend   = m?.spend   ?? 0;

  // Revenue from webhook (preferred) or fallback
  const revenue = webhookSales.reduce((s, x) => s + (x.amountBrl || x.amount), 0) || fallbackRevenue;
  const sales   = webhookSales.length || fallbackSales;
  const isFromWebhook = webhookSales.length > 0;

  const roas = spend > 0 ? revenue / spend : 0;
  const cac  = sales > 0 ? spend   / sales : 0;

  return {
    id:             entity?.id    || null,
    name:           entity?.name  || '—',
    status:         entity?.status || 'UNKNOWN',
    objective:      entity?.objective || '',
    dailyBudget:    entity?.dailyBudget ?? 0,
    thumbnail:      entity?.thumbnail  || null,
    // Meta funnel
    spend,
    impressions:     m?.impressions     ?? 0,
    clicks:          m?.clicks          ?? 0,
    outboundClicks:  m?.outboundClicks  ?? 0,
    landingPageViews:m?.landingPageViews ?? 0,
    checkouts:       m?.checkouts       ?? 0,
    connectRate:     m?.connectRate     ?? 0,
    checkoutRate:    m?.checkoutRate    ?? 0,
    purchaseRate:    m?.purchaseRate    ?? 0,
    ctr:             m?.ctr             ?? 0,
    // Hotmart
    revenue, sales, cac, roas,
    isFromWebhook,   // flag so UI can show "via UTM" indicator
    // Extra info
    webhookSalesList: webhookSales.map(s => ({
      transaction: s.transaction,
      product: s.productName,
      amount: s.amountBrl || s.amount,
      src: s.src,
      sck: s.sck,
      utmCampaign: s.utmCampaign,
      utmMedium: s.utmMedium,
      utmContent: s.utmContent,
    })),
  };
}

/* ── Fallback: name-based Hotmart matching ───────────────────────────────────── */
function buildHotmartFallbackMatcher(cleanSales: any[]) {
  return function match(name: string): { revenue: number; sales: number } {
    const cleanCampaign = cleanStr(name);
    const campTokens = name.toLowerCase()
      .replace(/[\[\]\-\_\(\)]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3)
      .filter(t => !['vendas','leads','hybrid','paginas','campanha','oficial',
        'atual','anuncio','geral','2025','2026','hotmart','meta','ads',
        'auto','venda','frio','quente','v01','v02','v03','cbo','abo'].includes(t));

    let rev = 0, qty = 0;
    cleanSales.forEach((s: any) => {
      const prodName  = s.product?.name || '';
      const cleanProd = cleanStr(prodName);
      const match = cleanProd.includes(cleanCampaign) ||
                    cleanCampaign.includes(cleanProd) ||
                    campTokens.some(tok => cleanProd.includes(cleanStr(tok)));
      if (match) {
        const net = s.purchase?.producer_net_brl ?? s.purchase?.producer_net;
        const g   = s.purchase?.price?.converted_value || 0;
        rev += net != null ? net : g;
        qty += 1;
      }
    });
    return { revenue: rev, sales: qty };
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/trafego/vendas-por-origem
   ══════════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');
  const force    = searchParams.get('force') === '1';

  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account)
    return NextResponse.json({ error: 'Missing META credentials' }, { status: 500 });

  const ck = `vpo3|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(ck);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    /* ── Time ranges ── */
    const tr = dateFrom && dateTo
      ? `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`
      : 'date_preset=last_30d';

    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs   = dateTo   ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;

    const INS = `${INSIGHT_FIELDS}&limit=500&access_token=${token}`;
    const Q   = `limit=500&access_token=${token}`;

    /* ── Parallel fetch: Meta + Hotmart history ── */
    const [
      allSales,
      campIns, adsetIns, adIns,
      campList, adsetList, adList,
    ] = await Promise.all([
      getCachedAllSales(),
      metaFetch(`${META_BASE}/${account}/insights?level=campaign&fields=campaign_id,campaign_name,${INS}&${tr}`),
      metaFetch(`${META_BASE}/${account}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      metaFetch(`${META_BASE}/${account}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      metaAll(`${META_BASE}/${account}/campaigns?fields=id,name,status,effective_status,objective,daily_budget&${Q}`),
      metaAll(`${META_BASE}/${account}/adsets?fields=id,name,status,effective_status,campaign_id&${Q}`),
      metaAll(`${META_BASE}/${account}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url}&${Q}`),
    ]);

    /* ── Filter Hotmart history sales to the period (for fallback matching) ── */
    const uniqueTx = new Set<string>();
    const historySales = (allSales as any[]).filter(s => {
      const tx = s.purchase?.transaction;
      if (!isApproved(s.purchase?.status) || !tx || uniqueTx.has(tx)) return false;
      const ts = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      if (ts < fromMs || ts > toMs) return false;
      uniqueTx.add(tx);
      return true;
    });

    /* ── Filter webhook sales to the period ── */
    const allWebhookSales = getWebhookSales();
    const webhookSalesInPeriod = allWebhookSales.filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });

    /* ── Totals ── */
    const totalHotmartSales   = historySales.length;
    const totalHotmartRevenue = historySales.reduce((acc, s) => {
      const net = s.purchase?.producer_net_brl ?? s.purchase?.producer_net;
      return acc + (net != null ? net : (s.purchase?.price?.converted_value || s.purchase?.price?.value || 0));
    }, 0);

    const totalWebhookSales   = webhookSalesInPeriod.length;
    const totalWebhookRevenue = webhookSalesInPeriod.reduce(
      (acc, s) => acc + (s.amountBrl || s.amount), 0,
    );
    const webhookPct = totalHotmartSales > 0
      ? (totalWebhookSales / totalHotmartSales) * 100
      : 0;

    /* ── Fallback (name-based) matcher ── */
    const fallbackMatch = buildHotmartFallbackMatcher(historySales);

    /* ── Index Meta entities ── */
    const campEntity  = new Map<string, any>();
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
    const campInsMap  = new Map<string, any>();
    ((campIns.data  || []) as any[]).forEach((d: any) => campInsMap.set(d.campaign_id, d));
    const adsetInsMap = new Map<string, any>();
    ((adsetIns.data || []) as any[]).forEach((d: any) => adsetInsMap.set(d.adset_id, d));
    const adInsMap    = new Map<string, any>();
    ((adIns.data    || []) as any[]).forEach((d: any) => adInsMap.set(d.ad_id, d));

    /* ── Match webhook sales to entity ── */
    function webhookSalesForCampaign(campName: string): WebhookSale[] {
      return webhookSalesInPeriod.filter(s =>
        utmMatchesName(s.utmCampaign || s.src, campName),
      );
    }
    function webhookSalesForAdset(adsetName: string, campName?: string | null): WebhookSale[] {
      return webhookSalesInPeriod.filter(s => {
        const mediumMatch  = utmMatchesName(s.utmMedium || s.sck, adsetName);
        const campaignMatch = !campName || utmMatchesName(s.utmCampaign || s.src, campName);
        return mediumMatch && campaignMatch;
      });
    }
    function webhookSalesForAd(adId: string, adName: string): WebhookSale[] {
      return webhookSalesInPeriod.filter(s => {
        // Prefer exact ad ID match (utm_term = {{ad.id}})
        if (s.utmTerm && s.utmTerm === adId) return true;
        // Fallback: content / xcod match
        return utmMatchesName(s.utmContent || s.xcod, adName);
      });
    }

    /* ── Build rows ── */
    const campaigns = campList
      .map((c: any) => {
        const e      = campEntity.get(c.id)!;
        const ins    = campInsMap.get(c.id);
        const wSales = webhookSalesForCampaign(c.name || '');
        const fb     = wSales.length === 0 ? fallbackMatch(c.name || '') : { revenue: 0, sales: 0 };
        return buildRow(e, ins, wSales, fb.revenue, fb.sales);
      })
      .filter((r: any) => r.spend > 0 || r.sales > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const adsets = adsetList
      .map((a: any) => {
        const e      = adsetEntity.get(a.id)!;
        const ins    = adsetInsMap.get(a.id);
        const camp   = campEntity.get(a.campaign_id);
        const wSales = webhookSalesForAdset(a.name || '', camp?.name);
        const fb     = wSales.length === 0 ? fallbackMatch(a.name || '') : { revenue: 0, sales: 0 };
        return buildRow(e, ins, wSales, fb.revenue, fb.sales);
      })
      .filter((r: any) => r.spend > 0 || r.sales > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const ads = adList
      .map((a: any) => {
        const e      = adEntity.get(a.id)!;
        const ins    = adInsMap.get(a.id);
        const wSales = webhookSalesForAd(a.id, a.name || '');
        const fb     = { revenue: 0, sales: 0 }; // no fallback for ads (too risky to name-match)
        return buildRow(e, ins, wSales, fb.revenue, fb.sales);
      })
      .filter((r: any) => r.spend > 0 || r.sales > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const result = {
      // Totals
      totalHotmartSales,
      totalHotmartRevenue,
      totalMetaSpend: campaigns.reduce((s: number, c: any) => s + c.spend, 0),
      // Webhook-specific metrics
      totalWebhookSales,
      totalWebhookRevenue,
      webhookPct,
      // Tables
      campaigns, adsets, ads,
    };

    setCache(ck, result);
    return NextResponse.json(result);

  } catch (e: any) {
    console.error('[vendas-por-origem]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
