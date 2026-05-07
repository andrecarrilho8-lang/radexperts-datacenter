/**
 * app/api/conta-azul/financeiro/route.ts
 *
 * A CA API retorna 10 itens/página (ignora o param size).
 * Estratégia: busca TODAS as páginas por status em lotes paralelos de 20.
 * - PENDING  → todas as páginas (costuma ter <200 registros)
 * - OVERDUE  → todas as páginas (costuma ter <500 registros)
 * - ACQUITTED → todas as páginas (pode ter muitos; capturamos até 100 páginas = 1000 registros)
 * - CANCELLED → primeiras 5 páginas (menos relevante)
 * Depois deduplica por id e ordena DESC por data_vencimento.
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const cache    = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;
function getCache(k: string) { const h = cache.get(k); return h && Date.now() - h.ts < CACHE_TTL ? h.data : null; }
function setCache(k: string, d: any) { cache.set(k, { data: d, ts: Date.now() }); }

async function caFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`CA ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Busca TODAS as páginas de um endpoint+status usando lotes paralelos.
 * Lote de 20 páginas simultâneas para evitar rate-limit (600 req/min na CA).
 */
async function fetchAllForStatus(
  endpoint: string,
  baseParams: URLSearchParams,
  status: string | null,
  token: string,
  maxPages = 100,   // cap de segurança
  batchSize = 20,   // páginas em paralelo por vez
): Promise<any[]> {
  // Página 0: descobre total
  const p0 = new URLSearchParams(baseParams);
  if (status) p0.set('status', status);
  p0.set('page', '0');

  let first: any;
  try { first = await caFetch<any>(`${endpoint}?${p0}`, token); }
  catch (e: any) { console.warn(`[CA] status=${status} p0:`, e.message); return []; }

  const itens0  = (first?.itens ?? []) as any[];
  const total   = (first?.itens_totais ?? 0) as number;
  const pgSize  = itens0.length || 10;
  const nPages  = Math.min(Math.ceil(total / pgSize), maxPages);

  console.log(`[CA fin] status=${status ?? 'all'}: total=${total} pgSize=${pgSize} pages=${nPages}`);

  if (nPages <= 1) return itens0;

  // Monta lista de todas as páginas restantes
  const remaining: number[] = [];
  for (let pg = 1; pg < nPages; pg++) remaining.push(pg);

  // Busca em lotes para não sobrecarregar a API
  const allItems: any[] = [...itens0];
  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(pg => {
      const p = new URLSearchParams(baseParams);
      if (status) p.set('status', status);
      p.set('page', String(pg));
      return caFetch<any>(`${endpoint}?${p}`, token)
        .then((r: any) => r?.itens ?? [])
        .catch((e: any) => { console.warn(`[CA] p${pg}:`, e.message); return []; });
    }));
    for (const items of results) allItems.push(...items);
  }

  // Deduplica por id
  const seen = new Set<string>();
  return allItems.filter((i: any) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
}

function normalize(item: any, tipo: 'RECEITA' | 'DESPESA', emailMap: Map<string, string> = new Map()) {
  const nome = (item.cliente?.nome ?? item.fornecedor?.nome ?? '').trim();
  return {
    id: item.id, tipo,
    valor: item.total ?? 0, pago: item.pago ?? 0, nao_pago: item.nao_pago ?? 0,
    status: item.status ?? '', status_traduzido: item.status_traduzido ?? '',
    descricao: item.descricao ?? '', data_vencimento: item.data_vencimento ?? '',
    data_competencia: item.data_competencia ?? '', data_criacao: item.data_criacao ?? '',
    categoria: item.categorias?.[0]?.nome ?? '', centro_de_custo: item.centros_de_custo?.[0]?.nome ?? '',
    cliente: nome, cliente_id: item.cliente?.id ?? item.fornecedor?.id ?? '',
    cliente_email: emailMap.get(nome.toUpperCase()) ?? '',
  };
}

async function enrichEmails(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!names.length) return map;
  try {
    await ensureSchema();
    const db  = getDb();
    const up  = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];
    const bp  = await db`SELECT UPPER(TRIM(name)) u, LOWER(email) e FROM buyer_profiles  WHERE UPPER(TRIM(name))=ANY(${up}) AND email!=''` as any[];
    for (const r of bp) if (r.u && r.e) map.set(r.u, r.e);
    const mis = up.filter(n => !map.has(n));
    if (mis.length) {
      const ms = await db`SELECT UPPER(TRIM(name)) u, LOWER(email) e FROM manual_students WHERE UPPER(TRIM(name))=ANY(${mis}) AND email!=''` as any[];
      for (const r of ms) if (r.u && r.e && !map.has(r.u)) map.set(r.u, r.e);
    }
  } catch (e: any) { console.warn('[CA fin] DB fail:', e.message); }
  return map;
}

