import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';
import { parseToken } from '@/app/lib/users';
import { ensureActivityLogSchema } from '@/app/lib/activityLog';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

function getActor(request: Request) {
  const auth  = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  return parseToken(token);
}

export async function GET(request: Request) {
  const actor = getActor(request);
  if (!actor || actor.role !== 'TOTAL') {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  try {
    await ensureActivityLogSchema();
    const sql = getDb();

    const { searchParams } = new URL(request.url);
    const action    = searchParams.get('action')    || '';
    const userId    = searchParams.get('user_id')   || '';
    const dateFrom  = searchParams.get('date_from') || '';
    const dateTo    = searchParams.get('date_to')   || '';
    const limit     = Math.min(parseInt(searchParams.get('limit') || '500'), 1000);

    // Build dynamic filters
    let rows: any[];

    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs   = dateTo   ? new Date(dateTo).getTime() + 86_400_000 : Date.now() + 86_400_000;

    rows = await sql`
      SELECT *
      FROM activity_logs
      WHERE created_at BETWEEN ${fromMs} AND ${toMs}
        AND (${action}   = '' OR action    = ${action})
        AND (${userId}   = '' OR user_id   = ${userId})
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as any[];

    return NextResponse.json({ logs: rows, total: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
