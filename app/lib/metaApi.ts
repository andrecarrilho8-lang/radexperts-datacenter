// @ts-ignore
import bizSdk from 'facebook-nodejs-business-sdk';


// ── In-memory LRU cache (persists across requests in the same Node process) ──
const CACHE = new Map<string, { data: any; ts: number }>();
const TTL_MS = 6 * 60 * 1000; // 6 minutes (default)

export function getCache(key: string): any | null {
  const entry = CACHE.get(key);
  if (!entry) return null;

  // New logic: If the saved object has an "expires_at" field, respect it over the global TTL.
  // This allows long-term caching for heavy reports.
  if (entry.data && typeof entry.data === 'object' && entry.data.expires_at) {
    if (entry.data.expires_at < Date.now()) {
        CACHE.delete(key);
        return null;
    }
    return entry.data;
  }

  if (Date.now() - entry.ts < TTL_MS) return entry.data;
  CACHE.delete(key);
  return null;
}

export function setCache(key: string, data: any): void {
  CACHE.set(key, { data, ts: Date.now() });
  // Evict oldest entries if cache grows too large
  if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value!);
}
export function invalidateCache(): void { CACHE.clear(); }
export function getCacheSize(): number { return CACHE.size; }

// ── Objective mapper ─────────────────────────────────────────────────────────
export const mapObjective = (raw: string): 'VENDAS' | 'LEADS' | 'OUTROS' => {
  const u = (raw || '').toUpperCase();
  if (u.includes('SALES') || u.includes('CONVERSIONS') || u === 'OUTCOME_SALES') return 'VENDAS';
  if (u.includes('LEAD')  || u === 'OUTCOME_LEADS'    || u === 'LEAD_GENERATION') return 'LEADS';
  return 'OUTROS';
};

// ── Core metrics parser (campaign & ad level) ────────────────────────────────
export const parseMetrics = (data: any) => {
  const actions      = data.actions      || [];
  const actionValues = data.action_values || [];

  const getVal = (type: string) => {
    const a = actions.find((x: any) => x.action_type === type);
    return a ? parseInt(a.value, 10) : 0;
  };
  const getMoney = (type: string) => {
    const a = actionValues.find((x: any) => x.action_type === type);
    return a ? parseFloat(a.value) : 0;
  };

  const purchases        = getVal('purchase') || getVal('offsite_conversion.fb_pixel_purchase');
  const leads            = getVal('lead')     || getVal('offsite_conversion.fb_pixel_lead');
  const revenue          = getMoney('purchase') || getMoney('offsite_conversion.fb_pixel_purchase');
  const landingPageViews = getVal('landing_page_view');
  const checkouts        = getVal('initiate_checkout') || getVal('offsite_conversion.fb_pixel_initiate_checkout');

  const outboundArr     = data.outbound_clicks || [];
  const outboundClicks  = Math.max(outboundArr.reduce((s: number, x: any) => s + parseInt(x.value, 10), 0), 1);

  const spend        = parseFloat(data.spend) || 0;
  const connectRate  = Math.min((landingPageViews / outboundClicks) * 100, 100);
  const checkoutRate = landingPageViews > 0 ? Math.min((checkouts / landingPageViews) * 100, 100) : 0;
  const purchaseRate = checkouts > 0 ? Math.min((purchases / checkouts) * 100, 100) : 0;
  const conversionRate = landingPageViews > 0 ? Math.min((leads / landingPageViews) * 100, 100) : 0;

  return {
    spend,
    revenue,
    roas:          spend > 0     ? revenue   / spend     : 0,
    cpa:           purchases > 0 ? spend     / purchases : 0,
    costPerLead:   leads > 0     ? spend     / leads      : 0,
    purchases, leads, landingPageViews, checkouts, outboundClicks,
    connectRate, checkoutRate, purchaseRate, conversionRate,
    impressions:   parseInt(data.impressions, 10) || 0,
    clicks:        parseInt(data.clicks, 10)      || 0,
    ctr:           parseFloat(data.ctr)           || 0,
    cpc:           parseFloat(data.cpc)           || 0,
    cpm:           parseFloat(data.cpm)           || (parseFloat(data.spend) / (parseInt(data.impressions, 10) || 1)) * 1000,
  };
};

// ── SDK init helper ──────────────────────────────────────────────────────────
export function initSDK(accessToken: string) {
  bizSdk.FacebookAdsApi.init(accessToken);
  return { AdAccount: bizSdk.AdAccount, Campaign: bizSdk.Campaign };
}

export const INSIGHT_FIELDS = [
  'campaign_name', 'campaign_id', 'spend', 'impressions',
  'clicks', 'outbound_clicks', 'cpc', 'ctr',
  'actions', 'action_values', 'date_start',
];

export const AD_INSIGHT_FIELDS = [
  'ad_id', 'ad_name', 'campaign_id', 'campaign_name', 'spend', 'impressions',
  'clicks', 'outbound_clicks', 'cpc', 'ctr', 'actions', 'action_values',
];
