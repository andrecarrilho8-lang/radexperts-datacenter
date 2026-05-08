import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let _ready = false;
async function boot() {
  if (!_ready) { await ensureWebhookSchema(); _ready = true; }
}

const APPROVED_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo   = searchParams.get('dateTo')   || '';

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom e dateTo são obrigatórios' }, { status: 400 });
  }

  try {
    await boot();
    const sql = getDb();


    // Expande parcelas com generate_series: cada parcela = data_primeira + N meses.
    // Filtra apenas parcelas cujo vencimento caiu no período selecionado.
    const manualRows = await sql`
      SELECT
        bp.email,
        COALESCE(bp.name, ms.student_name, bp.email)         AS nome,
        bp.vendedor,
        ms.course_name,
        n.parcelas,
        ROUND((bp.bp_valor / n.parcelas)::numeric, 2)        AS valor_parcela,
        (
          to_timestamp(bp.bp_primeira_parcela::bigint / 1000.0)
          + (gs.mes || ' months')::interval
        )::date                                               AS data_parcela,
        gs.mes + 1                                            AS parcela_num
      FROM buyer_profiles bp
      CROSS JOIN LATERAL (
        SELECT GREATEST(1,
          CASE WHEN bp.bp_pagamento ~ '^\d+'
               THEN (regexp_match(bp.bp_pagamento, '(\d+)'))[1]::int
               ELSE 1 END
        ) AS parcelas
      ) n
      CROSS JOIN generate_series(0, n.parcelas - 1) gs(mes)
      LEFT JOIN LATERAL (
        SELECT course_name, name AS student_name
        FROM manual_students
        WHERE email = bp.email
        ORDER BY entry_date DESC
        LIMIT 1
      ) ms ON TRUE
      WHERE bp.vendedor IS NOT NULL
        AND bp.bp_valor        > 0
        AND bp.bp_primeira_parcela IS NOT NULL
        AND (
          to_timestamp(bp.bp_primeira_parcela::bigint / 1000.0)
          + (gs.mes || ' months')::interval
        )::date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    ` as any[];

    // ── 2. Hotmart sales no período ──────────────────────────────────────────
    const startIso = `${dateFrom}T00:00:00`;
    const endIso   = `${dateTo}T23:59:59`;
    const hotmartSales = await fetchHotmartSales(startIso, endIso);

    // Emails aprovados da Hotmart
    const approvedSales = hotmartSales.filter((s: any) =>
      APPROVED_STATUSES.has(s.purchase?.status)
    );

    // Buscar vendedor para cada email hotmart
    const hotmartEmails = [...new Set(approvedSales.map((s: any) => s.buyer?.email?.toLowerCase()).filter(Boolean))];

    let vendedorByEmail: Record<string, string> = {};
    if (hotmartEmails.length > 0) {
      const profiles = await sql`
        SELECT email, vendedor FROM buyer_profiles
        WHERE email = ANY(${hotmartEmails}::text[])
          AND vendedor IS NOT NULL
      ` as any[];
      profiles.forEach((p: any) => { vendedorByEmail[p.email] = p.vendedor; });
    }

    // ── 3. Agregar por vendedor ───────────────────────────────────────────────
    type VendedorData = {
      nome: string;
      hotmartVendas: number;
      hotmartValor: number;
      manualVendas: number;
      manualValor: number;
      itens: any[];
    };
    const byVendedor = new Map<string, VendedorData>();

    const getOrCreate = (nome: string): VendedorData => {
      if (!byVendedor.has(nome)) {
        byVendedor.set(nome, { nome, hotmartVendas: 0, hotmartValor: 0, manualVendas: 0, manualValor: 0, itens: [] });
      }
      return byVendedor.get(nome)!;
    };

    // Hotmart
    const seenTx = new Set<string>();
    approvedSales.forEach((s: any) => {
      const email = s.buyer?.email?.toLowerCase();
      const tx    = s.purchase?.transaction;
      if (!email || !tx || seenTx.has(tx)) return;
      seenTx.add(tx);

      const vendedor = vendedorByEmail[email];
      if (!vendedor) return; // sem vendedor cadastrado → pula

      const currency = (s.purchase?.price?.currency_code || 'BRL').toUpperCase();
      const isBrl    = currency === 'BRL';

      // ── Valor líquido ────────────────────────────────────────────────────
      // BRL: producer_net → fallback (price.value - hotmart_fee.total)
      // LATAM/intl: producer_net_brl → fallback converted_value × (1 - fee%)
      let netValue: number;
      if (isBrl) {
        const pn = s.purchase?.producer_net;
        if (pn != null) {
          netValue = pn;
        } else {
          const gross = s.purchase?.price?.value ?? 0;
          const fee   = s.purchase?.hotmart_fee_total ?? s.purchase?.hotmart_fee?.total ?? 0;
          netValue = Math.max(0, gross - fee);
        }
      } else {
        const pnBrl = s.purchase?.producer_net_brl;
        if (pnBrl != null) {
          netValue = pnBrl;
        } else {
          const converted = s.purchase?.price?.converted_value || 0;
          const feePct    = s.purchase?.hotmart_fee?.percentage ?? 0;
          netValue = converted * (1 - feePct / 100);
        }
      }

      const data = new Date(s.purchase?.approved_date || s.purchase?.order_date).toISOString().slice(0, 10);

      const entry = getOrCreate(vendedor);
      entry.hotmartVendas++;
      entry.hotmartValor += netValue ?? 0;
      entry.itens.push({
        fonte:   'hotmart',
        nome:    s.buyer?.name || email,
        email,
        produto: s.product?.name || '—',
        valor:   netValue ?? 0,
        bruto:   netValue ?? 0,
        data,
      });
    });

    // Manuais
    manualRows.forEach((row: any) => {
      const entry = getOrCreate(row.vendedor);
      const data  = row.data_parcela ? String(row.data_parcela) : '—';
      const valor = Number(row.valor_parcela) || 0;
      const nParcelas = Number(row.parcelas) || 1;
      const nParcela  = Number(row.parcela_num) || 1;
      entry.manualVendas++;
      entry.manualValor += valor;
      entry.itens.push({
        fonte:   'manual',
        nome:    row.nome || row.email,
        email:   row.email,
        produto: `${row.course_name || 'Manual'}${nParcelas > 1 ? ` (${nParcela}/${nParcelas})` : ''}`,
        valor,
        bruto:   valor,
        data,
      });
    });

    // Ordenar itens por data
    byVendedor.forEach(v => {
      v.itens.sort((a, b) => (b.data > a.data ? 1 : -1));
    });

    const vendedores = Array.from(byVendedor.values())
      .map(v => ({
        ...v,
        totalVendas: v.hotmartVendas + v.manualVendas,
        totalValor:  v.hotmartValor  + v.manualValor,
      }))
      .sort((a, b) => b.totalValor - a.totalValor);

    return NextResponse.json({ vendedores, dateFrom, dateTo });
  } catch (e: any) {
    console.error('[comissoes]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
