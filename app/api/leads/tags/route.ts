/**
 * GET /api/leads/tags
 * Returns all tags from Active Campaign, sorted by name.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function acHeaders() {
  const key = process.env.AC_API_KEY;
  if (!key) throw new Error('AC_API_KEY não configurada.');
  return { 'Api-Token': key, 'Content-Type': 'application/json' };
}

function acBase() {
  const base = process.env.AC_BASE_URL;
  if (!base) throw new Error('AC_BASE_URL não configurada.');
  return base.replace(/\/$/, '');
}

export async function GET() {
  try {
    const res  = await fetch(`${acBase()}/api/3/tags?limit=1000`, {
      headers: acHeaders(),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AC API ${res.status}`);
    const data = await res.json();

    const tags = ((data.tags || []) as any[])
      .map(t => ({ id: String(t.id), name: String(t.tag || '').trim() }))
      .filter(t => t.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return NextResponse.json({ tags });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
