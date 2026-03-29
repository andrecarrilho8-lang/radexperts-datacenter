import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { convertToBRLOnDate } from '@/app/lib/currency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Status que a Hotmart considera como venda confirmada (equivalente ao dashboard)
const APPROVED_STATUSES = new Set([
  'APPROVED',
  'COMPLETE',
  'PRODUCER_CONFIRMED',
  'CONFIRMED',
  'ACTIVE',       // assinatura ativa
  'STARTED',      // algumas plataformas usam este para aprovado
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo   = searchParams.get('dateTo');
  const product  = searchParams.get('product'); // nome exato do produto (vem do dropdown Hotmart)

  if (!dateFrom || !dateTo || !product) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    // Hotmart filtra por approved_date, não order_date
    const allSales = await fetchHotmartSales(
      `${dateFrom}T00:00:00-03:00`,
      `${dateTo}T23:59:59-03:00`
    );

    const productTrim = product.trim();
    const productLower = productTrim.toLowerCase();

    const uniqueTxIds = new Set<string>();
    const matchedSales: {
      value: number; currency: string; dateIso: string; productName: string; status: string;
    }[] = [];
    const matchedProductNames = new Set<string>();

    for (const s of allSales as any[]) {
      const prodName  = (s.product?.name || '').trim();
      const purchase  = s.purchase || {};
      const txId      = purchase.transaction;
      const status    = (purchase.status || '').toUpperCase();

      // Filtro de status igual ao dashboard Hotmart
      if (!APPROVED_STATUSES.has(status)) continue;
      // Deduplicação por transaction ID
      if (uniqueTxIds.has(txId)) continue;

      // Match: EXATO primeiro (case-insensitive) — nome vem do dropdown, é exato
      const pLower = prodName.toLowerCase();
      const isExact = pLower === productLower;

      // Fallback: o nome do produto Da Hotmart contém o que o usuário buscou
      // (para produtos com variações de nome — ex: "NeuroNews - Plano Anual")
      const isContains = !isExact && (
        pLower.startsWith(productLower) ||           // "NeuroNews - Turma X"
        productLower.startsWith(pLower)              // busca parcial
      );

      if (!isExact && !isContains) continue;

      uniqueTxIds.add(txId);
      matchedProductNames.add(prodName);

      // Usa approved_date para consistência com o dashboard Hotmart
      const dateIso = purchase.approved_date
        ? new Date(purchase.approved_date).toISOString().split('T')[0]
        : purchase.order_date
          ? new Date(purchase.order_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

      // actual_value = valor real da transação (o que Hotmart mostra no dashboard)
      const value = purchase.price?.actual_value ?? purchase.price?.value ?? 0;

      matchedSales.push({
        value,
        currency: (purchase.price?.currency_code || 'BRL').toUpperCase(),
        dateIso,
        productName: prodName,
        status,
      });
    }

    // Converte cada venda para BRL usando cotação histórica do dia da venda
    const convertedValues = await Promise.all(
      matchedSales.map(s => convertToBRLOnDate(s.value, s.currency, s.dateIso))
    );

    const revenue       = convertedValues.reduce((a, b) => a + b, 0);
    const purchaseCount = matchedSales.length;

    // Breakdown por moeda (para diagnóstico)
    const byCurrency: Record<string, { count: number; originalTotal: number; convertedTotal: number }> = {};
    matchedSales.forEach((s, i) => {
      if (!byCurrency[s.currency]) byCurrency[s.currency] = { count: 0, originalTotal: 0, convertedTotal: 0 };
      byCurrency[s.currency].count++;
      byCurrency[s.currency].originalTotal += s.value;
      byCurrency[s.currency].convertedTotal += convertedValues[i];
    });

    // Debug: lista de produtos matchados e seus status (para diagnóstico de divergências)
    const debug = matchedSales.map((s, i) => ({
      product: s.productName,
      status:  s.status,
      currency: s.currency,
      original: s.value,
      converted: convertedValues[i],
      date: s.dateIso,
    }));

    return NextResponse.json({
      revenue,
      purchases:         purchaseCount,
      matchedProducts:   Array.from(matchedProductNames),
      currencyBreakdown: byCurrency,
      _debug:            debug, // remova em produção se quiser
    });

  } catch (error: any) {
    console.error('[/api/hotmart/sales-by-product]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
