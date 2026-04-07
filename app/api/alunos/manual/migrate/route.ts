import { NextResponse } from 'next/server';
import { getDb, ensureSchema, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/alunos/manual/migrate
   Normalises legacy manual_students and buyer_profiles data to the
   current schema. Safe to run multiple times (idempotent).

   What it does:
   1. Ensures schema / new columns exist
   2. Normalises bp_em_dia: SIM→Adimplente, NÃO/NAO→Inadimplente, etc.
   3. Backfills currency='BRL' where NULL
   4. Backfills installments=1, installment_amount=total_amount where missing
   5. Generates installment_dates from entry_date for rows that are missing them
   ══════════════════════════════════════════════════════════════════════════ */
export async function GET() {
  try {
    await ensureSchema();
    await ensureWebhookSchema();
    const sql = getDb();

    // ── 1. Normalise bp_em_dia in buyer_profiles ──────────────────────────────
    const emDiaResults = { updated: 0 };
    const bpRows = (await sql`
      SELECT email, bp_em_dia FROM buyer_profiles
      WHERE bp_em_dia IS NOT NULL
    `) as any[];

    for (const row of bpRows) {
      const raw = (row.bp_em_dia || '').trim().toUpperCase();
      let normalised: string | null = null;

      if (raw === 'SIM') normalised = 'Adimplente';
      else if (raw === 'NÃO' || raw === 'NAO' || raw === 'NÂO' || raw === 'NAO') normalised = 'Inadimplente';
      else if (raw === 'QUITADO' || raw === 'QUITO') normalised = 'Quitado';
      else if (raw === 'ADIMPLENTE') normalised = 'Adimplente';
      else if (raw === 'INADIMPLENTE') normalised = 'Inadimplente';

      if (normalised && normalised !== row.bp_em_dia) {
        await sql`UPDATE buyer_profiles SET bp_em_dia = ${normalised}, updated_at = ${Date.now()} WHERE email = ${row.email}`;
        emDiaResults.updated++;
      }
    }

    // ── 2. Normalise manual_students ──────────────────────────────────────────
    const msRows = (await sql`
      SELECT id, entry_date, payment_type, currency, total_amount,
             installments, installment_amount, installment_dates, down_payment
      FROM manual_students
    `) as any[];

    let msFixed = 0;

    for (const row of msRows) {
      const updates: Record<string, any> = {};

      // 2a. currency missing → BRL
      if (!row.currency) updates.currency = 'BRL';

      // 2b. payment_type normalisation
      const pt = (row.payment_type || '').toUpperCase();
      if (pt === 'PIX_CARTAO' || pt === 'PIX CARTAO') updates.payment_type = 'PIX_CARTAO';
      else if (pt === 'CREDIT_CARD' || pt === 'CREDITCARD' || pt === 'CARTAO') updates.payment_type = 'CREDIT_CARD';
      else if (pt === 'PIX_MENSAL' || pt === 'PIX MENSAL') updates.payment_type = 'PIX_MENSAL';
      else if (!['PIX', 'CREDIT_CARD', 'PIX_CARTAO', 'PIX_MENSAL'].includes(pt)) updates.payment_type = 'PIX';

      // 2c. installments missing or 0 → 1
      const installments = Number(row.installments);
      if (!installments || installments < 1) updates.installments = 1;

      // 2d. installment_amount missing → total_amount / installments
      const insts = (updates.installments ?? installments) || 1;
      const total = Number(row.total_amount) || 0;
      if (!Number(row.installment_amount) && total > 0) {
        updates.installment_amount = total / insts;
      }

      // 2e. installment_dates empty for installment plans → generate from entry_date
      let dates: any[] = [];
      try { dates = typeof row.installment_dates === 'string' ? JSON.parse(row.installment_dates) : (row.installment_dates || []); } catch {}

      const finalInsts = insts;
      const finalPt = updates.payment_type ?? row.payment_type ?? 'PIX';
      const needsDates = ['CREDIT_CARD', 'PIX_CARTAO', 'PIX_MENSAL'].includes(finalPt);

      if (needsDates && dates.length === 0 && finalInsts > 0 && row.entry_date) {
        const entryDate = Number(row.entry_date);
        const generated: any[] = [];
        for (let i = 0; i < finalInsts; i++) {
          const d = new Date(entryDate);
          d.setMonth(d.getMonth() + i);
          generated.push({ due_ms: d.getTime(), paid: false, paid_ms: null });
        }
        // If PIX à vista (one shot), mark already paid
        if (finalPt === 'PIX' && generated.length === 1) {
          generated[0].paid = true;
          generated[0].paid_ms = entryDate;
        }
        updates.installment_dates = JSON.stringify(generated);
      } else if (finalPt === 'PIX' && dates.length === 0 && row.entry_date) {
        // PIX à vista with no dates — generate single paid installment
        const entryDate = Number(row.entry_date);
        updates.installment_dates = JSON.stringify([{ due_ms: entryDate, paid: true, paid_ms: entryDate }]);
      }

      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => {
          const v = updates[k];
          if (k === 'installment_dates') return `${k} = '${v}'::jsonb`;
          if (k === 'installments') return `${k} = ${Number(v)}`;
          if (k === 'installment_amount' || k === 'total_amount') return `${k} = ${Number(v)}`;
          return `${k} = '${String(v).replace(/'/g, "''")}'`;
        }).join(', ');

        await sql.unsafe(`UPDATE manual_students SET ${setClauses}, updated_at = ${Date.now()} WHERE id = '${row.id}'`);
        msFixed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Migração concluída',
      bp_em_dia_normalised: emDiaResults.updated,
      manual_students_fixed: msFixed,
      total_manual: msRows.length,
    });
  } catch (e: any) {
    console.error('[migrate]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
