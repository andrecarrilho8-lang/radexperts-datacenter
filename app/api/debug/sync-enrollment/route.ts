import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

/**
 * POST /api/debug/sync-enrollment
 * Body: { courseName, keepEmails: string[], dryRun?: boolean }
 * 
 * - Deletes manual_students rows for this course where email NOT in keepEmails
 * - Returns the list of deleted and kept rows
 */
export async function POST(req: NextRequest) {
  const { courseName, keepEmails: rawKeep, dryRun = false } = await req.json();
  if (!courseName || !Array.isArray(rawKeep)) {
    return NextResponse.json({ error: 'courseName and keepEmails required' }, { status: 400 });
  }

  const keepSet = new Set(rawKeep.map((e: string) => e.toLowerCase().trim()));

  try {
    const sql = getDb();

    // Current manual students for this course
    const current = await sql`
      SELECT id, email, name, created_at FROM manual_students
      WHERE course_name = ${courseName}
      ORDER BY email
    ` as any[];

    const toDelete = current.filter(r => !keepSet.has(r.email.toLowerCase()));
    const toKeep   = current.filter(r =>  keepSet.has(r.email.toLowerCase()));

    if (!dryRun && toDelete.length > 0) {
      const deleteIds = toDelete.map(r => r.id);
      await sql`
        DELETE FROM manual_students
        WHERE id = ANY(${deleteIds}::text[])
      `;
    }

    return NextResponse.json({
      dryRun,
      courseName,
      deleted: toDelete.length,
      kept:    toKeep.length,
      deletedRows: toDelete.map(r => ({ email: r.email, name: r.name })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
