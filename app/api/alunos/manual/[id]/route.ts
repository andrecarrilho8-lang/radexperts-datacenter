import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';
import { logActivity, extractActor, extractIp } from '@/app/lib/activityLog';

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

    logActivity({
      ...extractActor(request),
      action:      'STUDENT_UPDATED',
      entity_type: 'manual_student',
      entity_id:   id,
      entity_name: rows[0].name || id,
      metadata:    { course: rows[0].course_name, fields_updated: Object.keys(body) },
      ip:          extractIp(request),
    });

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
    // Fetch name before deletion for the log
    const existing = await sql`SELECT name, course_name FROM manual_students WHERE id = ${id} LIMIT 1` as any[];
    await sql`DELETE FROM manual_students WHERE id = ${id}`;

    logActivity({
      ...extractActor(_request),
      action:      'STUDENT_DELETED',
      entity_type: 'manual_student',
      entity_id:   id,
      entity_name: existing[0]?.name || id,
      metadata:    { course: existing[0]?.course_name },
      ip:          extractIp(_request),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
