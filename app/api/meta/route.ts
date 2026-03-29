import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, mapObjective, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';
import { fetchHotmartSales, fetchHotmartCommissions, CommissionData } from '@/app/lib/hotmartApi';
import { getAllRates, getConvertedValue, convertToBRLOnDate } from '@/app/lib/currency';

export const dynamic         = 'force-dynamic';
export const runtime         = 'nodejs';
export const preferredRegion = 'gru1'; // São Paulo, Brasil — necessário para acessar API da Hotmart

function cleanStr(s: string) {
  return (s || '').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, ''); 
}

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

  const cacheKey = `fast|all|${dateFrom}|${dateTo}|${campaignId || 'all'}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const META_BASE = 'https://graph.facebook.com/v19.0';
    const dSince = dateFrom || null;
    const dUntil = dateTo   || null;

    const accountInsightFields = 'spend,impressions,clicks,outbound_clicks,cpc,ctr,actions,action_values,date_start';
    const campaignInsightFields = INSIGHT_FIELDS.join(',');

    // Build URLSearchParams to ensure correct encoding of time_range JSON
    const buildInsightParams = (level: string, extraFields?: string): URLSearchParams => {
      const p = new URLSearchParams({
        fields: level === 'account' ? accountInsightFields : (extraFields || campaignInsightFields),
        level,
        limit: '500',
        access_token: accessToken!,
      });
      if (dSince && dUntil) {
        p.set('time_range', JSON.stringify({ since: dSince, until: dUntil }));
      } else {
        p.set('date_preset', 'last_30d');
      }
      if (campaignId && level !== 'account') {
        p.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]));
      }
      return p;
    };

    const campaignParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,created_time,objective',
      limit: '1000',
      access_token: accessToken!,
    });

    // ── Fetch data in parallel via HTTP with proper URL encoding ──
    const hotmartStart = dSince ? `${dSince}T00:00:00-03:00` : '2026-01-01T00:00:00-03:00';
    const hotmartEnd   = dUntil ? `${dUntil}T23:59:59-03:00` : '2026-12-31T23:59:59-03:00';

    const [summaryRes, campaignsRes, campInsightsRes, hotmartSales, commissionMap] = await Promise.all([
      fetch(`${META_BASE}/${adAccountId}/insights?${buildInsightParams('account')}`).then(r => r.json()),
      fetch(`${META_BASE}/${adAccountId}/campaigns?${campaignParams}`).then(r => r.json()),
      fetch(`${META_BASE}/${adAccountId}/insights?${buildInsightParams('campaign')}`).then(r => r.json()),
      fetchHotmartSales(hotmartStart, hotmartEnd).catch(() => [] as any[]),
      // Busca comissões em paralelo — dá o valor líquido real (já deduzido co-produtor + Hotmart)
      fetchHotmartCommissions(hotmartStart, hotmartEnd).catch(() => new Map<string, CommissionData>()),
    ]);

    if (summaryRes.error)      throw new Error(JSON.stringify(summaryRes.error));
    if (campaignsRes.error)    throw new Error(JSON.stringify(campaignsRes.error));
    if (campInsightsRes.error) throw new Error(JSON.stringify(campInsightsRes.error));

    const summaryInsights   = summaryRes.data      || [];
    const allCampaigns      = campaignsRes.data    || [];
    const campaignsInsights = campInsightsRes.data || [];


    // ── Deduplicate Hotmart Sales and Convert Currencies per sale date ──
    const uniqueTxIds = new Set();
    const foreignSales = hotmartSales.filter((s: any) => {
      const txId = s.purchase?.transaction;
      const isApproved = ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(s.purchase?.status);
      const isNew = !uniqueTxIds.has(txId);
      if (isApproved && isNew) { uniqueTxIds.add(txId); return true; }
      return false;
    }).filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') !== 'BRL');

    // ── Convert LATAM gross + enrich with producer_net_brl ──────────────────
    // DESCOBERTA (debug 29/03/26): commission.value é SEMPRE em USD (moeda payout)
    // Para match exato com "Valor que você recebeu convertido" do CSV/painel Hotmart:
    //   net_BRL = producer_net_USD × BRL/USD_{data_da_venda}
    //   = convertToBRLOnDate(producer_net, 'USD', dateIso)
    await Promise.all(foreignSales.map(async (s: any) => {
      const dateIso = (s.purchase?.approved_date || s.purchase?.order_date)
        ? new Date(s.purchase.approved_date || s.purchase.order_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const rawValue = s.purchase.price?.actual_value ?? s.purchase.price?.value ?? 0;

      // 1. Gross converted to BRL (as before)
      s.purchase.price.converted_value = await convertToBRLOnDate(
        rawValue, s.purchase.price.currency_code, dateIso
      );

      // 2. Commission enrichment + producer_net_brl (exact match with Hotmart dashboard)
      const tx = s.purchase?.transaction;
      if (tx && commissionMap.has(tx)) {
        const cd: CommissionData = commissionMap.get(tx)!;
        s.purchase.producer_net     = cd.producerNet;   // USD
        s.purchase.co_producers     = cd.coProducers;
        // Convert USD net to BRL at the same historical rate → match com CSV
        s.purchase.producer_net_brl = await convertToBRLOnDate(cd.producerNet, 'USD', dateIso);
      }
    }));

    // BRL sales: converted_value = actual_value ?? value
    const uniqueTxIds2 = new Set();
    const cleanSales = hotmartSales.filter((s: any) => {
      const txId = s.purchase?.transaction;
      const isApproved = ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(s.purchase?.status);
      if (isApproved && !uniqueTxIds2.has(txId)) {
        uniqueTxIds2.add(txId);
        if ((s.purchase?.price?.currency_code || 'BRL') === 'BRL') {
          s.purchase.price.converted_value = s.purchase.price?.actual_value ?? s.purchase.price?.value ?? 0;
        }
        return true;
      }
      return false;
    });

    // ── Final enrichment: BRL sales commission + hotmart_fee_total ────────────
    // LATAM already enriched above (inside foreignSales loop with dateIso)
    // BRL sales: commission.value is already in BRL (payout currency = BRL)
    cleanSales.forEach((s: any) => {
      const tx  = s.purchase?.transaction;
      const cur = s.purchase?.price?.currency_code || 'BRL';
      if (tx && commissionMap.has(tx) && cur === 'BRL') {
        const cd: CommissionData = commissionMap.get(tx)!;
        s.purchase.producer_net     = cd.producerNet;   // BRL for BRL sales
        s.purchase.producer_net_brl = cd.producerNet;   // same for BRL
        s.purchase.co_producers     = cd.coProducers;
      }
      s.purchase.hotmart_fee_total = s.purchase?.hotmart_fee?.total ?? 0;
    });

    // Revenue = producer_net_brl when available (exact), else converted_value (fallback)
    const globalHotmartRevenue = cleanSales.reduce((acc: number, s: any) => {
      const net = s.purchase?.producer_net_brl ?? s.purchase?.producer_net;
      return acc + (net != null ? net : (s.purchase?.price?.converted_value || s.purchase?.price?.value || 0));
    }, 0);
    const globalHotmartPurchases = cleanSales.length;

    // ── Map Meta Insights ──
    const insightsDict: Record<string, any> = {};
    for (const d of campaignsInsights) {
       insightsDict[d.campaign_id] = parseMetrics(d);
    }

    const matchCampaignToHotmart = (campName: string) => {
       const cleanCampaign = cleanStr(campName);
       const campTokens = campName.toLowerCase()
          .replace(/[\[\]\-\_\(\)]/g, ' ') 
          .split(/\s+/)
          .filter(t => t.length > 3) 
          .filter(t => !['vendas', 'leads', 'hybrid', 'paginas', 'campanha', 'oficial', 'atual', 'anuncio', 'geral', '2025', '2026', 'hotmart', 'meta', 'ads'].includes(t));

       let rev = 0;
       let qty = 0;
       const matchedProducts: string[] = [];
       
       cleanSales.forEach((s: any) => {
         const prodName = s.product?.name || '';
         const cleanProduct = cleanStr(prodName);
         
         const isMatch = cleanProduct.includes(cleanCampaign) || 
                         cleanCampaign.includes(cleanProduct) ||
                         campTokens.some(token => cleanProduct.includes(cleanStr(token)));

          if (isMatch) {
            rev += (s.purchase?.price?.converted_value || 0);
            qty += 1;
            if (!matchedProducts.includes(prodName)) matchedProducts.push(prodName);
          }
       });

       return { hotmartRevenue: rev, hotmartPurchases: qty, matchedProducts };
    };

    // ── Build Final TableData by Joining All Campaigns with their Insights ──
    const tableData = allCampaigns.map((c: any) => {
      const metrics = insightsDict[c.id] || { spend: 0, revenue: 0, roas: 0, cpa: 0, purchases: 0, leads: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, outboundClicks: 0 };
      const { hotmartRevenue, hotmartPurchases, matchedProducts } = matchCampaignToHotmart(c.name || '');
      
      return {
        id:          c.id,
        name:        c.name,
        status:      c.effective_status || c.status,
        createdTime: c.created_time,
        objective:   mapObjective(c.objective || ''),
        ...metrics,
        hotmartRevenue,
        hotmartPurchases,
        matchedProducts
      };
    }).sort((a: any, b: any) => {
        const diff = (b.status === 'ACTIVE' ? 1 : 0) - (a.status === 'ACTIVE' ? 1 : 0);
        if (diff !== 0) return diff;
        return b.spend - a.spend;
    });

    // ── Build Overview ──
    let overview: any = null;
    if (campaignId) {
       overview = tableData.find((c: any) => c.id === campaignId) || null;
    } else if (summaryInsights.length > 0) {
       const mainMetrics = parseMetrics(summaryInsights[0]);
       overview = {
          id: 'total',
          name: 'Total Geral',
          ...mainMetrics,
          hotmartRevenue: globalHotmartRevenue,
          hotmartPurchases: globalHotmartPurchases
       };
    }

    const spendByObjective: Record<string, number> = { VENDAS: 0, LEADS: 0, OUTROS: 0 };
    for (const c of tableData) {
      spendByObjective[c.objective] = (spendByObjective[c.objective] || 0) + c.spend;
    }

    const result = { overview, tableData, spendByObjective, globalHotmartRevenue, hotmartSales: cleanSales };
    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    const metaError = error?.response?.error || error?.response?.data || error?.message || String(error);
    console.error('[/api/meta] Error:', metaError);
    return NextResponse.json({ error: 'Meta API error', detail: metaError }, { status: 500 });
  }
}
