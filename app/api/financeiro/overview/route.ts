import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getAllRates, getConvertedValue } from '@/app/lib/currency';

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

    /* ── 1. Recent Transactions — last 10 ───────────────────────────────── */
    const sortedAll = [...approved].sort((a: any, b: any) =>
      new Date(b.purchase?.approved_date || b.purchase?.order_date || 0).getTime() -
      new Date(a.purchase?.approved_date || a.purchase?.order_date || 0).getTime()
    );
    const recentRaw = sortedAll.slice(0, 10).map((s: any) => ({
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
    }));

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
    recentRaw.forEach(t => { if (t.currency !== 'BRL' && !t.amountBRL) allCurrencies.add(t.currency); });
    subMap.forEach(e => { if (e.currency !== 'BRL') allCurrencies.add(e.currency); });
    if (allCurrencies.size > 0) await getAllRates(Array.from(allCurrencies));

    // Enrich recent transactions with BRL conversion if missing
    const recentTransactions = recentRaw.map(t => ({
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
        .slice(0, 10)
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

    return NextResponse.json({
      totalTransactions: approved.length,
      recentTransactions,
      upcoming,
      overdue: filteredOverdue,
      totalSubs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
