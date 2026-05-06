/**
 * Busca receitas por status separadamente (PENDING, OVERDUE, ACQUITTED)
 * para garantir dados em todos os filtros. Deduplica por ID.
 * CA API sempre retorna 10/página ignorando size param.
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

async function fetchCA<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CA API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Busca até N páginas de um endpoint+status em paralelo. Deduplica por id. */
async function fetchByStatus(
  endpoint: string,
  baseParams: URLSearchParams,
  status: string | null,
  token: string,
  maxPages = 15,
): Promise<any[]> {
  const params0 = new URLSearchParams(baseParams);
  if (status) params0.set('status', status);
  params0.set('page', '0');

  let first: any;
  try { first = await fetchCA<any>(`${endpoint}?${params0}`, token); }
  catch (e: any) { console.warn(`[CA fin] status=${status} p0 error:`, e.message); return []; }

  const itens0: any[] = first?.itens ?? [];
  const total: number = first?.itens_totais ?? 0;
  const pgSize        = itens0.length || 10;

  if (total <= pgSize || itens0.length === 0) return itens0;

  const totalPages = Math.ceil(total / pgSize);
  const startPg    = Math.max(1, totalPages - maxPages + 1); // get most recent pages

  const promises = [];
  for (let pg = startPg; pg < totalPages; pg++) {
    const p = new URLSearchParams(baseParams);
    if (status) p.set('status', status);
    p.set('page', String(pg));
    promises.push(
      fetchCA<any>(`${endpoint}?${p}`, token)
        .then((r: any) => r?.itens ?? [])
        .catch(() => [] as any[])
    );
  }

  const rest = await Promise.all(promises);
  const all  = [...itens0, ...rest.flat()];
  // Deduplicate by id
  const seen = new Set<string>();
  return all.filter((i: any) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
}

function normalizeItem(item: any, tipo: 'RECEITA' | 'DESPESA', emailMap: Map<string, string> = new Map()) {
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
    const db    = getDb();
    const upper = [...new Set(names.map(n => n.toUpperCase().trim()).filter(Boolean))];
    const bp    = await db`SELECT UPPER(TRIM(name)) AS u, LOWER(email) AS e FROM buyer_profiles WHERE UPPER(TRIM(name))=ANY(${upper}) AND email!=''` as any[];
    for (const r of bp) if (r.u && r.e) map.set(r.u, r.e);
    const miss = upper.filter(n => !map.has(n));
    if (miss.length) {
      const ms = await db`SELECT UPPER(TRIM(name)) AS u, LOWER(email) AS e FROM manual_students WHERE UPPER(TRIM(name))=ANY(${miss}) AND email!=''` as any[];
      for (const r of ms) if (r.u && r.e && !map.has(r.u)) map.set(r.u, r.e);
    }
  } catch (e: any) { console.warn('[CA fin] DB enrich fail:', e.message); }
  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo  = searchParams.get('tipo')       || '';
  const dI    = searchParams.get('dataInicio') || '';
  const dF    = searchParams.get('dataFim')    || '';
  const force = searchParams.get('force') === '1';

  const cacheKey = `fin2|${tipo}|${dI}|${dF}`;
  if (!force) { const c = getCache(cacheKey); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    const inicio = dI || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const fim    = dF || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    const baseR = new URLSearchParams({ data_vencimento_de: inicio, data_vencimento_ate: fim });
    const baseD = new URLSearchParams({ data_vencimento_de: inicio, data_vencimento_ate: fim });

    let rawR: any[] = [];
    let rawD: any[] = [];
    let rTotaisRaw: any = null;
    let dTotaisRaw: any = null;

    if (!tipo || tipo === 'RECEITA') {
      // Busca os 3 status em paralelo — garante dados em todos os filtros
      const [pending, overdue, acquitted, cancelled] = await Promise.all([
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-receber/buscar', baseR, 'PENDING',   token, 10),
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-receber/buscar', baseR, 'OVERDUE',   token, 10),
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-receber/buscar', baseR, 'ACQUITTED', token, 10),
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-receber/buscar', baseR, 'CANCELLED', token, 3),
      ]);
      rawR = [...pending, ...overdue, ...acquitted, ...cancelled];

      // Totais: busca sem filtro de status para ter KPIs corretos
      try {
        const tot = await fetchCA<any>(
          `/financeiro/eventos-financeiros/contas-a-receber/buscar?${baseR}&page=0`, token
        );
        rTotaisRaw = tot?.totais;
      } catch { /* usa o que tiver */ }
    }

    if (!tipo || tipo === 'DESPESA') {
      const [dp, do_, da] = await Promise.all([
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-pagar/buscar', baseD, 'PENDING',   token, 5),
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-pagar/buscar', baseD, 'OVERDUE',   token, 5),
        fetchByStatus('/financeiro/eventos-financeiros/contas-a-pagar/buscar', baseD, 'ACQUITTED', token, 5),
      ]);
      rawD = [...dp, ...do_, ...da];
      try {
        const tot = await fetchCA<any>(
          `/financeiro/eventos-financeiros/contas-a-pagar/buscar?${baseD}&page=0`, token
        );
        dTotaisRaw = tot?.totais;
      } catch { /* ignora */ }
    }

    // Deduplica novamente no nível global (por segurança)
    const dedupR = Array.from(new Map(rawR.map((i: any) => [i.id, i])).values());
    const dedupD = Array.from(new Map(rawD.map((i: any) => [i.id, i])).values());

    const names    = dedupR.map((i: any) => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const emailMap = await enrichEmails(names);

    const receitasItens = dedupR
      .map((i: any) => normalizeItem(i, 'RECEITA', emailMap))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const despesasItens = dedupD
      .map((i: any) => normalizeItem(i, 'DESPESA'))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const rT = rTotaisRaw ?? {};
    const dT = dTotaisRaw ?? {};

    const result = {
      receitas: receitasItens,
      despesas: despesasItens,
      meta: { fetchedReceitas: receitasItens.length, fetchedDespesas: despesasItens.length },
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
  } catch (error: any) {
    console.error('[CA fin]', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar'))
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
