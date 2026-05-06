/**
 * app/api/conta-azul/contratos/route.ts
 * Lista contratos (cob. recorrentes) do ERP Conta Azul.
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
  const page  = searchParams.get('page')  || '0';
  const size  = searchParams.get('size')  || '50';
  const force = searchParams.get('force') === '1';

  const cacheKey = `contratos|${page}|${size}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      return NextResponse.json({ ...hit.data, fromCache: true });
    }
  }

  try {
    const token = await getContaAzulToken();
    const qs = new URLSearchParams({ page, size });

    const candidates = [
      `${CA_API_BASE}/contrato/busca?${qs}`,
      `${CA_API_BASE}/contratos?${qs}`,
      `${CA_API_BASE}/recorrencia/busca?${qs}`,
    ];

    let raw: any = null;
    let usedEndpoint = '';
    for (const url of candidates) {
      const attempt = await tryFetch(url, token);
      if (attempt.ok) { raw = attempt.data; usedEndpoint = url; break; }
      if (attempt.status !== 404 && attempt.status !== 0) {
        throw new Error(`Conta Azul API ${attempt.status}: ${JSON.stringify(attempt.data)}`);
      }
    }

    if (!raw) throw new Error('Nenhum endpoint de contratos respondeu com sucesso');

    const items: any[] = Array.isArray(raw)
      ? raw
      : (raw?.content ?? raw?.itens ?? raw?.data ?? []);

    const result = {
      contratos: items,
      total: raw?.totalElements ?? raw?.itens_totais ?? items.length,
      page: raw?.number ?? 0,
      _endpoint: usedEndpoint,
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[conta-azul/contratos] Error:', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
