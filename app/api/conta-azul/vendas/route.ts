/**
 * app/api/conta-azul/vendas/route.ts
 * Lista vendas do ERP Conta Azul.
 * GET https://api-v2.contaazul.com/v1/vendas
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page   = searchParams.get('page')   || '0';
  const size   = searchParams.get('size')   || '50';
  const status = searchParams.get('status') || '';
  const force  = searchParams.get('force') === '1';

  const cacheKey = `vendas|${page}|${size}|${status}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      return NextResponse.json({ ...hit.data, fromCache: true });
    }
  }

  try {
    const token = await getContaAzulToken();

    const params = new URLSearchParams({ page, size });
    if (status) params.set('situacao', status);  // CA usa "situacao" não "status"

    const res = await fetch(`${CA_API_BASE}/venda/busca?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Conta Azul API ${res.status}: ${body}`);
    }

    const raw   = await res.json();
    const items = raw?.content || raw?.data || raw || [];
    const result = { vendas: items, total: raw?.totalElements || items.length, page: raw?.number || 0 };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[conta-azul/vendas] Error:', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
