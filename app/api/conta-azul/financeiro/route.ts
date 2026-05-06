/**
 * app/api/conta-azul/financeiro/route.ts
 * Busca eventos financeiros (contas a receber e a pagar) na API Conta Azul v2.
 *
 * A CA API limita 50 itens por página. Este route itera TODAS as páginas
 * automaticamente para garantir que retornamos todos os registros.
 *
 * Estrutura real da resposta da API:
 *   { itens_totais, itens: [...], totais: { pago: { valor }, vencido: { valor }, ... } }
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cache em memória (15 minutos) — fetch completo é mais pesado
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;
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

/**
 * Busca TODAS as páginas de um endpoint paginado da CA API.
 * A CA retorna no máximo 50 itens por página. Itera até esgotar ou atingir maxPages.
 * Retorna objeto com itens concatenados + totais da última resposta.
 */
async function fetchAllPages(
  endpoint: string,
  baseParams: URLSearchParams,
  token: string,
  maxPages = 30, // safety cap: 30 × 50 = 1500 itens
): Promise<any> {
  const PAGE_SIZE = 50;
  let allItems: any[] = [];
  let lastRaw: any = null;

  for (let pg = 0; pg < maxPages; pg++) {
    const params = new URLSearchParams(baseParams);
    params.set('page', String(pg));
    params.set('size', String(PAGE_SIZE));

    const raw = await fetchCA<any>(`${endpoint}?${params}`, token);
    const itens: any[] = raw?.itens ?? [];
    allItems = allItems.concat(itens);
    lastRaw = raw;

    const total: number = raw?.itens_totais ?? 0;
    console.log(`[CA financeiro] page ${pg}: ${itens.length} itens, total=${total}, fetched=${allItems.length}`);

    // Para quando buscamos todos os registros
    if (itens.length < PAGE_SIZE || allItems.length >= total) break;
  }

  return { ...lastRaw, itens: allItems };
}

/** Normaliza um item da API para o formato esperado pelo frontend */
function normalizeItem(item: any, tipo: 'RECEITA' | 'DESPESA', emailMap: Map<string, string> = new Map()) {
  const clienteId = item.cliente?.id ?? item.fornecedor?.id ?? '';
  return {
    id:               item.id,
    tipo,
    valor:            item.total      ?? 0,
    pago:             item.pago       ?? 0,
    nao_pago:         item.nao_pago   ?? 0,
    status:           item.status          ?? '',
    status_traduzido: item.status_traduzido ?? '',
    descricao:        item.descricao        ?? '',
    data_vencimento:  item.data_vencimento  ?? '',
    data_competencia: item.data_competencia ?? '',
    data_criacao:     item.data_criacao     ?? '',
    categoria:        item.categorias?.[0]?.nome       ?? '',
    centro_de_custo:  item.centros_de_custo?.[0]?.nome ?? '',
    cliente:          item.cliente?.nome    ?? item.fornecedor?.nome ?? '',
    cliente_id:       clienteId,
    cliente_email:    emailMap.get(clienteId) ?? '',
  };
}

/** Build name → email map from our own DB */
async function enrichEmailsFromDB(names: string[]): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  if (!names.length) return emailMap;

  try {
    await ensureSchema();
    const db = getDb();
    const upperNames = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];

    const bpRows = await db`
      SELECT UPPER(TRIM(name)) AS uname, LOWER(email) AS email
      FROM buyer_profiles
      WHERE UPPER(TRIM(name)) = ANY(${upperNames})
        AND email IS NOT NULL AND email != ''
    ` as any[];
    for (const r of bpRows) {
      if (r.uname && r.email) emailMap.set(r.uname, r.email);
    }

    const missing = upperNames.filter(n => !emailMap.has(n));
    if (missing.length > 0) {
      const msRows = await db`
        SELECT UPPER(TRIM(name)) AS uname, LOWER(email) AS email
        FROM manual_students
        WHERE UPPER(TRIM(name)) = ANY(${missing})
          AND email IS NOT NULL AND email != ''
      ` as any[];
      for (const r of msRows) {
        if (r.uname && r.email && !emailMap.has(r.uname)) {
          emailMap.set(r.uname, r.email);
        }
      }
    }
  } catch (e: any) {
    console.warn('[conta-azul/financeiro] DB email enrichment failed:', e.message);
  }

  return emailMap;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo       = searchParams.get('tipo')       || '';
  const dataInicio = searchParams.get('dataInicio') || '';
  const dataFim    = searchParams.get('dataFim')    || '';
  const force      = searchParams.get('force') === '1';

  // Cache key does NOT include status/page/size — we always fetch everything
  const cacheKey = `financeiro|${tipo}|${dataInicio}|${dataFim}`;

  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const token = await getContaAzulToken();

    const hoje = new Date();
    const defaultInicio = dataInicio || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const defaultFim    = dataFim    || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    let receitasRaw: any = null;
    let despesasRaw: any = null;

    if (!tipo || tipo === 'RECEITA') {
      const params = new URLSearchParams({
        data_vencimento_de:  defaultInicio,
        data_vencimento_ate: defaultFim,
      });
      receitasRaw = await fetchAllPages(
        '/financeiro/eventos-financeiros/contas-a-receber/buscar', params, token
      );
    }

    if (!tipo || tipo === 'DESPESA') {
      const params = new URLSearchParams({
        data_vencimento_de:  defaultInicio,
        data_vencimento_ate: defaultFim,
      });
      despesasRaw = await fetchAllPages(
        '/financeiro/eventos-financeiros/contas-a-pagar/buscar', params, token
      );
    }

    // ── Extrair itens ──────────────────────────────────────────────────────
    const rawReceitas: any[] = receitasRaw?.itens ?? [];
    const rawDespesas: any[] = despesasRaw?.itens ?? [];

    // ── Enrich with email ──────────────────────────────────────────────────
    const clienteNames = rawReceitas
      .map((i: any) => (i.cliente?.nome ?? '').trim())
      .filter(Boolean);
    const emailMap = await enrichEmailsFromDB(clienteNames);

    const receitasItens: any[] = rawReceitas.map((i: any) => {
      const nome = (i.cliente?.nome ?? i.fornecedor?.nome ?? '').trim();
      return {
        ...normalizeItem(i, 'RECEITA', emailMap),
        cliente_email: emailMap.get(nome.toUpperCase()) ?? '',
      };
    });
    const despesasItens: any[] = rawDespesas.map((i: any) => normalizeItem(i, 'DESPESA'));

    // ── Totais da API ──────────────────────────────────────────────────────
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
      totalItens: {
        receitas: receitasItens.length,
        despesas: despesasItens.length,
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
