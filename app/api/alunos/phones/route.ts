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
   Returns: {
     phones:     { [email]: string },
     documents:  { [email]: string },
     buyerPersona: { [email]: BuyerPersonaFields }
   }

   Strategy:
    1. Check buyer_profiles (populated by Hotmart webhook / CSV import) — instant
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

  if (emails.length === 0) return NextResponse.json({ phones: {}, documents: {}, buyerPersona: {} });

  const phones:       Record<string, string> = {};
  const documents:    Record<string, string> = {};
  const buyerPersona: Record<string, any>    = {};

  // ── 1. Check our DB (buyer_profiles) ──────────────────────────────────────
  let needAC: string[] = [...emails];
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
        email, phone, document,
        vendedor, bp_valor, bp_pagamento, bp_modelo, bp_parcela,
        bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia, notes
      FROM buyer_profiles
      WHERE email = ANY(${emails}::text[])
    `) as any[];

    for (const row of rows) {
      const em = row.email.toLowerCase();
      if (row.phone)    phones[em]    = row.phone;
      if (row.document) documents[em] = row.document;

      // Buyer-persona fields — always override Hotmart data when present
      const bp: Record<string, any> = {};
      if (row.vendedor)             bp.vendedor           = row.vendedor;
      if (row.bp_valor != null)     bp.valor              = Number(row.bp_valor);
      if (row.bp_pagamento)         bp.pagamento          = row.bp_pagamento;
      if (row.bp_modelo)            bp.modelo             = row.bp_modelo;
      if (row.bp_parcela != null)   bp.parcela            = Number(row.bp_parcela);
      if (row.bp_primeira_parcela)  bp.primeira_parcela   = Number(row.bp_primeira_parcela);
      if (row.bp_ultimo_pagamento)  bp.ultimo_pagamento   = Number(row.bp_ultimo_pagamento);
      if (row.bp_proximo_pagamento) bp.proximo_pagamento  = Number(row.bp_proximo_pagamento);
      if (row.bp_em_dia != null)    bp.em_dia             = row.bp_em_dia;
      if (row.notes != null)        bp.notes              = row.notes;

      if (Object.keys(bp).length > 0) buyerPersona[em] = bp;
    }

    // Only need AC for emails with no phone in DB
    needAC = emails.filter(e => !(e in phones));
  } catch {
    needAC = [...emails];
  }

  // ── 2. Fetch remaining phones from ActiveCampaign ─────────────────────────
  const BATCH = 10;
  for (let i = 0; i < needAC.length; i += BATCH) {
    const batch = needAC.slice(i, i + BATCH);
    const acPhones = await Promise.all(batch.map(fetchPhoneFromAC));
    batch.forEach((email, idx) => { if (acPhones[idx]) phones[email] = acPhones[idx]; });
    if (i + BATCH < needAC.length) await new Promise(r => setTimeout(r, 150));
  }

  return NextResponse.json({ phones, documents, buyerPersona });
}
