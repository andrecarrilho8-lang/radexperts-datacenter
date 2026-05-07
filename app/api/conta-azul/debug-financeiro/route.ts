/**
 * Debug endpoint - testa paginação real da CA API
 */
import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const token = await getContaAzulToken();
    const ep    = `${CA_API_BASE}/financeiro/eventos-financeiros/contas-a-receber/buscar`;

    // Testa páginas 0, 1 e 2 SEM filtro de data - para ver se paginação funciona
    const tests: Record<string, any> = {};

    for (const pg of [0, 1, 2]) {
      try {
        const r = await fetch(`${ep}?page=${pg}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        const j = await r.json();
        tests[`page=${pg}_nodate`] = {
          status: r.status,
          itens_count: j?.itens?.length ?? 0,
          itens_totais: j?.itens_totais,
          sample: j?.itens?.slice(0, 2).map((i: any) => ({ id: i.id, vencimento: i.data_vencimento, status: i.status })),
        };
      } catch (e: any) { tests[`page=${pg}_nodate`] = { error: e.message }; }
    }

    // Testa WITH data filter (1 year)
    const hoje = new Date();
    const ini  = new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1).toISOString().split('T')[0];
    const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 6, 0).toISOString().split('T')[0];

    for (const pg of [0, 1]) {
      try {
        const r = await fetch(`${ep}?page=${pg}&data_vencimento_de=${ini}&data_vencimento_ate=${fim}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        const j = await r.json();
        tests[`page=${pg}_withdate(${ini}→${fim})`] = {
          status: r.status,
          itens_count: j?.itens?.length ?? 0,
          itens_totais: j?.itens_totais,
          sample: j?.itens?.slice(0, 2).map((i: any) => ({ id: i.id, vencimento: i.data_vencimento, status: i.status })),
        };
      } catch (e: any) { tests[`page=${pg}_withdate`] = { error: e.message }; }
    }

    // Testa com data_emissao em vez de data_vencimento
    try {
      const r = await fetch(`${ep}?page=0&data_emissao_de=${ini}&data_emissao_ate=${fim}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const j = await r.json();
      tests['page=0_data_emissao'] = {
        status: r.status,
        itens_count: j?.itens?.length ?? 0,
        itens_totais: j?.itens_totais,
      };
    } catch (e: any) { tests['page=0_data_emissao'] = { error: e.message }; }

    return NextResponse.json(tests, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
