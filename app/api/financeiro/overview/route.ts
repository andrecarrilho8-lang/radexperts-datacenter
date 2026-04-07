import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getAllRates, getConvertedValue } from '@/app/lib/currency';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPROVED_STATUS = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/* ── Subscriptions API (ACTIVE only) ─────────────────────────────────────── */
function httpsGet(token: string, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'developers.hotmart.com', path, method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body: any = null;
          try { body = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    req.end();
  });
}

async function fetchActiveSubs(token: string): Promise<any[]> {
  const items: any[] = [];
  let pageToken = '';
  do {
    const qs = `/payments/api/v1/subscriptions?status=ACTIVE&max_results=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await httpsGet(token, qs);
    if (r.status !== 200) break;
    const batch: any[] = r.body?.items || [];
    items.push(...batch);
    pageToken = r.body?.page_info?.next_page_token || '';
  } while (pageToken);
  return items;
}

/* ── Same logic as /api/cursos/[courseName] — fixed order ──────────────── */
function classifySub(
  isSub: boolean, isSmartInstall: boolean,
  lastPayTs: number, maxRecur: number, inst: number,
  nowMs: number
): 'ACTIVE' | 'OVERDUE' | 'CANCELLED' {
  if (!isSub && !isSmartInstall) return 'ACTIVE'; // one-time = always paid
  // ── Smart installments: check completion FIRST (before timing) ──────────
  // A person who paid ALL installments is QUITADO even if last charge was >35d ago
  if (isSmartInstall && inst > 1 && maxRecur >= inst) return 'CANCELLED'; // QUITADO
  if (!lastPayTs) return 'ACTIVE';
  const daysSince = (nowMs - lastPayTs) / 86_400_000;
  if (daysSince > 65) return 'CANCELLED';
  if (daysSince > 35) return 'OVERDUE';
  return 'ACTIVE';
}

export async function GET() {
  try {
    const allSales = await getCachedAllSales();
    const nowMs    = Date.now();
    const approved = allSales.filter((s: any) => APPROVED_STATUS.has(s.purchase?.status));

    /* ── 1. Recent Transactions — Hotmart top 20 ─────────────────── */
    const sortedAll = [...approved].sort((a: any, b: any) =>
      new Date(b.purchase?.approved_date || b.purchase?.order_date || 0).getTime() -
      new Date(a.purchase?.approved_date || a.purchase?.order_date || 0).getTime()
    );
    const hotmartEntries = sortedAll.slice(0, 20).map((s: any) => ({
      transaction:      s.purchase?.transaction,
      date:             s.purchase?.approved_date || s.purchase?.order_date,
      buyer:            { name: s.buyer?.name || '—', email: s.buyer?.email || '—' },
      product:          { name: s.product?.name || '—' },
      amount:           s.purchase?.price?.value ?? 0,
      currency:         (s.purchase?.price?.currency_code || 'BRL').toUpperCase(),
      amountBRL:        s.purchase?.price?.converted_value || null,
      paymentType:      s.purchase?.payment?.type || '—',
      status:           s.purchase?.status,
      isSubscription:   s.purchase?.is_subscription === true ||
                        (s.purchase?.offer?.payment_mode || '').toUpperCase() === 'SUBSCRIPTION',
      installments:     s.purchase?.payment?.installments_number || 1,
      recurrencyNumber: s.purchase?.recurrency_number || null,
      source:           'hotmart' as const,
    }));

    /* ── 1b. Manual entries (PIX / installments) ordered by last update ─── */
    const manualEntriesList: any[] = [];
    try {
      await ensureSchema();
      const db = getDb();
      const manualRows = await db`
        SELECT id, name, email, course_name, entry_date, payment_type,
               total_amount, installments, installment_amount, installment_dates, notes,
               COALESCE(updated_at, entry_date) AS sort_ts
        FROM manual_students
        WHERE COALESCE(total_amount, 0) > 0
        ORDER BY COALESCE(updated_at, entry_date) DESC
        LIMIT 500
      ` as any[];

      for (const row of manualRows) {
        const name       = (row.name || '—').toUpperCase();
        const email      = (row.email || '').toLowerCase().trim();
        const product    = row.course_name || '—';
        const ptype      = (row.payment_type || 'PIX').toUpperCase();
        const instAmt    = Number(row.installment_amount) || Number(row.total_amount) || 0;
        const installments = Number(row.installments) || 1;

        // Build installment_dates array from JSON
        let instDates: { due_ms: number; paid: boolean; paid_ms: number | null }[] = [];
        try {
          const raw = typeof row.installment_dates === 'string'
            ? JSON.parse(row.installment_dates)
            : (row.installment_dates || []);
          if (Array.isArray(raw)) instDates = raw;
        } catch { /* ignore */ }

        if (installments === 1 || instDates.length === 0) {
          // PIX / single payment — one entry at entry_date
          const ts = Number(row.entry_date);
          if (ts > 0) {
            manualEntriesList.push({
              transaction:      `manual-${row.id}`,
              date:             new Date(ts).toISOString(),
              buyer:            { name, email },
              product:          { name: product },
              amount:           Number(row.total_amount) || 0,
              currency:         'BRL',
              amountBRL:        null,
              paymentType:      ptype,
              status:           'APPROVED',
              isSubscription:   false,
              installments:     1,
              recurrencyNumber: null,
              source:           'manual' as const,
              notes:            row.notes || '',
            });
          }
        } else {
          // Credit card with installments — one entry per PAID installment
          instDates.forEach((inst, idx) => {
            if (!inst.paid) return;
            const ts = Number(inst.paid_ms) || Number(row.entry_date);
            if (ts <= 0) return;
            manualEntriesList.push({
              transaction:      `manual-${row.id}-inst${idx + 1}`,
              date:             new Date(ts).toISOString(),
              buyer:            { name, email },
              product:          { name: product },
              amount:           instAmt,
              currency:         'BRL',
              amountBRL:        null,
              paymentType:      ptype,
              status:           'APPROVED',
              isSubscription:   false,
              installments,
              recurrencyNumber: idx + 1,
              source:           'manual' as const,
              notes:            row.notes || '',
            });
          });
        }
      }
    } catch (e: any) {
      console.warn('[financeiro] manual_students fetch failed:', e.message);
    }

    /* ── 1c. Sort manual entries by most-recently-updated, keep all ─────── */
    const manualSorted = manualEntriesList.sort((a, b) =>
      new Date(b.sort_ts || b.date || 0).getTime() - new Date(a.sort_ts || a.date || 0).getTime()
    );

    /* ── 2. Inadimplentes — sales-based, deduplicated by email×product ─── */
    type AggKey = string;
    const subMap = new Map<AggKey, {
      email: string; name: string; product: string;
      offerCode: string; offerName: string;
      amount: number; currency: string;
      lastPayTs: number; firstPayTs: number;
      lastTransaction: string;
      isSub: boolean; isSmartInstall: boolean;
      maxRecurrency: number; installments: number;
      paymentCount: number; paymentSum: number;
    }>();

    for (const s of approved) {
      const email   = (s.buyer?.email || '').toLowerCase().trim();
      const product = s.product?.name || '—';
      if (!email || !product) continue;

      const ts         = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      const mode       = (s.purchase?.offer?.payment_mode || 'UNIQUE_PAYMENT').toUpperCase();
      const recur      = s.purchase?.recurrency_number || 1;
      const inst       = s.purchase?.payment?.installments_number || 1;
      const isSub      = mode === 'SUBSCRIPTION'; // ← same as /api/cursos/[courseName]
      const isSmartInstall = !isSub && recur > 1;

      // Skip one-time & standard card splits — they're always QUITADO
      if (!isSub && !isSmartInstall) continue;

      const offerCode = s.purchase?.offer?.code || '';
      const rawName   = (s.purchase?.offer?.name || '').trim();
      const cleanCode = offerCode.replace(/_/g, ' ')
        .toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
      const offerName = rawName || cleanCode || offerCode;

      const key: AggKey = `${email}|${product}`;
      const cur = subMap.get(key);
      if (!cur) {
        subMap.set(key, {
          email, name: s.buyer?.name || '—', product,
          offerCode, offerName,
          amount:   s.purchase?.price?.value ?? 0,
          currency: (s.purchase?.price?.currency_code || 'BRL').toUpperCase(),
          lastPayTs: ts, firstPayTs: ts,
          lastTransaction: s.purchase?.transaction || '—',
          isSub, isSmartInstall,
          maxRecurrency: recur, installments: inst,
          paymentCount: 1,
          paymentSum: s.purchase?.price?.value ?? 0,
        });
      } else {
        if (ts > cur.lastPayTs) {
          cur.lastPayTs       = ts;
          cur.lastTransaction = s.purchase?.transaction || cur.lastTransaction;
          cur.name            = s.buyer?.name || cur.name;
          cur.offerName       = offerName || cur.offerName;
          cur.amount          = s.purchase?.price?.value ?? cur.amount;
          cur.currency        = (s.purchase?.price?.currency_code || 'BRL').toUpperCase();
        }
        cur.paymentCount++;
        cur.paymentSum += s.purchase?.price?.value ?? 0;
        if (ts > 0 && ts < cur.firstPayTs) cur.firstPayTs = ts;
        if (recur > cur.maxRecurrency)     cur.maxRecurrency = recur;
        if (inst  > cur.installments)      cur.installments  = inst;
      }
    }

    // Collect all LATAM currencies for batch rate fetch
    const allCurrencies = new Set<string>();
    hotmartEntries.forEach((t: any) => { if (t.currency !== 'BRL' && !t.amountBRL) allCurrencies.add(t.currency); });
    subMap.forEach(e => { if (e.currency !== 'BRL') allCurrencies.add(e.currency); });
    if (allCurrencies.size > 0) await getAllRates(Array.from(allCurrencies));

    // Enrich Hotmart entries with BRL conversion
    const hotmartEntriesFinal = hotmartEntries.map((t: any) => ({
      ...t,
      amountBRL: t.amountBRL ?? (t.currency !== 'BRL' ? getConvertedValue(t.amount, t.currency) : null),
    }));

    // Build overdue list (deduplicated — one per unique subscriber+product)
    const overdue: any[] = [];
    for (const entry of subMap.values()) {
      const status = classifySub(
        entry.isSub, entry.isSmartInstall,
        entry.lastPayTs, entry.maxRecurrency, entry.installments, nowMs
      );
      if (status !== 'OVERDUE') continue;

      const daysSinceLast = Math.floor((nowMs - entry.lastPayTs) / 86_400_000);
      const amountBRL     = entry.currency === 'BRL' ? null
        : getConvertedValue(entry.amount, entry.currency);

      overdue.push({
        email:          entry.email,
        subscriber:     { name: (entry.name || '').toUpperCase(), email: entry.email },
        product:        { name: entry.product },
        plan:           entry.offerName || entry.offerCode,
        amount:         entry.amount,
        currency:       entry.currency,
        amountBRL,
        accessionDate:  entry.firstPayTs,
        lastPayDate:    entry.lastPayTs,
        daysSinceLast,
        lastTransaction: entry.lastTransaction,
        // Payment breakdown
        isSub:          entry.isSub,
        isSmartInstall: entry.isSmartInstall,
        paidCount:      entry.paymentCount,
        paidTotal:      entry.paymentSum,
        installments:   entry.installments,
      });
    }
    overdue.sort((a, b) => b.daysSinceLast - a.daysSinceLast);

    /* ── 3. Upcoming — from Hotmart ACTIVE subscriptions ─────────────────── */
    let upcoming: any[] = [];
    let totalSubs = 0;
    // activeEmailSet: emails of people being charged normally → exclude from inadimplentes
    const activeEmailSet = new Set<string>();
    try {
      const token      = await getHotmartToken();
      const activeSubs = await fetchActiveSubs(token);
      totalSubs = activeSubs.length;
      activeSubs.forEach(s => {
        const email = (s.subscriber?.email || '').toLowerCase().trim();
        if (email) activeEmailSet.add(email);
      });
      upcoming = activeSubs
        .filter(s => s.date_next_charge && s.date_next_charge > nowMs)
        .sort((a, b) => a.date_next_charge - b.date_next_charge)
        .map(s => {
          const cur       = (s.price?.currency_code || 'BRL').toUpperCase();
          const amount    = s.price?.value ?? 0;
          const amountBRL = cur === 'BRL' ? null : getConvertedValue(amount, cur);
          return {
            subscriberCode: s.subscriber_code,
            subscriber:     { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
            product:        { name: s.product?.name || '—' },
            plan:           s.plan?.name || '—',
            dateNextCharge: s.date_next_charge,
            amount, currency: cur, amountBRL,
            accessionDate:  s.accession_date,
          };
        });
    } catch { /* upcoming stays [] */ }

    // Filter overdue: exclude anyone with an active subscription (they're paying normally)
    const filteredOverdue = overdue.filter(o => !activeEmailSet.has(o.email));

    /* ── 4. Manual upcoming & overdue (from installment_dates) ───────────── */
    const manualUpcoming: any[] = [];
    const manualOverdue:  any[] = [];

    // Re-read already-fetched manualRows — derive from installment_dates
    try {
      const db = getDb();
      const rows = await db`
        SELECT id, name, email, course_name, entry_date,
               total_amount, installments, installment_amount, installment_dates,
               bp_proximo_pagamento, bp_em_dia
        FROM manual_students ms
        LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
        WHERE COALESCE(ms.total_amount, 0) > 0
        ORDER BY ms.entry_date DESC
      ` as any[];

      for (const row of rows) {
        const name    = (row.name || '—').toUpperCase();
        const email   = (row.email || '').toLowerCase().trim();
        const product = row.course_name || '—';
        const instAmt = Number(row.installment_amount) || Number(row.total_amount) || 0;
        const totalInst = Number(row.installments) || 1;

        let instDates: { due_ms: number; paid: boolean; paid_ms: number | null }[] = [];
        try {
          const raw = typeof row.installment_dates === 'string'
            ? JSON.parse(row.installment_dates)
            : (row.installment_dates || []);
          if (Array.isArray(raw)) instDates = raw;
        } catch { /* ignore */ }

        if (totalInst === 1 || instDates.length === 0) {
          // Single PIX: use bp_proximo_pagamento if available
          const nextMs = Number(row.bp_proximo_pagamento) || 0;
          if (nextMs > nowMs) {
            manualUpcoming.push({ name, email, product,
              dueDate: nextMs, amount: instAmt, installmentNum: 1, totalInstallments: 1,
              source: 'manual',
            });
          }
        } else {
          // Find next UNPAID installment
          const unpaid = instDates
            .map((d, i) => ({ ...d, idx: i }))
            .filter(d => !d.paid);
          const nextUnpaid = unpaid.sort((a, b) => a.due_ms - b.due_ms)[0];
          if (nextUnpaid) {
            if (nextUnpaid.due_ms > nowMs) {
              manualUpcoming.push({ name, email, product,
                dueDate: nextUnpaid.due_ms, amount: instAmt,
                installmentNum: nextUnpaid.idx + 1, totalInstallments: totalInst,
                source: 'manual',
              });
            } else {
              // due_ms < nowMs → overdue
              const daysOverdue = Math.floor((nowMs - nextUnpaid.due_ms) / 86_400_000);
              manualOverdue.push({ name, email, product,
                dueDate: nextUnpaid.due_ms, daysOverdue, amount: instAmt,
                installmentNum: nextUnpaid.idx + 1, totalInstallments: totalInst,
                source: 'manual',
              });
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[financeiro] manual upcoming/overdue failed:', e.message);
    }

    manualUpcoming.sort((a, b) => a.dueDate - b.dueDate);
    manualOverdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return NextResponse.json({
      totalTransactions: approved.length,
      hotmartEntries: hotmartEntriesFinal,
      manualEntries: manualSorted,
      upcoming,
      manualUpcoming,
      overdue: filteredOverdue,
      manualOverdue,
      totalSubs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
