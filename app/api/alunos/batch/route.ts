import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/alunos/batch
   Body: {
     courseName: string,
     students: Array<{
       name, email, phone, cpf, paymentMethod, totalAmount, entryDate
     }>
   }
   Saves all to manual_students in a single round-trip.
   Returns: { saved, failed, errors }
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const courseName: string  = (body.courseName || '').trim();
  const students: any[]     = Array.isArray(body.students) ? body.students : [];

  if (!courseName) return NextResponse.json({ error: 'courseName required' }, { status: 400 });
  if (students.length === 0) return NextResponse.json({ error: 'No students' }, { status: 400 });

  const sql = getDb();
  const now = Date.now();
  const results: { saved: number; failed: number; errors: string[] } = { saved: 0, failed: 0, errors: [] };

  for (const s of students) {
    const name  = (s.name  || '').trim();
    const email = (s.email || '').toLowerCase().trim();
    if (!name || !email) { results.failed++; results.errors.push(`Linha sem nome ou email: ${email || name}`); continue; }

    const entryDate    = s.entryDate    ? Number(s.entryDate) : now;
    const paymentType  = s.paymentMethod || 'PIX';
    const totalAmount  = parseFloat(s.totalAmount || '0') || 0;
    const phone        = (s.phone || '').trim();
    const cpf          = (s.cpf   || '').trim();

    try {
      await sql`
        INSERT INTO manual_students
          (id, course_name, name, email, phone, entry_date, payment_type,
           total_amount, installments, installment_amount, installment_dates, notes,
           created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${courseName}, ${name}, ${email}, ${phone}, ${entryDate}, ${paymentType},
          ${totalAmount}, 1, ${totalAmount},
          '[]'::jsonb, ${cpf ? `CPF: ${cpf}` : ''},
          ${now}, ${now}
        )
      `;
      // Also upsert buyer_profiles so phone/CPF appear via the phones endpoint
      if (phone || cpf) {
        await sql`
          INSERT INTO buyer_profiles
            (email, name, phone, document, purchase_count, created_at, updated_at)
          VALUES (${email}, ${name}, ${phone || null}, ${cpf || null}, 0, ${now}, ${now})
          ON CONFLICT (email) DO UPDATE SET
            phone    = COALESCE(NULLIF(EXCLUDED.phone, ''),    buyer_profiles.phone),
            document = COALESCE(NULLIF(EXCLUDED.document, ''), buyer_profiles.document),
            name     = COALESCE(NULLIF(EXCLUDED.name, ''),     buyer_profiles.name),
            updated_at = ${now}
        `;
      }
      results.saved++;
    } catch (e: any) {
      results.failed++;
      results.errors.push(`${email}: ${e.message}`);
    }
  }

  return NextResponse.json(results);
}
