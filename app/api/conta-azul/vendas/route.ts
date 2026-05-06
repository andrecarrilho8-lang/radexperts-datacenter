/**
 * app/api/conta-azul/vendas/route.ts
 * Lista vendas do ERP Conta Azul.
 *
 * Lógica: tenta múltiplos endpoints e métodos. Só para no 401.
 * Se nenhum funcionar → retorna lista vazia (CA pode não ter este módulo).
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

interface Attempt {
  method: 'GET' | 'POST';
  url: string;
  body?: object;
}

async function tryRequest(
  attempt: Attempt,
  token: string,
): Promise<{ ok: boolean; data: any; status: number }> {
  try {
    const opts: RequestInit = {
      method: attempt.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    };
    if (attempt.body) opts.body = JSON.stringify(attempt.body);

    const res = await fetch(attempt.url, opts);
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

    const attempts: Attempt[] = [
      { method: 'GET',  url: `${CA_API_BASE}/venda/busca?${qs}` },
      { method: 'POST', url: `${CA_API_BASE}/venda/busca`, body: { page: Number(page), size: Number(size), ...(status ? { situacao: status } : {}) } },
      { method: 'GET',  url: `${CA_API_BASE}/venda?${qs}` },
      { method: 'GET',  url: `${CA_API_BASE}/vendas?${qs}` },
      { method: 'GET',  url: `${CA_API_BASE}/pedido/busca?${qs}` },
    ];

    let raw: any = null;
    let usedEndpoint = '';
    const triedErrors: string[] = [];

    for (const att of attempts) {
      const res = await tryRequest(att, token);

      if (res.status === 401 || res.status === 403) {
        throw new Error('não conectado — token inválido ou expirado');
      }

      if (res.ok) {
        raw = res.data;
        usedEndpoint = `${att.method} ${att.url}`;
        break;
      }

      triedErrors.push(`${att.method} ${att.url.replace(CA_API_BASE, '')} → ${res.status}`);
    }

    if (!raw) {
      console.warn('[conta-azul/vendas] Todos os endpoints falharam:', triedErrors);
      return NextResponse.json({
        vendas: [],
        total: 0,
        page: 0,
        _warning: 'Módulo de Vendas não disponível nesta conta CA',
        _tried: triedErrors,
      });
    }

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
