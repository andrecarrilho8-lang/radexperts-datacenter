import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/admin/cleanup-hotmart-manuals
 * Body: { emails: string[] }
 * Deletes manual_students records for Hotmart students (any course_name).
 * These records were incorrectly created by an earlier bulk import.
 */
export async function POST(req: NextRequest) {
  const { emails } = await req.json() as { emails: string[] };
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: 'emails array required' }, { status: 400 });
  }

  const sql = getDb();
  const lower = emails.map(e => e.toLowerCase().trim());
  const results: { email: string; deleted: number }[] = [];

  for (const email of lower) {
    // Find all manual_students records for this email
    const existing = await sql`
      SELECT id, course_name, payment_type FROM manual_students
      WHERE LOWER(email) = ${email}
    ` as any[];

    if (existing.length === 0) {
      results.push({ email, deleted: 0 });
      continue;
    }

    // Delete ALL manual records for this email
    // (Hotmart data is authoritative; manual records for Hotmart students are noise)
    await sql`DELETE FROM manual_students WHERE LOWER(email) = ${email}`;
    results.push({ email, deleted: existing.length });
  }

  const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
  return NextResponse.json({ ok: true, totalDeleted, details: results });
}
