import { NextResponse } from 'next/server';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOTMART_API_HOST = 'developers.hotmart.com';
const AC_URL = process.env.ACTIVECAMPAIGN_URL;
const AC_KEY  = process.env.ACTIVECAMPAIGN_KEY;

// ── Helpers ──────────────────────────────────────────────────────────────────
function idToEmail(id: string): string {
  try {
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const pad  = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
    return Buffer.from(pad, 'base64').toString('utf-8');
  } catch { return id; }
}

async function htGet(path: string, token: string): Promise<any> {
  const https = await import('https');
  return new Promise((resolve) => {
    const req = https.default.request(
      { hostname: HOTMART_API_HOST, path, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let data = '';
        res.on('data', (c: any) => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function acGet(path: string): Promise<any> {
  if (!AC_URL || !AC_KEY) return null;
  try {
    const res = await fetch(`${AC_URL}/api/3${path}`, {
      headers: { 'Api-Token': AC_KEY },
      cache: 'no-store',
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

// Fetch ALL Hotmart sales for a given period, NO product filter, paginated
async function fetchAllHotmartByEmail(token: string, email: string): Promise<any[]> {
  const nowMs    = Date.now();
  const threeYrs = nowMs - 3 * 365 * 24 * 60 * 60 * 1000;
  // Use 60-day chunks, 6 concurrent
  const CHUNK    = 60 * 24 * 60 * 60 * 1000;
  const chunks: { start: number; end: number }[] = [];
  let cur = threeYrs;
  while (cur < nowMs) {
    chunks.push({ start: cur, end: Math.min(cur + CHUNK, nowMs) });
    cur += CHUNK + 1;
  }

  const emailLower = email.toLowerCase().trim();
  const allMatches: any[] = [];
  const seenTx = new Set<string>();
  const CONCURRENCY = 6;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (chunk) => {
      const items: any[] = [];
      let pageToken = '';
      for (let p = 0; p < 5; p++) { // max 5 pages per chunk
        const path = `/payments/api/v1/sales/history?start_date=${chunk.start}&end_date=${chunk.end}&max_results=500${pageToken ? `&page_token=${pageToken}` : ''}`;
        const data = await htGet(path, token);
        if (!data?.items?.length) break;
        items.push(...data.items);
        pageToken = data.page_info?.next_page_token || '';
        if (!pageToken) break;
      }
      return items.filter((s: any) => (s.buyer?.email || '').toLowerCase() === emailLower);
    }));
    for (const arr of results) {
      for (const s of arr) {
        const tx = s.purchase?.transaction;
        if (tx && !seenTx.has(tx)) { seenTx.add(tx); allMatches.push(s); }
      }
    }
  }

  return allMatches;
}

// ── Main Handler ─────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email   = idToEmail(id).toLowerCase().trim();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    // ── 0. Buyer Persona (internal DB) ──────────────────────────────────────
    let buyerPersona: Record<string, any> | null = null;
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT
          name, phone, document,
          vendedor, bp_valor, bp_pagamento, bp_modelo, bp_parcela,
          bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia
        FROM buyer_profiles
        WHERE email = ${email}
        LIMIT 1
      ` as any[];
      if (rows.length > 0) {
        const r = rows[0];
        buyerPersona = {
          name:               r.name     || null,
          phone:              r.phone    || null,
          document:           r.document || null,
          vendedor:           r.vendedor || null,
          valor:              r.bp_valor    != null ? Number(r.bp_valor)    : null,
          pagamento:          r.bp_pagamento || null,
          modelo:             r.bp_modelo   || null,
          parcela:            r.bp_parcela  != null ? Number(r.bp_parcela)  : null,
          primeira_parcela:   r.bp_primeira_parcela  ? new Date(Number(r.bp_primeira_parcela)).toISOString() : null,
          ultimo_pagamento:   r.bp_ultimo_pagamento  ? new Date(Number(r.bp_ultimo_pagamento)).toISOString() : null,
          proximo_pagamento:  r.bp_proximo_pagamento ? new Date(Number(r.bp_proximo_pagamento)).toISOString() : null,
          em_dia:             r.bp_em_dia || null,
        };
      }
    } catch { /* columns may not exist yet — ignore */ }

    // ── 1. ActiveCampaign ───────────────────────────────────────────────────
    const acSearch = await acGet(`/contacts?email=${encodeURIComponent(email)}&limit=1`);
    const acContact: any = acSearch?.contacts?.[0] || null;
    const acId = acContact?.id;

    let acTags:        any[] = [];
    let acLists:       any[] = [];
    let acAutomations: any[] = [];
    let acScore:       number | null = null;
    let acDeals:       any[] = [];
    let acPhone        = '';
    let acFirstName    = '';
    let acLastName     = '';

    if (acContact) {
      acFirstName = acContact.firstName || '';
      acLastName  = acContact.lastName  || '';
      acPhone     = acContact.phone     || '';
    }

    if (acId) {
      // Tags
      const [tagsData, tagsMeta, listsData, listsMeta, autoData, autoMeta, scoreData, dealData] =
        await Promise.all([
          acGet(`/contacts/${acId}/contactTags`),
          acGet(`/tags?limit=200`),
          acGet(`/contacts/${acId}/contactLists`),
          acGet(`/lists?limit=50`),
          acGet(`/contacts/${acId}/contactAutomations`),
          acGet(`/automations?limit=100`),
          acGet(`/contacts/${acId}/scoreValues`),
          acGet(`/contacts/${acId}/deals`),
        ]);

      const tagMap:  Record<string, string> = {};
      const listMap: Record<string, string> = {};
      const autoMap: Record<string, string> = {};

      (tagsMeta?.tags  || []).forEach((t: any) => { tagMap[t.id]  = t.tag;  });
      (listsMeta?.lists || []).forEach((l: any) => { listMap[l.id] = l.name; });
      (autoMeta?.automations || []).forEach((a: any) => { autoMap[a.id] = a.name; });

      acTags = (tagsData?.contactTags || []).map((t: any) => ({
        tagId:   t.tagid,
        tagName: tagMap[t.tagid] || `Tag #${t.tagid}`,
        created: t.cdate,
      }));

      acLists = (listsData?.contactLists || []).map((l: any) => ({
        listId:  l.list,
        name:    listMap[l.list] || `Lista #${l.list}`,
        status:  l.status,
        created: l.cdate,
      }));

      acAutomations = (autoData?.contactAutomations || []).map((a: any) => ({
        autoId:    a.automation,
        name:      autoMap[a.automation] || `Automação #${a.automation}`,
        status:    a.status,
        entered:   a.adddate,
        exited:    a.remdate || null,
        completed: a.completed === '1',
      }));

      const scores = scoreData?.scoreValues || [];
      if (scores.length > 0) acScore = Number(scores[0]?.score) || null;

      acDeals = (dealData?.deals || []).map((d: any) => ({
        id:      d.id,
        title:   d.title,
        value:   Number(d.value) || 0,
        status:  d.status,
        created: d.cdate,
      }));
    }

    // ── 2. Hotmart ──────────────────────────────────────────────────────────
    const token   = await getHotmartToken();
    const rawSales = await fetchAllHotmartByEmail(token, email);

    const APPROVED = new Set(['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED']);

    const purchases = rawSales.map((s: any) => {
      const p = s.purchase || {};
      const price = p.price || {};
      return {
        txId:           p.transaction,
        status:         p.status,
        date:           p.approved_date || p.order_date,
        product:        s.product?.name || '',
        productId:      s.product?.id,
        currency:       (price.currency_code || 'BRL').toUpperCase(),
        grossValue:     price.value ?? 0,
        convertedBRL:   price.converted_value ?? null,
        netValue:       p.producer_net ?? null,
        netBRL:         p.producer_net_brl ?? null,
        hotmartFeePct:  p.hotmart_fee?.percentage ?? 0,
        hotmartFeeAmt:  p.hotmart_fee?.total ?? 0,
        paymentType:    p.payment?.type || p.payment_type || '',
        installments:   p.payment?.installments_number || 1,
        recurrencyNum:  p.recurrency_number || null,
        isSubscription: p.is_subscription === true,
        src:            p.tracking?.source       || '',
        sck:            p.tracking?.source_sck  || '',
        utmSource:      p.tracking?.utm_source  || '',
        utmMedium:      p.tracking?.utm_medium  || '',
        utmCampaign:    p.tracking?.utm_campaign || '',
        utmContent:     p.tracking?.utm_content  || '',
        utmTerm:        p.tracking?.utm_term     || '',
        country:        s.buyer?.address?.country || '',
      };
    }).sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    // LTV = sum of all APPROVED grossValue. For non-BRL: use converted_value when available,
    // otherwise keep the raw value in its own currency and track separately.
    const ltvBRL = { BRL: 0 } as Record<string, number>;
    for (const s of rawSales) {
      const p = s.purchase || {};
      const st = (p.status || '').toUpperCase();
      if (!APPROVED.has(st)) continue;
      const cur = (p.price?.currency_code || 'BRL').toUpperCase();
      const converted = p.price?.converted_value || p.producer_net_brl || 0;
      const gross     = p.price?.value ?? 0;
      if (cur === 'BRL') {
        ltvBRL['BRL'] += gross;
      } else if (converted > 0) {
        ltvBRL['BRL'] += converted;            // use BRL-converted value
      } else {
        // No conversion available — track in original currency
        ltvBRL[cur] = (ltvBRL[cur] || 0) + gross;
      }
    }

    // Add manual student totals (total_amount is in BRL always) + fetch full manual records
    let manualStudents: any[] = [];
    try {
      const sql = getDb();
      const manualRows = await sql`
        SELECT id, name, email, course_name, entry_date, phone,
               payment_type, currency, total_amount, down_payment,
               installments, installment_amount, installment_dates, notes,
               created_at, updated_at
        FROM manual_students
        WHERE LOWER(email) = ${email}
        ORDER BY entry_date DESC
      ` as any[];
      for (const row of manualRows) {
        ltvBRL['BRL'] += Number(row.total_amount) || 0;
      }
      manualStudents = manualRows.map(r => ({
        id:                 r.id,
        name:               r.name,
        email:              r.email,
        course_name:        r.course_name,
        entry_date:         Number(r.entry_date) || null,
        phone:              r.phone || '',
        payment_type:       r.payment_type || 'PIX',
        currency:           r.currency || 'BRL',
        total_amount:       Number(r.total_amount) || 0,
        down_payment:       Number(r.down_payment) || 0,
        installments:       Number(r.installments) || 1,
        installment_amount: Number(r.installment_amount) || 0,
        installment_dates:  (() => {
          try {
            const raw = typeof r.installment_dates === 'string'
              ? JSON.parse(r.installment_dates)
              : (r.installment_dates || []);
            return Array.isArray(raw) ? raw : [];
          } catch { return []; }
        })(),
        notes:              r.notes || '',
      }));
    } catch { /* non-fatal */ }

    // Primary LTV = BRL total (most common); expose breakdown for UI
    const ltv = ltvBRL['BRL'] || 0;

    const uniqueProducts = [...new Set(
      rawSales
        .filter((s: any) => APPROVED.has((s.purchase?.status || '').toUpperCase()))
        .map((s: any) => s.product?.name || '')
        .filter(Boolean)
    )];

    // Hotmart buyer name/phone/document from first sale with buyer data
    const hotmartBuyer    = rawSales.find((s: any) => s.buyer?.name || s.buyer?.phone)?.buyer || null;
    const hotmartName     = hotmartBuyer?.name || null;
    const hotmartPhone    = hotmartBuyer?.phone || hotmartBuyer?.checkout_phone || null;
    const hotmartDocument = hotmartBuyer?.document || hotmartBuyer?.cpf || null;
    const hotmartCountry  = hotmartBuyer?.address?.country || null;

    // Merge: buyer_profiles (manual edits) takes priority; Hotmart buyer data is fallback
    const mergedBuyerPersona = buyerPersona ? {
      ...buyerPersona,
      phone:    buyerPersona.phone    || hotmartPhone,
      document: buyerPersona.document || hotmartDocument,
      name:     buyerPersona.name     || hotmartName,
    } : (hotmartPhone || hotmartDocument ? {
      name:               hotmartName,
      phone:              hotmartPhone,
      document:           hotmartDocument,
      country:            hotmartCountry,
      vendedor:           null,
      valor:              null,
      pagamento:          null,
      modelo:             null,
      parcela:            null,
      primeira_parcela:   null,
      ultimo_pagamento:   null,
      proximo_pagamento:  null,
      em_dia:             null,
    } : null);

    return NextResponse.json({
      email,
      name: [acFirstName, acLastName].filter(Boolean).join(' ') || mergedBuyerPersona?.name || hotmartName || null,
      hotmartName,
      phone: mergedBuyerPersona?.phone || acPhone || null,
      document: mergedBuyerPersona?.document || null,
      ltv,
      ltvByCurrency: ltvBRL,
      purchases,
      uniqueProducts,
      buyerPersona: mergedBuyerPersona,
      manualStudents,
      ac: acId ? {
        id:          acId,
        firstName:   acFirstName,
        lastName:    acLastName,
        email:       acContact.email,
        phone:       acPhone,
        created:     acContact.cdate,
        updated:     acContact.udate,
        score:       acScore,
        tags:        acTags,
        lists:       acLists,
        automations: acAutomations,
        deals:       acDeals,
      } : null,
    });

  } catch (err: any) {
    console.error('[aluno API]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
