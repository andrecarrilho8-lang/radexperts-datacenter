import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PATCH /api/alunos/bp-patch?email=...
 * Updates buyer_profiles fields for a given email.
 * Only updates fields explicitly present in the body (null = clear).
 */
export async function PATCH(request: Request) {
  const url   = new URL(request.url);
  const email = url.searchParams.get('email')?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: 'email param required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const sql = getDb();
  const now = Date.now();

  try {
    // Upsert — creates row if doesn't exist (manual students may not have a buyer_profile yet)
    await sql`
      INSERT INTO buyer_profiles (email, created_at, updated_at)
      VALUES (${email}, ${now}, ${now})
      ON CONFLICT (email) DO NOTHING
    `;

    // Build individual COALESCE-style update — only touch fields provided
    const rows = await sql`
      UPDATE buyer_profiles SET
        document             = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'document')}
                                THEN ${body.document ?? null}::text    ELSE document             END,
        vendedor             = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'vendedor')}
                                THEN ${body.vendedor ?? null}::text    ELSE vendedor             END,
        bp_modelo            = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'bp_modelo')}
                                THEN ${body.bp_modelo ?? null}::text   ELSE bp_modelo            END,
        bp_pagamento         = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'bp_pagamento')}
                                THEN ${body.bp_pagamento ?? null}::text ELSE bp_pagamento        END,
        bp_em_dia            = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'bp_em_dia')}
                                THEN ${body.bp_em_dia ?? null}::text   ELSE bp_em_dia            END,
        bp_primeira_parcela  = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'bp_primeira_parcela')}
                                THEN ${body.bp_primeira_parcela ?? null}::bigint ELSE bp_primeira_parcela END,
        bp_ultimo_pagamento  = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'bp_ultimo_pagamento')}
                                THEN ${body.bp_ultimo_pagamento ?? null}::bigint ELSE bp_ultimo_pagamento END,
        bp_proximo_pagamento = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, 'bp_proximo_pagamento')}
                                THEN ${body.bp_proximo_pagamento ?? null}::bigint ELSE bp_proximo_pagamento END,
        updated_at           = ${now}
      WHERE LOWER(email) = ${email}
      RETURNING *
    ` as any[];

    return NextResponse.json({ ok: true, profile: rows[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
