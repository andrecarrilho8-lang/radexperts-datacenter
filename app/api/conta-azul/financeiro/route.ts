/**
 * app/api/conta-azul/financeiro/route.ts
 * Busca eventos financeiros na API Conta Azul v2.
 * Usa busca em PARALELO para evitar timeout no Vercel.
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 60; // Vercel Pro: 60s timeout

const cache    = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

function getCache(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  return null;
}
function setCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

async function fetchCA<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Conta Azul API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Busca TODAS as páginas de um endpoint em PARALELO.
 * Passo 1: busca página 0 → descobre itens_totais.
 * Passo 2: dispara páginas restantes com Promise.all (simultâneas).
 */
async function fetchAllPages(
  endpoint: string,
  baseParams: URLSearchParams,
  token: string,
  maxPages = 20,
): Promise<any> {
  const PG_SIZE = 50;

  // Página 0 — descobre total
  const p0 = new URLSearchParams(baseParams);
  p0.set('page', '0');
  p0.set('size', String(PG_SIZE));
  const first   = await fetchCA<any>(`${endpoint}?${p0}`, token);
  const itens0  = first?.itens ?? [] as any[];
  const total   = first?.itens_totais ?? 0;

  console.log(`[CA financeiro] p0: ${itens0.length}/${total}`);

  if (total <= PG_SIZE || itens0.length < PG_SIZE) {
    return { ...first, itens: itens0 };
  }

  // Páginas restantes em paralelo
  const numPages = Math.min(Math.ceil(total / PG_SIZE), maxPages);
  const promises: Promise<any>[] = [];
  for (let pg = 1; pg < numPages; pg++) {
    const p = new URLSearchParams(baseParams);
    p.set('page', String(pg));
    p.set('size', String(PG_SIZE));
    promises.push(
      fetchCA<any>(`${endpoint}?${p}`, token)
        .catch(err => { console.warn(`[CA p${pg}]:`, err.message); return { itens: [] }; })
    );
  }

  const rest = await Promise.all(promises);
  const all  = [...itens0, ...rest.flatMap((r: any) => r?.itens ?? [])];
  console.log(`[CA financeiro] total fetched: ${all.length}/${total}`);
  return { ...first, itens: all };
}

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

async function enrichEmailsFromDB(names: string[]): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  if (!names.length) return emailMap;
  try {
    await ensureSchema();
    const db = getDb();
    const upper = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];

    const bp = await db`
      SELECT UPPER(TRIM(name)) AS uname, LOWER(email) AS email
      FROM buyer_profiles
      WHERE UPPER(TRIM(name)) = ANY(${upper}) AND email IS NOT NULL AND email != ''
    ` as any[];
    for (const r of bp) if (r.uname && r.email) emailMap.set(r.uname, r.email);

    const missing = upper.filter(n => !emailMap.has(n));
    if (missing.length) {
      const ms = await db`
        SELECT UPPER(TRIM(name)) AS uname, LOWER(email) AS email
        FROM manual_students
        WHERE UPPER(TRIM(name)) = ANY(${missing}) AND email IS NOT NULL AND email != ''
      ` as any[];
      for (const r of ms) if (r.uname && r.email && !emailMap.has(r.uname)) emailMap.set(r.uname, r.email);
    }
  } catch (e: any) {
    console.warn('[CA financeiro] DB enrichment failed:', e.message);
  }
  return emailMap;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo       = searchParams.get('tipo')       || '';
  const dataInicio = searchParams.get('dataInicio') || '';
  const dataFim    = searchParams.get('dataFim')    || '';
  const force      = searchParams.get('force') === '1';

  const cacheKey = `financeiro|${tipo}|${dataInicio}|${dataFim}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const token = await getContaAzulToken();

    const hoje    = new Date();
    const dInicio = dataInicio || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const dFim    = dataFim    || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    let receitasRaw: any = null;
    let despesasRaw: any = null;

    const receitaParams = new URLSearchParams({ data_vencimento_de: dInicio, data_vencimento_ate: dFim });
    const despesaParams = new URLSearchParams({ data_vencimento_de: dInicio, data_vencimento_ate: dFim });

    if (!tipo || tipo === 'RECEITA') {
      receitasRaw = await fetchAllPages(
        '/financeiro/eventos-financeiros/contas-a-receber/buscar', receitaParams, token
      );
    }
    if (!tipo || tipo === 'DESPESA') {
      despesasRaw = await fetchAllPages(
        '/financeiro/eventos-financeiros/contas-a-pagar/buscar', despesaParams, token
      );
    }

    const rawReceitas: any[] = receitasRaw?.itens ?? [];
    const rawDespesas: any[] = despesasRaw?.itens ?? [];

    const clienteNames = rawReceitas.map((i: any) => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const emailMap     = await enrichEmailsFromDB(clienteNames);

    const receitasItens: any[] = rawReceitas.map((i: any) => ({
      ...normalizeItem(i, 'RECEITA', emailMap),
      cliente_email: emailMap.get((i.cliente?.nome ?? '').trim().toUpperCase()) ?? '',
    }));
    const despesasItens: any[] = rawDespesas.map((i: any) => normalizeItem(i, 'DESPESA'));

    const rT = receitasRaw?.totais ?? {};
    const dT = despesasRaw?.totais ?? {};

    const result = {
      receitas: receitasItens,
      despesas: despesasItens,
      totalItens: { receitas: receitasItens.length, despesas: despesasItens.length },
      totais: {
        totalReceitas:     rT.todos           ?? 0,
        totalDespesas:     dT.todos            ?? 0,
        receitasPagas:     rT.pago?.valor      ?? 0,
        receitasPendentes: rT.pendente?.valor  ?? 0,
        receitasVencidas:  rT.vencido?.valor   ?? 0,
        receitasHoje:      rT.vence_hoje?.valor ?? 0,
        despesasPagas:     dT.pago?.valor      ?? 0,
        despesasPendentes: dT.pendente?.valor  ?? 0,
        despesasVencidas:  dT.vencido?.valor   ?? 0,
        saldoProjetado:    (rT.pendente?.valor ?? 0) - (dT.pendente?.valor ?? 0),
      },
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[CA financeiro] Error:', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
