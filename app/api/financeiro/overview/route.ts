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

/** Paginate ALL subs (no status filter — then slice client-side) */
async function fetchAllSubs(token: string, limit = 1000): Promise<any[]> {
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
    // ── 1. Recent transactions — ALL time, last 10 approved ───────────────
    const allSales = await getCachedAllSales();
    const approved = allSales.filter((s: any) => APPROVED_STATUS.has(s.purchase?.status));
    const sorted   = approved.sort((a: any, b: any) => {
      const ta = new Date(b.purchase?.approved_date || b.purchase?.order_date || 0).getTime();
      const tb = new Date(a.purchase?.approved_date || a.purchase?.order_date || 0).getTime();
      return ta - tb;
    });
    const recentTransactions = sorted.slice(0, 10).map((s: any) => ({
      transaction: s.purchase?.transaction,
      date:        s.purchase?.approved_date || s.purchase?.order_date,
      buyer:       { name: s.buyer?.name || '—', email: s.buyer?.email || '—' },
      product:     { name: s.product?.name || '—', id: s.product?.id },
      amount:      s.purchase?.price?.value ?? 0,
      currency:    s.purchase?.price?.currency_code || 'BRL',
      amountBRL:   s.purchase?.price?.converted_value || null,
      paymentType: s.purchase?.payment?.type || '—',
      status:      s.purchase?.status,
      isSubscription: s.purchase?.is_subscription === true,
      installments:   s.purchase?.payment?.installments_number || 1,
      recurrencyNumber: s.purchase?.recurrency_number || null,
    }));

    // ── 2 & 3. Subscriptions: upcoming payments + overdue ──────────────────
    const token  = await getHotmartToken();
    const allSubs = await fetchAllSubs(token, 500);

    const now = Date.now();

    // Upcoming: ACTIVE with future date_next_charge
    const upcoming = allSubs
      .filter(s => s.status === 'ACTIVE' && s.date_next_charge && s.date_next_charge > now)
      .sort((a, b) => a.date_next_charge - b.date_next_charge)
      .slice(0, 10)
      .map(s => ({
        subscriberCode:   s.subscriber_code,
        subscriber:       { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
        product:          { name: s.product?.name || '—', id: s.product?.id },
        plan:             s.plan?.name || '—',
        dateNextCharge:   s.date_next_charge,
        amount:           s.price?.value ?? 0,
        currency:         s.price?.currency_code || 'BRL',
        accessionDate:    s.accession_date,
      }));

    // Overdue: any status that is DELAYED
    const overdue = allSubs
      .filter(s => s.status === 'DELAYED')
      .sort((a, b) => (b.request_date || b.accession_date || 0) - (a.request_date || a.accession_date || 0))
      .map(s => ({
        subscriberCode:  s.subscriber_code,
        subscriber:      { name: s.subscriber?.name || '—', email: s.subscriber?.email || '—' },
        product:         { name: s.product?.name || '—', id: s.product?.id },
        plan:            s.plan?.name || '—',
        amount:          s.price?.value ?? 0,
        currency:        s.price?.currency_code || 'BRL',
        accessionDate:   s.accession_date,
        requestDate:     s.request_date,
        lastTransaction: s.transaction,
        status:          s.status,
      }));

    // Status summary (so page can show debugging info)
    const statusCounts: Record<string, number> = {};
    allSubs.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });

    return NextResponse.json({
      totalTransactions: approved.length,
      recentTransactions,
      upcoming,
      overdue,
      statusCounts,      // for debugging
      totalSubs: allSubs.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
