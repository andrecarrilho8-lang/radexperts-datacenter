import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

// GET  — list all mappings
// POST — upsert { sck, vendedor }
// DELETE — remove { sck }

export async function GET() {
  await ensureWebhookSchema();
  const sql = getDb();
  const rows = await sql`SELECT sck, vendedor, updated_at FROM sck_vendedor_map ORDER BY vendedor, sck` as any[];
  return NextResponse.json({ ok: true, mappings: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sck      = (body.sck      || '').trim();
  const vendedor = (body.vendedor || '').trim();
  if (!sck || !vendedor) return NextResponse.json({ error: 'sck e vendedor são obrigatórios' }, { status: 400 });

  await ensureWebhookSchema();
  const sql = getDb();
  const now = Date.now();
  await sql`
    INSERT INTO sck_vendedor_map (sck, vendedor, created_at, updated_at)
    VALUES (${sck}, ${vendedor}, ${now}, ${now})
    ON CONFLICT (sck) DO UPDATE SET
      vendedor   = EXCLUDED.vendedor,
      updated_at = ${now}
  `;
  return NextResponse.json({ ok: true, sck, vendedor });
}

export async function DELETE(request: Request) {
  const { sck } = await request.json().catch(() => ({}));
  if (!sck) return NextResponse.json({ error: 'sck é obrigatório' }, { status: 400 });

  await ensureWebhookSchema();
  const sql = getDb();
  await sql`DELETE FROM sck_vendedor_map WHERE sck = ${sck}`;
  return NextResponse.json({ ok: true, deleted: sck });
}
