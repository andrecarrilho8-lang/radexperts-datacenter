import { NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/vendas/manual?from=<ms>&to=<ms>
   Returns manual sales (manual_students) with revenue totals by currency.
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

    // Aggregate by currency
    const totalsByCurrency: Record<string, { gross: number; count: number }> = {};
    for (const r of rows) {
      const cur = (r.currency || 'BRL').toUpperCase();
      if (!totalsByCurrency[cur]) totalsByCurrency[cur] = { gross: 0, count: 0 };
      totalsByCurrency[cur].gross += Number(r.total_amount) || 0;
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
