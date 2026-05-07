/**
 * Busca as páginas MAIS RECENTES da CA API (que retorna exatamente 10/página).
 * Com 1521 registros = 153 páginas. Buscamos as últimas 50 páginas (500 registros)
 * em 2 lotes paralelos de 30 = ~2s total. Dentro do timeout do Vercel Hobby (10s).
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
  const r = await fetch(`${CA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`CA ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchRecentPages(
  endpoint: string,
  qs: URLSearchParams,
  token: string,
  maxFetch = 50,   // últimas N páginas  (50×10 = 500 registros mais recentes)
  batch    = 30,   // paralelos por lote
): Promise<{ items: any[]; totais: any; total: number; capped: boolean }> {

  // Pg 0 → descobre total e totais KPI
  const q0 = new URLSearchParams(qs); q0.set('page', '0');
  let first: any;
  try   { first = await caGet<any>(`${endpoint}?${q0}`, token); }
  catch (e: any) { console.error('[CA] p0:', e.message); return { items: [], totais: {}, total: 0, capped: false }; }

  const items0 = (first?.itens ?? []) as any[];
  const total  = (first?.itens_totais ?? 0) as number;
  const pgSize = items0.length || 10;
  const nPages = Math.ceil(total / pgSize);  // ex: ceil(1521/10) = 153
  const capped = nPages > maxFetch;

  // Se tudo cabe em 1 pg, retorna direto
  if (nPages <= 1) return { items: items0, totais: first?.totais ?? {}, total, capped: false };

  // Buscar as páginas MAIS RECENTES (as últimas no índice)
  const startPg = capped ? Math.max(0, nPages - maxFetch) : 0;

  // Monta lista de páginas a buscar (excluindo pg 0 se já buscamos)
  const pagesToFetch: number[] = [];
  for (let pg = (startPg === 0 ? 1 : startPg); pg < nPages; pg++) pagesToFetch.push(pg);

  const allItems: any[] = startPg === 0 ? [...items0] : [];

  // Lotes paralelos
  for (let i = 0; i < pagesToFetch.length; i += batch) {
    const slice = pagesToFetch.slice(i, i + batch);
    const res   = await Promise.all(slice.map(pg => {
      const q = new URLSearchParams(qs); q.set('page', String(pg));
      return caGet<any>(`${endpoint}?${q}`, token)
        .then((r: any) => r?.itens ?? [] as any[])
        .catch((e: any) => { console.warn(`[CA] p${pg}: ${e.message}`); return [] as any[]; });
    }));
    for (const arr of res) allItems.push(...(arr as any[]));
  }

  // Deduplica por id
  const seen = new Set<string>();
  const deduped = allItems.filter((i: any) => {
    const k = String(i?.id ?? '');
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });

  console.log(`[CA] ${endpoint.split('/').pop()}: total=${total} fetched=${deduped.length} capped=${capped}`);
  return { items: deduped, totais: first?.totais ?? {}, total, capped };
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
    const db = getDb();
    const up = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];
    const bp = await db`SELECT UPPER(TRIM(name)) u,LOWER(email) e FROM buyer_profiles WHERE UPPER(TRIM(name))=ANY(${up}) AND email!=''` as any[];
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

  const key = `fin6|${tipo}|${dI}|${dF}`;
  if (!force) { const c = getCache(key); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    // Default: 2 anos atrás → 6 meses à frente (cobre histórico completo)
    const ini   = dI || new Date(hoje.getFullYear() - 2, hoje.getMonth(), 1).toISOString().split('T')[0];
    const fim   = dF || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    const epR = '/financeiro/eventos-financeiros/contas-a-receber/buscar';
    const epD = '/financeiro/eventos-financeiros/contas-a-pagar/buscar';
    const qR  = new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim });
    const qD  = new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim });

    const [rRes, dRes] = await Promise.all([
      (!tipo || tipo === 'RECEITA') ? fetchRecentPages(epR, qR, token) : Promise.resolve({ items: [], totais: {}, total: 0, capped: false }),
      (!tipo || tipo === 'DESPESA') ? fetchRecentPages(epD, qD, token) : Promise.resolve({ items: [], totais: {}, total: 0, capped: false }),
    ]);

    const names    = rRes.items.map((i: any) => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const emailMap = await enrichEmails(names);

    const receitas = rRes.items
      .map((i: any) => normalize(i, 'RECEITA', emailMap))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const despesas = dRes.items
      .map((i: any) => normalize(i, 'DESPESA'))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const rT = rRes.totais ?? {};
    const dT = dRes.totais ?? {};

    const result = {
      receitas, despesas,
      meta: {
        fetchedReceitas:  receitas.length,
        totalCAReceitas:  rRes.total,
        cappedReceitas:   rRes.capped,
        fetchedDespesas:  despesas.length,
        totalCADespesas:  dRes.total,
        periodo: { ini, fim },
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

    setCache(key, result);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[CA fin]', err.message);
    if (err.message?.includes('não conectado') || err.message?.includes('reconectar'))
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
