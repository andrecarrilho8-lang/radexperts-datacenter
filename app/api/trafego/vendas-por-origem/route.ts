import { NextResponse } from 'next/server';
import { getWebhookSales, type WebhookSale } from '@/app/lib/webhookStore';
import { parseMetrics, getCache, setCache } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const META_BASE      = 'https://graph.facebook.com/v19.0';
const INSIGHT_FIELDS = [
  'spend', 'impressions', 'clicks', 'outbound_clicks',
  'actions', 'action_values', 'landing_page_view',
].join(',');

/* ── Meta fetch helpers ─────────────────────────────────────────────────────── */
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

/* ── UTM → Meta entity match ────────────────────────────────────────────────── */
/**
 * Determines whether a UTM value (e.g. utm_campaign) references a specific Meta entity.
 *
 * Match priority:
 *  1. Exact string match
 *  2. Case-insensitive exact match
 *  3. One string wholly contains the other (cleaned)
 *
 * We do NOT guess or infer — if the UTM value doesn't clearly match, return false.
 */
function utmMatchesEntity(utmValue: string | null, entityName: string): boolean {
  if (!utmValue || !entityName) return false;
  // Exact
  if (utmValue === entityName) return true;
  // Case-insensitive exact
  const u = utmValue.toLowerCase().trim();
  const e = entityName.toLowerCase().trim();
  if (u === e) return true;
  // Contains (both directions, after removing common separators)
  const clean = (s: string) => s.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const cu = clean(u);
  const ce = clean(e);
  if (cu === ce) return true;
  if (ce.includes(cu) && cu.length > 4) return true;
  if (cu.includes(ce) && ce.length > 4) return true;
  return false;
}

/**
 * Find webhook sales for a given Meta entity based on UTM field matching.
 * Only uses actual UTM fields — never infers from product name or entity name.
 */
function webhookSalesForEntity(
  sales: WebhookSale[],
  utmField: 'utm_campaign' | 'utm_medium' | 'utm_content',
  entityName: string,
  entityId?: string,
): WebhookSale[] {
  return sales.filter(s => {
    const utmVal = s[utmField];
    // For ads: utm_term might be exact ad ID → highest confidence match
    if (utmField === 'utm_content' && entityId && s.utm_term === entityId) return true;
    return utmMatchesEntity(utmVal, entityName);
  });
}

/* ── Row builder ────────────────────────────────────────────────────────────── */
type EntityRow = {
  id:          string | null;
  name:        string;
  thumbnail:   string | null;
  // Meta metrics
  spend:       number;
  checkouts:   number;
  pageviews:   number;
  // Hotmart webhook metrics
  compras:     number;   // webhook sales count (UTM-matched)
  revenue:     number;   // webhook sales revenue (BRL)
  // Calculated
  cpa:              number;         // spend / compras
  compraCheckout:   number;         // compras / checkouts (%)
  checkoutPageview: number;         // checkouts / pageviews (%)
  cpCheckout:       number;         // spend / checkouts
  // Attribution
  attributionStatuses: Record<string, number>; // {complete, partial, missing}
};

