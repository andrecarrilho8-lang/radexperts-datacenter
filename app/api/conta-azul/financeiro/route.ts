/**
 * app/api/conta-azul/financeiro/route.ts
 *
 * A CA API retorna fixo 10 itens/página (ignora size).
 * Total pode chegar a ~1521 registros = 153 páginas.
 *
 * Estratégia:
 *   1) Busca página 0 → descobre itens_totais
 *   2) Busca as últimas LAST_PAGES páginas em paralelo (mais recentes)
 *   3) Ordena tudo DESC por data_vencimento no backend antes de retornar
 *
 * Com LAST_PAGES=30 buscamos os 300 registros mais recentes (10/pg × 30pg)
 * em paralelo, muito mais rápido que busca sequencial.
 */

import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const cache     = new Map<string, { data: any; ts: number }>();
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
    throw new Error(`CA API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * A CA API ignora o parâmetro `size` e retorna sempre 10 itens/página.
 * Para capturar os registros MAIS RECENTES buscamos as últimas N páginas.
 * O total é descoberto na primeira chamada (itens_totais).
 */
async function fetchRecentPages(
  endpoint: string,
  baseParams: URLSearchParams,
  token: string,
  maxFetchPages = 30, // busca até 30 páginas × 10 = 300 registros mais recentes
): Promise<any> {
  // Página 0 — descobre total
  const p0 = new URLSearchParams(baseParams);
  p0.set('page', '0');
  const first  = await fetchCA<any>(`${endpoint}?${p0}`, token);
  const itens0 = first?.itens ?? [] as any[];
  const total  = first?.itens_totais ?? 0;
  const PG_SIZE = itens0.length || 10; // real page size returned by CA

  console.log(`[CA fin] p0: ${itens0.length}/${total}, real pgSize=${PG_SIZE}`);

  const totalPages = Math.ceil(total / PG_SIZE);

  if (totalPages <= 1) {
    return { ...first, itens: itens0, _fetchedPages: 1, _totalPages: totalPages };
  }

  // Determina o range de páginas: queremos as mais recentes = últimas páginas
  const lastPage  = totalPages - 1;
  const firstPage = Math.max(1, lastPage - maxFetchPages + 1); // +1 pq já temos p0

  const promises: Promise<any>[] = [];
  for (let pg = firstPage; pg <= lastPage; pg++) {
    const p = new URLSearchParams(baseParams);
    p.set('page', String(pg));
    promises.push(
      fetchCA<any>(`${endpoint}?${p}`, token)
        .catch(err => { console.warn(`[CA p${pg}]:`, err.message); return { itens: [] }; })
    );
  }

  const rest = await Promise.all(promises);
  const recent = rest.flatMap((r: any) => r?.itens ?? []);

  // Se as páginas mais recentes são as últimas, incluir página 0 apenas
  // se ela também está no range (ou seja, quando o total é pequeno)
  const allItems = [...itens0, ...recent];
  console.log(`[CA fin] fetched ${allItems.length} itens (pg0 + pg${firstPage}–${lastPage}) de ${total} totais`);

  return { ...first, itens: allItems, _fetchedPages: promises.length + 1, _totalPages: totalPages };
}

function normalizeItem(item: any, tipo: 'RECEITA' | 'DESPESA', emailMap: Map<string, string> = new Map()) {
  const nome = (item.cliente?.nome ?? item.fornecedor?.nome ?? '').trim();
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
    cliente:          nome,
    cliente_id:       item.cliente?.id ?? item.fornecedor?.id ?? '',
    cliente_email:    emailMap.get(nome.toUpperCase()) ?? '',
  };
}

async function enrichEmailsFromDB(names: string[]): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  if (!names.length) return emailMap;
  try {
    await ensureSchema();
    const db    = getDb();
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
    console.warn('[CA fin] DB enrichment failed:', e.message);
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
    const hoje  = new Date();
    const dI    = dataInicio || new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const dF    = dataFim    || new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    const rParams = new URLSearchParams({ data_vencimento_de: dI, data_vencimento_ate: dF });
    const dParams = new URLSearchParams({ data_vencimento_de: dI, data_vencimento_ate: dF });

    let receitasRaw: any = null;
    let despesasRaw: any = null;

    if (!tipo || tipo === 'RECEITA') {
      receitasRaw = await fetchRecentPages(
        '/financeiro/eventos-financeiros/contas-a-receber/buscar', rParams, token
      );
    }
    if (!tipo || tipo === 'DESPESA') {
      despesasRaw = await fetchRecentPages(
        '/financeiro/eventos-financeiros/contas-a-pagar/buscar', dParams, token
      );
    }

    const rawR: any[] = receitasRaw?.itens ?? [];
    const rawD: any[] = despesasRaw?.itens ?? [];

    const names    = rawR.map((i: any) => (i.cliente?.nome ?? '').trim()).filter(Boolean);
    const emailMap = await enrichEmailsFromDB(names);

    // Sort DESC by vencimento in the backend (CA API doesn't support ordering)
    const receitasItens = rawR
      .map((i: any) => normalizeItem(i, 'RECEITA', emailMap))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const despesasItens = rawD
      .map((i: any) => normalizeItem(i, 'DESPESA'))
      .sort((a: any, b: any) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

    const rT = receitasRaw?.totais ?? {};
    const dT = despesasRaw?.totais ?? {};

    const result = {
      receitas: receitasItens,
      despesas: despesasItens,
      meta: {
        totalItensCA:    receitasRaw?._totalPages != null ? receitasRaw._totalPages * 10 : rawR.length,
        fetchedReceitas: receitasItens.length,
        fetchedDespesas: despesasItens.length,
      },
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
    console.error('[CA fin] Error:', error.message);
    if (error.message?.includes('não conectado') || error.message?.includes('reconectar')) {
      return NextResponse.json({ error: 'not_connected', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
