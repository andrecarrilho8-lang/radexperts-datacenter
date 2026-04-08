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

    // ── 1. Alunos manuais com vendedor e valor no período ─────────────────────
    // bp_primeira_parcela = epoch ms da 1ª parcela/compra manual
    const fromMs = new Date(dateFrom).getTime();
    const toMs   = new Date(dateTo + 'T23:59:59').getTime();

    const manualRows = await sql`
      SELECT
        bp.email,
        COALESCE(bp.name, ms.name, bp.email) AS nome,
        bp.vendedor,
        bp.bp_valor    AS valor,
        bp.bp_pagamento AS pagamento,
        bp.bp_primeira_parcela::bigint AS data_ms
      FROM buyer_profiles bp
      LEFT JOIN manual_students ms ON ms.email = bp.email
      WHERE bp.vendedor IS NOT NULL
        AND bp.bp_valor  IS NOT NULL
        AND bp.bp_valor  > 0
        AND bp.bp_primeira_parcela IS NOT NULL
        AND bp.bp_primeira_parcela::bigint >= ${fromMs}
        AND bp.bp_primeira_parcela::bigint <= ${toMs}
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

      const netValue = s.purchase?.producer_net
        ?? (s.purchase?.price?.value - (s.purchase?.hotmart_fee?.total ?? 0));
      const grossValue = s.purchase?.price?.value ?? 0;
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
        bruto:   grossValue,
        data,
      });
    });

    // Manuais
    manualRows.forEach((row: any) => {
      const entry = getOrCreate(row.vendedor);
      const data  = row.data_ms ? new Date(Number(row.data_ms)).toISOString().slice(0, 10) : '—';
      entry.manualVendas++;
      entry.manualValor += Number(row.valor) || 0;
      entry.itens.push({
        fonte:   'manual',
        nome:    row.nome || row.email,
        email:   row.email,
        produto: row.pagamento || 'Manual',
        valor:   Number(row.valor) || 0,
        bruto:   Number(row.valor) || 0,
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
