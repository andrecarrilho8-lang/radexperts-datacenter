import { NextResponse } from 'next/server';
import { getHotmartToken, isOfficialProduct } from '@/app/lib/hotmartApi';

export async function GET(request: Request) {
  try {
    const token = await getHotmartToken();
    const HOTMART_API_BASE = 'https://developers.hotmart.com/payments/api/v1';

    // Pega as últimas 50 vendas ignorando filtros
    // Pega as últimas 50 vendas ignorando filtros (usando 14 dias para evitar invalid_parameter do Hotmart que barra tempos acima de meses)
    const now = Date.now();
    const past = now - (14 * 24 * 60 * 60 * 1000);
    const url = `${HOTMART_API_BASE}/sales/history?start_date=${past}&end_date=${now}`;

    const resp = await fetch(url, { 
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });

    if (!resp.ok) {
      return NextResponse.json({ 
        error: 'Erro ao buscar vendas', 
        status: resp.status, 
        text: await resp.text(),
        debug_url: url
      });
    }

    const data = await resp.json();
    const items = data.items || [];

    const productsFound = Array.from(new Set(items.map((i: any) => i.product?.name)));
    const productsMatched = productsFound.filter((name: any) => isOfficialProduct({ id: 0, name: String(name) }));

    return NextResponse.json({
      success: true,
      total_sales_30d: items.length,
      token_used: token.substring(0, 10) + '...',
      all_products_found: productsFound,
      products_matched_by_filter: productsMatched,
      sample_sales: items.slice(0, 2)
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
