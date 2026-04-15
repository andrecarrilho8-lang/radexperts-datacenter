import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// ── Types ──────────────────────────────────────────────────────────────────
interface ImportStudent {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  vendedor: string;
  payment_type: 'PIX_AVISTA' | 'PIX_MENSAL' | 'PIX_CARTAO' | 'HOTMART_CHECK';
  force_update?: boolean;   // bypass Hotmart check and always write manual record
  currency: string;
  total_amount: number;
  down_payment: number;
  installments: number;
  installment_amount: number;
  entry_date: number | null;          // epoch ms
  ultimo_pagamento: number | null;    // epoch ms
  proximo_pagamento: number | null;   // epoch ms (null = QUITADO means all paid)
  all_paid: boolean;                  // true when QUITADO
  status: 'Adimplente' | 'Inadimplente' | 'Quitado';
  course_name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function buildInstallmentDates(
  entryMs: number,
  installments: number,
  allPaid: boolean,
  proximoMs: number | null,
  ultimoMs: number | null,
): Array<{ due_ms: number; paid: boolean; paid_ms: number | null }> {
  const d = new Date(entryMs);
  const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
  // Compare dates by YMD to avoid timezone-induced off-by-hours bugs
  const ymd = (ms: number) => {
    const dt = new Date(ms);
    return dt.getUTCFullYear() * 10000 + dt.getUTCMonth() * 100 + dt.getUTCDate();
  };
  const proxYMD = proximoMs ? ymd(proximoMs) : null;
  const dates = [];
  for (let i = 0; i < installments; i++) {
    const dueMs = new Date(y, mo + i, day, 12, 0, 0).getTime();
    let paid = allPaid;
    if (!paid && proxYMD !== null) {
      // paid = installment's date is strictly before próximo pagamento date
      paid = ymd(dueMs) < proxYMD;
    }
    const paid_ms = paid ? dueMs : null;
    dates.push({ due_ms: dueMs, paid, paid_ms });
  }
  return dates;
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as { course_name: string; students: ImportStudent[] };
  const { course_name, students } = body;

  if (!course_name || !Array.isArray(students)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const sql = getDb();
  const results = { inserted: 0, updated: 0, hotmart_updated: 0, skipped: 0, errors: [] as string[] };

  for (const s of students) {
    try {
      const email = s.email.toLowerCase().trim();
      const now   = Date.now();

      // ── 1. Check if this student has Hotmart purchase data ──────────────
      const [bpRow] = await sql`
        SELECT email, purchase_count, vendedor, phone, document
        FROM buyer_profiles WHERE email = ${email}
      ` as any[];

      const isHotmart = (bpRow && (bpRow.purchase_count || 0) > 0) || s.payment_type === 'HOTMART_CHECK';

      if (isHotmart && !s.force_update) {
        // ── Hotmart / CSV-indicated Hotmart: only update non-payment fields ──
        await sql`
          INSERT INTO buyer_profiles (email, name, phone, document, vendedor, created_at, updated_at)
          VALUES (${email}, ${s.name.trim().toUpperCase()}, ${s.phone}, ${s.cpf}, ${s.vendedor}, ${now}, ${now})
          ON CONFLICT (email) DO UPDATE SET
            phone     = COALESCE(NULLIF(${s.phone}, ''), buyer_profiles.phone),
            document  = COALESCE(NULLIF(${s.cpf},   ''), buyer_profiles.document),
            vendedor  = COALESCE(NULLIF(${s.vendedor}, ''), buyer_profiles.vendedor),
            updated_at = ${now}
        `;
        results.hotmart_updated++;
        continue;
      }

      // ── 2. Manual student: build installment dates ─────────────────────
      const entryMs = s.entry_date ?? now;
      let installmentDates: ReturnType<typeof buildInstallmentDates> = [];

      if (s.payment_type !== 'PIX_AVISTA' && s.installments > 0) {
        installmentDates = buildInstallmentDates(
          entryMs,
          s.installments,
          s.all_paid,
          s.proximo_pagamento,
          s.ultimo_pagamento,
        );
      } else if (s.payment_type === 'PIX_AVISTA') {
        installmentDates = [{ due_ms: entryMs, paid: true, paid_ms: entryMs }];
      }

      // Search by email (no course_name constraint) to find ANY existing record → prioritize correct course_name
      const existingRows = await sql`
        SELECT id FROM manual_students
        WHERE LOWER(email) = ${email}
        ORDER BY
          CASE WHEN course_name = ${course_name} THEN 0 ELSE 1 END,
          updated_at DESC
        LIMIT 1
      ` as any[];

      const payload = {
        course_name,
        name:               s.name.trim().toUpperCase(),
        email,
        phone:              s.phone,
        entry_date:         entryMs,
        payment_type:       s.payment_type === 'PIX_AVISTA' ? 'PIX' : s.payment_type,
        currency:           s.currency,
        total_amount:       s.total_amount,
        down_payment:       s.down_payment,
        installments:       s.installments,
        installment_amount: s.installment_amount,
        installment_dates:  JSON.stringify(installmentDates),
        notes:              s.status,
        updated_at:         now,
      };

      if (existingRows.length > 0) {
        const id = existingRows[0].id;
        await sql`
          UPDATE manual_students SET
            name               = ${payload.name},
            phone              = ${payload.phone},
            entry_date         = ${payload.entry_date},
            payment_type       = ${payload.payment_type},
            currency           = ${payload.currency},
            total_amount       = ${payload.total_amount},
            down_payment       = ${payload.down_payment},
            installments       = ${payload.installments},
            installment_amount = ${payload.installment_amount},
            installment_dates  = ${payload.installment_dates}::jsonb,
            notes              = ${payload.notes},
            updated_at         = ${payload.updated_at}
          WHERE id = ${id}
        `;
        results.updated++;
      } else {
        await sql`
          INSERT INTO manual_students (
            id, course_name, name, email, phone,
            entry_date, payment_type, currency, total_amount, down_payment,
            installments, installment_amount, installment_dates, notes,
            created_at, updated_at
          ) VALUES (
            gen_random_uuid()::text,
            ${payload.course_name}, ${payload.name}, ${email}, ${payload.phone},
            ${payload.entry_date}, ${payload.payment_type}, ${payload.currency},
            ${payload.total_amount}, ${payload.down_payment},
            ${payload.installments}, ${payload.installment_amount},
            ${payload.installment_dates}::jsonb, ${payload.notes},
            ${now}, ${now}
          )
        `;
        results.inserted++;
      }

      // ── 4. UPDATE buyer_profiles (upsert) ───────────────────────────────
      const bpVal     = s.total_amount;
      const bpParcela = s.installment_amount;
      const bpEm      = s.status;

      await sql`
        INSERT INTO buyer_profiles (email, name, phone, document, vendedor,
          bp_valor, bp_pagamento, bp_modelo, bp_parcela,
          bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia,
          created_at, updated_at)
        VALUES (${email}, ${payload.name}, ${s.phone}, ${s.cpf}, ${s.vendedor},
          ${bpVal}, ${s.payment_type}, ${s.installments + 'x'}, ${bpParcela},
          ${s.entry_date}, ${s.ultimo_pagamento}, ${s.proximo_pagamento}, ${bpEm},
          ${now}, ${now})
        ON CONFLICT (email) DO UPDATE SET
          phone              = COALESCE(NULLIF(${s.phone},     ''), buyer_profiles.phone),
          document           = COALESCE(NULLIF(${s.cpf},       ''), buyer_profiles.document),
          vendedor           = COALESCE(NULLIF(${s.vendedor},  ''), buyer_profiles.vendedor),
          bp_valor           = ${bpVal},
          bp_pagamento       = ${s.payment_type},
          bp_modelo          = ${s.installments + 'x'},
          bp_parcela         = ${bpParcela},
          bp_primeira_parcela  = ${s.entry_date},
          bp_ultimo_pagamento  = ${s.ultimo_pagamento},
          bp_proximo_pagamento = ${s.proximo_pagamento},
          bp_em_dia            = ${bpEm},
          updated_at           = ${now}
      `;

    } catch (e: any) {
      results.errors.push(`${s.email}: ${e.message}`);
    }
  }

  // Bust caches
  try {
    const { setCache } = await import('@/app/lib/metaApi');
    setCache('all_students_v5', null as any);
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, ...results });
}
