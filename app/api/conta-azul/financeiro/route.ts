/**
 * CA API usa `pagina` (1-indexed) para paginar, não `page`.
 * Sempre retorna 10 itens/página. Batchs de 20 em paralelo.
 * Com 1521 registros: 153 páginas → cap em 100 páginas = 1000 registros.
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

async function caGet(path: string, token: string) {
  const r = await fetch(`${CA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`CA ${r.status}`);
  return r.json();
}

/**
 * Busca todas as páginas usando `pagina` (1-indexed).
 * Para automaticamente quando um lote retorna menos do que o esperado.
 */
async function fetchAll(
  endpoint: string,
  qs: URLSearchParams,
  token: string,
  maxPaginas = 50,   // cap pages
  batchSize  = 10,   // parallel pages per batch
): Promise<{ items: any[]; totais: any }> {
  // Use tamanho_pagina from QS or default 200 — API supports up to 1000
  const PER_PAGE = parseInt(qs.get('tamanho_pagina') || '200', 10) || 200;
  qs.set('tamanho_pagina', String(PER_PAGE));

  // pagina=1 (1-indexed)
  const q1 = new URLSearchParams(qs);
  q1.set('pagina', '1');
  let first: any;
  try   { first = await caGet(`${endpoint}?${q1}`, token); }
  catch (e: any) { console.error('[CA] pagina=1:', e.message); return { items: [], totais: {} }; }

  const items1   = (first?.itens ?? []) as any[];
  const total    = (first?.itens_totais ?? 0) as number;
  const nPaginas = Math.min(Math.ceil(total / PER_PAGE), maxPaginas);

  console.log(`[CA] ${endpoint.split('/').pop()}: total=${total} pages=${nPaginas} perPage=${PER_PAGE}`);

  if (nPaginas <= 1) return { items: items1, totais: first?.totais ?? {} };

  const allItems: any[] = [...items1];
  let done = false;

  for (let start = 2; start <= nPaginas && !done; start += batchSize) {
    const end   = Math.min(start + batchSize - 1, nPaginas);
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    const results = await Promise.all(pages.map(pg => {
      const q = new URLSearchParams(qs);
      q.set('pagina', String(pg));
      return caGet(`${endpoint}?${q}`, token)
        .then((r: any) => r?.itens ?? [] as any[])
        .catch((e: any) => { console.warn(`[CA] pagina=${pg}: ${e.message}`); return [] as any[]; });
    }));

    let batchCount = 0;
    for (const arr of results) { allItems.push(...(arr as any[])); batchCount += (arr as any[]).length; }
    if (batchCount < pages.length * PER_PAGE) done = true;
  }

  const seen = new Set<string>();
  const items = allItems.filter((i: any) => {
    const k = String(i?.id ?? '');
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });

  console.log(`[CA] fetched ${items.length}/${total} (deduped from ${allItems.length})`);
  return { items, totais: first?.totais ?? {} };
}

function norm(item: any, tipo: 'RECEITA' | 'DESPESA', em: Map<string, string> = new Map()) {
  const nome = (item.cliente?.nome ?? item.fornecedor?.nome ?? '').trim();
  return {
    id: item.id, tipo,
    valor: item.total ?? 0, pago: item.pago ?? 0, nao_pago: item.nao_pago ?? 0,
    status: item.status ?? '', status_traduzido: item.status_traduzido ?? '',
    descricao: item.descricao ?? '', data_vencimento: item.data_vencimento ?? '',
    data_competencia: item.data_competencia ?? '', data_criacao: item.data_criacao ?? '',
    categoria: item.categorias?.[0]?.nome ?? '', centro_de_custo: item.centros_de_custo?.[0]?.nome ?? '',
    cliente: nome, cliente_id: item.cliente?.id ?? item.fornecedor?.id ?? '',
    cliente_email: em.get(nome.toUpperCase()) ?? '',
  };
}

