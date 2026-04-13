import { NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/vendas/manual?from=<ms>&to=<ms>
   Returns manual sales (manual_students) with REAL revenue totals:
   down_payment already paid + paid installments × installment_amount.
   ══════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = Number(searchParams.get('from') || 0);
  const to   = Number(searchParams.get('to')   || Date.now());

  try {
    await ensureSchema();
    const sql = getDb();

    const rows = (await sql`
      SELECT ms.*, bp.vendedor, bp.bp_em_dia
      FROM manual_students ms
      LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
      WHERE ms.entry_date >= ${from} AND ms.entry_date <= ${to}
      ORDER BY ms.entry_date DESC
    `) as any[];

    // Aggregate by currency using REAL paid amount
    const totalsByCurrency: Record<string, { gross: number; count: number }> = {};
    for (const r of rows) {
      const cur = (r.currency || 'BRL').toUpperCase();
      if (!totalsByCurrency[cur]) totalsByCurrency[cur] = { gross: 0, count: 0 };

      const ptype = (r.payment_type || 'PIX').toUpperCase();
      const isPix = ptype === 'PIX' || ptype === 'PIX_AVISTA';

      let realPaid = 0;
      if (isPix) {
        // PIX à vista: fully paid at entry
        realPaid = Number(r.total_amount) || 0;
      } else {
        // PIX_MENSAL / PIX_CARTAO / CREDIT_CARD: entrada + paid installments
        const downAmt = Number(r.down_payment) || 0;
        const instAmt = Number(r.installment_amount) || Number(r.total_amount) || 0;
        let paidCount = 0;
        try {
          const raw = typeof r.installment_dates === 'string'
            ? JSON.parse(r.installment_dates)
            : (r.installment_dates || []);
          if (Array.isArray(raw)) paidCount = raw.filter((d: any) => d.paid).length;
        } catch { /* ignore */ }
        realPaid = downAmt + paidCount * instAmt;
      }

      totalsByCurrency[cur].gross += realPaid;
      totalsByCurrency[cur].count += 1;
    }

    const brlTotal  = totalsByCurrency['BRL']?.gross  ?? 0;
    const latamTotal = Object.entries(totalsByCurrency)
      .filter(([cur]) => cur !== 'BRL')
      .reduce((acc, [, v]) => acc + v.gross, 0);

    return NextResponse.json({
      ok: true,
      sales: rows,
      totals: totalsByCurrency,
      brlTotal,
      latamTotal,
      count: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
