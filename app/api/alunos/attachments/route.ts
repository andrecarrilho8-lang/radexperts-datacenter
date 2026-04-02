import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';
// Allow large bodies for file uploads
export const maxDuration = 30;

/* ── ensure table ──────────────────────────────────────────────────────────── */
let _ready = false;
async function ensureTable() {
  if (_ready) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS student_attachments (
      id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email       TEXT    NOT NULL,
      filename    TEXT    NOT NULL,
      mimetype    TEXT    NOT NULL,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      data        TEXT    NOT NULL,   -- base64 encoded file
      created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS student_attachments_email_idx ON student_attachments(email)`;
  _ready = true;
}

/* ══════════════════════════════════════════════════════════════════════
   GET /api/alunos/attachments?email=<email>
   Returns list of attachments (without data blob for performance)
══════════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get('email') || '';
  const id    = new URL(request.url).searchParams.get('id')    || '';
  if (!email && !id) return NextResponse.json({ error: 'email or id required' }, { status: 400 });

  try {
    await ensureTable();
    const sql = getDb();

    // If id provided, return the full blob for download
    if (id) {
      const rows = await sql`SELECT id, filename, mimetype, data FROM student_attachments WHERE id = ${id}` as any[];
      if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
      const buf = Buffer.from(rows[0].data, 'base64');
      return new Response(buf, {
        headers: {
          'Content-Type': rows[0].mimetype,
          'Content-Disposition': `inline; filename="${rows[0].filename}"`,
          'Content-Length': String(buf.length),
        },
      });
    }

    // List metadata only (no data blob)
    const rows = await sql`
      SELECT id, email, filename, mimetype, size_bytes, created_at
      FROM student_attachments
      WHERE email = ${email.toLowerCase()}
      ORDER BY created_at DESC
    ` as any[];
    return NextResponse.json({ attachments: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   POST /api/alunos/attachments
   Body: FormData { email, file }
   Allowed: image/jpeg, image/png, application/pdf — max 8 MB
══════════════════════════════════════════════════════════════════════ */
export async function POST(request: Request) {
  try {
    await ensureTable();
    const sql = getDb();

    const formData = await request.formData();
    const email = ((formData.get('email') as string) || '').toLowerCase().trim();
    const file  = formData.get('file') as File | null;

    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
    if (!file)  return NextResponse.json({ error: 'file required' },  { status: 400 });

    const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: 'Tipo não permitido. Use JPG, PNG ou PDF.' }, { status: 400 });

    const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: 'Arquivo muito grande (máx 8 MB).' }, { status: 400 });

    const arrayBuf = await file.arrayBuffer();
    const base64   = Buffer.from(arrayBuf).toString('base64');
    const now      = Date.now();

    const rows = await sql`
      INSERT INTO student_attachments (email, filename, mimetype, size_bytes, data, created_at)
      VALUES (${email}, ${file.name}, ${file.type}, ${file.size}, ${base64}, ${now})
      RETURNING id, email, filename, mimetype, size_bytes, created_at
    ` as any[];

    return NextResponse.json({ attachment: rows[0] });
  } catch (e: any) {
    console.error('[attachments POST]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   DELETE /api/alunos/attachments?id=<id>
══════════════════════════════════════════════════════════════════════ */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await ensureTable();
    const sql = getDb();
    await sql`DELETE FROM student_attachments WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
