import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

/**
 * GET /api/alunos/overlap?courseName=xxx
 * Shows which emails appear BOTH in manual_students AND buyer_profiles for a given course.
 * These are students enrolled from Hotmart AND also manually — potential duplicates across tables.
 */
export async function GET(request: Request) {
  const courseName = new URL(request.url).searchParams.get('courseName') || '';
  if (!courseName) return NextResponse.json({ error: 'courseName required' }, { status: 400 });

  const sql = getDb();
  try {
    // Students in manual_students for this course
    const manualRows = await sql`
      SELECT email, name FROM manual_students
      WHERE course_name = ${courseName}
      ORDER BY name
    ` as any[];

    const manualEmails = manualRows.map((r: any) => r.email.toLowerCase());

    // Which of those also appear in Hotmart sales for this course?
    // Since Hotmart students are shown via purchases matching the courseName product,
    // we check buyer_profiles for any purchase data
    const overlapRows = await sql`
      SELECT bp.email, bp.name, bp.last_product
      FROM buyer_profiles bp
      WHERE bp.email = ANY(${manualEmails})
        AND bp.purchase_count > 0
      ORDER BY bp.name
    ` as any[];

    const overlapEmails = new Set(overlapRows.map((r: any) => r.email.toLowerCase()));

    return NextResponse.json({
      courseName,
      totalManual: manualRows.length,
      totalInHotmartAlso: overlapRows.length,
      overlapStudents: overlapRows,
      pureManualCount: manualRows.filter((r: any) => !overlapEmails.has(r.email.toLowerCase())).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/alunos/overlap?courseName=xxx
 * Removes manual_students rows for students that ALREADY exist in Hotmart (buyer_profiles with purchase_count > 0).
 * This cleans up cases where a Hotmart buyer was accidentally re-enrolled manually.
 */
export async function DELETE(request: Request) {
  const courseName = new URL(request.url).searchParams.get('courseName') || '';
  if (!courseName) return NextResponse.json({ error: 'courseName required' }, { status: 400 });

  const sql = getDb();
  try {
    const deleted = await sql`
      DELETE FROM manual_students
      WHERE course_name = ${courseName}
        AND email IN (
          SELECT email FROM buyer_profiles
          WHERE purchase_count > 0
        )
      RETURNING email, name
    ` as any[];

    return NextResponse.json({
      ok: true,
      removedFromManual: deleted.length,
      removed: deleted.map((r: any) => ({ email: r.email, name: r.name })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
