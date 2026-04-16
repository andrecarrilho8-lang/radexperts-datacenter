import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/admin/merge-student-emails
 * Merges two student accounts: sets primary_email as canonical and
 * hotmart_email as the alias used to fetch Hotmart API data.
 *
 * Body: {
 *   primary_email: string,   // the canonical primary email to keep
 *   hotmart_email: string,   // the Hotmart account email (alias)
 *   // optional extra fields to update in buyer_profiles
 *   name?: string, phone?: string, vendedor?: string, bp_em_dia?: string,
 *   delete_stale_manual_id?: string  // ID of stale manual_students record to remove
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { primary_email, hotmart_email, name, phone, vendedor, bp_em_dia, delete_stale_manual_id } = body;

    if (!primary_email || !hotmart_email) {
      return NextResponse.json({ error: 'primary_email and hotmart_email are required' }, { status: 400 });
    }

    const sql = getDb();

    // 1. Ensure hotmart_email column exists in buyer_profiles
    try {
      await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS hotmart_email TEXT`;
    } catch (e: any) {
      // Ignore if column already exists or not supported
      console.warn('ALTER TABLE warning:', e.message);
    }

    // 2. Upsert buyer_profile for primary_email with hotmart_email alias + merged data
    const now = Date.now().toString();
    await sql`
      INSERT INTO buyer_profiles (email, name, phone, vendedor, bp_em_dia, hotmart_email, created_at, updated_at)
      VALUES (
        ${primary_email.toLowerCase().trim()},
        ${name || null},
        ${phone || null},
        ${vendedor || null},
        ${bp_em_dia || null},
        ${hotmart_email.toLowerCase().trim()},
        ${now},
        ${now}
      )
      ON CONFLICT (email) DO UPDATE SET
        hotmart_email = ${hotmart_email.toLowerCase().trim()},
        name          = COALESCE(EXCLUDED.name,     buyer_profiles.name),
        phone         = COALESCE(EXCLUDED.phone,    buyer_profiles.phone),
        vendedor      = COALESCE(EXCLUDED.vendedor, buyer_profiles.vendedor),
        bp_em_dia     = COALESCE(EXCLUDED.bp_em_dia,buyer_profiles.bp_em_dia),
        updated_at    = ${now}
    `;

    // 3. Delete stale manual_students record if provided
    let deletedStale = false;
    if (delete_stale_manual_id) {
      const res = await sql`DELETE FROM manual_students WHERE id = ${delete_stale_manual_id}`;
      deletedStale = true;
    }

    // 4. Verify result
    const updated = await sql`
      SELECT email, name, phone, vendedor, bp_em_dia, hotmart_email
      FROM buyer_profiles WHERE email = ${primary_email.toLowerCase().trim()}
    ` as any[];

    return NextResponse.json({
      ok: true,
      message: `Merged ${primary_email} ← ${hotmart_email}`,
      buyer_profile: updated[0] || null,
      deleted_stale_manual: deletedStale,
    });
  } catch (e: any) {
    console.error('merge-student-emails error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
