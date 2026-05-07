/**
 * Debug: descobre o parâmetro correto de paginação da CA API.
 * Testa: pagina, offset, cursor, etc.
 */
import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const token  = await getContaAzulToken();
    const ep     = `${CA_API_BASE}/financeiro/eventos-financeiros/contas-a-receber/buscar`;
    const hoje   = new Date();
    const ini    = new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1).toISOString().split('T')[0];
    const fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 6, 0).toISOString().split('T')[0];
    const dates  = `data_vencimento_de=${ini}&data_vencimento_ate=${fim}`;

    async function test(label: string, qs: string) {
      try {
        const r = await fetch(`${ep}?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        const j = await r.json();
        const ids = (j?.itens ?? []).slice(0,2).map((i:any) => i.id?.slice(0,8));
        return { status: r.status, count: j?.itens?.length ?? 0, totais: j?.itens_totais, ids };
      } catch (e: any) { return { error: e.message }; }
    }

    const results: Record<string,any> = {};

    // Testar diferentes nomes de parâmetro para página 2
    results['page=0']         = await test('p0',  `${dates}&page=0`);
    results['page=1']         = await test('p1',  `${dates}&page=1`);
    results['page=2']         = await test('p2',  `${dates}&page=2`);
    results['pagina=1']       = await test('pag1',`${dates}&pagina=1`);
    results['pagina=2']       = await test('pag2',`${dates}&pagina=2`);
    results['pagina=3']       = await test('pag3',`${dates}&pagina=3`);
    results['offset=0']       = await test('off0',`${dates}&offset=0`);
    results['offset=10']      = await test('off10',`${dates}&offset=10`);
    results['offset=20']      = await test('off20',`${dates}&offset=20`);
    results['size=50&page=0'] = await test('s50p0',`${dates}&size=50&page=0`);
    results['size=50&pagina=1'] = await test('s50pag1',`${dates}&size=50&pagina=1`);
    results['itensPorPagina=50&pagina=1'] = await test('ipp50pag1',`${dates}&itensPorPagina=50&pagina=1`);
    results['itensPorPagina=50&pagina=2'] = await test('ipp50pag2',`${dates}&itensPorPagina=50&pagina=2`);
    results['per_page=50&page=0'] = await test('pp50p0',`${dates}&per_page=50&page=0`);
    results['limit=50&skip=0']   = await test('l50s0',`${dates}&limit=50&skip=0`);
    results['limit=50&skip=10']  = await test('l50s10',`${dates}&limit=50&skip=10`);

    // IDs de referência (page=0 para comparar)
    results['_note'] = 'Se ids forem iguais ao page=0, o param é ignorado. IDs diferentes = paginação funciona!';

    return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
