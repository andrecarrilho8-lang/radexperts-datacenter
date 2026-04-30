/**
 * app/api/conta-azul/debug/route.ts
 * Rota de diagnóstico — mostra resposta RAW da API Conta Azul.
 * REMOVER em produção.
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function probe(label: string, url: string, token: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    return {
      label,
      url,
      status:  res.status,
      ok:      res.ok,
      ms:      Date.now() - start,
      body,
    };
  } catch (err: any) {
    return { label, url, status: 0, ok: false, ms: Date.now() - start, error: err.message };
  }
}

export async function GET() {
  const results: any[] = [];
  let token = '';
  let tokenError = '';

  try {
    token = await getContaAzulToken();
    results.push({ label: 'token', ok: true, length: token.length, preview: token.slice(0, 40) + '...' });
  } catch (err: any) {
    tokenError = err.message;
    results.push({ label: 'token', ok: false, error: err.message });
    return NextResponse.json({ tokenError, results }, { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0];
  const past3y = new Date(new Date().setFullYear(new Date().getFullYear() - 3)).toISOString().split('T')[0];
  const fut6m  = new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0];

  // ── Testa vários endpoints ─────────────────────────────────────────────────
  const endpoints = [
    // Sem filtro de data
    [`conta-financeira`, `${CA_API_BASE}/conta-financeira?size=5`],
    [`produto (sem data)`, `${CA_API_BASE}/produto?size=5`],
    [`pessoa/busca`, `${CA_API_BASE}/pessoa/busca?size=5`],

    // Financeiro com data ampla
    [`contas-a-receber (3y)`, `${CA_API_BASE}/financeiro/eventos-financeiros/contas-a-receber/buscar?size=5&data_vencimento_de=${past3y}&data_vencimento_ate=${fut6m}`],
    [`contas-a-pagar (3y)`,   `${CA_API_BASE}/financeiro/eventos-financeiros/contas-a-pagar/buscar?size=5&data_vencimento_de=${past3y}&data_vencimento_ate=${fut6m}`],

    // Vendas
    [`venda/busca`, `${CA_API_BASE}/venda/busca?size=5`],

    // Rota raiz da API (health check)
    [`API root`, `https://api-v2.contaazul.com/v1`],
  ];

  for (const [label, url] of endpoints) {
    results.push(await probe(label as string, url as string, token));
  }

  return NextResponse.json({ results }, {
    headers: { 'Content-Type': 'application/json' },
  });
}
