import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   PUT /api/alunos/manual/[id]
   Update installment_dates (mark parcelas as paid/unpaid) or other fields.
   ══════════════════════════════════════════════════════════════════════════ */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sql = getDb();
  const now = Date.now();

  try {
    // Allow updating installment_dates and/or notes
    const rows = (await sql`
      UPDATE manual_students SET
        installment_dates = COALESCE(${body.installment_dates ? JSON.stringify(body.installment_dates) : null}::jsonb, installment_dates),
        notes      = COALESCE(${body.notes ?? null}, notes),
        updated_at = ${now}
      WHERE id = ${id}
      RETURNING *
    `) as any[];
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ student: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   DELETE /api/alunos/manual/[id]
   Remove a manual student.
   ══════════════════════════════════════════════════════════════════════════ */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sql = getDb();
  try {
    await sql`DELETE FROM manual_students WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
