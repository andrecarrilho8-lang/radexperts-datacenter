import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AC_URL = process.env.ACTIVECAMPAIGN_URL;
const AC_KEY = process.env.ACTIVECAMPAIGN_KEY;

async function fetchPhoneFromAC(email: string): Promise<string> {
  if (!AC_URL || !AC_KEY) return '';
  try {
    const res = await fetch(
      `${AC_URL}/api/3/contacts?email=${encodeURIComponent(email)}&limit=1`,
      { headers: { 'Api-Token': AC_KEY }, cache: 'no-store' }
    );
    if (!res.ok) return '';
    const data = await res.json();
    return (data?.contacts?.[0]?.phone || '').trim();
  } catch {
    return '';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/alunos/phones
   Body: { emails: string[] }   (max 100)
   Returns: { phones: { [email]: string } }

   Strategy:
    1. Check buyer_profiles (populated by Hotmart webhook) — instant, no API call
    2. For emails not in DB, fall back to ActiveCampaign API in parallel batches
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const emails: string[] = (body?.emails || [])
    .map((e: string) => e.toLowerCase().trim())
    .filter((e: string) => e.includes('@'))
    .slice(0, 100);

  if (emails.length === 0) return NextResponse.json({ phones: {} });

  const result: Record<string, string> = {};

  // ── 1. Check our DB (webhook-enriched buyer_profiles) ───────────────────────
  let needAC: string[] = [...emails];
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT email, phone FROM buyer_profiles
      WHERE email = ANY(${emails}::text[]) AND phone IS NOT NULL AND phone <> ''
    `) as any[];
    for (const row of rows) {
      result[row.email] = row.phone;
    }
    needAC = emails.filter(e => !(e in result));
  } catch {
    // DB unavailable — fall through to AC for all
    needAC = [...emails];
  }

  // ── 2. Fetch remaining from ActiveCampaign in batches of 10 ─────────────────
  const BATCH = 10;
  for (let i = 0; i < needAC.length; i += BATCH) {
    const batch = needAC.slice(i, i + BATCH);
    const phones = await Promise.all(batch.map(fetchPhoneFromAC));
    batch.forEach((email, idx) => { result[email] = phones[idx]; });
    if (i + BATCH < needAC.length) await new Promise(r => setTimeout(r, 150));
  }

  return NextResponse.json({ phones: result });
}

