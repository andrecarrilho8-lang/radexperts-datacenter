/**
 * app/api/conta-azul/financeiro/route.ts
 *
 * Busca TODOS os registros da CA API sem filtro de status.
 * CA API retorna 10 itens/página (ignora size param).
 * Com ~1521 registros = ~153 páginas → lotes de 30 paralelos = ~3s total.
 *
 * Filtragem por status é feita no frontend (client-side).
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

async function caGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`CA ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Busca TODAS as páginas de um endpoint paginado em lotes paralelos.
 * @param endpoint  ex: /financeiro/eventos-financeiros/contas-a-receber/buscar
 * @param qs        query string base (datas, etc.)
 * @param token     OAuth token
 * @param maxPages  cap de segurança (default 200 = 2000 registros)
 * @param batchSize páginas simultâneas por lote (default 30)
 */
async function fetchAllPages(
  endpoint: string,
  qs: URLSearchParams,
  token: string,
  maxPages  = 200,
  batchSize = 30,
): Promise<{ items: any[]; totais: any }> {
  // Página 0 — descobre total
  const q0 = new URLSearchParams(qs);
  q0.set('page', '0');
  let first: any;
  try {
    first = await caGet<any>(`${endpoint}?${q0}`, token);
  } catch (e: any) {
    console.error(`[CA fin] p0 failed: ${e.message}`);
    return { items: [], totais: {} };
  }

  const items0  = (first?.itens ?? []) as any[];
  const total   = (first?.itens_totais ?? 0) as number;
  const pgSize  = items0.length || 10;
  const nPages  = Math.min(Math.ceil(total / pgSize), maxPages);

  console.log(`[CA fin] ${endpoint.split('/').pop()}: total=${total} pgSize=${pgSize} nPages=${nPages}`);

  if (nPages <= 1) return { items: items0, totais: first?.totais ?? {} };

  // Busca restante em lotes paralelos
  const allItems: any[] = [...items0];
  for (let start = 1; start < nPages; start += batchSize) {
    const end   = Math.min(start + batchSize, nPages);
    const pages = Array.from({ length: end - start }, (_, i) => start + i);

    const results = await Promise.all(pages.map(pg => {
      const q = new URLSearchParams(qs);
      q.set('page', String(pg));
      return caGet<any>(`${endpoint}?${q}`, token)
        .then((r: any) => r?.itens ?? [])
        .catch((e: any) => {
          console.warn(`[CA fin] p${pg} err: ${e.message}`);
          return [] as any[];
        });
    }));

    for (const batch of results) allItems.push(...(batch as any[]));
  }

  // Deduplica por id
  const seen = new Set<string>();
  const deduped = allItems.filter((i: any) => {
    if (!i?.id || seen.has(String(i.id))) return false;
    seen.add(String(i.id));
    return true;
  });

  console.log(`[CA fin] fetched ${deduped.length}/${total} (deduped from ${allItems.length})`);
  return { items: deduped, totais: first?.totais ?? {} };
}

function normalize(item: any, tipo: 'RECEITA' | 'DESPESA', emailMap: Map<string, string> = new Map()) {
  const nome = (item.cliente?.nome ?? item.fornecedor?.nome ?? '').trim();
  return {
    id:               item.id,
    tipo,
    valor:            item.total            ?? 0,
    pago:             item.pago             ?? 0,
    nao_pago:         item.nao_pago         ?? 0,
    status:           item.status           ?? '',
    status_traduzido: item.status_traduzido ?? '',
    descricao:        item.descricao        ?? '',
    data_vencimento:  item.data_vencimento  ?? '',
    data_competencia: item.data_competencia ?? '',
    data_criacao:     item.data_criacao     ?? '',
    categoria:        item.categorias?.[0]?.nome        ?? '',
    centro_de_custo:  item.centros_de_custo?.[0]?.nome  ?? '',
    cliente:          nome,
    cliente_id:       item.cliente?.id ?? item.fornecedor?.id ?? '',
    cliente_email:    emailMap.get(nome.toUpperCase()) ?? '',
  };
}