export async function GET(request: Request) {
  const sp    = new URL(request.url).searchParams;
  const tipo  = sp.get('tipo')       || '';
  const dI    = sp.get('dataInicio') || '';
  const dF    = sp.get('dataFim')    || '';
  const force = sp.get('force') === '1';

  const cacheKey = `fin3|${tipo}|${dI}|${dF}`;
  if (!force) { const c = getCache(cacheKey); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    const inicio = dI || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const fim    = dF || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    const epR = '/financeiro/eventos-financeiros/contas-a-receber/buscar';
    const epD = '/financeiro/eventos-financeiros/contas-a-pagar/buscar';
    const bR  = new URLSearchParams({ data_vencimento_de: inicio, data_vencimento_ate: fim });
    const bD  = new URLSearchParams({ data_vencimento_de: inicio, data_vencimento_ate: fim });

    let rawR: any[] = [];
    let rawD: any[] = [];
    let rTotais: any = {};
    let dTotais: any = {};

    if (!tipo || tipo === 'RECEITA') {
      // Busca cada status em paralelo — cada fetchAllForStatus é independente
      const [pending, overdue, acquitted, cancelled] = await Promise.all([
        fetchAllForStatus(epR, bR, 'PENDING',   token, 100),
        fetchAllForStatus(epR, bR, 'OVERDUE',   token, 100),
        fetchAllForStatus(epR, bR, 'ACQUITTED', token, 100),
        fetchAllForStatus(epR, bR, 'CANCELLED', token,   5),
      ]);
      rawR = [...pending, ...overdue, ...acquitted, ...cancelled];
      // KPI totais: busca page 0 sem status para pegar os totals agregados
      try {
        const kpi = await caFetch<any>(`${epR}?${bR}&page=0`, token);
        rTotais = kpi?.totais ?? {};
      } catch { /* opcional */ }
    }

    if (!tipo || tipo === 'DESPESA') {
      const [dp, dov, da] = await Promise.all([
        fetchAllForStatus(epD, bD, 'PENDING',   token, 50),
        fetchAllForStatus(epD, bD, 'OVERDUE',   token, 50),
        fetchAllForStatus(epD, bD, 'ACQUITTED', token, 50),
      ]);
      rawD = [...dp, ...dov, ...da];
      try {
        const kpi = await caFetch<any>(`${epD}?${bD}&page=0`, token);
        dTotais = kpi?.totais ?? {};
      } catch { /* opcional */ }
    }

    // Deduplica global por id
    const dedupById = (arr: any[]) =>
      Array.from(new Map(arr.map(i => [i.id, i])).values());

    const names    = dedupById(rawR).map(i => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const emailMap = await enrichEmails(names);

    const receitasItens = dedupById(rawR)
      .map(i => normalize(i, 'RECEITA', emailMap))
      .sort((a, b) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const despesasItens = dedupById(rawD)
      .map(i => normalize(i, 'DESPESA'))
      .sort((a, b) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    console.log(`[CA fin] final: ${receitasItens.length} receitas, ${despesasItens.length} despesas`);

    const result = {
      receitas: receitasItens,
      despesas: despesasItens,
      meta: { fetchedReceitas: receitasItens.length, fetchedDespesas: despesasItens.length },
      totais: {
        totalReceitas:     rTotais.todos           ?? 0,
        totalDespesas:     dTotais.todos            ?? 0,
        receitasPagas:     rTotais.pago?.valor      ?? 0,
        receitasPendentes: rTotais.pendente?.valor  ?? 0,
        receitasVencidas:  rTotais.vencido?.valor   ?? 0,
        receitasHoje:      rTotais.vence_hoje?.valor ?? 0,
        despesasPagas:     dTotais.pago?.valor      ?? 0,
        despesasPendentes: dTotais.pendente?.valor  ?? 0,
        despesasVencidas:  dTotais.vencido?.valor   ?? 0,
        saldoProjetado:    (rTotais.pendente?.valor ?? 0) - (dTotais.pendente?.valor ?? 0),
      },
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error('[CA fin]', err.message);
    if (err.message?.includes('não conectado') || err.message?.includes('reconectar'))
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
