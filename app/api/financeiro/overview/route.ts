import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { getCachedAllSales } from '@/app/lib/salesCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPROVED_STATUS = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/* ─── Subscriptions API (for upcoming payments only) ──────────────────────── */
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

async function fetchActiveSubs(token: string, limit = 300): Promise<any[]> {
  const items: any[] = [];
  let pageToken = '';
  do {
    const qs = `/payments/api/v1/subscriptions?status=ACTIVE&max_results=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await httpsGet(token, qs);
    if (r.status !== 200) break;
    const batch: any[] = r.body?.items || [];
    items.push(...batch);
    pageToken = r.body?.page_info?.next_page_token || '';
    if (items.length >= limit) break;
  } while (pageToken);
  return items;
}

/* ─── Same logic used by /api/cursos/[courseName] ──────────────────────── */
function classifyByLastPayment(lastPayTs: number, nowMs: number): 'ACTIVE' | 'OVERDUE' | 'CANCELLED' {
  if (!lastPayTs) return 'ACTIVE';
  const daysSince = (nowMs - lastPayTs) / 86_400_000;
  if (daysSince > 65) return 'CANCELLED';
  if (daysSince > 35) return 'OVERDUE'; // ← INADIMPLENTE
  return 'ACTIVE';
}

export async function GET() {
  try {
    const allSales = await getCachedAllSales();
    const nowMs    = Date.now();

    // Only approved sales
    const approved = allSales.filter((s: any) => APPROVED_STATUS.has(s.purchase?.status));

    /* ─── 1. Recent transactions — last 10 across all time ─── */
    const sortedAll = approved.sort((a: any, b: any) => {
      const ta = new Date(b.purchase?.approved_date || b.purchase?.order_date || 0).getTime();
      const tb = new Date(a.purchase?.approved_date || a.purchase?.order_date || 0).getTime();
      return ta - tb;
    });
    const recentTransactions = sortedAll.slice(0, 10).map((s: any) => ({
      transaction:      s.purchase?.transaction,
      date:             s.purchase?.approved_date || s.purchase?.order_date,
      buyer:            { name: s.buyer?.name || '—', email: s.buyer?.email || '—' },
      product:          { name: s.product?.name || '—' },
      amount:           s.purchase?.price?.value ?? 0,
      currency:         s.purchase?.price?.currency_code || 'BRL',
      amountBRL:        s.purchase?.price?.converted_value || null,
      paymentType:      s.purchase?.payment?.type || '—',
      status:           s.purchase?.status,
      isSubscription:   s.purchase?.is_subscription === true ||
                        (s.purchase?.offer?.payment_mode || '').toUpperCase() === 'SUBSCRIPTION',
      installments:     s.purchase?.payment?.installments_number || 1,
      recurrencyNumber: s.purchase?.recurrency_number || null,
    }));

    /* ─── 2. Inadimplentes — exactly same logic as course detail ─── */
    // Group by email × product to track last payment per subscription
    type SubKey = string; // `${email}|${product}`
    const subMap = new Map<SubKey, {
      email: string; name: string; product: string;
      offerCode: string; paymentMode: string;
      amount: number; currency: string;
      lastPayTs: number; firstPayTs: number;
      lastTransaction: string;
      isSub: boolean; isSmartInstall: boolean;
      maxRecurrency: number; installments: number;
    }>();

    for (const s of approved) {
      const email      = (s.buyer?.email || '').toLowerCase().trim();
      const product    = s.product?.name || '—';
      if (!email || !product) continue;

      const ts          = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      const paymentMode = (s.purchase?.offer?.payment_mode || 'UNIQUE_PAYMENT').toUpperCase();
      const recur       = s.purchase?.recurrency_number || 1;
      const inst        = s.purchase?.payment?.installments_number || 1;
      const isSub       = paymentMode === 'SUBSCRIPTION' || s.purchase?.is_subscription === true;

      // Only track subscriptions and smart installments (one-time = quitado immediately)
      const maxRecurForEntry = recur; // starts at current recurrency
      if (!isSub && inst <= 1) continue; // skip one-time & standard card splits

      const isSmartInstall = !isSub && recur > 1;
      const key: SubKey = `${email}|${product}`;
      const existing = subMap.get(key);

      if (!existing) {
        subMap.set(key, {
          email,
          name:            s.buyer?.name || '—',
          product,
          offerCode:       s.purchase?.offer?.code || '—',
          paymentMode,
          amount:          s.purchase?.price?.value ?? 0,
          currency:        s.purchase?.price?.currency_code || 'BRL',
          lastPayTs:       ts,
          firstPayTs:      ts,
          lastTransaction: s.purchase?.transaction || '—',
          isSub,
          isSmartInstall,
          maxRecurrency:   maxRecurForEntry,
          installments:    inst,
        });
      } else {
        if (ts > existing.lastPayTs) {
          existing.lastPayTs       = ts;
          existing.lastTransaction = s.purchase?.transaction || existing.lastTransaction;
          existing.name            = s.buyer?.name || existing.name;
        }
        if (ts > 0 && ts < existing.firstPayTs) existing.firstPayTs = ts;
        if (recur > existing.maxRecurrency) existing.maxRecurrency = recur;
        if (inst > existing.installments)   existing.installments  = inst;
      }
    }

    const overdue: any[] = [];
    for (const entry of subMap.values()) {
      const status = classifyByLastPayment(entry.lastPayTs, nowMs);
      if (status !== 'OVERDUE') continue;

      // Smart installment: if all paid, skip
      if (entry.isSmartInstall && entry.maxRecurrency >= entry.installments && entry.installments > 1) continue;

      const daysSinceLast = Math.floor((nowMs - entry.lastPayTs) / 86_400_000);

      overdue.push({
        email:           entry.email,
        subscriber:      { name: entry.name.toUpperCase(), email: entry.email },
        product:         { name: entry.product },
        plan:            entry.offerCode,
        amount:          entry.amount,
        currency:        entry.currency,
        accessionDate:   entry.firstPayTs,
        lastPayDate:     entry.lastPayTs,
        daysSinceLast,
        lastTransaction: entry.lastTransaction,
        paymentMode:     entry.paymentMode,
      });
    }
    // Sort: most days overdue first
    overdue.sort((a, b) => b.daysSinceLast - a.daysSinceLast);

    /* ─── 3. Upcoming payments — from Hotmart ACTIVE subscriptions ─── */
    let upcoming: any[] = [];
    try {
      const token      = await getHotmartToken();
      const activeSubs = await fetchActiveSubs(token, 300);
      upcoming = activeSubs
        .filter(s => s.date_next_charge && s.date_next_charge > nowMs)
        .sort((a, b) => a.date_next_charge - b.date_next_charge)
        .slice(0, 10)
        .map(s => ({
          subscriberCode: s.subscriber_code,
          subscriber:     { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
          product:        { name: s.product?.name || '—' },
          plan:           s.plan?.name || '—',
          dateNextCharge: s.date_next_charge,
          amount:         s.price?.value ?? 0,
          currency:       s.price?.currency_code || 'BRL',
          accessionDate:  s.accession_date,
        }));
    } catch { /* upcoming is [] */ }

    return NextResponse.json({
      totalTransactions: approved.length,
      recentTransactions,
      upcoming,
      overdue,
      // debug
      overdueCount: overdue.length,
      subsTracked:  subMap.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