function buildRow(
  entity:    { id: string; name: string; thumbnail?: string | null },
  insData:   any,
  wSales:    WebhookSale[],
): EntityRow {
  const m         = insData ? parseMetrics(insData) : null;
  const spend     = m?.spend        ?? 0;
  const checkouts = m?.checkouts    ?? 0;
  const pageviews = m?.landingPageViews ?? 0;

  const compras  = wSales.length;
  const revenue  = wSales.reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

  const cpa              = compras  > 0 ? spend     / compras  : 0;
  const compraCheckout   = checkouts > 0 ? (compras  / checkouts) * 100 : 0;
  const checkoutPageview = pageviews > 0 ? (checkouts / pageviews) * 100 : 0;
  const cpCheckout       = checkouts > 0 ? spend     / checkouts  : 0;

  // Attribution quality summary
  const attrSummary = { complete: 0, partial: 0, missing: 0 };
  wSales.forEach(s => { attrSummary[s.attribution_status]++; });

  return {
    id:        entity.id   || null,
    name:      entity.name || '—',
    thumbnail: entity.thumbnail || null,
    spend, checkouts, pageviews,
    compras, revenue,
    cpa, compraCheckout, checkoutPageview, cpCheckout,
    attributionStatuses: attrSummary,
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

  const ck = `vpo4|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(ck);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    /* ── Time range ── */
    const tr = dateFrom && dateTo
      ? `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`
      : 'date_preset=last_30d';

    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs   = dateTo   ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;

    const INS = `${INSIGHT_FIELDS}&limit=500&access_token=${token}`;
    const Q   = `limit=500&access_token=${token}`;

    /* ── Parallel fetch: Meta insights + entity lists ── */
    const [
      campIns, adsetIns, adIns,
      campList, adsetList, adList,
    ] = await Promise.all([
      metaFetch(`${META_BASE}/${account}/insights?level=campaign&fields=campaign_id,campaign_name,${INS}&${tr}`),
      metaFetch(`${META_BASE}/${account}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      metaFetch(`${META_BASE}/${account}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      metaAll(`${META_BASE}/${account}/campaigns?fields=id,name,status,effective_status,daily_budget&${Q}`),
      metaAll(`${META_BASE}/${account}/adsets?fields=id,name,status,campaign_id&${Q}`),
      metaAll(`${META_BASE}/${account}/ads?fields=id,name,adset_id,campaign_id,creative{thumbnail_url}&${Q}`),
    ]);

    /* ── Webhook sales filtered to the period ── */
    const allWebhook = getWebhookSales();
    const webhookInPeriod = allWebhook.filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });

    /* ── Webhook stats ── */
    const totalWebhookSales   = webhookInPeriod.length;
    const totalWebhookRevenue = webhookInPeriod.reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

    /* Attribution breakdown */
    const attrBreakdown = { complete: 0, partial: 0, missing: 0 };
    webhookInPeriod.forEach(s => { attrBreakdown[s.attribution_status]++; });

    /* ── Index insights ── */
    const campInsMap  = new Map<string, any>();
    ((campIns.data  || []) as any[]).forEach((d: any) => campInsMap.set(d.campaign_id, d));
    const adsetInsMap = new Map<string, any>();
    ((adsetIns.data || []) as any[]).forEach((d: any) => adsetInsMap.set(d.adset_id, d));
    const adInsMap    = new Map<string, any>();
    ((adIns.data    || []) as any[]).forEach((d: any) => adInsMap.set(d.ad_id, d));

    /* ── Build campaign rows ── */
    const campaigns: EntityRow[] = campList
      .map((c: any) => {
        const ins    = campInsMap.get(c.id);
        const wSales = webhookSalesForEntity(webhookInPeriod, 'utm_campaign', c.name, c.id);
        return buildRow({ id: c.id, name: c.name }, ins, wSales);
      })
      .filter((r: EntityRow) => r.spend > 0 || r.compras > 0)
      .sort((a: EntityRow, b: EntityRow) => b.spend - a.spend);

    /* ── Build adset rows ── */
    const adsets: EntityRow[] = adsetList
      .map((a: any) => {
        const ins    = adsetInsMap.get(a.id);
        const wSales = webhookSalesForEntity(webhookInPeriod, 'utm_medium', a.name, a.id);
        return buildRow({ id: a.id, name: a.name }, ins, wSales);
      })
      .filter((r: EntityRow) => r.spend > 0 || r.compras > 0)
      .sort((a: EntityRow, b: EntityRow) => b.spend - a.spend);

    /* ── Build ad rows ── */
    const ads: EntityRow[] = adList
      .map((a: any) => {
        const ins    = adInsMap.get(a.id);
        const thumb  = (a as any).creative?.thumbnail_url || null;
        const wSales = webhookSalesForEntity(webhookInPeriod, 'utm_content', a.name, a.id);
        return buildRow({ id: a.id, name: a.name, thumbnail: thumb }, ins, wSales);
      })
      .filter((r: EntityRow) => r.spend > 0 || r.compras > 0)
      .sort((a: EntityRow, b: EntityRow) => b.spend - a.spend);

    /* ── Totals ── */
    const totalMetaSpend = campaigns.reduce((s: number, c: EntityRow) => s + c.spend, 0);

    const result = {
      // Summary
      totalMetaSpend,
      totalWebhookSales,
      totalWebhookRevenue,
      attrBreakdown,
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