async function enrichEmails(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!names.length) return map;
  try {
    await ensureSchema();
    const db  = getDb();
    const up  = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];
    const bp  = await db`
      SELECT UPPER(TRIM(name)) u, LOWER(email) e
      FROM buyer_profiles
      WHERE UPPER(TRIM(name)) = ANY(${up}) AND email != ''
    ` as any[];
    for (const r of bp) if (r.u && r.e) map.set(r.u, r.e);

    const mis = up.filter(n => !map.has(n));
    if (mis.length) {
      const ms = await db`
        SELECT UPPER(TRIM(name)) u, LOWER(email) e
        FROM manual_students
        WHERE UPPER(TRIM(name)) = ANY(${mis}) AND email != ''
      ` as any[];
      for (const r of ms) if (r.u && r.e && !map.has(r.u)) map.set(r.u, r.e);
    }
  } catch (e: any) { console.warn('[CA fin] DB enrich fail:', e.message); }
  return map;
}

export async function GET(request: Request) {
  const sp    = new URL(request.url).searchParams;
  const tipo  = sp.get('tipo')       || '';
  const dI    = sp.get('dataInicio') || '';
  const dF    = sp.get('dataFim')    || '';
  const force = sp.get('force') === '1';

  const cacheKey = `fin4|${tipo}|${dI}|${dF}`;
  if (!force) { const c = getCache(cacheKey); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    const inicio = dI || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const fim    = dF || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    const epR = '/financeiro/eventos-financeiros/contas-a-receber/buscar';
    const epD = '/financeiro/eventos-financeiros/contas-a-pagar/buscar';
    const qR  = new URLSearchParams({ data_vencimento_de: inicio, data_vencimento_ate: fim });
    const qD  = new URLSearchParams({ data_vencimento_de: inicio, data_vencimento_ate: fim });

    // Busca receitas e despesas em paralelo, cada uma com todas as páginas
    const [recRes, desRes] = await Promise.all([
      (!tipo || tipo === 'RECEITA') ? fetchAllPages(epR, qR, token) : Promise.resolve({ items: [], totais: {} }),
      (!tipo || tipo === 'DESPESA') ? fetchAllPages(epD, qD, token) : Promise.resolve({ items: [], totais: {} }),
    ]);

    const rawR = recRes.items;
    const rawD = desRes.items;
    const rT   = recRes.totais ?? {};
    const dT   = desRes.totais ?? {};

    // Enrich emails from our DB
    const names    = rawR.map((i: any) => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const emailMap = await enrichEmails(names);

    const receitasItens = rawR
      .map((i: any) => normalize(i, 'RECEITA', emailMap))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const despesasItens = rawD
      .map((i: any) => normalize(i, 'DESPESA'))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    console.log(`[CA fin] FINAL: ${receitasItens.length} receitas, ${despesasItens.length} despesas`);

    const result = {
      receitas: receitasItens,
      despesas: despesasItens,
      meta: {
        fetchedReceitas: receitasItens.length,
        fetchedDespesas: despesasItens.length,
        periodo: { inicio, fim },
      },
      totais: {
        totalReceitas:     rT.todos            ?? 0,
        totalDespesas:     dT.todos             ?? 0,
        receitasPagas:     rT.pago?.valor       ?? 0,
        receitasPendentes: rT.pendente?.valor   ?? 0,
        receitasVencidas:  rT.vencido?.valor    ?? 0,
        receitasHoje:      rT.vence_hoje?.valor ?? 0,
        despesasPagas:     dT.pago?.valor       ?? 0,
        despesasPendentes: dT.pendente?.valor   ?? 0,
        despesasVencidas:  dT.vencido?.valor    ?? 0,
        saldoProjetado:    (rT.pendente?.valor ?? 0) - (dT.pendente?.valor ?? 0),
      },
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error('[CA fin] GET error:', err.message);
    if (err.message?.includes('não conectado') || err.message?.includes('reconectar'))
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
