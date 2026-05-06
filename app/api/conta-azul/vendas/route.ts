/**
 * app/api/conta-azul/vendas/route.ts
 * Lista vendas do ERP Conta Azul.
 * Tenta múltiplos endpoints pois a CA API v2 pode usar caminhos diferentes.
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

async function tryFetch(url: string, token: string): Promise<{ ok: boolean; data: any; status: number }> {
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, data, status: res.status };
  } catch (e: any) {
    return { ok: false, data: { error: e.message }, status: 0 };
  }
}

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
    const qs = new URLSearchParams({ page, size });
    if (status) qs.set('situacao', status);

    // Tenta endpoints em ordem de probabilidade
    const candidates = [
      `${CA_API_BASE}/venda/busca?${qs}`,
      `${CA_API_BASE}/vendas?${qs}`,
      `${CA_API_BASE}/sale/busca?${qs}`,
    ];

    let raw: any = null;
    let usedEndpoint = '';
    for (const url of candidates) {
      const attempt = await tryFetch(url, token);
      if (attempt.ok) { raw = attempt.data; usedEndpoint = url; break; }
      // 404 = rota errada, continua. Outros erros = para.
      if (attempt.status !== 404 && attempt.status !== 0) {
        throw new Error(`Conta Azul API ${attempt.status}: ${JSON.stringify(attempt.data)}`);
      }
    }

    if (!raw) throw new Error('Nenhum endpoint de vendas respondeu com sucesso');

    // Normaliza resposta: pode ser array, paginado {content}, ou {itens}
    const items: any[] = Array.isArray(raw)
      ? raw
      : (raw?.content ?? raw?.itens ?? raw?.data ?? []);

    const result = {
      vendas: items,
      total: raw?.totalElements ?? raw?.itens_totais ?? items.length,
      page: raw?.number ?? 0,
      _endpoint: usedEndpoint,
    };

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