async function enrichEmails(names: string[]) {
  const map = new Map<string, string>();
  if (!names.length) return map;
  try {
    await ensureSchema();
    const db = getDb();
    const up = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];
    const bp = await db`SELECT UPPER(TRIM(name)) u,LOWER(email) e FROM buyer_profiles  WHERE UPPER(TRIM(name))=ANY(${up}) AND email!=''` as any[];
    for (const r of bp) if (r.u && r.e) map.set(r.u, r.e);
    const mis = up.filter(n => !map.has(n));
    if (mis.length) {
      const ms = await db`SELECT UPPER(TRIM(name)) u,LOWER(email) e FROM manual_students WHERE UPPER(TRIM(name))=ANY(${mis}) AND email!=''` as any[];
      for (const r of ms) if (r.u && r.e && !map.has(r.u)) map.set(r.u, r.e);
    }
  } catch (e: any) { console.warn('[CA] DB:', e.message); }
  return map;
}

export async function GET(req: Request) {
  const sp    = new URL(req.url).searchParams;
  const tipo  = sp.get('tipo')  || '';
  const force = sp.get('force') === '1';

  // Wide date range — captures overdue (very old) + pending (far future) + paid records.
  // No status filter = global totais + all statuses in items array.
  const INI = '2010-01-01';
  const FIM = '2035-12-31';

  const key = `fin10|${tipo}`;
  if (!force) { const c = getCache(key); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();

    const epR = '/financeiro/eventos-financeiros/contas-a-receber/buscar';
    const epD = '/financeiro/eventos-financeiros/contas-a-pagar/buscar';

    // tamanho_pagina=1000: with 1521 total records → only 2 pages needed
    const qR = new URLSearchParams({ data_vencimento_de: INI, data_vencimento_ate: FIM, tamanho_pagina: '1000' });
    const qD = new URLSearchParams({ data_vencimento_de: INI, data_vencimento_ate: FIM, tamanho_pagina: '1000' });

    const [rRes, dRes] = await Promise.all([
      (!tipo || tipo === 'RECEITA') ? fetchAll(epR, qR, token, 10, 5) : Promise.resolve({ items: [], totais: {} }),
      (!tipo || tipo === 'DESPESA') ? fetchAll(epD, qD, token, 10, 5) : Promise.resolve({ items: [], totais: {} }),
    ]);

    const names = rRes.items.map((i: any) => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const em    = await enrichEmails(names);

    const receitas = rRes.items
      .map((i: any) => norm(i, 'RECEITA', em))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const despesas = dRes.items
      .map((i: any) => norm(i, 'DESPESA'))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const rT = rRes.totais ?? {};
    const dT = dRes.totais ?? {};

    // KPI totals: prefer API-provided totais fields; fall back to summing items
    const sumBy = (arr: any[], field: string) => arr.reduce((s: number, i: any) => s + (i[field] ?? 0), 0);

    const recPagas     = rT.pago?.valor       ?? sumBy(receitas.filter((r: any) => ['ACQUITTED','RECEBIDO'].includes((r.status||'').toUpperCase()) || ['RECEBIDO','RECEBIDO_PARCIAL'].includes((r.status_traduzido||'').toUpperCase())), 'pago');
    const recPendentes = rT.pendente?.valor   ?? sumBy(receitas.filter((r: any) => ['PENDING','OPEN'].includes((r.status||'').toUpperCase()) || (r.status_traduzido||'').toUpperCase() === 'EM_ABERTO'), 'nao_pago');
    const recVencidas  = rT.vencido?.valor    ?? sumBy(receitas.filter((r: any) => (r.status||'').toUpperCase() === 'OVERDUE' || (r.status_traduzido||'').toUpperCase() === 'ATRASADO'), 'nao_pago');

    const result = {
      receitas, despesas,
      meta: { fetchedReceitas: receitas.length, fetchedDespesas: despesas.length, periodo: { ini: INI, fim: FIM } },
      totais: {
        totalReceitas:     rT.todos?.valor      ?? (recPagas + recPendentes + recVencidas),
        totalDespesas:     dT.todos?.valor       ?? 0,
        receitasPagas:     recPagas,
        receitasPendentes: recPendentes,
        receitasVencidas:  recVencidas,
        receitasHoje:      rT.vence_hoje?.valor ?? 0,
        despesasPagas:     dT.pago?.valor       ?? 0,
        despesasPendentes: dT.pendente?.valor   ?? 0,
        despesasVencidas:  dT.vencido?.valor    ?? 0,
        saldoProjetado:    (rT.pendente?.valor  ?? recPendentes) - (dT.pendente?.valor ?? 0),
      },
    };

    setCache(key, result);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[CA fin]', err.message);
    if (err.message?.includes('não conectado') || err.message?.includes('reconectar'))
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

