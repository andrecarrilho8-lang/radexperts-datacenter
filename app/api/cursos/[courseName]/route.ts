import { NextRequest, NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_TTL = 2 * 60 * 60 * 1000;

const CURRENCY_TO_ISO: Record<string, string> = {
  BRL: 'br', USD: 'us', EUR: 'eu', COP: 'co', MXN: 'mx',
  ARS: 'ar', PEN: 'pe', CLP: 'cl', PYG: 'py', BOB: 'bo',
  UYU: 'uy', VES: 've', CRC: 'cr', DOP: 'do', GTQ: 'gt',
  HNL: 'hn', NIO: 'ni', PAB: 'pa', GBP: 'gb', CAD: 'ca',
};

/**
 * Returns the BRL amount from Hotmart's purchase price.
 * For BRL sales: price.value is already in BRL.
 * For LATAM: price.actual_value or price.converted_value (if available) = BRL equivalent.
 * If neither exists for LATAM, returns 0 (not raw foreign amount, to avoid R$1.605.812 type bugs).
 */
function getBRLValue(purchase: any): number {
  const currency = (purchase?.price?.currency_code || 'BRL').toUpperCase();
  if (currency === 'BRL') {
    return purchase?.price?.value ?? 0;
  }
  // LATAM: prefer Hotmart's own BRL conversion fields; 0 if not available
  return purchase?.price?.actual_value
    ?? purchase?.price?.converted_value
    ?? 0;  // Return 0 rather than wrong raw foreign amount
}

function getCurrency(purchase: any): string {
  return (purchase?.price?.currency_code || 'BRL').toUpperCase();
}

function getFlag(purchase: any): string {
  const currency = getCurrency(purchase);
  return CURRENCY_TO_ISO[currency] || '';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseName: string }> }
) {
  const { courseName: rawParam } = await params;
  const { searchParams } = new URL(req.url);
  const courseName = decodeURIComponent(rawParam);
  const turma      = searchParams.get('turma') || '';

  // v8: fixed entryDate (first payment), real currency, correct LATAM values
  const CACHE_KEY = `curso_v8_${courseName}`;
  const hit = getCache(CACHE_KEY);
  if (hit?.expires_at > Date.now()) {
    const result = hit.data;
    return NextResponse.json(
      turma ? { ...result, students: result.students.filter((s: any) => s.turma === turma) } : result
    );
  }

  try {
    const sales = await getCachedAllSales();

    const filtered = sales.filter((s: any) =>
      APPROVED.has(s.purchase?.status) && (s.product?.name || '') === courseName
    );

    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || '';
      if (t) turmasSet.add(t);
    });

    type Agg = {
      firstTs: number;       // ← FIRST payment timestamp (for entryDate)
      latestTs: number;      // ← LAST payment timestamp (for lastPayDate)
      latestSale: any;
      maxRecurrency: number;
      isSub: boolean;
      totalInstallments: number;
      currency: string;
      payments: Array<{ date: number; valor: number; recurrencyNumber: number }>;
    };
    const emailMap = new Map<string, Agg>();

    filtered.forEach((s: any) => {
      const buyerEmail = (s.buyer?.email || s.purchase?.buyer?.email || '').toLowerCase();
      if (!buyerEmail) return;

      const ts      = s.purchase?.approved_date || s.purchase?.order_date || 0;
      const recur   = s.purchase?.recurrency_number || 1;
      const isSub   = s.purchase?.is_subscription === true ||
                      (s.purchase?.offer?.payment_mode || '').toUpperCase() === 'SUBSCRIPTION';
      const install = s.purchase?.payment?.installments_number || 1;
      const brlVal  = getBRLValue(s.purchase);
      const currency = getCurrency(s.purchase);

      const cur = emailMap.get(buyerEmail);
      if (!cur) {
        emailMap.set(buyerEmail, {
          firstTs: ts,    // ← track the earliest
          latestTs: ts,
          latestSale: s,
          maxRecurrency: recur,
          isSub,
          totalInstallments: install,
          currency,
          payments: [{ date: ts, valor: brlVal, recurrencyNumber: recur }],
        });
      } else {
        cur.payments.push({ date: ts, valor: brlVal, recurrencyNumber: recur });
        if (ts < cur.firstTs || cur.firstTs === 0) cur.firstTs = ts;  // ← keep earliest
        if (ts > cur.latestTs) { cur.latestTs = ts; cur.latestSale = s; }
        if (recur > cur.maxRecurrency) cur.maxRecurrency = recur;
      }
    });

    const nowMs = Date.now();

    const students = Array.from(emailMap.entries()).map(([buyerEmail, agg]) => {
      const s        = agg.latestSale;
      const purchase = s.purchase || {};
      const buyerObj = typeof s.buyer === 'object' ? s.buyer : {};
      const buyerName = buyerObj.name || (typeof s.buyer === 'string' ? s.buyer : '—');

      const payType  = (purchase.payment?.type || '').toUpperCase();
      const isSub    = agg.isSub;
      const install  = agg.totalInstallments;
      const maxRecur = agg.maxRecurrency;
      const lastPayTs = agg.latestTs;

      let subStatus: 'ACTIVE' | 'OVERDUE' | 'CANCELLED' = 'ACTIVE';
      if (isSub && lastPayTs) {
        const daysSince = (nowMs - lastPayTs) / (24 * 60 * 60 * 1000);
        if (daysSince > 65) subStatus = 'CANCELLED';
        else if (daysSince > 35) subStatus = 'OVERDUE';
      }

      const valor    = getBRLValue(purchase);
      const currency = getCurrency(purchase);
      const flag     = getFlag(purchase);

      const sortedPayments = agg.payments
        .filter(p => p.date > 0)
        .sort((a, b) => a.date - b.date)
        .map((p, i) => ({ ...p, index: i + 1 }))
        .slice(-24);

      return {
        name:               buyerName.toUpperCase(),
        email:              buyerEmail,
        entryDate:          agg.firstTs || null,   // ← FIRST payment = entry date
        lastPayDate:        lastPayTs || null,
        turma:              purchase.offer?.code || '—',
        valor,
        currency,           // actual currency code (BRL, COP, ARS, etc.)
        flag,               // ISO 2-letter lowercase for CDN flag, or '' if unknown
        transaction:        purchase.transaction || '',
        paymentType:        payType,
        paymentInstallments: install,
        paymentIsSub:       isSub,
        paymentRecurrency:  maxRecur,
        subStatus,
        paymentHistory: sortedPayments,
      };

    }).sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

    const result = { students, turmas: Array.from(turmasSet).sort(), total: students.length };
    setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });

    return NextResponse.json(
      turma ? { ...result, students: students.filter(s => s.turma === turma) } : result
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
