import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';
import { setCache } from '@/app/lib/metaApi';
import { invalidateSalesCache } from '@/app/lib/salesCache';

function bustCursosCache() {
  setCache('cursos_list_v10', { data: null, expires_at: 0, stale_until: 0 });
  invalidateSalesCache();
}

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';
export const maxDuration = 60;

/* ─── Ensure the unique constraint exists (idempotent, runs once per cold start) ── */
let _constraintReady = false;
async function ensureUniqueConstraint() {
  if (_constraintReady) return;
  const sql = getDb();
  // Add unique constraint on (course_name, email) so ON CONFLICT works properly.
  // Safe to call repeatedly — IF NOT EXISTS semantics via exception swallow.
  try {
    await sql`
      ALTER TABLE manual_students
      ADD CONSTRAINT manual_students_course_email_unique
      UNIQUE (course_name, email)
    `;
  } catch {
    // Already exists — that's fine
  }
  _constraintReady = true;
}

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const courseName: string = (body.courseName || '').trim();
  const students: any[]    = Array.isArray(body.students) ? body.students : [];

  if (!courseName) return NextResponse.json({ error: 'courseName required' }, { status: 400 });
  if (students.length === 0) return NextResponse.json({ error: 'No students' }, { status: 400 });

  const sql = getDb();
  const now = Date.now();

  // Ensure unique constraint exists BEFORE we process students
  await ensureUniqueConstraint();

  const emailList = students
    .map(s => (s.email || '').toLowerCase().trim())
    .filter(Boolean);

  // Who is already enrolled in this course (in manual_students)?
  const existingManualRows = await sql`
    SELECT email FROM manual_students
    WHERE course_name = ${courseName}
      AND email = ANY(${emailList})
  ` as any[];
  const inManual = new Set(existingManualRows.map((r: any) => r.email.toLowerCase()));

  // Who exists in buyer_profiles (came from Hotmart)?
  const existingProfileRows = await sql`
    SELECT email FROM buyer_profiles
    WHERE email = ANY(${emailList})
  ` as any[];
  const inProfiles = new Set(existingProfileRows.map((r: any) => r.email.toLowerCase()));

  const results: { saved: number; enriched: number; failed: number; errors: string[] } = {
    saved: 0, enriched: 0, failed: 0, errors: [],
  };

  for (const s of students) {
    const name  = (s.name  || '').trim();
    const email = (s.email || '').toLowerCase().trim();
    if (!name || !email) {
      results.failed++;
      results.errors.push(`Linha sem nome ou email: ${email || name}`);
      continue;
    }

    const phone    = (s.phone    || '').trim();
    const cpf      = (s.cpf      || '').trim();
    const vendedor = (s.vendedor || '').trim() || null;
    const bpValor  = s.bp_valor  != null ? parseFloat(String(s.bp_valor).replace(',', '.')) || null : null;
    const bpPag    = (s.bp_pagamento  || '').trim() || null;
    const bpModelo = (s.bp_modelo     || '').trim() || null;
    const bpParc   = s.bp_parcela    != null ? parseFloat(String(s.bp_parcela).replace(',', '.')) || null : null;
    const bpPrim   = s.bp_primeira_parcela  ? Number(s.bp_primeira_parcela)  : null;
    const bpUlt    = s.bp_ultimo_pagamento  ? Number(s.bp_ultimo_pagamento)  : null;
    const bpProx   = s.bp_proximo_pagamento ? Number(s.bp_proximo_pagamento) : null;
    const bpEmDia  = (s.bp_em_dia  || '').trim() || null;
    const hasBP    = !!(vendedor || bpValor || bpPag || bpModelo || bpParc || bpPrim || bpUlt || bpProx || bpEmDia);

    /* ── Case 1: Already enrolled in this course (manual_students row exists) ──
       Only enrich buyer_profiles — never duplicate the enrollment row.         */
    if (inManual.has(email)) {
      try {
        await sql`
          INSERT INTO buyer_profiles
            (email, name, phone, document, purchase_count,
             vendedor, bp_valor, bp_pagamento, bp_modelo, bp_parcela,
             bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia,
             created_at, updated_at)
          VALUES (
            ${email}, ${name}, ${phone || null}, ${cpf || null}, 0,
            ${vendedor}, ${bpValor}, ${bpPag}, ${bpModelo}, ${bpParc},
            ${bpPrim}, ${bpUlt}, ${bpProx}, ${bpEmDia},
            ${now}, ${now}
          )
          ON CONFLICT (email) DO UPDATE SET
            phone      = CASE WHEN buyer_profiles.phone    IS NULL OR buyer_profiles.phone    = ''
                              THEN NULLIF(EXCLUDED.phone,    '') ELSE buyer_profiles.phone    END,
            document   = CASE WHEN buyer_profiles.document IS NULL OR buyer_profiles.document = ''
                              THEN NULLIF(EXCLUDED.document, '') ELSE buyer_profiles.document END,
            name       = CASE WHEN buyer_profiles.name     IS NULL OR buyer_profiles.name     = ''
                              THEN NULLIF(EXCLUDED.name,     '') ELSE buyer_profiles.name     END,
            vendedor             = CASE WHEN EXCLUDED.vendedor             IS NOT NULL THEN EXCLUDED.vendedor             ELSE buyer_profiles.vendedor             END,
            bp_valor             = CASE WHEN EXCLUDED.bp_valor             IS NOT NULL THEN EXCLUDED.bp_valor             ELSE buyer_profiles.bp_valor             END,
            bp_pagamento         = CASE WHEN EXCLUDED.bp_pagamento         IS NOT NULL THEN EXCLUDED.bp_pagamento         ELSE buyer_profiles.bp_pagamento         END,
            bp_modelo            = CASE WHEN EXCLUDED.bp_modelo            IS NOT NULL THEN EXCLUDED.bp_modelo            ELSE buyer_profiles.bp_modelo            END,
            bp_parcela           = CASE WHEN EXCLUDED.bp_parcela           IS NOT NULL THEN EXCLUDED.bp_parcela           ELSE buyer_profiles.bp_parcela           END,
            bp_primeira_parcela  = CASE WHEN EXCLUDED.bp_primeira_parcela  IS NOT NULL THEN EXCLUDED.bp_primeira_parcela  ELSE buyer_profiles.bp_primeira_parcela  END,
            bp_ultimo_pagamento  = CASE WHEN EXCLUDED.bp_ultimo_pagamento  IS NOT NULL THEN EXCLUDED.bp_ultimo_pagamento  ELSE buyer_profiles.bp_ultimo_pagamento  END,
            bp_proximo_pagamento = CASE WHEN EXCLUDED.bp_proximo_pagamento IS NOT NULL THEN EXCLUDED.bp_proximo_pagamento ELSE buyer_profiles.bp_proximo_pagamento END,
            bp_em_dia            = CASE WHEN EXCLUDED.bp_em_dia            IS NOT NULL THEN EXCLUDED.bp_em_dia            ELSE buyer_profiles.bp_em_dia            END,
            updated_at = ${now}
        `;
        results.enriched++;
      } catch (e: any) {
        results.failed++;
        console.error('[batch enrich-manual]', email, e.message);
        results.errors.push(`${email} (enrich): ${e.message}`);
      }
      continue;
    }

    // Shared payment data for cases 2 and 3
    const entryDate  = s.entryDate ? Number(s.entryDate) : now;
    const payType    = (s.paymentMethod || 'PIX').toString();
    const totalAmt   = parseFloat((s.totalAmount  || '0').toString().replace(',', '.'))  || 0;
    const instCount  = parseInt(s.installments    || '1', 10) || 1;
    const instAmtIn  = parseFloat((s.installmentAmount || '0').toString().replace(',', '.'));
    const instPaid   = parseInt(s.installmentsPaid || '0', 10) || 0;

    const instAmount = instAmtIn > 0 ? instAmtIn : (instCount > 1 ? totalAmt / instCount : totalAmt);
    const realTotal  = totalAmt > 0 ? totalAmt : instAmount * instCount;

    const MONTH = 30 * 24 * 60 * 60 * 1000;
    const installmentDates = payType === 'CARTAO_CREDITO' && instCount > 1
      ? Array.from({ length: instCount }, (_, i) => ({
          due_ms:  entryDate + i * MONTH,
          paid_ms: i < instPaid ? entryDate + i * MONTH : null,
          paid:    i < instPaid,
          index:   i,
        }))
      : [];

    const notes = [
      cpf ? `CPF: ${cpf}` : '',
      payType === 'CARTAO_CREDITO' && instCount > 1
        ? `Cartao ${instCount}x de R$ ${instAmount.toFixed(2)} - ${instPaid} pagas`
        : '',
    ].filter(Boolean).join(' | ');

    /* ── Case 2: In Hotmart (buyer_profiles) but NOT yet in this course ──
       Enroll them via manual_students using ON CONFLICT (course_name, email)
       so re-importing the spreadsheet never creates duplicate rows.          */
    if (inProfiles.has(email)) {
      try {
        await sql`
          INSERT INTO manual_students
            (id, course_name, name, email, phone, entry_date, payment_type,
             total_amount, installments, installment_amount, installment_dates, notes,
             created_at, updated_at)
          VALUES (
            gen_random_uuid()::text,
            ${courseName}, ${name}, ${email}, ${phone}, ${entryDate}, ${payType},
            ${realTotal}, ${instCount}, ${instAmount},
            ${JSON.stringify(installmentDates)}::jsonb,
            ${notes},
            ${now}, ${now}
          )
          ON CONFLICT (course_name, email) DO UPDATE SET
            name       = CASE WHEN EXCLUDED.name  IS NOT NULL AND EXCLUDED.name  <> '' THEN EXCLUDED.name  ELSE manual_students.name  END,
            phone      = CASE WHEN EXCLUDED.phone IS NOT NULL AND EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE manual_students.phone END,
            updated_at = ${now}
        `;

        /* Enrich buyer_profiles: contact info fills blanks, bp_* only fills if NULL (preserve Hotmart data) */
        await sql`
          UPDATE buyer_profiles SET
            phone      = CASE WHEN phone    IS NULL OR phone    = '' THEN NULLIF(${phone || null}, '') ELSE phone    END,
            document   = CASE WHEN document IS NULL OR document = '' THEN NULLIF(${cpf   || null}, '') ELSE document END,
            name       = CASE WHEN name     IS NULL OR name     = '' THEN NULLIF(${name  || null}, '') ELSE name     END,
            vendedor             = CASE WHEN vendedor             IS NULL THEN ${vendedor}::text    ELSE vendedor             END,
            bp_valor             = CASE WHEN bp_valor             IS NULL THEN ${bpValor}::numeric  ELSE bp_valor             END,
            bp_pagamento         = CASE WHEN bp_pagamento         IS NULL THEN ${bpPag}::text       ELSE bp_pagamento         END,
            bp_modelo            = CASE WHEN bp_modelo            IS NULL THEN ${bpModelo}::text    ELSE bp_modelo            END,
            bp_parcela           = CASE WHEN bp_parcela           IS NULL THEN ${bpParc}::numeric   ELSE bp_parcela           END,
            bp_primeira_parcela  = CASE WHEN bp_primeira_parcela  IS NULL THEN ${bpPrim}::bigint    ELSE bp_primeira_parcela  END,
            bp_ultimo_pagamento  = CASE WHEN bp_ultimo_pagamento  IS NULL THEN ${bpUlt}::bigint     ELSE bp_ultimo_pagamento  END,
            bp_proximo_pagamento = CASE WHEN bp_proximo_pagamento IS NULL THEN ${bpProx}::bigint    ELSE bp_proximo_pagamento END,
            bp_em_dia            = CASE WHEN bp_em_dia            IS NULL THEN ${bpEmDia}::text     ELSE bp_em_dia            END,
            updated_at = ${now}
          WHERE email = ${email}
        `;

        results.saved++;
      } catch (e: any) {
        results.failed++;
        console.error('[batch enroll-hotmart]', email, e.message);
        results.errors.push(`${email} (hotmart-enroll): ${e.message}`);
      }
      continue;
    }

    /* ── Case 3: Brand new student — not in Hotmart, not in course ──
       Full insert. ON CONFLICT (course_name, email) prevents duplicates. */
    try {
      await sql`
        INSERT INTO manual_students
          (id, course_name, name, email, phone, entry_date, payment_type,
           total_amount, installments, installment_amount, installment_dates, notes,
           created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${courseName}, ${name}, ${email}, ${phone}, ${entryDate}, ${payType},
          ${realTotal}, ${instCount}, ${instAmount},
          ${JSON.stringify(installmentDates)}::jsonb,
          ${notes},
          ${now}, ${now}
        )
        ON CONFLICT (course_name, email) DO UPDATE SET
          name       = CASE WHEN EXCLUDED.name  IS NOT NULL AND EXCLUDED.name  <> '' THEN EXCLUDED.name  ELSE manual_students.name  END,
          phone      = CASE WHEN EXCLUDED.phone IS NOT NULL AND EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE manual_students.phone END,
          updated_at = ${now}
      `;
      if (phone || cpf || hasBP) {
        await sql`
          INSERT INTO buyer_profiles
            (email, name, phone, document, purchase_count,
             vendedor, bp_valor, bp_pagamento, bp_modelo, bp_parcela,
             bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia,
             created_at, updated_at)
          VALUES (
            ${email}, ${name}, ${phone || null}, ${cpf || null}, 0,
            ${vendedor}, ${bpValor}, ${bpPag}, ${bpModelo}, ${bpParc},
            ${bpPrim}, ${bpUlt}, ${bpProx}, ${bpEmDia},
            ${now}, ${now}
          )
          ON CONFLICT (email) DO UPDATE SET
            phone    = COALESCE(NULLIF(EXCLUDED.phone,    ''), buyer_profiles.phone),
            document = COALESCE(NULLIF(EXCLUDED.document, ''), buyer_profiles.document),
            name     = COALESCE(NULLIF(EXCLUDED.name,     ''), buyer_profiles.name),
            vendedor             = COALESCE(EXCLUDED.vendedor,             buyer_profiles.vendedor),
            bp_valor             = COALESCE(EXCLUDED.bp_valor,             buyer_profiles.bp_valor),
            bp_pagamento         = COALESCE(EXCLUDED.bp_pagamento,         buyer_profiles.bp_pagamento),
            bp_modelo            = COALESCE(EXCLUDED.bp_modelo,            buyer_profiles.bp_modelo),
            bp_parcela           = COALESCE(EXCLUDED.bp_parcela,           buyer_profiles.bp_parcela),
            bp_primeira_parcela  = COALESCE(EXCLUDED.bp_primeira_parcela,  buyer_profiles.bp_primeira_parcela),
            bp_ultimo_pagamento  = COALESCE(EXCLUDED.bp_ultimo_pagamento,  buyer_profiles.bp_ultimo_pagamento),
            bp_proximo_pagamento = COALESCE(EXCLUDED.bp_proximo_pagamento, buyer_profiles.bp_proximo_pagamento),
            bp_em_dia            = COALESCE(EXCLUDED.bp_em_dia,            buyer_profiles.bp_em_dia),
            updated_at = ${now}
        `;
      }
      results.saved++;
    } catch (e: any) {
      results.failed++;
      console.error('[batch new]', email, e.message);
      results.errors.push(`${email}: ${e.message}`);
    }
  }

  if (results.saved > 0 || results.enriched > 0) bustCursosCache();
  return NextResponse.json(results);
}
