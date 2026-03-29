import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { convertToBRLOnDate } from '@/app/lib/currency';

export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom  = searchParams.get('dateFrom');
  const dateTo    = searchParams.get('dateTo');
  const product   = searchParams.get('product'); // exact product name from Hotmart

  if (!dateFrom || !dateTo || !product) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const allSales = await fetchHotmartSales(
      `${dateFrom}T00:00:00-03:00`,
      `${dateTo}T23:59:59-03:00`
    );

    const productLower = product.toLowerCase().trim();

    const uniqueTxIds = new Set<string>();
    const matchedSales: { value: number; currency: string; dateIso: string; productName: string }[] = [];
    const matchedProductNames = new Set<string>();

    for (const s of allSales as any[]) {
      const prodName  = (s.product?.name || '').trim();
      const purchase  = s.purchase || {};
      const txId      = purchase.transaction;
      const isOk      = ['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED'].includes(purchase.status);
      if (!isOk || uniqueTxIds.has(txId)) continue;

      // Match: exact OR product name contains search OR search contains product name
      const pLower = prodName.toLowerCase();
      const isMatch =
        pLower === productLower ||
        pLower.includes(productLower) ||
        productLower.includes(pLower);

      if (!isMatch) continue;

      uniqueTxIds.add(txId);
      matchedProductNames.add(prodName);
      const dateIso = purchase.order_date
        ? new Date(purchase.order_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      matchedSales.push({
        value:       purchase.price?.value || 0,
        currency:    (purchase.price?.currency_code || 'BRL').toUpperCase(),
        dateIso,
        productName: prodName,
      });
    }

    // Convert to BRL using historical rates
    const convertedValues = await Promise.all(
      matchedSales.map(s => convertToBRLOnDate(s.value, s.currency, s.dateIso))
    );

    const revenue       = convertedValues.reduce((a, b) => a + b, 0);
    const purchaseCount = matchedSales.length;

    // Breakdown by currency
    const byCurrency: Record<string, { count: number; originalTotal: number; convertedTotal: number }> = {};
    matchedSales.forEach((s, i) => {
      if (!byCurrency[s.currency]) byCurrency[s.currency] = { count: 0, originalTotal: 0, convertedTotal: 0 };
      byCurrency[s.currency].count++;
      byCurrency[s.currency].originalTotal += s.value;
      byCurrency[s.currency].convertedTotal += convertedValues[i];
    });

    return NextResponse.json({
      revenue,
      purchases:        purchaseCount,
      matchedProducts:  Array.from(matchedProductNames),
      currencyBreakdown: byCurrency,
    });

  } catch (error: any) {
    console.error('[/api/hotmart/sales-by-product]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
