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
        -- "user-editable" fields: ALWAYS overwrite (including NULL to clear)
        phone               = ${phone},
        document            = ${document},
        vendedor            = ${vendedor},
        bp_valor            = ${bpValor},
        bp_pagamento        = ${bpPagamento},
        bp_modelo           = ${bpModelo},
        bp_parcela          = ${bpParcela},
        bp_em_dia           = ${bpEmDia},
        bp_primeira_parcela = ${bpPrimeiraParcela},
        bp_ultimo_pagamento = ${bpUltimoPagamento},
        bp_proximo_pagamento= ${bpProximoPagamento},
        notes               = ${notes},
        -- name: only overwrite if provided (Hotmart name is the source of truth)
        name                = CASE WHEN ${name}::text IS NOT NULL THEN ${name} ELSE buyer_profiles.name END,
        country             = CASE WHEN ${country}::text IS NOT NULL THEN ${country} ELSE buyer_profiles.country END,
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
