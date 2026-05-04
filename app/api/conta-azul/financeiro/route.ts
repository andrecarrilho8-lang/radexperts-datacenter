/**
 * app/api/conta-azul/financeiro/route.ts
 * Busca eventos financeiros (contas a receber e a pagar) na API Conta Azul v2.
 *
 * Estrutura real da resposta da API:
 *   { itens_totais, itens: [...], totais: { pago: { valor }, vencido: { valor }, ... } }
 *
 * Campos de cada item:
 *   id, status ("ACQUITTED"|"PENDING"|"OVERDUE"|"CANCELLED"),
 *   status_traduzido, total, pago, nao_pago, descricao,
 *   data_vencimento, data_competencia, data_criacao,
 *   categorias[{ id, nome }], centros_de_custo[{ id, nome }],
 *   cliente { id, nome }  (receita) | fornecedor { id, nome } (despesa)
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cache em memória (10 minutos) — respeitando rate limit de 600 req/min
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;
function getCache(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  return null;
}
function setCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

async function fetchCA<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CA_API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Conta Azul API ${res.status}: ${body}`);
  }
  return res.json();
}

/** Normaliza um item da API para o formato esperado pelo frontend */
function normalizeItem(item: any, tipo: 'RECEITA' | 'DESPESA', emailMap: Map<string, string> = new Map()) {
  const clienteId = item.cliente?.id ?? item.fornecedor?.id ?? '';
  return {
    id:               item.id,
    tipo,
    // Campos financeiros
    valor:            item.total      ?? 0,
    pago:             item.pago       ?? 0,
    nao_pago:         item.nao_pago   ?? 0,
    // Status
    status:           item.status          ?? '',
    status_traduzido: item.status_traduzido ?? '',
    // Descrição e datas
    descricao:        item.descricao        ?? '',
    data_vencimento:  item.data_vencimento  ?? '',
    data_competencia: item.data_competencia ?? '',
    data_criacao:     item.data_criacao     ?? '',
    // Categorias e centros
    categoria:        item.categorias?.[0]?.nome       ?? '',
    centro_de_custo:  item.centros_de_custo?.[0]?.nome ?? '',
    // Pessoa
    cliente:          item.cliente?.nome    ?? item.fornecedor?.nome ?? '',
    cliente_id:       clienteId,
    cliente_email:    emailMap.get(clienteId) ?? '',
  };
}

/** Fetch emails for all unique cliente IDs in parallel (max 15 concurrent) */
async function enrichClienteEmails(
  ids: string[],
  token: string
): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  const CONCURRENCY = 15;
  const unique = [...new Set(ids.filter(Boolean))];

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (id) => {
      try {
        const r = await fetchCA<any>(`/pessoa/${id}`, token);
        // CA API may use 'email' directly or nested in arrays
        const email = r?.email || r?.emails?.[0]?.email || '';
        if (email) emailMap.set(id, email.toLowerCase());
      } catch { /* skip — email is non-critical */ }
    }));
  }
  return emailMap;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo       = searchParams.get('tipo')       || '';  // RECEITA | DESPESA | '' (ambos)
  const status     = searchParams.get('status')     || '';  // PENDENTE | PAGO | VENCIDO
  const dataInicio = searchParams.get('dataInicio') || '';
  const dataFim    = searchParams.get('dataFim')    || '';
  const force      = searchParams.get('force') === '1';
  const page       = searchParams.get('page') || '0';
  const size       = searchParams.get('size') || '50';

  const cacheKey = `financeiro|${tipo}|${status}|${dataInicio}|${dataFim}|${page}`;

  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const token = await getContaAzulToken();

    // Datas padrão: 12 meses atrás → 6 meses à frente
    const hoje = new Date();
    const defaultInicio = dataInicio || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const defaultFim    = dataFim    || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    let receitasRaw: any = null;
    let despesasRaw: any = null;

    if (!tipo || tipo === 'RECEITA') {
      const params = new URLSearchParams({
        size, page,
        data_vencimento_de:  defaultInicio,
        data_vencimento_ate: defaultFim,
      });
      // Mapear status do frontend para o formato da CA API
      if (status === 'PAGO')     params.set('status', 'ACQUITTED');
      if (status === 'PENDENTE') params.set('status', 'PENDING');
      if (status === 'VENCIDO')  params.set('status', 'OVERDUE');
      receitasRaw = await fetchCA<any>(
        `/financeiro/eventos-financeiros/contas-a-receber/buscar?${params}`, token
      );
    }

    if (!tipo || tipo === 'DESPESA') {
      const params = new URLSearchParams({
        size, page,
        data_vencimento_de:  defaultInicio,
        data_vencimento_ate: defaultFim,
      });
      if (status === 'PAGO')     params.set('status', 'ACQUITTED');
      if (status === 'PENDENTE') params.set('status', 'PENDING');
      if (status === 'VENCIDO')  params.set('status', 'OVERDUE');
      despesasRaw = await fetchCA<any>(
        `/financeiro/eventos-financeiros/contas-a-pagar/buscar?${params}`, token
      );
    }

    // ── Extrair itens — campo real é "itens" não "content" ─────────────────
    const rawReceitas: any[] = receitasRaw?.itens ?? [];
    const rawDespesas: any[] = despesasRaw?.itens ?? [];

    // ── Enrich receitas with cliente emails (server-side, parallel) ──────
    const clienteIds = rawReceitas.map((i: any) => i.cliente?.id ?? '').filter(Boolean);
    const emailMap   = clienteIds.length > 0
      ? await enrichClienteEmails(clienteIds, token)
      : new Map<string, string>();

    const receitasItens: any[] = rawReceitas.map((i: any) => normalizeItem(i, 'RECEITA', emailMap));
    const despesasItens: any[] = rawDespesas.map((i: any) => normalizeItem(i, 'DESPESA'));

    // ── Totais vindos diretamente da API (muito mais precisos que calcular) ─
    const rTotais = receitasRaw?.totais ?? {};
    const dTotais = despesasRaw?.totais ?? {};

    const totalReceitas     = rTotais.todos           ?? 0;
    const totalDespesas     = dTotais.todos            ?? 0;
    const receitasPagas     = rTotais.pago?.valor      ?? 0;
    const receitasPendentes = rTotais.pendente?.valor  ?? 0;
    const receitasVencidas  = rTotais.vencido?.valor   ?? 0;
    const receitasHoje      = rTotais.vence_hoje?.valor ?? 0;
    const despesasPagas     = dTotais.pago?.valor      ?? 0;
    const despesasPendentes = dTotais.pendente?.valor  ?? 0;
    const despesasVencidas  = dTotais.vencido?.valor   ?? 0;
    const saldoProjetado    = receitasPendentes - despesasPendentes;

    const result = {
      receitas: receitasItens,
      despesas: despesasItens,
      paginacao: {
        receitas: { total: receitasRaw?.itens_totais ?? 0 },
        despesas: { total: despesasRaw?.itens_totais ?? 0 },
      },
      totais: {
        totalReceitas,
        totalDespesas,
        receitasPagas,
        receitasPendentes,
        receitasVencidas,
        receitasHoje,
        despesasPagas,
        despesasPendentes,
        despesasVencidas,
        saldoProjetado,
      },
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[conta-azul/financeiro] Error:', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
