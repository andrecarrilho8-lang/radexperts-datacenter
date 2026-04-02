import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/alunos/batch
   Body: {
     courseName: string,
     students: Array<{
       name, email, phone, cpf, paymentMethod, totalAmount, entryDate,
       isExisting?: boolean   ← if true, only enrich buyer_profiles (no insert)
     }>
   }
   Returns: { saved, enriched, failed, errors }
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
  const results: { saved: number; enriched: number; failed: number; errors: string[] } = {
    saved: 0, enriched: 0, failed: 0, errors: [],
  };

  for (const s of students) {
    const name  = (s.name  || '').trim();
    const email = (s.email || '').toLowerCase().trim();
    if (!name || !email) { results.failed++; results.errors.push(`Linha sem nome ou email: ${email || name}`); continue; }

    const phone  = (s.phone || '').trim();
    const cpf    = (s.cpf   || '').trim();

    // ── Belt-and-suspenders dedup: check server-side even if client sent isExisting ──
    // 1. Did client already flag this as existing?
    const clientFlagged = s.isExisting === true;

    // 2. Check if email already in manual_students for this course
    let isInManual = false;
    try {
      const existing = await sql`
        SELECT id FROM manual_students
        WHERE email = ${email} AND course_name = ${courseName}
        LIMIT 1
      ` as any[];
      isInManual = existing.length > 0;
    } catch { /* ignore check error, will try insert */ }

    // 3. Check if email in buyer_profiles (Hotmart student)
    let isInProfiles = false;
    if (!isInManual) {
      try {
        const bp = await sql`SELECT email FROM buyer_profiles WHERE email = ${email} LIMIT 1` as any[];
        isInProfiles = bp.length > 0;
      } catch { /* ignore */ }
    }

    const shouldEnrichOnly = clientFlagged || isInManual || isInProfiles;

    if (shouldEnrichOnly) {
      // Only update buyer_profiles with missing fields — never create a duplicate
      try {
        if (phone || cpf) {
          await sql`
            INSERT INTO buyer_profiles
              (email, name, phone, document, purchase_count, created_at, updated_at)
            VALUES (${email}, ${name}, ${phone || null}, ${cpf || null}, 0, ${now}, ${now})
            ON CONFLICT (email) DO UPDATE SET
              phone    = COALESCE(NULLIF(buyer_profiles.phone,    ''), NULLIF(EXCLUDED.phone,    '')),
              document = COALESCE(NULLIF(buyer_profiles.document, ''), NULLIF(EXCLUDED.document, '')),
              name     = COALESCE(NULLIF(buyer_profiles.name,     ''), NULLIF(EXCLUDED.name,     '')),
              updated_at = ${now}
          `;
        }
        results.enriched++;
      } catch (e: any) {
        results.failed++;
        results.errors.push(`${email}: ${e.message}`);
      }
      continue;
    }

    // ── New student — full insert ─────────────────────────────────────────
    const entryDate     = s.entryDate ? Number(s.entryDate) : now;
    const paymentType   = s.paymentMethod || 'PIX';
    const totalAmount   = parseFloat((s.totalAmount  || '0').toString().replace(',', '.'))  || 0;
    const instCount     = parseInt(s.installments    || '1', 10) || 1;
    const instAmtIn     = parseFloat((s.installmentAmount || '0').toString().replace(',', '.'));
    const instPaid      = parseInt(s.installmentsPaid || '0', 10) || 0;

    const instAmount = instAmtIn > 0 ? instAmtIn : (instCount > 1 ? totalAmount / instCount : totalAmount);
    const realTotal  = totalAmount > 0 ? totalAmount : instAmount * instCount;

    const MONTH = 30 * 24 * 60 * 60 * 1000;
    const installmentDates = paymentType === 'CARTAO_CREDITO' && instCount > 1
      ? Array.from({ length: instCount }, (_, i) => {
          const due_ms  = entryDate + i * MONTH;
          const isPaid  = i < instPaid;
          return { due_ms, paid_ms: isPaid ? due_ms : null, paid: isPaid, index: i };
        })
      : [];

    const notes = [
      cpf ? `CPF: ${cpf}` : '',
      paymentType === 'CARTAO_CREDITO' && instCount > 1
        ? `Cartão ${instCount}x de R$ ${instAmount.toFixed(2)} · ${instPaid} pagas`
        : '',
    ].filter(Boolean).join(' | ');

    try {
      await sql`
        INSERT INTO manual_students
          (id, course_name, name, email, phone, entry_date, payment_type,
           total_amount, installments, installment_amount, installment_dates, notes,
           created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${courseName}, ${name}, ${email}, ${phone}, ${entryDate}, ${paymentType},
          ${realTotal}, ${instCount}, ${instAmount},
          ${JSON.stringify(installmentDates)}::jsonb,
          ${notes},
          ${now}, ${now}
        )
      `;
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
