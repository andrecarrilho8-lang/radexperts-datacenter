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
  maxPaginas = 100,  // cap: 100×10 = 1000 registros
  batchSize  = 20,   // páginas paralelas por lote
): Promise<{ items: any[]; totais: any }> {
  const PER_PAGE = 10;

  // pagina=1 (primeira página, 1-indexed)
  const q1 = new URLSearchParams(qs);
  q1.set('pagina', '1');
  let first: any;
  try   { first = await caGet(`${endpoint}?${q1}`, token); }
  catch (e: any) { console.error('[CA] pagina=1:', e.message); return { items: [], totais: {} }; }

  const items1  = (first?.itens ?? []) as any[];
  const total   = (first?.itens_totais ?? 0) as number;
  const nPaginas = Math.min(Math.ceil(total / PER_PAGE), maxPaginas); // ex: min(153,100)=100

  console.log(`[CA] ${endpoint.split('/').pop()}: total=${total} pages=${nPaginas}`);

  if (nPaginas <= 1) return { items: items1, totais: first?.totais ?? {} };

  // Busca paginas=2..nPaginas em lotes paralelos
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

    // Parada automática: lote incompleto = fim real dos dados
    if (batchCount < pages.length * PER_PAGE) done = true;
  }

  // Deduplica por id
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
  const tipo  = sp.get('tipo')       || '';
  const dI    = sp.get('dataInicio') || '';
  const dF    = sp.get('dataFim')    || '';
  const force = sp.get('force') === '1';

  const key = `fin8|${tipo}|${dI}|${dF}`;
  if (!force) { const c = getCache(key); if (c) return NextResponse.json({ ...c, fromCache: true }); }

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    const ini   = dI || new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1).toISOString().split('T')[0];
    const fim   = dF || new Date(hoje.getFullYear(), hoje.getMonth() + 6, 0).toISOString().split('T')[0];

    const epR = '/financeiro/eventos-financeiros/contas-a-receber/buscar';
    const epD = '/financeiro/eventos-financeiros/contas-a-pagar/buscar';
    const qR  = new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim });
    const qD  = new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim });

    // Fetch each situacao bucket separately so the 1000-record cap doesn't
    // bias toward the most-recent (usually RECEBIDO) records.

    const [rPago, rPendente, rVencido, dRes] = await Promise.all([
      // RECEBIDO: filter by the user's selected date range
      (!tipo || tipo === 'RECEITA') ? fetchAll(epR, new URLSearchParams({ data_vencimento_de: ini, data_vencimento_ate: fim, situacao: 'RECEBIDO' }), token) : Promise.resolve({ items: [], totais: {} }),
      // PENDENTE: no date restriction — pending records often have far-future due dates
      (!tipo || tipo === 'RECEITA') ? fetchAll(epR, new URLSearchParams({ situacao: 'PENDENTE' }), token) : Promise.resolve({ items: [], totais: {} }),
      // VENCIDO: no date restriction — overdue records often have due dates from years ago
      (!tipo || tipo === 'RECEITA') ? fetchAll(epR, new URLSearchParams({ situacao: 'VENCIDO' }), token) : Promise.resolve({ items: [], totais: {} }),
      (!tipo || tipo === 'DESPESA') ? fetchAll(epD, qD, token) : Promise.resolve({ items: [], totais: {} }),
    ]);

    // Normalise status from the bucket source — CA API may omit or vary the
    // status field for unpaid records. Force a known value so client filter works.
    rPago.items.forEach((i: any)    => { i.status = i.status || 'ACQUITTED'; });
    rPendente.items.forEach((i: any) => { i.status = 'PENDING'; });
    rVencido.items.forEach((i: any)  => { i.status = 'OVERDUE';  });

    // Use totais from the unrestricted first page (RECEBIDO bucket has the aggregate totais)
    const rRes = {
      items: [...rPago.items, ...rPendente.items, ...rVencido.items],
      totais: rPago.totais ?? rPendente.totais ?? rVencido.totais ?? {},
    };

    // Deduplicate merged list by id
    const seen = new Set<string>();
    const deduped = rRes.items.filter((i: any) => {
      const k = String(i?.id ?? '');
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    });
    rRes.items = deduped;

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
