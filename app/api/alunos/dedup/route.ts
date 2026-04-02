import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

/**
 * POST /api/alunos/dedup
 * Remove duplicate manual_students rows, keeping the OLDEST one per (course_name, email).
 * Also adds the UNIQUE constraint if missing.
 * 
 * Body: { courseName?: string }  — if omitted, deduplicates ALL courses
 */
export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}

  const sql = getDb();
  const courseName = (body.courseName || '').trim() || null;

  try {
    // 1. Find and delete duplicates (keep oldest row = smallest created_at per group)
    const deleted = await sql`
      DELETE FROM manual_students
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY course_name, email
                   ORDER BY created_at ASC  -- keep the first (oldest) row
                 ) AS rn
          FROM manual_students
          WHERE (${courseName}::text IS NULL OR course_name = ${courseName})
        ) ranked
        WHERE rn > 1
      )
      RETURNING id, email, course_name
    ` as any[];

    // 2. Add UNIQUE constraint (idempotent)
    try {
      await sql`
        ALTER TABLE manual_students
        ADD CONSTRAINT manual_students_course_email_unique
        UNIQUE (course_name, email)
      `;
    } catch {
      // Already exists
    }

    return NextResponse.json({
      ok: true,
      duplicatesRemoved: deleted.length,
      removed: deleted.map(r => ({ email: r.email, course: r.course_name })),
    });
  } catch (e: any) {
    console.error('[dedup]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/alunos/dedup?courseName=xxx
 * Preview how many duplicates exist without deleting
 */
export async function GET(request: Request) {
  const courseName = new URL(request.url).searchParams.get('courseName') || null;
  const sql = getDb();
  try {
    const dupes = await sql`
      SELECT course_name, email, COUNT(*) as cnt
      FROM manual_students
      WHERE (${courseName}::text IS NULL OR course_name = ${courseName})
      GROUP BY course_name, email
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
    ` as any[];
    const total = dupes.reduce((sum: number, r: any) => sum + Number(r.cnt) - 1, 0);
    return NextResponse.json({ duplicateGroups: dupes.length, rowsToRemove: total, preview: dupes.slice(0, 20) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
