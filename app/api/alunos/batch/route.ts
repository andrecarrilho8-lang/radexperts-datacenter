import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';
export const maxDuration = 60; // 60s Vercel limit

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/alunos/batch
   Optimised: 2 bulk pre-checks + individual inserts (no per-row lookups).
   Returns: { saved, enriched, failed, errors }
   ══════════════════════════════════════════════════════════════════════════ */
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

  // ── 1. Collect all emails and do ONE bulk dedup check ─────────────────────
  const emailList = students
    .map(s => (s.email || '').toLowerCase().trim())
    .filter(Boolean);

  // Emails already in manual_students for this course
  const existingManualRows = await sql`
    SELECT email FROM manual_students
    WHERE course_name = ${courseName}
      AND email = ANY(${emailList})
  ` as any[];
  const inManual = new Set(existingManualRows.map((r: any) => r.email.toLowerCase()));

  // Emails already in buyer_profiles (Hotmart students)
  const existingProfileRows = await sql`
    SELECT email FROM buyer_profiles
    WHERE email = ANY(${emailList})
  ` as any[];
  const inProfiles = new Set(existingProfileRows.map((r: any) => r.email.toLowerCase()));

  // ── 2. Process each student ───────────────────────────────────────────────
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

    // ── Determine what to do ────────────────────────────────────────────────
    // - inManual: already enrolled in THIS course → only enrich BP
    // - inProfiles: known Hotmart student (appears via Hotmart API) → only enrich BP, NOT manual_students
    //   (adding them to manual_students would create duplicates since Hotmart API already shows them)
    // - brand new: not in Hotmart, not in manual → insert into manual_students + buyer_profiles
    const alreadyEnrolled = inManual.has(email) || inProfiles.has(email);

    if (alreadyEnrolled) {
      // Already known — just upsert buyer_persona enrichment, never duplicate
      try {
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
              phone    = COALESCE(NULLIF(buyer_profiles.phone,    ''), NULLIF(EXCLUDED.phone,    '')),
              document = COALESCE(NULLIF(buyer_profiles.document, ''), NULLIF(EXCLUDED.document, '')),
              name     = COALESCE(NULLIF(buyer_profiles.name,     ''), NULLIF(EXCLUDED.name,     '')),
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
        results.enriched++;
      } catch (e: any) {
        results.failed++;
        console.error('[batch enrich]', email, e.message);
        results.errors.push(`${email} (enrich): ${e.message}`);
      }
      continue;
    }

    // ── Full insert ──────────────────────────────────────────────────────────
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
          ${courseName}, ${name}, ${email}, ${phone}, ${entryDate}, ${payType},
          ${realTotal}, ${instCount}, ${instAmount},
          ${JSON.stringify(installmentDates)}::jsonb,
          ${notes},
          ${now}, ${now}
        )
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
            -- buyer_persona: ALWAYS overwrite with new data from spreadsheet
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

  return NextResponse.json(results);
}
