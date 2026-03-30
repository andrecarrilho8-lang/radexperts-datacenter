import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import { getCachedAllSales } from '@/app/lib/salesCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPROVED_STATUS = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

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

/** Paginate through all subscription items for a given status */
async function fetchAllSubsByStatus(token: string, status: string, limit = 500): Promise<any[]> {
  const items: any[] = [];
  let pageToken = '';
  do {
    const qs = `/payments/api/v1/subscriptions?status=${status}&max_results=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await httpsGet(token, qs);
    if (r.status !== 200) break;
    const batch: any[] = r.body?.items || [];
    items.push(...batch);
    pageToken = r.body?.page_info?.next_page_token || '';
    if (items.length >= limit) break;
  } while (pageToken);
  return items;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo   = searchParams.get('dateTo')   || '';

    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : Date.now();

    // ── 1. Recent transactions (from sales cache, filtered by period) ───────
    const allSales = await getCachedAllSales();
    const periodSales = allSales.filter((s: any) => {
      if (!APPROVED_STATUS.has(s.purchase?.status)) return false;
      const ts = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      return ts >= fromMs && ts <= toMs;
    });
    const sortedSales  = periodSales.sort((a: any, b: any) => {
      const ta = new Date(b.purchase?.approved_date || b.purchase?.order_date || 0).getTime();
      const tb = new Date(a.purchase?.approved_date || a.purchase?.order_date || 0).getTime();
      return ta - tb;
    });
    const recentTransactions = sortedSales.slice(0, 10).map((s: any) => ({
      transaction: s.purchase?.transaction,
      date:        s.purchase?.approved_date || s.purchase?.order_date,
      buyer:       { name: s.buyer?.name || '—', email: s.buyer?.email || '—' },
      product:     { name: s.product?.name || '—', id: s.product?.id },
      amount:      s.purchase?.price?.value ?? 0,
      currency:    s.purchase?.price?.currency_code || 'BRL',
      amountBRL:   s.purchase?.price?.converted_value || (s.purchase?.price?.currency_code === 'BRL' ? s.purchase?.price?.value : null),
      paymentType: s.purchase?.payment?.type || '—',
      status:      s.purchase?.status,
    }));

    // ── 2 & 3. Subscriptions: upcoming payments + overdue ──────────────────
    const token = await getHotmartToken();
    const [activeSubs, delayedSubs] = await Promise.all([
      fetchAllSubsByStatus(token, 'ACTIVE', 200),
      fetchAllSubsByStatus(token, 'DELAYED', 500),
    ]);

    // Upcoming payments: active subs sorted by date_next_charge asc, future only
    const now = Date.now();
    const upcoming = activeSubs
      .filter(s => s.date_next_charge && s.date_next_charge > now)
      .sort((a, b) => a.date_next_charge - b.date_next_charge)
      .slice(0, 10)
      .map(s => ({
        subscriberCode: s.subscriber_code,
        subscriber:     { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
        product:        { name: s.product?.name || '—', id: s.product?.id },
        plan:           s.plan?.name || '—',
        dateNextCharge: s.date_next_charge,
        amount:         s.price?.value ?? 0,
        currency:       s.price?.currency_code || 'BRL',
        recurrencyPeriod: s.plan?.recurrency_period || 30,
        accessionDate:  s.accession_date,
      }));

    // Overdue (DELAYED): all, sorted by accession date desc
    const overdue = delayedSubs
      .sort((a, b) => (b.accession_date || 0) - (a.accession_date || 0))
      .map(s => ({
        subscriberCode: s.subscriber_code,
        subscriber:     { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
        product:        { name: s.product?.name || '—', id: s.product?.id },
        plan:           s.plan?.name || '—',
        amount:         s.price?.value ?? 0,
        currency:       s.price?.currency_code || 'BRL',
        accessionDate:  s.accession_date,
        requestDate:    s.request_date,
        lastTransaction: s.transaction,
      }));

    return NextResponse.json({
      period: { from: dateFrom, to: dateTo },
      totalInPeriod: sortedSales.length,
      recentTransactions,
      upcoming,
      overdue,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
