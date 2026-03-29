import { NextResponse } from 'next/server';
import { fetchHotmartSales, fetchHotmartCommissions } from '@/app/lib/hotmartApi';
import { convertToBRLOnDate } from '@/app/lib/currency';

function cleanStr(s: string) {
  return (s || '').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, '');
}

// Mapeamentos explícitos: se o nome da campanha contiver a keyword,
// inclui automaticamente os produtos listados no matching.
const CAMPAIGN_KEYWORD_MAP: { keyword: string; products: string[] }[] = [
  { keyword: 'latam', products: ['NeuroExpert - Posgrado en Neuroradiología'] },
  // Adicione mais regras abaixo conforme necessário:
  // { keyword: 'alzheimer', products: ['Avanços na Doença de Alzheimer'] },
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = await params;
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const campaignName = searchParams.get('campaignName');
  const manualProductsParam = searchParams.get('manualProducts'); // comma-separated override

  if (!dateFrom || !dateTo || !campaignName) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const dSince = `${dateFrom}T00:00:00-03:00`;
    const dUntil = `${dateTo}T23:59:59-03:00`;

    const allSales         = await fetchHotmartSales(dSince, dUntil);
    const commissionMap    = await fetchHotmartCommissions(dSince, dUntil).catch(() => new Map());

    const normCampName = cleanStr(campaignName);
    const campTokens = campaignName.toLowerCase()
      .replace(/[\[\]\-\_\(\)]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3)
      .filter(t => !['vendas', 'leads', 'hybrid', 'paginas', 'campanha', 'oficial', 'atual', 'anuncio', 'geral', '2025', '2026'].includes(t));

    // Resolve explicit keyword overrides
    const campNameLower = campaignName.toLowerCase();
    const forcedProducts = new Set<string>();
    // Se manualProducts foi passado, sobrescreve todo o matching automático
    const manualProductSet: Set<string> | null = manualProductsParam
      ? new Set(manualProductsParam.split('|').map(p => p.trim()).filter(Boolean))
      : null;

    for (const map of CAMPAIGN_KEYWORD_MAP) {
      if (!manualProductSet && campNameLower.includes(map.keyword.toLowerCase())) {
        map.products.forEach(p => forcedProducts.add(p));
      }
    }

    // Collect matched sales (deduped)
    const matchedProductsNames: Set<string> = new Set();
    const uniqueTxIds = new Set<string>();
    const matchedSales: { value: number; netBRL: number; currency: string; dateIso: string }[] = [];

    for (const s of allSales) {
      const prodName = s.product?.name || '';
      const cleanProduct = cleanStr(prodName);
      const purchase = s.purchase || {};
      const txId = purchase.transaction;

      const isApproved = ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(purchase.status);
      if (!isApproved) continue;

      // Manual override: só produtos selecionados
      const isManualMatch = manualProductSet ? manualProductSet.has(prodName) : false;

      const isForced = !manualProductSet && forcedProducts.has(prodName);
      const isGenericMatch = !manualProductSet && !isForced && (
        cleanProduct.includes(normCampName) ||
        normCampName.includes(cleanProduct) ||
        campTokens.some((token: string) => cleanProduct.includes(cleanStr(token)))
      );

      if ((isManualMatch || isForced || isGenericMatch) && !uniqueTxIds.has(txId)) {
        uniqueTxIds.add(txId);
        matchedProductsNames.add(prodName);
        const dateIso = (purchase.approved_date || purchase.order_date)
          ? new Date(purchase.approved_date || purchase.order_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        const currency = (purchase.price?.currency_code || 'BRL').toUpperCase();
        const grossValue = purchase.price?.actual_value ?? purchase.price?.value ?? 0;

        // Liquid net: use commission PRODUCER source when available
        const commData    = commissionMap.get(txId);
        const isBRL       = currency === 'BRL';
        let netValue: number;
        if (commData?.producerNet != null) {
          if (isBRL) {
            // BRL: commission already in BRL
            netValue = commData.producerNet;
          } else {
            // LATAM: commission.value is in USD payout currency — convert to BRL at historical rate
            netValue = await convertToBRLOnDate(commData.producerNet, 'USD', dateIso);
          }
        } else {
          // Fallback: gross × (1 - hotmartFee%)
          const feePct = purchase.hotmart_fee?.percentage ?? 0;
          const grossBRLFb = await convertToBRLOnDate(grossValue, currency, dateIso);
          netValue = grossBRLFb * (1 - feePct / 100);
        }

        matchedSales.push({ value: grossValue, netBRL: netValue, currency, dateIso });
      }
    }

    const revenueBRL  = matchedSales.reduce((a, s) => a + s.netBRL, 0);
    const purchaseCount = matchedSales.length;

    // Currency breakdown — convertedTotal now reflects net BRL
    const byCurrency: Record<string, { count: number; originalTotal: number; convertedTotal: number }> = {};
    for (const s of matchedSales) {
      if (!byCurrency[s.currency]) byCurrency[s.currency] = { count: 0, originalTotal: 0, convertedTotal: 0 };
      byCurrency[s.currency].count++;
      byCurrency[s.currency].originalTotal += s.value;
      byCurrency[s.currency].convertedTotal += s.netBRL;
    }

    // Gross BRL para tooltip
    const grossConversions = await Promise.all(
      matchedSales.map(s => convertToBRLOnDate(s.value, s.currency, s.dateIso))
    );
    const grossBRL = grossConversions.reduce((a, b) => a + b, 0);

    return NextResponse.json({
      success: true,
      revenue: revenueBRL,          // Líquido em BRL (producer_net)
      revenueBRL,                   // alias explícito
      grossBRL,                     // bruto BRL (para tooltip)
      hotmartFeesBRL: grossBRL - revenueBRL,
      purchases: purchaseCount,
      matchedProducts: Array.from(matchedProductsNames),
      currencyBreakdown: byCurrency,
    });

  } catch (error: any) {
    console.error('[/api/meta/campaign/hotmart] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
