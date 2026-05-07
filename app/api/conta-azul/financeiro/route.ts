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
 * Busca todas as páginas com parada automática.
 * CA API retorna sempre 10 itens/página (ignora size).
 * Lotes de BATCH_SIZE páginas em paralelo.
 * Para quando um lote retornar MENOS items que o esperado (fim real dos dados).
 */
async function fetchAll(
  endpoint: string,
  qs: URLSearchParams,
  token: string,
  maxPages  = 100,   // cap: 100×10 = 1000 registros máximo
  batchSize = 20,    // páginas simultâneas por lote
) {
  const EXPECTED_PER_PAGE = 10;
  const allItems: any[] = [];
  let firstTotais: any  = {};
  let done              = false;

  for (let start = 0; start < maxPages && !done; start += batchSize) {
    const end   = Math.min(start + batchSize, maxPages);
    const pages = Array.from({ length: end - start }, (_, i) => start + i);

    const results = await Promise.all(pages.map(pg => {
      const q = new URLSearchParams(qs);
      q.set('page', String(pg));
      return caGet(`${endpoint}?${q}`, token)
        .then((r: any) => ({ items: r?.itens ?? [], totais: r?.totais }))
        .catch(() => ({ items: [], totais: null }));
    }));

    // Totais do page 0 para KPIs
    if (start === 0 && results[0]?.totais) firstTotais = results[0].totais;

    let batchCount = 0;
    for (const r of results) {
      allItems.push(...r.items);
      batchCount += r.items.length;
    }

    // Se lote retornou menos do esperado → chegamos no fim
    if (batchCount < pages.length * EXPECTED_PER_PAGE) done = true;
  }

  // Deduplica por id
  const seen = new Set<string>();
  const items = allItems.filter((i: any) => {
    const k = String(i?.id ?? '');
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });

  console.log(`[CA] ${endpoint.split('/').pop()}: ${items.length} itens (raw=${allItems.length})`);
  return { items, totais: firstTotais };
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
  const tipo  = sp.get('tipo')       || '';
  const dI    = sp.get('dataInicio') || '';
  const dF    = sp.get('dataFim')    || '';
  const force = sp.get('force') === '1';

  const key = `fin7|${tipo}|${dI}|${dF}`;
  if (!force) { const c = getCache(key); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    const ini   = dI || new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1).toISOString().split('T')[0];
    const fim   = dF || new Date(hoje.getFullYear(),     hoje.getMonth() + 6, 0).toISOString().split('T')[0];

    const epR = '/financeiro/eventos-financeiros/contas-a-receber/buscar';
    const epD = '/financeiro/eventos-financeiros/contas-a-pagar/buscar';
    const qR  = new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim });
    const qD  = new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim });

    const [rRes, dRes] = await Promise.all([
      (!tipo || tipo === 'RECEITA') ? fetchAll(epR, qR, token) : Promise.resolve({ items: [], totais: {} }),
      (!tipo || tipo === 'DESPESA') ? fetchAll(epD, qD, token) : Promise.resolve({ items: [], totais: {} }),
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

    const result = {
      receitas, despesas,
      meta: { fetchedReceitas: receitas.length, fetchedDespesas: despesas.length, periodo: { ini, fim } },
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

    setCache(key, result);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[CA fin]', err.message);
    if (err.message?.includes('não conectado') || err.message?.includes('reconectar'))
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
