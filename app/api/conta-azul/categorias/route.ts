/**
 * app/api/conta-azul/categorias/route.ts
 * Lista categorias financeiras cadastradas no ERP.
 * GET https://api-v2.contaazul.com/v1/categorias
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cache longo — categorias raramente mudam (30 min)
let _cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get('force') === '1';

  if (!force && _cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json({ ..._cache.data, fromCache: true });
  }

  try {
    const token = await getContaAzulToken();
    const res   = await fetch(`${CA_API_BASE}/categorias`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Conta Azul API ${res.status}: ${body}`);
    }

    const raw        = await res.json();
    const categorias = raw?.content || raw?.data || raw || [];

    const result = { categorias, total: categorias.length };
    _cache = { data: result, ts: Date.now() };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[conta-azul/categorias] Error:', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
