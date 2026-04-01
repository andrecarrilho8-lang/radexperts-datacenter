import { NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/alunos/hide?course=<name>
   Returns the set of hidden emails for a course.
   ══════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const course = searchParams.get('course') || '';
  try {
    await ensureSchema();
    const sql = getDb();
    const rows = course
      ? (await sql`SELECT email FROM hidden_students WHERE course_name = ${course}`) as any[]
      : (await sql`SELECT email, course_name FROM hidden_students`) as any[];
    return NextResponse.json({ hidden: rows.map((r: any) => r.email) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/alunos/hide
   Hide a Hotmart student from the course list.
   Body: { course_name, email }
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { course_name, email } = body;
  if (!course_name || !email)
    return NextResponse.json({ error: 'course_name and email are required' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getDb();
    const now = Date.now();
    // ON CONFLICT DO NOTHING — idempotent
    await sql`
      INSERT INTO hidden_students (course_name, email, created_at)
      VALUES (${course_name}, ${email.toLowerCase().trim()}, ${now})
      ON CONFLICT (course_name, email) DO NOTHING
    `;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   DELETE /api/alunos/hide?course=<name>&email=<email>
   Unhide a student (restore to list).
   ══════════════════════════════════════════════════════════════════════════ */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const course = searchParams.get('course') || '';
  const email  = searchParams.get('email')  || '';
  if (!course || !email)
    return NextResponse.json({ error: 'course and email required' }, { status: 400 });
  try {
    const sql = getDb();
    await sql`DELETE FROM hidden_students WHERE course_name = ${course} AND email = ${email}`;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
