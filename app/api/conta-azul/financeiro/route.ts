/**
 * app/api/conta-azul/financeiro/route.ts
 * Busca eventos financeiros (contas a receber e a pagar) na API Conta Azul.
 *
 * Endpoint CA: GET https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros
 * Query params suportados:
 *   tipo       RECEITA | DESPESA
 *   status     PENDENTE | PAGO | VENCIDO | CANCELADO
 *   page       número da página (default 0)
 *   size       itens por página (max 50, default 50)
 *   dataInicio data inicial (YYYY-MM-DD)
 *   dataFim    data final   (YYYY-MM-DD)
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CA_BASE = CA_API_BASE;

// Cache em memória (10 minutos) — respeitando rate limit de 600 req/min
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getCache(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  return null;
}
function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
}

async function fetchCA<T>(path: string, token: string): Promise<T> {
  const url = `${CA_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Conta Azul API ${res.status}: ${body}`);
  }

  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo      = searchParams.get('tipo')      || '';     // RECEITA | DESPESA | '' (ambos)
  const status    = searchParams.get('status')    || '';     // PENDENTE | PAGO | VENCIDO
  const dataInicio = searchParams.get('dataInicio') || '';
  const dataFim    = searchParams.get('dataFim')    || '';
  const force      = searchParams.get('force') === '1';

  const cacheKey = `financeiro|${tipo}|${status}|${dataInicio}|${dataFim}`;

  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const token = await getContaAzulToken();

    // Busca receitas e despesas (ou só uma delas se tipo for especificado)
    const buildParams = (t: string) => {
      const p = new URLSearchParams({ size: '50', page: '0' });
      if (t)         p.set('tipo', t);
      if (status)    p.set('status', status);
      if (dataInicio) p.set('dataInicio', dataInicio);
      if (dataFim)    p.set('dataFim', dataFim);
      return p.toString();
    };

    let receitasData: any[] = [];
    let despesasData: any[] = [];

    if (!tipo || tipo === 'RECEITA') {
      // Endpoint correto: contas-a-receber/buscar
      const params = new URLSearchParams({ size: '50', page: '0' });
      if (status)     params.set('status',     status);
      if (dataInicio) params.set('dataVencimentoInicial', dataInicio);
      if (dataFim)    params.set('dataVencimentoFinal',   dataFim);
      const res = await fetchCA<any>(`/financeiro/eventos-financeiros/contas-a-receber/buscar?${params}`, token);
      receitasData = res?.content || res?.data || (Array.isArray(res) ? res : []);
      // Adicionar campo tipo para compatibilidade com o frontend
      receitasData = receitasData.map((r: any) => ({ ...r, evento: { ...r.evento, tipo: 'RECEITA' } }));
    }

    if (!tipo || tipo === 'DESPESA') {
      // Endpoint correto: contas-a-pagar/buscar
      const params = new URLSearchParams({ size: '50', page: '0' });
      if (status)     params.set('status',     status);
      if (dataInicio) params.set('dataVencimentoInicial', dataInicio);
      if (dataFim)    params.set('dataVencimentoFinal',   dataFim);
      const res = await fetchCA<any>(`/financeiro/eventos-financeiros/contas-a-pagar/buscar?${params}`, token);
      despesasData = res?.content || res?.data || (Array.isArray(res) ? res : []);
      despesasData = despesasData.map((r: any) => ({ ...r, evento: { ...r.evento, tipo: 'DESPESA' } }));
    }

    // Agrega totais
    const sumByStatus = (items: any[], statusFilter?: string) =>
      items
        .filter(i => !statusFilter || i.status === statusFilter)
        .reduce((acc, i) => acc + (i.valor_total ?? i.valor ?? 0), 0);

    const totalReceitas      = sumByStatus(receitasData);
    const totalDespesas      = sumByStatus(despesasData);
    const receitasPendentes  = sumByStatus(receitasData, 'PENDENTE');
    const despesasPendentes  = sumByStatus(despesasData, 'PENDENTE');
    const receitasVencidas   = sumByStatus(receitasData, 'VENCIDO');
    const despesasVencidas   = sumByStatus(despesasData, 'VENCIDO');
    const saldoProjetado     = receitasPendentes - despesasPendentes;

    const result = {
      receitas:          receitasData,
      despesas:          despesasData,
      totais: {
        totalReceitas,
        totalDespesas,
        receitasPendentes,
        despesasPendentes,
        receitasVencidas,
        despesasVencidas,
        saldoProjetado,
      },
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[conta-azul/financeiro] Error:', error.message);

    // Se não há conexão, retornar status especial (não 500)
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
