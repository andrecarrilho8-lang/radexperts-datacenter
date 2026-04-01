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

  const email    = (body.email || '').toLowerCase().trim();
  const phone    = (body.phone    ?? null) as string | null;
  const name     = (body.name     ?? null) as string | null;
  const document = (body.document ?? null) as string | null;
  const country  = (body.country  ?? null) as string | null;
  const manualId = (body.manualId ?? null) as string | null;

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  try {
    await boot();
    const sql = getDb();
    const now = Date.now();

    // 1. Upsert buyer_profiles (enriched contact store)
    await sql`
      INSERT INTO buyer_profiles (
        email, name, phone, document, country,
        purchase_count, created_at, updated_at
      ) VALUES (
        ${email},
        ${name || null}, ${phone || null}, ${document || null}, ${country || null},
        0, ${now}, ${now}
      )
      ON CONFLICT (email) DO UPDATE SET
        phone      = CASE WHEN ${phone}::text IS NOT NULL THEN ${phone} ELSE buyer_profiles.phone    END,
        name       = CASE WHEN ${name}::text  IS NOT NULL THEN ${name}  ELSE buyer_profiles.name     END,
        document   = CASE WHEN ${document}::text IS NOT NULL THEN ${document} ELSE buyer_profiles.document END,
        country    = CASE WHEN ${country}::text  IS NOT NULL THEN ${country}  ELSE buyer_profiles.country  END,
        updated_at = ${now}
    `;

    // 2. If manualId provided → also update manual_students.phone
    if (manualId && phone !== null) {
      await sql`
        UPDATE manual_students
        SET phone = ${phone}, updated_at = ${now}
        WHERE id = ${manualId}
      `;
    }

    return NextResponse.json({ ok: true, email, updated: { phone, name, document, country } });
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
