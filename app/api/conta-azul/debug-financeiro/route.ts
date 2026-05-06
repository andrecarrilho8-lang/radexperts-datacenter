/**
 * app/api/conta-azul/debug-financeiro/route.ts
 * Debug: retorna a resposta RAW da CA API para diagnóstico.
 */
import { NextResponse } from 'next/server';
import { getContaAzulToken, CA_API_BASE } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '0';
  const size = searchParams.get('size') || '50';

  try {
    const token = await getContaAzulToken();
    const hoje  = new Date();
    const dInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const dFim    = new Date(hoje.getFullYear(), hoje.getMonth() + 6,  0).toISOString().split('T')[0];

    // Try multiple param variations to find what CA API accepts
    const variants: Record<string, string> = {
      'size+page (QueryString)':         `size=${size}&page=${page}&data_vencimento_de=${dInicio}&data_vencimento_ate=${dFim}`,
      'limit+offset':                    `limit=${size}&offset=${+page * +size}&data_vencimento_de=${dInicio}&data_vencimento_ate=${dFim}`,
      'pagina+itensPorPagina':           `pagina=${page}&itensPorPagina=${size}&data_vencimento_de=${dInicio}&data_vencimento_ate=${dFim}`,
      'no pagination params':            `data_vencimento_de=${dInicio}&data_vencimento_ate=${dFim}`,
    };

    const results: Record<string, any> = {};

    for (const [label, qs] of Object.entries(variants)) {
      try {
        const url = `${CA_API_BASE}/financeiro/eventos-financeiros/contas-a-receber/buscar?${qs}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        const raw = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }

        results[label] = {
          status: res.status,
          itens_totais: parsed?.itens_totais,
          itens_count: parsed?.itens?.length ?? 0,
          keys: typeof parsed === 'object' ? Object.keys(parsed) : [],
          sample_item_keys: parsed?.itens?.[0] ? Object.keys(parsed.itens[0]) : [],
          sample_status: parsed?.itens?.slice(0, 3).map((i: any) => ({ status: i.status, status_traduzido: i.status_traduzido })),
          url,
        };
      } catch (e: any) {
        results[label] = { error: e.message };
      }
    }

    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
