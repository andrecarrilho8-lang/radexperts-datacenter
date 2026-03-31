import { NextResponse } from 'next/server';
import { getWebhookSales, type WebhookSale } from '@/app/lib/webhookStore';
import { getCache, setCache, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

const BASE = 'https://graph.facebook.com/v19.0';

/* ── Meta fetch helpers ─────────────────────────────────────────────────── */
async function metaGet(url: string): Promise<any> {
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) console.error('[vpo] Meta API error:', j.error.message, '| url:', url.slice(0, 120));
  return j;
}

async function metaPaged(url: string): Promise<any[]> {
  const items: any[] = [];
  let next = url;
  while (next) {
    const j = await metaGet(next);
    if (j.error) break;
    items.push(...(j.data || []));
    next = j.paging?.next || '';
  }
  return items;
}

/* ── UTM → Meta entity match ────────────────────────────────────────────── */
function utmMatch(utmValue: string | null, entityName: string): boolean {
  if (!utmValue || !entityName) return false;
  if (utmValue === entityName) return true;

  const u = utmValue.toLowerCase().trim();
  const e = entityName.toLowerCase().trim();
  if (u === e) return true;

  const norm = (s: string) => s.replace(/[-_\s]+/g, ' ').trim();
  if (norm(u) === norm(e)) return true;

  if (u.length >= 6 && e.includes(u)) return true;
  if (e.length >= 6 && u.includes(e)) return true;

  return false;
}

function matchSales(
  sales: WebhookSale[],
  field: 'utm_campaign' | 'utm_medium' | 'utm_content',
  name:  string,
  adId?: string,
): WebhookSale[] {
  return sales.filter(s => {
    if (field === 'utm_content' && adId && s.utm_term === adId) return true;
    return utmMatch(s[field], name);
  });
}

