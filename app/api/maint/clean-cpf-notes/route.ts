import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// One-time migration: move CPF data from notes to document field
export async function GET() {
  const db = getDb();

  const rows = await db`
    SELECT id, name, email, notes, document
    FROM manual_students
    WHERE notes IS NOT NULL AND UPPER(notes) LIKE '%CPF:%'
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

    const newDoc = row.document || cpfVal;

    await db`
      UPDATE manual_students
      SET notes    = ${cleanNotes || null},
          document = ${newDoc}
      WHERE id = ${row.id}
    `;

    results.push(`✓ ${row.name} → CPF: ${cpfVal} → document`);
  }

  return NextResponse.json({
    updated: results.length,
    records: results,
  });
}
