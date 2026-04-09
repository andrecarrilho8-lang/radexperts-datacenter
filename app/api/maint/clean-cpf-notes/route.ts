import { NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// One-time migration: remove CPF lines from notes field in manual_students
// (CPF belongs in buyer_profiles.bp_document, not in notes)
export async function GET() {
  try {
    await ensureSchema();
    const db = getDb();

    const rows = await db`
      SELECT id, name, email, notes
      FROM manual_students
      WHERE notes IS NOT NULL AND UPPER(notes::text) LIKE '%CPF:%'
    ` as any[];

    const results: string[] = [];

    for (const row of rows) {
      const lines: string[] = (row.notes || '').split('\n');
      const cpfLine = lines.find((l: string) => l.trim().toUpperCase().startsWith('CPF:'));
      if (!cpfLine) continue;

      const cpfVal = cpfLine.replace(/^CPF:/i, '').trim();
      const cleanNotes = lines
        .filter((l: string) => !l.trim().toUpperCase().startsWith('CPF:'))
        .join('\n')
        .trim();

      await db`
        UPDATE manual_students
        SET notes = ${cleanNotes || ''}
        WHERE id = ${row.id}
      `;

      results.push(`✓ ${row.name} (${row.email}) → CPF "${cpfVal}" removido das notas`);
    }

    return NextResponse.json({ updated: results.length, records: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
