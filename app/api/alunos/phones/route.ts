import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AC_URL = process.env.ACTIVECAMPAIGN_URL;
const AC_KEY = process.env.ACTIVECAMPAIGN_KEY;

async function fetchPhone(email: string): Promise<string> {
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
   Fetches in parallel batches of 10 to avoid rate-limiting.
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const emails: string[] = (body?.emails || [])
    .map((e: string) => e.toLowerCase().trim())
    .filter((e: string) => e.includes('@'))
    .slice(0, 100); // safety cap

  if (emails.length === 0) {
    return NextResponse.json({ phones: {} });
  }

  const BATCH = 10;
  const result: Record<string, string> = {};

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const phones = await Promise.all(batch.map(fetchPhone));
    batch.forEach((email, idx) => { result[email] = phones[idx]; });
    // small pause between batches to respect AC rate limits
    if (i + BATCH < emails.length) await new Promise(r => setTimeout(r, 150));
  }

  return NextResponse.json({ phones: result });
}
