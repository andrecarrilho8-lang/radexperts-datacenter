import { NextResponse } from 'next/server';
import { getWebhookSales, type WebhookSale } from '@/app/lib/webhookStore';
import { getCache, setCache, parseMetrics } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

const BASE   = 'https://graph.facebook.com/v19.0';
const FIELDS = 'spend,impressions,clicks,actions,action_values,outbound_clicks,landing_page_view';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
async function metaGet(url: string) {
  const r = await fetch(url);
  return r.json();
}

async function metaPaged(url: string): Promise<any[]> {
  const items: any[] = [];
  let nextUrl = url;
  while (nextUrl) {
    const j = await metaGet(nextUrl);
    if (j.error) { console.error('[vpo] Meta error:', j.error.message); break; }
    items.push(...(j.data || []));
    nextUrl = j.paging?.next || '';
  }
  return items;
}

/* ── UTM → Meta campaign match ──────────────────────────────────────────── */
/**
 * Matches utm_* value from webhook against a Meta entity name.
 * Priority:
 *  1. Exact string match
 *  2. Case-insensitive match
 *  3. Underscore/hyphen-normalised match
 *  4. One contains the other (min 5 chars)
 */
function utmMatch(utmValue: string | null, entityName: string): boolean {
  if (!utmValue || !entityName) return false;
  if (utmValue === entityName) return true;

  const u = utmValue.toLowerCase().trim();
  const e = entityName.toLowerCase().trim();
  if (u === e) return true;

  // Normalize: hyphens/underscores/spaces all become spaces
  const norm = (s: string) => s.replace(/[-_\s]+/g, ' ').trim();
  if (norm(u) === norm(e)) return true;

  // Substring match (only for meaningful lengths)
  if (u.length >= 6 && e.includes(u)) return true;
  if (e.length >= 6 && u.includes(e)) return true;

  return false;
}

function matchingSales(
  sales:  WebhookSale[],
  field:  'utm_campaign' | 'utm_medium' | 'utm_content',
  name:   string,
  adId?:  string,
): WebhookSale[] {
  return sales.filter(s => {
    // utm_term sometimes carries the Meta ad ID (exact match)
    if (field === 'utm_content' && adId && s.utm_term === adId) return true;
    return utmMatch(s[field], name);
  });
}

