import { NextRequest, NextResponse } from 'next/server';
import { fetchHotmartSales, getHotmartToken } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';
import https from 'https';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function httpsGet(token: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'developers.hotmart.com', path, method: 'GET',
        headers: { Authorization: `Bearer ${token}` } },
      (res) => { let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve({ status: res.statusCode || 0, body: d })); }
    );
    req.on('error', reject);
    req.end();
  });
}

function sourceLabel(s: any): string {
  return s.purchase?.tracking?.source_sck || s.purchase?.tracking?.source || '—';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseName: string }> }
) {
  const { courseName: rawParam } = await params;
  const { searchParams } = new URL(req.url);
  const courseName = decodeURIComponent(rawParam);
  const turma = searchParams.get('turma') || '';

  const CACHE_KEY = `curso_students_v5_${courseName}`;
  const cached = getCache(CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) {
    const result = cached.data;
    const out = turma ? { ...result, students: result.students.filter((s: any) => s.turma === turma) } : result;
    return NextResponse.json(out);
  }

  try {
    const since = new Date('2023-01-01').toISOString();
    const now = new Date().toISOString();
    const sales = await fetchHotmartSales(since, now, 60 * 24 * 60 * 60 * 1000, 8);

    // Filter relevant approved sales for this course
    const filtered = sales.filter((s: any) =>
      APPROVED.has(s.purchase?.status) && (s.product?.name || '') === courseName
    );

    // Collect turmas
    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || '';
      if (t) turmasSet.add(t);
    });

    // Group by email — aggregate ALL payments (subscriptions can have many)
    type StudentAgg = {
      latestTs: number;
      latestSale: any;
      maxRecurrency: number;   // highest recurrency seen = total paid
      allDates: number[];      // all payment timestamps for this email
      isSub: boolean;
      totalInstallments: number;
    };
    const emailMap = new Map<string, StudentAgg>();

    filtered.forEach((s: any) => {
      const email = (s.buyer?.email || (typeof s.buyer === 'string' ? '' : '')).toLowerCase();
      // buyer can be a string (name) in some API responses - need to get email from purchase
      // Try different paths for email
      const buyerEmail = (
        s.buyer?.email ||
        s.purchase?.buyer?.email ||
        ''
      ).toLowerCase();
      if (!buyerEmail) return;

      const ts = s.purchase?.approved_date || s.purchase?.order_date || 0;
      const recur = s.purchase?.recurrency_number || 1;
      const isSub = s.purchase?.is_subscription === true ||
        (s.purchase?.offer?.payment_mode || '').toUpperCase() === 'SUBSCRIPTION';
      const install = s.purchase?.payment?.installments_number || 1;

      const cur = emailMap.get(buyerEmail);
      if (!cur) {
        emailMap.set(buyerEmail, {
          latestTs: ts, latestSale: s,
          maxRecurrency: recur, allDates: [ts],
          isSub, totalInstallments: install,
        });
      } else {
        cur.allDates.push(ts);
        if (ts > cur.latestTs) { cur.latestTs = ts; cur.latestSale = s; }
        if (recur > cur.maxRecurrency) cur.maxRecurrency = recur;
      }
    });

    // Fetch buyer details (phone) for transactions via sales/users endpoint
    // We sample a batch of transactions to get phone numbers
    const token = await getHotmartToken();
    const phoneMap = new Map<string, string>(); // email → phone

    // Build list of unique transactions to look up (max 200 to avoid timeout)
    const txnsForPhone: string[] = [];
    emailMap.forEach((agg) => {
      const tx = agg.latestSale?.purchase?.transaction;
      if (tx) txnsForPhone.push(tx);
    });

    // Batch fetch phone in groups of 5 concurrently (sales/users has buyer phone)
    const PHONE_BATCH = 5;
    for (let i = 0; i < Math.min(txnsForPhone.length, 150); i += PHONE_BATCH) {
      const batch = txnsForPhone.slice(i, i + PHONE_BATCH);
      await Promise.all(batch.map(async (tx) => {
        try {
          const resp = await httpsGet(token, `/payments/api/v1/sales/users?transaction=${tx}`);
          if (resp.status === 200) {
            const data = JSON.parse(resp.body);
            const items = data.items || [];
            items.forEach((it: any) => {
              const email = (it.buyer?.email || '').toLowerCase();
              const phone = it.buyer?.phone || it.buyer?.cellphone || '';
              if (email && phone) phoneMap.set(email, phone);
            });
          }
        } catch { /* optional */ }
      }));
    }

    const nowMs = Date.now();

    const students = Array.from(emailMap.entries()).map(([buyerEmail, agg]) => {
      const s = agg.latestSale;
      const purchase = s.purchase || {};
      const buyerObj = typeof s.buyer === 'object' ? s.buyer : {};
      const buyerName = buyerObj.name || (typeof s.buyer === 'string' ? s.buyer : '—');

      const payType = (purchase.payment?.type || '').toUpperCase();
      const isSub = agg.isSub;
      const install = agg.totalInstallments;
      const maxRecur = agg.maxRecurrency;  // total subscription payments made
      const lastPayTs = agg.latestTs;

      // Subscription status
      let subStatus: 'ACTIVE' | 'OVERDUE' | 'CANCELLED' = 'ACTIVE';
      if (isSub && lastPayTs) {
        const daysSince = (nowMs - lastPayTs) / (24 * 60 * 60 * 1000);
        if (daysSince > 65) subStatus = 'CANCELLED';
        else if (daysSince > 35) subStatus = 'OVERDUE';
      }

      return {
        name: buyerName.toUpperCase(),
        email: buyerEmail,
        phone: phoneMap.get(buyerEmail) || '—',
        entryDate: purchase.approved_date || purchase.order_date || null,
        lastPayDate: lastPayTs || null,
        turma: purchase.offer?.code || '—',
        valor: purchase.price?.value ?? 0,
        currency: purchase.price?.currency_code || 'BRL',
        source: sourceLabel(s),
        transaction: purchase.transaction || '',
        paymentType: payType,
        paymentInstallments: install,
        paymentIsSub: isSub,
        paymentRecurrency: maxRecur,   // total paid
        subStatus,
      };
    }).sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

    const result = {
      students,
      turmas: Array.from(turmasSet).sort(),
      total: students.length,
    };

    setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });
    const out = turma ? { ...result, students: students.filter(s => s.turma === turma) } : result;
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
