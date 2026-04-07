import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   PUT /api/alunos/manual/[id]
   Full update of a manual student — all editable fields.
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
    // Build update payload — only override fields that are explicitly provided
    const rows = (await sql`
      UPDATE manual_students SET
        name               = COALESCE(${body.name               ?? null}, name),
        phone              = COALESCE(${body.phone              ?? null}, phone),
        entry_date         = COALESCE(${body.entry_date         ?? null}::bigint, entry_date),
        payment_type       = COALESCE(${body.payment_type       ?? null}, payment_type),
        currency           = COALESCE(${body.currency           ?? null}, currency),
        total_amount       = COALESCE(${body.total_amount       ?? null}::numeric, total_amount),
        down_payment       = COALESCE(${body.down_payment       ?? null}::numeric, down_payment),
        installments       = COALESCE(${body.installments       ?? null}::integer, installments),
        installment_amount = COALESCE(${body.installment_amount ?? null}::numeric, installment_amount),
        installment_dates  = COALESCE(${body.installment_dates  ? JSON.stringify(body.installment_dates) : null}::jsonb, installment_dates),
        notes              = COALESCE(${body.notes              ?? null}, notes),
        updated_at         = ${now}
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
