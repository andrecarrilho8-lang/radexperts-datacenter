import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';

export async function GET() {
  try {
    // Busca vendas dos últimos 90 dias para obter lista de produtos
    const until = new Date().toISOString();
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    const sales = await fetchHotmartSales(since, until);

    const products: Set<string> = new Set();
    sales.forEach((s: any) => {
      const name = s.product?.name;
      if (name) products.add(name);
    });

    return NextResponse.json({ products: Array.from(products).sort() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