/* ── Row builder ─────────────────────────────────────────────────────────── */
function buildRow(
  entity:    { id: string; name: string; thumbnail?: string | null },
  insData:   any | null,
  wSales:    WebhookSale[],
) {
  const m         = insData ? parseMetrics(insData) : null;
  const spend     = m?.spend            ?? 0;
  const checkouts = m?.checkouts        ?? 0;
  const pageviews = m?.landingPageViews ?? 0;

  const compras  = wSales.length;
  const revenue  = wSales.reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

  const cpa              = compras   > 0 ? spend     / compras              : 0;
  const compraCheckout   = checkouts > 0 ? (compras  / checkouts) * 100     : 0;
  const checkoutPageview = pageviews > 0 ? (checkouts / pageviews) * 100    : 0;
  const cpCheckout       = checkouts > 0 ? spend     / checkouts             : 0;

  return {
    id:           entity.id   || null,
    name:         entity.name || '—',
    thumbnail:    entity.thumbnail || null,
    spend,
    checkouts,
    pageviews,
    compras,
    revenue,
    cpa,
    compraCheckout,
    checkoutPageview,
    cpCheckout,
    webhookSales: compras,
    apiSales:     0,
    missingSales: 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/trafego/vendas-por-origem
   ══════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo   = searchParams.get('dateTo')   || new Date().toISOString().slice(0, 10);
  const force    = searchParams.get('force') === '1';

  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account)
    return NextResponse.json({ error: 'Missing META credentials' }, { status: 500 });

  const ck = `vpo6|${dateFrom}|${dateTo}`;
  if (!force) {
    const cached = getCache(ck);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const fromMs = new Date(dateFrom).getTime();
    const toMs   = new Date(`${dateTo}T23:59:59`).getTime();

    const tr  = `time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`;
    const tok = `access_token=${token}`;
    const INS = `${FIELDS}&limit=500&${tok}`;
    const Q   = `limit=500&${tok}`;

    /* ── Meta: fetch all in parallel (no Hotmart call) ── */
    const [
      campInsRaw, adsetInsRaw, adInsRaw,
      campList,   adsetList,   adList,
    ] = await Promise.all([
      metaGet(`${BASE}/${account}/insights?level=campaign&fields=campaign_id,campaign_name,${INS}&${tr}`),
      metaGet(`${BASE}/${account}/insights?level=adset&fields=adset_id,adset_name,${INS}&${tr}`),
      metaGet(`${BASE}/${account}/insights?level=ad&fields=ad_id,ad_name,${INS}&${tr}`),
      metaPaged(`${BASE}/${account}/campaigns?fields=id,name,status,daily_budget,effective_status&${Q}`),
      metaPaged(`${BASE}/${account}/adsets?fields=id,name,status,campaign_id&${Q}`),
      metaPaged(`${BASE}/${account}/ads?fields=id,name,adset_id,campaign_id,creative{thumbnail_url}&${Q}`),
    ]);

    /* ── Index Meta insights by entity ID ── */
    const campIns  = new Map<string, any>();
    const adsetIns = new Map<string, any>();
    const adIns    = new Map<string, any>();
    (campInsRaw.data  || []).forEach((d: any) => campIns.set(d.campaign_id, d));
    (adsetInsRaw.data || []).forEach((d: any) => adsetIns.set(d.adset_id, d));
    (adInsRaw.data    || []).forEach((d: any) => adIns.set(d.ad_id, d));

    /* ── Webhook sales filtered to period ── */
    const allSales = getWebhookSales().filter(s => {
      const ts = s.approvedDateMs || Date.parse(s.orderDate);
      return ts >= fromMs && ts <= toMs;
    });

    const attrBreakdown = { complete: 0, partial: 0, missing: 0 };
    allSales.forEach(s => { attrBreakdown[s.attribution_status]++; });

    const totalWebhookSales   = allSales.length;
    const totalWebhookRevenue = allSales.reduce((s, x) => s + (x.amountBrl || x.amount || 0), 0);

    /* ── Build rows: only include entities with spend OR webhook sales ── */
    const campaigns = campList
      .map((c: any) => buildRow(
        { id: c.id, name: c.name },
        campIns.get(c.id) || null,
        matchingSales(allSales, 'utm_campaign', c.name),
      ))
      .filter((r: any) => r.spend > 0 || r.compras > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const adsets = adsetList
      .map((a: any) => buildRow(
        { id: a.id, name: a.name },
        adsetIns.get(a.id) || null,
        matchingSales(allSales, 'utm_medium', a.name),
      ))
      .filter((r: any) => r.spend > 0 || r.compras > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const ads = adList
      .map((a: any) => buildRow(
        { id: a.id, name: a.name, thumbnail: (a as any).creative?.thumbnail_url || null },
        adIns.get(a.id) || null,
        matchingSales(allSales, 'utm_content', a.name, a.id),
      ))
      .filter((r: any) => r.spend > 0 || r.compras > 0)
      .sort((a: any, b: any) => b.spend - a.spend);

    const totalMetaSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0);

    /* ── API limitation note (explicit) ── */
    const apiAttributionNote =
      'Fonte: Webhook Hotmart (tempo real). Vendas históricas anteriores ao deploy não são rastreadas via webhook.';

    const result = {
      totalMetaSpend,
      totalWebhookSales,
      totalApiSales:       0,
      totalWebhookRevenue,
      totalApiRevenue:     0,
      attrBreakdown,
      apiAttributionNote,
      campaigns,
      adsets,
      ads,
    };

    // Cache 5 minutes
    setCache(ck, result);
    return NextResponse.json(result);

  } catch (e: any) {
    console.error('[vendas-por-origem]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
