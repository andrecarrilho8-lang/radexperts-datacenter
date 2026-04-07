import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let _ready = false;
async function boot() {
  if (!_ready) { await ensureWebhookSchema(); _ready = true; }
}

/* ══════════════════════════════════════════════════════════════════════════
   PATCH /api/alunos/profile
   Body: { email, phone?, name?, document?, country?, manualId? }

   - Always upserts buyer_profiles (works for both Hotmart + Manual students)
   - If manualId is provided, also updates manual_students.phone
   ══════════════════════════════════════════════════════════════════════════ */
export async function PATCH(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email      = (body.email    || '').toLowerCase().trim();
  const phone      = (body.phone    ?? null) as string | null;
  const name       = (body.name     ?? null) as string | null;
  const document   = (body.document ?? null) as string | null;
  const country    = (body.country  ?? null) as string | null;
  const manualId   = (body.manualId ?? null) as string | null;

  // buyer_persona fields
  const vendedor          = (body.vendedor          ?? null) as string | null;
  const bpValor           = body.bp_valor != null ? (parseFloat(String(body.bp_valor).replace(',', '.')) || null) : null;
  const bpPagamento       = (body.bp_pagamento       ?? null) as string | null;
  const bpModelo          = (body.bp_modelo           ?? null) as string | null;
  const bpParcela         = body.bp_parcela != null ? (parseFloat(String(body.bp_parcela).replace(',', '.')) || null) : null;
  const bpEmDia           = (body.bp_em_dia          ?? null) as string | null;
  // date fields — accept ISO string (YYYY-MM-DD) and store as epoch ms
  function parseDate(v: any): number | null {
    if (!v) return null;
    const ms = new Date(String(v)).getTime();
    return isNaN(ms) ? null : ms;
  }
  const bpPrimeiraParcela  = parseDate(body.bp_primeira_parcela);
  const bpUltimoPagamento  = parseDate(body.bp_ultimo_pagamento);
  const bpProximoPagamento = parseDate(body.bp_proximo_pagamento);
  const notes              = (body.notes ?? null) as string | null;

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  try {
    await boot();
    const sql = getDb();
    const now = Date.now();

    // 1. Upsert buyer_profiles (enriched contact store + buyer_persona)
    await sql`
      INSERT INTO buyer_profiles (
        email, name, phone, document, country,
        vendedor, bp_valor, bp_pagamento, bp_modelo, bp_parcela, bp_em_dia,
        bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, notes,
        purchase_count, created_at, updated_at
      ) VALUES (
        ${email},
        ${name || null}, ${phone || null}, ${document || null}, ${country || null},
        ${vendedor}, ${bpValor}, ${bpPagamento}, ${bpModelo}, ${bpParcela}, ${bpEmDia},
        ${bpPrimeiraParcela}, ${bpUltimoPagamento}, ${bpProximoPagamento}, ${notes},
        0, ${now}, ${now}
      )
      ON CONFLICT (email) DO UPDATE SET
        phone               = CASE WHEN ${phone}::text           IS NOT NULL THEN ${phone}               ELSE buyer_profiles.phone               END,
        name                = CASE WHEN ${name}::text            IS NOT NULL THEN ${name}                ELSE buyer_profiles.name                END,
        document            = CASE WHEN ${document}::text        IS NOT NULL THEN ${document}            ELSE buyer_profiles.document            END,
        country             = CASE WHEN ${country}::text         IS NOT NULL THEN ${country}             ELSE buyer_profiles.country             END,
        vendedor            = CASE WHEN ${vendedor}::text        IS NOT NULL THEN ${vendedor}            ELSE buyer_profiles.vendedor            END,
        bp_valor            = CASE WHEN ${bpValor}::numeric      IS NOT NULL THEN ${bpValor}            ELSE buyer_profiles.bp_valor            END,
        bp_pagamento        = CASE WHEN ${bpPagamento}::text     IS NOT NULL THEN ${bpPagamento}        ELSE buyer_profiles.bp_pagamento        END,
        bp_modelo           = CASE WHEN ${bpModelo}::text        IS NOT NULL THEN ${bpModelo}           ELSE buyer_profiles.bp_modelo           END,
        bp_parcela          = CASE WHEN ${bpParcela}::numeric    IS NOT NULL THEN ${bpParcela}          ELSE buyer_profiles.bp_parcela          END,
        bp_em_dia           = CASE WHEN ${bpEmDia}::text         IS NOT NULL THEN ${bpEmDia}            ELSE buyer_profiles.bp_em_dia           END,
        bp_primeira_parcela = CASE WHEN ${bpPrimeiraParcela}::bigint IS NOT NULL THEN ${bpPrimeiraParcela} ELSE buyer_profiles.bp_primeira_parcela END,
        bp_ultimo_pagamento = CASE WHEN ${bpUltimoPagamento}::bigint IS NOT NULL THEN ${bpUltimoPagamento} ELSE buyer_profiles.bp_ultimo_pagamento END,
        bp_proximo_pagamento= CASE WHEN ${bpProximoPagamento}::bigint IS NOT NULL THEN ${bpProximoPagamento} ELSE buyer_profiles.bp_proximo_pagamento END,
        notes               = CASE WHEN ${notes}::text            IS NOT NULL THEN ${notes}               ELSE buyer_profiles.notes               END,
        updated_at          = ${now}
    `;

    // 2. If manualId provided → also update manual_students for name/phone/payment field changes
    if (manualId) {
      if (phone !== null) {
        await sql`UPDATE manual_students SET phone = ${phone}, updated_at = ${now} WHERE id = ${manualId}`;
      }
      if (name !== null) {
        await sql`UPDATE manual_students SET name = ${name}, updated_at = ${now} WHERE id = ${manualId}`;
      }
      // Bump updated_at when any payment-related field (VALOR TOTAL, EM DIA, ÚLTIMO/PRÓX. PAGAMENTO) changes
      if (bpValor !== null || bpEmDia !== null || bpUltimoPagamento !== null || bpProximoPagamento !== null) {
        await sql`UPDATE manual_students SET updated_at = ${now} WHERE id = ${manualId}`;
      }
    }

    return NextResponse.json({ ok: true, email });
  } catch (e: any) {
    console.error('[profile PATCH]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/alunos/profile?email=<email>
   Returns the buyer_profiles entry for a given email.
   ══════════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get('email') || '';
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
  try {
    await boot();
    const sql = getDb();
    const rows = (await sql`SELECT * FROM buyer_profiles WHERE email = ${email.toLowerCase()}`) as any[];
    return NextResponse.json({ profile: rows[0] || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
