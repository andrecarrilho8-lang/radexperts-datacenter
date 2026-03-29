import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';

function cleanStr(s: string) {
  return (s || '').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, ''); // Keep only letters and numbers
}

// Mapeamentos explícitos: se o nome da campanha contiver a keyword,
// inclui automaticamente os produtos listados no matching.
const CAMPAIGN_KEYWORD_MAP: { keyword: string; products: string[] }[] = [
  { keyword: 'latam', products: ['NeuroExpert - Posgrado en Neuroradiología'] },
  // Adicione mais regras abaixo conforme necessário:
  // { keyword: 'alzheimer', products: ['Avanços na Doença de Alzheimer'] },
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const campaignName = searchParams.get('campaignName');

  if (!dateFrom || !dateTo || !campaignName) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const dSince = `${dateFrom}T00:00:00-03:00`;
    const dUntil = `${dateTo}T23:59:59-03:00`;
    
    // Fetch all sales for the period
    const allSales = await fetchHotmartSales(dSince, dUntil);
    
    const normCampName = cleanStr(campaignName);
    
    // Extraction of unique identifying tokens
    const campTokens = campaignName.toLowerCase()
      .replace(/[\[\]\-\_\(\)]/g, ' ') 
      .split(/\s+/)
      .filter(t => t.length > 3) 
      .filter(t => !['vendas', 'leads', 'hybrid', 'paginas', 'campanha', 'oficial', 'atual', 'anuncio', 'geral', '2025', '2026'].includes(t));

    const matchedProductsNames: Set<string> = new Set();
    const uniqueTxIds = new Set();
    let grossRevenue = 0;
    let userCommission = 0;
    let purchaseCount = 0;

    // Resolve explicit keyword overrides for this campaign
    const campNameLower = campaignName.toLowerCase();
    const forcedProducts = new Set<string>();
    for (const map of CAMPAIGN_KEYWORD_MAP) {
      if (campNameLower.includes(map.keyword.toLowerCase())) {
        map.products.forEach(p => forcedProducts.add(p));
      }
    }

    allSales.forEach(s => {
      const prodName = s.product?.name || '';
      const cleanProduct = cleanStr(prodName);
      const purchase = s.purchase || {};
      const txId = purchase.transaction;

      // Status check (Approved only)
      const isApproved = ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(purchase.status);
      if (!isApproved) return;

      // Explicit override first (e.g. latam → NeuroExpert Posgrado)
      const isForced = forcedProducts.has(prodName);

      // Generic token match as fallback
      const isGenericMatch = !isForced && (
        cleanProduct.includes(normCampName) ||
        normCampName.includes(cleanProduct) ||
        campTokens.some(token => cleanProduct.includes(cleanStr(token)))
      );

      if ((isForced || isGenericMatch) && !uniqueTxIds.has(txId)) {
        uniqueTxIds.add(txId);
        matchedProductsNames.add(prodName);
        grossRevenue += (purchase.price?.value || 0);
        userCommission += (purchase.commission?.value || 0);
        purchaseCount++;
      }
    });

    return NextResponse.json({ 
      success: true, 
      revenue: grossRevenue, // Total gross value for ROAS
      userShare: userCommission, // What the user actually earned
      purchases: purchaseCount,
      matchedProducts: Array.from(matchedProductsNames)
    });

  } catch (error: any) {
    console.error('[/api/meta/campaign/hotmart] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
