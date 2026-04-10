import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

/**
 * PATCH /api/alunos/manual/pay-installment
 * Body: { email: string, installmentIndex: number }
 *
 * Marks the installment at `installmentIndex` as paid (today).
 * Then updates bp_em_dia based on new installment state:
 *   - All paid → 'Quitado'
 *   - No more overdue → 'Adimplente'
 */
export async function PATCH(req: Request) {
  try {
    const { email, installmentIndex } = await req.json() as {
      email: string;
      installmentIndex: number;
    };

    if (!email || installmentIndex == null) {
      return NextResponse.json({ error: 'email e installmentIndex são obrigatórios' }, { status: 400 });
    }

    const db = getDb();
    const emailLower = email.toLowerCase().trim();

    // Fetch the latest manual_student record for this email
    const rows = await db`
      SELECT id, installment_dates
      FROM manual_students
      WHERE LOWER(email) = ${emailLower}
      ORDER BY entry_date DESC
      LIMIT 1
    ` as any[];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aluno manual não encontrado' }, { status: 404 });
    }

    const row = rows[0];
    let dates: { due_ms: number; paid: boolean; paid_ms: number | null }[] = [];
    try {
      const raw = typeof row.installment_dates === 'string'
        ? JSON.parse(row.installment_dates)
        : (row.installment_dates || []);
      if (Array.isArray(raw)) dates = raw;
    } catch { /* ignore */ }

    if (installmentIndex < 0 || installmentIndex >= dates.length) {
      return NextResponse.json({ error: 'Índice de parcela inválido' }, { status: 400 });
    }

    // Mark the installment as paid
    const paidMs = Date.now();
    dates[installmentIndex] = { ...dates[installmentIndex], paid: true, paid_ms: paidMs };

    // Determine new effective status
    const GRACE_15 = 15 * 24 * 60 * 60 * 1000;
    const allPaid  = dates.every(d => d.paid);
    const hasOverdue = dates.some(d => !d.paid && Number(d.due_ms) + GRACE_15 < Date.now());
    const newStatus = allPaid ? 'Quitado' : hasOverdue ? 'Inadimplente' : 'Adimplente';

    // Update manual_students installment_dates
    await db`
      UPDATE manual_students
      SET installment_dates = ${JSON.stringify(dates)},
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    // Update buyer_profiles bp_em_dia
    await db`
      UPDATE buyer_profiles
      SET bp_em_dia = ${newStatus}
      WHERE LOWER(email) = ${emailLower}
    `;

    return NextResponse.json({
      success: true,
      newStatus,
      allPaid,
      paidMs,
      updatedDates: dates,
    });
  } catch (e: any) {
    console.error('[pay-installment]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
