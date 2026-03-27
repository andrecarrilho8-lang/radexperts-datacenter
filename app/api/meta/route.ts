import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK, mapObjective, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';

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
    const { AdAccount } = initSDK(accessToken);
    const account       = new AdAccount(adAccountId);

    const dSince = dateFrom ? `${dateFrom}T00:00:00-03:00` : null;
    const dUntil = dateTo ? `${dateTo}T23:59:59-03:00` : null;

    const dateRange = dSince && dUntil
      ? { time_range: { since: dateFrom!, until: dateTo! } }
      : { date_preset: 'last_30d' };

    const campaignFilter = campaignId
      ? [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]
      : undefined;

    // ── Fetch data in parallel ──
    const [summaryInsights, allCampaigns, campaignsInsights, hotmartSales] = await Promise.all([
      account.getInsights(INSIGHT_FIELDS, { level: 'account', ...dateRange }),
      account.getCampaigns(
        ['id', 'name', 'status', 'effective_status', 'created_time', 'objective'],
        { limit: 1000 }
      ),
      account.getInsights(INSIGHT_FIELDS, { level: 'campaign', limit: 500, ...dateRange }),
      fetchHotmartSales(dSince || '2026-01-01T00:00:00-03:00', dUntil || '2026-12-31T23:59:59-03:00').catch(() => [])
    ]);

    // ── Deduplicate Hotmart Sales ──
    const uniqueTxIds = new Set();
    const cleanSales = hotmartSales.filter((s: any) => {
      const txId = s.purchase?.transaction;
      const isApproved = ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(s.purchase?.status);
      if (isApproved && !uniqueTxIds.has(txId)) {
        uniqueTxIds.add(txId);
        return true;
      }
      return false;
    });

    const globalHotmartRevenue = cleanSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.value || 0), 0);
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
            rev += (s.purchase?.price?.value || 0);
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
       overview = tableData.find(c => c.id === campaignId) || null;
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
    console.error('[/api/meta] Error:', error?.response?.error || error.message);
    return NextResponse.json({ error: 'Meta API error' }, { status: 500 });
  }
}
