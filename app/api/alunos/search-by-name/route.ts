import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/alunos/search-by-name?name=JEFFERSON
 * Returns up to 5 profiles whose name contains the search term (case-insensitive).
 * Searches buyer_profiles + manual_students, deduplicated by email.
 * Used for duplicate-detection on manual student add.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get('name') || '').trim();
  if (raw.length < 3) return NextResponse.json({ matches: [] });

  try {
    const sql = getDb();
    const term = `%${raw.toUpperCase()}%`;

    // Query buyer_profiles + manual_students, prefer bp data
    const rows = await sql`
      SELECT email, name, 'buyer_profiles' AS src, NULL::text AS course_name
      FROM buyer_profiles
      WHERE UPPER(name) LIKE ${term}

      UNION

      SELECT email, name, 'manual_students' AS src, course_name
      FROM manual_students
      WHERE UPPER(name) LIKE ${term}

      ORDER BY name
      LIMIT 30
    ` as any[];

    // Dedupe by email: for each email, collect unique course_names
    const byEmail = new Map<string, { email: string; name: string; courses: Set<string>; hasBp: boolean }>();
    for (const row of rows) {
      const key = (row.email || '').toLowerCase().trim();
      if (!key) continue;
      if (!byEmail.has(key)) {
        byEmail.set(key, { email: key, name: row.name || '', courses: new Set(), hasBp: false });
      }
      const entry = byEmail.get(key)!;
      if (row.course_name) entry.courses.add(row.course_name);
      if (row.src === 'buyer_profiles') entry.hasBp = true;
    }

    const matches = [...byEmail.values()].slice(0, 5).map(e => ({
      email:   e.email,
      name:    e.name,
      courses: [...e.courses],
    }));

    return NextResponse.json({ matches });
  } catch (e: any) {
    console.error('search-by-name error:', e);
    return NextResponse.json({ matches: [] });
  }
}
