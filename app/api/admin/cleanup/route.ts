import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

// Temporary admin route: DELETE backfill BP students from Educação Continuada
export async function DELETE() {
  try {
    const sql = getDb();
    const deleted = await sql`
      DELETE FROM manual_students
      WHERE course_name = 'Educação Continuada - Neuroexpert'
      AND notes = 'Importado via backfill BP'
      RETURNING id, name, email
    `;
    return NextResponse.json({ deleted: deleted.length, students: deleted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const sql = getDb();
    const count = await sql`
      SELECT COUNT(*) as cnt FROM manual_students
      WHERE course_name = 'Educação Continuada - Neuroexpert'
      AND notes = 'Importado via backfill BP'
    `;
    const total = await sql`
      SELECT COUNT(*) as cnt FROM manual_students
      WHERE course_name = 'Educação Continuada - Neuroexpert'
    `;
    return NextResponse.json({ backfill_to_delete: count[0].cnt, total_in_course: total[0].cnt });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
