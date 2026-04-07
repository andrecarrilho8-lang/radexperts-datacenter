import { NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   PATCH /api/alunos/manual/[id]/installment
   Marks a specific installment as paid (or unpaid).

   Body: { installmentIndex: number, paid: boolean }
   ══════════════════════════════════════════════════════════════════════════ */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { installmentIndex, paid } = body;
  if (installmentIndex === undefined || paid === undefined) {
    return NextResponse.json({ error: 'installmentIndex e paid são obrigatórios' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getDb();
    const now = Date.now();

    // Fetch current installment_dates
    const rows = await sql`
      SELECT installment_dates FROM manual_students WHERE id = ${id}
    ` as any[];
    if (!rows.length) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });

    let dates: any[] = [];
    try {
      const raw = typeof rows[0].installment_dates === 'string'
        ? JSON.parse(rows[0].installment_dates)
        : (rows[0].installment_dates || []);
      if (Array.isArray(raw)) dates = raw;
    } catch { /* ignore */ }

    if (installmentIndex < 0 || installmentIndex >= dates.length) {
      return NextResponse.json({ error: 'Índice de parcela inválido' }, { status: 400 });
    }

    dates[installmentIndex] = {
      ...dates[installmentIndex],
      paid: !!paid,
      paid_ms: paid ? now : null,
    };

    const datesJson = JSON.stringify(dates);
    const updated = await sql`
      UPDATE manual_students
      SET installment_dates = ${datesJson}::jsonb,
          updated_at = ${now}
      WHERE id = ${id}
      RETURNING *
    ` as any[];

    return NextResponse.json({ student: updated[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