/* ── Row builder ────────────────────────────────────────────────────────── */
function buildRow(
  id:        string,
  name:      string,
  thumbnail: string | null,
  insData:   any | null,
  wSales:    WebhookSale[],
) {
  const m         = insData ? parseMetrics(insData) : null;
  const spend     = m?.spend            ?? 0;
  const checkouts = m?.checkouts        ?? 0;
  const pageviews = m?.landingPageViews ?? 0;
  const compras   = wSales.length;
  const revenue   = wSales.reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

  return {
    id, name, thumbnail,
    spend, checkouts, pageviews, compras, revenue,
    cpa:              compras   > 0 ? spend     / compras              : 0,
    compraCheckout:   checkouts > 0 ? (compras  / checkouts) * 100     : 0,
    checkoutPageview: pageviews > 0 ? (checkouts / pageviews) * 100    : 0,
    cpCheckout:       checkouts > 0 ? spend     / checkouts             : 0,
    webhookSales: wSales.filter(s => s.source === 'webhook').length,
    apiSales:     wSales.filter(s => s.source === 'api').length,
    reportSales:  wSales.filter(s => s.source === 'report').length,
    missingSales: 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/trafego/vendas-por-origem
   ══════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom')
    || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo   = searchParams.get('dateTo')
    || new Date().toISOString().slice(0, 10);
  const force    = searchParams.get('force') === '1';

  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account)
    return NextResponse.json({ error: 'Missing META credentials' }, { status: 500 });

  const ck = `vpo7|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(ck);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const fromMs = new Date(dateFrom).getTime();
    const toMs   = new Date(`${dateTo}T23:59:59`).getTime();

    // Use the exact same insight fields that the working Análise de Tráfego uses
    const insFields = INSIGHT_FIELDS.join(',');
    const tr        = `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`;
    const tok       = `access_token=${token}`;

    /* ── Fetch all Meta data in parallel – NO Hotmart API call ── */
    const [campInsRaw, adsetInsRaw, adInsRaw, campList, adsetList, adList] =
      await Promise.all([
        metaGet(`${BASE}/${account}/insights?level=campaign&fields=${insFields}&${tr}&limit=500&${tok}`),
        metaGet(`${BASE}/${account}/insights?level=adset&fields=${insFields},adset_id,adset_name&${tr}&limit=500&${tok}`),
        metaGet(`${BASE}/${account}/insights?level=ad&fields=${insFields},ad_id,ad_name&${tr}&limit=500&${tok}`),
        metaPaged(`${BASE}/${account}/campaigns?fields=id,name,status,effective_status,daily_budget&limit=500&${tok}`),
        metaPaged(`${BASE}/${account}/adsets?fields=id,name,status,campaign_id&limit=500&${tok}`),
        metaPaged(`${BASE}/${account}/ads?fields=id,name,adset_id,campaign_id,creative{thumbnail_url}&limit=500&${tok}`),
      ]);

    /* ── Index insights by entity ID ── */
    const campIns  = new Map<string, any>();
    const adsetIns = new Map<string, any>();
    const adIns    = new Map<string, any>();

    ((campInsRaw.data  || []) as any[]).forEach((d: any) => campIns.set(d.campaign_id, d));
    ((adsetInsRaw.data || []) as any[]).forEach((d: any) => adsetIns.set(d.adset_id,   d));
    ((adInsRaw.data    || []) as any[]).forEach((d: any) => adIns.set(d.ad_id,         d));

    /* ── Webhook sales filtered to the selected period ── */
    const allSales = getWebhookSales().filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });

    const attrBreakdown = { complete: 0, partial: 0, missing: 0 };
    allSales.forEach(s => { attrBreakdown[s.attribution_status]++; });

    /* ── Build rows: show entities with spend OR webhook sales ── */
    const campaigns = campList
      .map((c: any) => buildRow(
        c.id, c.name, null,
        campIns.get(c.id) ?? null,
        matchSales(allSales, 'utm_campaign', c.name),
      ))
      .filter((r: any) => r.spend > 0 || r.compras > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const adsets = adsetList
      .map((a: any) => buildRow(
        a.id, a.name, null,
        adsetIns.get(a.id) ?? null,
        matchSales(allSales, 'utm_medium', a.name),
      ))
      .filter((r: any) => r.spend > 0 || r.compras > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const ads = adList
      .map((a: any) => buildRow(
        a.id, a.name,
        (a as any).creative?.thumbnail_url || null,
        adIns.get(a.id) ?? null,
        matchSales(allSales, 'utm_content', a.name, a.id),
      ))
      .filter((r: any) => r.spend > 0 || r.compras > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    /* ── Diagnostics ── */
    const metaErrors = [campInsRaw, adsetInsRaw, adInsRaw]
      .map(r => r.error?.message)
      .filter(Boolean);

    const totalMetaSpend     = campaigns.reduce((s: number, c: any) => s + c.spend, 0);
    const totalWebhookSales   = allSales.filter(s => s.source === 'webhook').length;
    const totalReportSales    = allSales.filter(s => s.source === 'report').length;
    const totalWebhookRevenue = allSales.filter(s => s.source === 'webhook').reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);
    const totalReportRevenue  = allSales.filter(s => s.source === 'report').reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

    const result = {
      totalMetaSpend,
      totalWebhookSales,
      totalReportSales,
      totalApiSales:       0,
      totalWebhookRevenue,
      totalReportRevenue,
      totalApiRevenue:     0,
      attrBreakdown,
      apiAttributionNote: metaErrors.length > 0
        ? `⚠️ Meta API erros: ${metaErrors.join('; ')}`
        : `Fonte: Webhook Hotmart. Campanhas: ${campaigns.length}, Conjuntos: ${adsets.length}, Anúncios: ${ads.length}.`,
      campaigns, adsets, ads,
      // Debug info (remove in prod if desired)
      _debug: {
        totalCampaigns:    campList.length,
        totalAdsets:       adsetList.length,
        totalAds:          adList.length,
        insightsCampaigns: (campInsRaw.data || []).length,
        insightsAdsets:    (adsetInsRaw.data || []).length,
        insightsAds:       (adInsRaw.data || []).length,
        webhookSalesInPeriod: allSales.length,
        metaErrors,
      },
    };

    setCache(ck, result);
    return NextResponse.json(result);

  } catch (e: any) {
    console.error('[vendas-por-origem FATAL]', e.message);
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
