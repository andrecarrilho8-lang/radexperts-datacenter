import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';
import { getCachedAllSales } from '@/app/lib/salesCache';

// Comparison endpoint: given a list of emails, tells us who is in manual_students
// for a given course and who is in Hotmart sales for that course.
// POST /api/debug/compare-enrollment
// Body: { courseName: string, emails: string[] }
export async function POST(req: NextRequest) {
  const { courseName, emails: rawEmails } = await req.json();
  if (!courseName || !Array.isArray(rawEmails)) {
    return NextResponse.json({ error: 'courseName and emails required' }, { status: 400 });
  }

  const emails = rawEmails.map((e: string) => e.toLowerCase().trim()).filter(Boolean);

  try {
    const sql = getDb();

    // 1. Who is in manual_students for this course?
    const manualRows = await sql`
      SELECT email, name, created_at FROM manual_students
      WHERE course_name = ${courseName}
    ` as any[];
    const inManual = new Set(manualRows.map(r => r.email.toLowerCase()));

    // 2. Who is in Hotmart sales for this course?
    const ACTIVE = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
    const sales = await getCachedAllSales();
    const hotmartEmails = new Set<string>();
    for (const s of sales) {
      if (!ACTIVE.has(s.purchase?.status)) continue;
      const name = (s.product?.name || '').trim();
      if (name !== courseName) continue;
      const email = (s.buyer?.email || '').toLowerCase().trim();
      if (email) hotmartEmails.add(email);
    }

    // 3. Classify each provided email
    const inFile = emails;
    const inSystem = new Set([...inManual, ...hotmartEmails]);

    const missingFromSystem: string[] = [];
    const onlyInManual: string[] = [];
    const onlyInHotmart: string[] = [];
    const inBoth: string[] = [];

    for (const e of inFile) {
      const manual = inManual.has(e);
      const hotmart = hotmartEmails.has(e);
      if (!manual && !hotmart) missingFromSystem.push(e);
      else if (manual && hotmart) inBoth.push(e);
      else if (manual) onlyInManual.push(e);
      else onlyInHotmart.push(e);
    }

    // 4. Who is in the system for this course but NOT in the file?
    const inSystemNotInFile: string[] = [];
    for (const e of inManual) {
      if (!inFile.includes(e)) inSystemNotInFile.push(e);
    }
    for (const e of hotmartEmails) {
      if (!inFile.includes(e) && !inSystemNotInFile.includes(e)) inSystemNotInFile.push(e);
    }

    return NextResponse.json({
      courseName,
      fileCount: emails.length,
      summary: {
        missingFromSystem: missingFromSystem.length,
        onlyInManual: onlyInManual.length,
        onlyInHotmart: onlyInHotmart.length,
        inBoth: inBoth.length,
        inSystemNotInFile: inSystemNotInFile.length,
      },
      missingFromSystem,
      onlyInManual,
      onlyInHotmart,
      inBoth,
      inSystemNotInFile,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
