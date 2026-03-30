import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getAllRates, getConvertedValue } from '@/app/lib/currency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPROVED_STATUS = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/* ── Hotmart subscriptions API ──────────────────────────────────────────── */
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

/** Fetch ALL subscriptions (no status filter) — paginated */
async function fetchAllSubs(token: string, limit = 500): Promise<any[]> {
  const items: any[] = [];
  let pageToken = '';
  do {
    const qs = `/payments/api/v1/subscriptions?max_results=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await httpsGet(token, qs);
    if (r.status !== 200) break;
    const batch: any[] = r.body?.items || [];
    items.push(...batch);
    pageToken = r.body?.page_info?.next_page_token || '';
    if (items.length >= limit) break;
  } while (pageToken);
  return items;
}

export async function GET() {
  try {
    /* ── 1. Recent transactions from sales cache ─────────────────────────── */
    const allSales = await getCachedAllSales();
    const approved = allSales.filter((s: any) => APPROVED_STATUS.has(s.purchase?.status));

    const sortedAll = [...approved].sort((a: any, b: any) => {
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

    /* ── 2 & 3. Subscriptions: upcoming + inadimplentes ─────────────────── */
    const token   = await getHotmartToken();
    const allSubs = await fetchAllSubs(token, 500);
    const nowMs   = Date.now();

    // Collect all unique non-BRL currencies for batch rate fetch
    const allCurrencies = [...new Set(
      [...recentTransactions, ...allSubs.map(s => s.price?.currency_code)]
        .map(c => (typeof c === 'string' ? c : 'BRL').toUpperCase())
        .filter(c => c !== 'BRL')
    )];
    if (allCurrencies.length > 0) {
      await getAllRates(allCurrencies); // warms cache once; getConvertedValue used below
    }

    /* Upcoming — ACTIVE with future charge */
    const upcoming = allSubs
      .filter(s => s.status === 'ACTIVE' && s.date_next_charge && s.date_next_charge > nowMs)
      .sort((a, b) => a.date_next_charge - b.date_next_charge)
      .slice(0, 10)
      .map(s => {
        const cur     = (s.price?.currency_code || 'BRL').toUpperCase();
        const amount  = s.price?.value ?? 0;
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

    /* Inadimplentes — INACTIVE or DELAYED: subscriptions that stopped paying */
    const OVERDUE_STATUSES = new Set(['INACTIVE', 'DELAYED', 'OVERDUE',
      'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SELLER', 'CANCELLED_BY_ADMIN']);

    const overdue = allSubs
      .filter(s => OVERDUE_STATUSES.has(s.status))
      .map(s => {
        const cur      = (s.price?.currency_code || 'BRL').toUpperCase();
        const amount   = s.price?.value ?? 0;
        const amountBRL = cur === 'BRL' ? null : getConvertedValue(amount, cur);
        // Days since subscription should have renewed
        const refTs    = s.date_next_charge && s.date_next_charge < nowMs
          ? s.date_next_charge
          : s.accession_date || nowMs;
        const daysSinceLast = Math.max(0, Math.floor((nowMs - refTs) / 86_400_000));
        return {
          subscriberCode:  s.subscriber_code,
          subscriber:      { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
          product:         { name: s.product?.name || '—' },
          plan:            s.plan?.name || '—',
          status:          s.status,
          amount, currency: cur, amountBRL,
          accessionDate:   s.accession_date,
          dateNextCharge:  s.date_next_charge,
          daysSinceLast,
          lastTransaction: s.transaction || s.subscriber_code || '—',
        };
      })
      .sort((a, b) => b.daysSinceLast - a.daysSinceLast);

    /* Status summary */
    const statusCounts: Record<string, number> = {};
    allSubs.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });

    return NextResponse.json({
      totalTransactions: approved.length,
      recentTransactions,
      upcoming,
      overdue,
      statusCounts,
      totalSubs: allSubs.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
