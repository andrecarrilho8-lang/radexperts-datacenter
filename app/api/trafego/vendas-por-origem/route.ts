import { NextResponse } from 'next/server';
import { getWebhookSales, storeHistoricalSales, type WebhookSale } from '@/app/lib/webhookStore';
import { fetchSalesForAttribution } from '@/app/lib/hotmartApi';
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
function utmMatchesEntity(utmValue: string | null, entityName: string): boolean {
  if (!utmValue || !entityName) return false;
  if (utmValue === entityName) return true;
  const u = utmValue.toLowerCase().trim();
  const e = entityName.toLowerCase().trim();
  if (u === e) return true;
  const clean = (s: string) => s.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const cu = clean(u);
  const ce = clean(e);
  if (cu === ce) return true;
  if (ce.includes(cu) && cu.length > 4) return true;
  if (cu.includes(ce) && ce.length > 4) return true;
  return false;
}

function webhookSalesForEntity(
  sales: WebhookSale[],
  utmField: 'utm_campaign' | 'utm_medium' | 'utm_content',
  entityName: string,
  entityId?: string,
): WebhookSale[] {
  return sales.filter(s => {
    const utmVal = s[utmField];
    if (utmField === 'utm_content' && entityId && s.utm_term === entityId) return true;
    return utmMatchesEntity(utmVal, entityName);
  });
}

/* ── Row builder ────────────────────────────────────────────────────────────── */
type EntityRow = {
  id:          string | null;
  name:        string;
  thumbnail:   string | null;
  spend:       number;
  checkouts:   number;
  pageviews:   number;
  compras:     number;
  revenue:     number;
  cpa:              number;
  compraCheckout:   number;
  checkoutPageview: number;
  cpCheckout:       number;
  webhookSales:     number;
  apiSales:         number;
  missingSales:     number;
};

