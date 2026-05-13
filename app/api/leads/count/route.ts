/**
 * GET /api/leads/count?tagId=123
 *
 * Returns the total number of contacts in Active Campaign that have the given tag.
 * Uses meta.total from the AC API (single lightweight request, no pagination needed).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function acHeaders() {
  const key = process.env.AC_API_KEY;
  if (!key) throw new Error('AC_API_KEY env var não configurada.');
  return { 'Api-Token': key, 'Content-Type': 'application/json' };
}

function acBase() {
  const base = process.env.AC_BASE_URL;
  if (!base) throw new Error('AC_BASE_URL env var não configurada.');
  return base.replace(/\/$/, '');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get('tagId')?.trim();

  if (!tagId) {
    return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
  }

  try {
    // Single lightweight request: limit=1 just to get meta.total
    const url = `${acBase()}/api/3/contacts?limit=1&offset=0&tagid=${encodeURIComponent(tagId)}`;
    const res = await fetch(url, {
      headers: acHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AC API ${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json();
    const count = parseInt(data?.meta?.total ?? '0', 10);

    return NextResponse.json({ count, tagId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
