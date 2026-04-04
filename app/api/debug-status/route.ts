import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Temporary debug endpoint - checks real bp_em_dia values in the DB
// GET /api/debug-status?course=<course_name>&limit=10
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const course = searchParams.get('course') || '';
  const limit  = parseInt(searchParams.get('limit') || '10');

  const sql = getDb();

  // 1. Manual students for this course + their buyer_profiles
  const manualRows = await sql`
    SELECT
      ms.name, ms.email, ms.payment_type,
      bp.bp_em_dia, bp.bp_proximo_pagamento,
      bp.bp_pagamento, bp.vendedor
    FROM manual_students ms
    LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
    WHERE ms.course_name = ${course}
    ORDER BY ms.entry_date DESC
    LIMIT ${limit}
  ` as any[];

  // 2. Check what em_dia values exist in buyer_profiles for this course's manual students
  const allEmDia = await sql`
    SELECT DISTINCT bp.bp_em_dia, COUNT(*) as count
    FROM manual_students ms
    LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
    WHERE ms.course_name = ${course}
    GROUP BY bp.bp_em_dia
  ` as any[];

  // 3. Raw buyer_profiles for first few emails
  const emails = manualRows.slice(0, 5).map((r: any) => r.email.toLowerCase());
  const bpRaw = emails.length > 0 ? await sql`
    SELECT email, bp_em_dia, bp_proximo_pagamento, bp_pagamento, vendedor
    FROM buyer_profiles
    WHERE LOWER(email) = ANY(${emails}::text[])
  ` as any[] : [];

  return NextResponse.json({
    course,
    manualStudentsSample: manualRows,
    emDiaDistribution: allEmDia,
    buyerProfilesRaw: bpRaw,
  });
}
