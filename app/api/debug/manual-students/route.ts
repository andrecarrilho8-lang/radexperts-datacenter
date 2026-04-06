import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

// Temporary diagnostic endpoint – shows manual_students by course_name pattern
// Usage: /api/debug/manual-students?course=Educa%C3%A7%C3%A3o+Continuada
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const course = (searchParams.get('course') || '').trim();

  try {
    const sql = getDb();

    // Count per course_name (all manual students)
    const counts = await sql`
      SELECT course_name, COUNT(*) as total,
             MIN(created_at) as first_created,
             MAX(created_at) as last_created
      FROM manual_students
      ${course ? sql`WHERE course_name ILIKE ${'%' + course + '%'}` : sql``}
      GROUP BY course_name
      ORDER BY total DESC
    ` as any[];

    // Emails that appear in 2+ courses (potential erroneous duplicates)
    const duplicates = await sql`
      SELECT email, COUNT(DISTINCT course_name) as course_count,
             array_agg(DISTINCT course_name ORDER BY course_name) as courses,
             MIN(created_at) as first_import
      FROM manual_students
      GROUP BY email
      HAVING COUNT(DISTINCT course_name) > 1
      ORDER BY course_count DESC
      LIMIT 50
    ` as any[];

    return NextResponse.json({
      courseCounts: counts.map(r => ({
        course_name: r.course_name,
        total: Number(r.total),
        first_created: new Date(Number(r.first_created)).toISOString(),
        last_created:  new Date(Number(r.last_created)).toISOString(),
      })),
      duplicateEmails: duplicates.map(r => ({
        email:        r.email,
        course_count: Number(r.course_count),
        courses:      r.courses,
        first_import: new Date(Number(r.first_import)).toISOString(),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
