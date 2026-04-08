import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/backfill-vendedor
 *
 * Two functions in one:
 * 1. ?mode=diagnose  → list all unique non-empty SCKs in buyer_profiles with counts
 * 2. ?mode=apply     → apply sck_vendedor_map to all profiles with sck but no vendedor
 *    &secret=...     → required for apply mode (CRON_SECRET)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode   = searchParams.get('mode') || 'diagnose';
  const secret = searchParams.get('secret') || '';

  await ensureWebhookSchema();
  const sql = getDb();

  /* ── Diagnose: list unique SCKs ─────────────────────────────────── */
  if (mode === 'diagnose') {
    const [scks, map] = await Promise.all([
      sql`
        SELECT
          COALESCE(sck, '(sem SCK)') AS sck,
          COUNT(*)::int               AS count,
          MAX(vendedor)               AS vendedor_atual
        FROM buyer_profiles
        GROUP BY sck
        ORDER BY count DESC, sck
      ` as any[],
      sql`SELECT sck, vendedor FROM sck_vendedor_map ORDER BY vendedor, sck` as any[],
    ]);

    return NextResponse.json({ ok: true, mode: 'diagnose', scks, current_mappings: map });
  }

  /* ── Apply: backfill vendedor based on sck_vendedor_map ─────────── */
  if (mode === 'apply') {
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Bulk UPDATE using JOIN semantics (neon postgres supports UPDATE FROM)
    const result = await sql`
      UPDATE buyer_profiles bp
      SET
        vendedor   = svm.vendedor,
        updated_at = ${Date.now()}
      FROM sck_vendedor_map svm
      WHERE bp.sck = svm.sck
        AND (bp.vendedor IS NULL OR TRIM(bp.vendedor) = '')
      RETURNING bp.email, bp.sck, svm.vendedor
    ` as any[];

    return NextResponse.json({
      ok:       true,
      mode:     'apply',
      updated:  result.length,
      profiles: result.map((r: any) => ({ email: r.email, sck: r.sck, vendedor: r.vendedor })),
    });
  }

  return NextResponse.json({ error: 'mode deve ser "diagnose" ou "apply"' }, { status: 400 });
}
