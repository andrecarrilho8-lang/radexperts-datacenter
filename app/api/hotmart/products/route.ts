import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const until = new Date().toISOString();
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    const sales = await fetchHotmartSales(since, until);

    // Retorna { id, name } de cada produto único
    const productMap = new Map<string, { id: number | string; name: string }>();
    sales.forEach((s: any) => {
      const p = s.product;
      if (p?.name && !productMap.has(p.name)) {
        productMap.set(p.name, { id: p.id, name: p.name });
      }
    });

    const products = Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ products: products.map(p => p.name), productMap: products });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