function buildRow(
  entity:  { id: string; name: string; thumbnail?: string | null },
  insData: any,
  wSales:  WebhookSale[],
): EntityRow {
  const m         = insData ? parseMetrics(insData) : null;
  const spend     = m?.spend        ?? 0;
  const checkouts = m?.checkouts    ?? 0;
  const pageviews = m?.landingPageViews ?? 0;

  const compras  = wSales.length;
  const revenue  = wSales.reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

  by_source: {
    var webhookSales = wSales.filter(s => s.source === 'webhook').length;
    var apiSales     = wSales.filter(s => s.source === 'api').length;
    var missingSales = wSales.filter(s => s.attribution_status === 'missing').length;
  }

  const cpa              = compras   > 0 ? spend     / compras   : 0;
  const compraCheckout   = checkouts > 0 ? (compras  / checkouts) * 100 : 0;
  const checkoutPageview = pageviews > 0 ? (checkouts / pageviews) * 100 : 0;
  const cpCheckout       = checkouts > 0 ? spend     / checkouts  : 0;

  return {
    id: entity.id || null, name: entity.name || '—', thumbnail: entity.thumbnail || null,
    spend, checkouts, pageviews, compras, revenue,
    cpa, compraCheckout, checkoutPageview, cpCheckout,
    webhookSales, apiSales, missingSales,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/trafego/vendas-por-origem
   ══════════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo   = searchParams.get('dateTo')   || new Date().toISOString().slice(0, 10);
  const force    = searchParams.get('force') === '1';

  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account)
    return NextResponse.json({ error: 'Missing META credentials' }, { status: 500 });

  const ck = `vpo5|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(ck);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const toMs   = new Date(`${dateTo}T23:59:59`).getTime();
    const fromMs = new Date(dateFrom).getTime();
    const tr = `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`;
    const INS = `${INSIGHT_FIELDS}&limit=500&access_token=${token}`;
    const Q   = `limit=500&access_token=${token}`;

    /* ── Parallel: Meta + Hotmart historical attribution ── */
    const [
      campIns, adsetIns, adIns,
      campList, adsetList, adList,
      historicalSales,
    ] = await Promise.all([
      metaFetch(`${META_BASE}/${account}/insights?level=campaign&fields=campaign_id,campaign_name,${INS}&${tr}`),
      metaFetch(`${META_BASE}/${account}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      metaFetch(`${META_BASE}/${account}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${INS}&${tr}`),
      metaAll(`${META_BASE}/${account}/campaigns?fields=id,name,status,effective_status,daily_budget&${Q}`),
      metaAll(`${META_BASE}/${account}/adsets?fields=id,name,status,campaign_id&${Q}`),
      metaAll(`${META_BASE}/${account}/ads?fields=id,name,adset_id,campaign_id,creative{thumbnail_url}&${Q}`),
      // FLOW 2: Historical Hotmart sales with tracking data
      fetchSalesForAttribution(dateFrom, dateTo).catch(e => {
        console.error('[vendas-por-origem] Historical fetch failed:', e.message);
        return [] as WebhookSale[];
      }),
    ]);

    /* ── FLOW 1: Webhook store (real-time, highest priority) ── */
    const webhookSales = getWebhookSales().filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });

    /* ── RECONCILIATION: Merge historical into store (webhook data takes priority) ── */
    // Filter historical to the period
    const historicalInPeriod = historicalSales.filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });
    storeHistoricalSales(historicalInPeriod);

    /* ── Combined sales (post-reconciliation) ── */
    const allSales = getWebhookSales().filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });

    /* ── Stats ── */
    const totalWebhookSales   = allSales.filter(s => s.source === 'webhook').length;
    const totalApiSales       = allSales.filter(s => s.source === 'api').length;
    const totalWebhookRevenue = allSales.filter(s => s.source === 'webhook').reduce((acc, s) => acc + (s.amountBrl || s.amount || 0), 0);
    const totalApiRevenue     = allSales.filter(s => s.source === 'api').reduce((acc, s) => acc + (s.amountBrl || s.amount || 0), 0);
    const attrBreakdown = { complete: 0, partial: 0, missing: 0 };
    allSales.forEach(s => { attrBreakdown[s.attribution_status]++; });

    /* ── Index Meta insights ── */
    const campInsMap  = new Map<string, any>();
    ((campIns.data  || []) as any[]).forEach((d: any) => campInsMap.set(d.campaign_id, d));
    const adsetInsMap = new Map<string, any>();
    ((adsetIns.data || []) as any[]).forEach((d: any) => adsetInsMap.set(d.adset_id, d));
    const adInsMap    = new Map<string, any>();
    ((adIns.data    || []) as any[]).forEach((d: any) => adInsMap.set(d.ad_id, d));

    /* ── Build rows ── */
    const campaigns: EntityRow[] = campList
      .map((c: any) => buildRow({ id: c.id, name: c.name }, campInsMap.get(c.id), webhookSalesForEntity(allSales, 'utm_campaign', c.name, c.id)))
      .filter((r: EntityRow) => r.spend > 0 || r.compras > 0)
      .sort((a: EntityRow, b: EntityRow) => b.spend - a.spend);

    const adsets: EntityRow[] = adsetList
      .map((a: any) => buildRow({ id: a.id, name: a.name }, adsetInsMap.get(a.id), webhookSalesForEntity(allSales, 'utm_medium', a.name, a.id)))
      .filter((r: EntityRow) => r.spend > 0 || r.compras > 0)
      .sort((a: EntityRow, b: EntityRow) => b.spend - a.spend);

    const ads: EntityRow[] = adList
      .map((a: any) => {
        const thumb  = (a as any).creative?.thumbnail_url || null;
        return buildRow({ id: a.id, name: a.name, thumbnail: thumb }, adInsMap.get(a.id), webhookSalesForEntity(allSales, 'utm_content', a.name, a.id));
      })
      .filter((r: EntityRow) => r.spend > 0 || r.compras > 0)
      .sort((a: EntityRow, b: EntityRow) => b.spend - a.spend);

    const totalMetaSpend = campaigns.reduce((s: number, c: EntityRow) => s + c.spend, 0);

    const result = {
      totalMetaSpend,
      totalWebhookSales,
      totalApiSales,
      totalWebhookRevenue,
      totalApiRevenue,
      attrBreakdown,
      // Explicit API limitation statement (per business rules)
      apiAttributionNote: historicalInPeriod.length > 0
        ? `Hotmart History API retornou ${historicalInPeriod.length} vendas com dados de tracking parciais (purchase.tracking). Campos utm_* completos disponíveis apenas via webhook.`
        : 'Nenhuma venda histórica com tracking recuperada da API Hotmart no período.',
      campaigns, adsets, ads,
    };

    setCache(ck, result);
    return NextResponse.json(result);

  } catch (e: any) {
    console.error('[vendas-por-origem]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
