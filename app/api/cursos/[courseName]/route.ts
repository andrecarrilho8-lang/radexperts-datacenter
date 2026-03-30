import { NextRequest, NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';

/**
 * Hotmart Sales API — status guide (confirmed via docs):
 *
 * APPROVED         → Payment identified, access released. Counts as active student.
 * COMPLETE         → Warranty period expired, still has access. Counts as active.
 * PRODUCER_CONFIRMED → Manual payment confirmed by producer. Counts as active.
 * CANCELLED        → Payment failed/refused BEFORE completion. NOT a valid student.
 * REFUNDED         → Money returned. No longer a student.
 * CHARGEBACK       → Reversed. No longer a student.
 * EXPIRED          → Billet/PIX not paid. NOT a student.
 * WAITING_PAYMENT  → Pending. NOT a student yet.
 *
 * For installments (CREDIT_CARD):
 *   - Standard card 12x: ONE transaction, installments_number=12, recurrency_number=1
 *   - Smart Installments: N transactions (one per charge), recurrency_number increments
 *
 * For subscriptions:
 *   - Each cycle = new APPROVED transaction, recurrency_number increments
 *
 * Student deduplication: group by buyer.email — all recurrency events for same
 * email/product are the SAME student's payment history.
 */

const ACTIVE_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_TTL = 2 * 60 * 60 * 1000;

const CURRENCY_TO_ISO: Record<string, string> = {
  BRL: 'br', USD: 'us', EUR: 'eu', COP: 'co', MXN: 'mx',
  ARS: 'ar', PEN: 'pe', CLP: 'cl', PYG: 'py', BOB: 'bo',
  UYU: 'uy', VES: 've', CRC: 'cr', DOP: 'do', GTQ: 'gt',
  HNL: 'hn', NIO: 'ni', PAB: 'pa', GBP: 'gb', CAD: 'ca',
};

function getBRLValue(purchase: any): number {
  const currency = (purchase?.price?.currency_code || 'BRL').toUpperCase();
  if (currency === 'BRL') return purchase?.price?.value ?? 0;
  // LATAM: use Hotmart's converted value if available, otherwise 0 (not raw foreign amount)
  return purchase?.price?.actual_value ?? purchase?.price?.converted_value ?? 0;
}

function getCurrency(purchase: any): string {
  return (purchase?.price?.currency_code || 'BRL').toUpperCase();
}

function getFlag(purchase: any): string {
  return CURRENCY_TO_ISO[getCurrency(purchase)] || '';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseName: string }> }
) {
  const { courseName: rawParam } = await params;
  const { searchParams } = new URL(req.url);
  const courseName = decodeURIComponent(rawParam);
  const turma      = searchParams.get('turma') || '';

  // v9: uses correct Hotmart status knowledge from docs
  const CACHE_KEY = `curso_v9_${courseName}`;
  const hit = getCache(CACHE_KEY);
  if (hit?.expires_at > Date.now()) {
    const result = hit.data;
    return NextResponse.json(
      turma ? { ...result, students: result.students.filter((s: any) => s.turma === turma) } : result
    );
  }

  try {
    const sales = await getCachedAllSales();

    // Filter: only this product, only active purchases
    // Note: CANCELLED/REFUNDED/CHARGEBACK/EXPIRED are NOT included in ACTIVE_STATUSES
    const filtered = sales.filter((s: any) =>
      ACTIVE_STATUSES.has(s.purchase?.status) && (s.product?.name || '') === courseName
    );

    // Collect turmas
    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || '';
      if (t) turmasSet.add(t);
    });

    /**
     * Group ALL transactions by buyer email.
     *
     * For subscriptions & Smart Installments: each monthly charge = new transaction.
     * For standard card 12x: single transaction, installments_number=12, recurrency=1.
     *
     * We track:
     *   - firstTs: earliest payment date (= true entry/enrollment date)
     *   - latestTs: most recent payment (= last pay date, used for subscription health)
     *   - latestSale: most recent sale object (for buyer info, payment type, etc.)
     *   - firstSale: earliest sale object (for enrollment payment type)
     *   - payments: all individual payment events (sorted later for tooltip)
     *   - isSub: whether this is a recurring subscription product
     *   - totalInstallments: number of installments if card payment
     */
    type Agg = {
      firstTs: number;
      latestTs: number;
      firstSale: any;
      latestSale: any;
      maxRecurrency: number;
      isSub: boolean;
      totalInstallments: number;
      currency: string;
      payments: Array<{ date: number; valor: number; recurrencyNumber: number }>;
    };
    const emailMap = new Map<string, Agg>();

    filtered.forEach((s: any) => {
      const buyerEmail = (s.buyer?.email || s.purchase?.buyer?.email || '').toLowerCase().trim();
      if (!buyerEmail) return;

      const ts      = s.purchase?.approved_date || s.purchase?.order_date || 0;
      const recur   = s.purchase?.recurrency_number || 1;
      const isSub   = s.purchase?.is_subscription === true ||
                      (s.purchase?.offer?.payment_mode || '').toUpperCase() === 'SUBSCRIPTION';
      // installments_number: for standard 12x card = 12, for each smart-installment/sub charge = 1
      const install = s.purchase?.payment?.installments_number || 1;
      const brlVal  = getBRLValue(s.purchase);
      const currency = getCurrency(s.purchase);

      const cur = emailMap.get(buyerEmail);
      if (!cur) {
        emailMap.set(buyerEmail, {
          firstTs: ts,
          latestTs: ts,
          firstSale: s,
          latestSale: s,
          maxRecurrency: recur,
          isSub,
          totalInstallments: install,
          currency,
          payments: [{ date: ts, valor: brlVal, recurrencyNumber: recur }],
        });
      } else {
        cur.payments.push({ date: ts, valor: brlVal, recurrencyNumber: recur });
        // Track earliest (enrollment date)
        if (ts > 0 && (ts < cur.firstTs || cur.firstTs === 0)) {
          cur.firstTs   = ts;
          cur.firstSale = s;
        }
        // Track latest (most recent payment)
        if (ts > cur.latestTs) {
          cur.latestTs   = ts;
          cur.latestSale = s;
        }
        if (recur > cur.maxRecurrency) cur.maxRecurrency = recur;
        // If ANY transaction is a subscription, flag the student as subscriber
        if (isSub) cur.isSub = true;
        // Keep max installments seen (standard card 12x has installments=12 in first transaction only)
        if (install > cur.totalInstallments) cur.totalInstallments = install;
      }
    });

    const nowMs = Date.now();

    const students = Array.from(emailMap.entries()).map(([buyerEmail, agg]) => {
      // Use LATEST sale for buyer name/email (most up to date)
      const s        = agg.latestSale;
      const purchase = s.purchase || {};
      const buyerObj = typeof s.buyer === 'object' ? s.buyer : {};
      const buyerName = (buyerObj.name || (typeof s.buyer === 'string' ? s.buyer : '—')).trim();

      // Payment type from the FIRST (enrollment) purchase
      const firstPurchase = agg.firstSale?.purchase || {};
      const payType  = (firstPurchase.payment?.type || purchase.payment?.type || '').toUpperCase();

      const isSub    = agg.isSub;
      // For card installments: totalInstallments from the purchase with the highest value
      // (smart installments will have install=1 per charge, standard card has install=N in first charge)
      const install  = agg.totalInstallments;
      const maxRecur = agg.maxRecurrency;
      const lastPayTs = agg.latestTs;

      /**
       * Subscription health based on time since last payment:
       * - Hotmart charges monthly. If last charge was >35 days ago, overdue.
       * - If >65 days ago, likely cancelled.
       * Note: Hotmart webhook would give real-time status, but sales history
       * gives us the last APPROVED payment as proxy.
       */
      let subStatus: 'ACTIVE' | 'OVERDUE' | 'CANCELLED' = 'ACTIVE';
      if (isSub && lastPayTs) {
        const daysSince = (nowMs - lastPayTs) / (24 * 60 * 60 * 1000);
        if (daysSince > 65) subStatus = 'CANCELLED';
        else if (daysSince > 35) subStatus = 'OVERDUE';
      }

      // Use first purchase's price for valor (enrollment price)
      const valor    = getBRLValue(firstPurchase) || getBRLValue(purchase);
      const currency = getCurrency(firstPurchase) || getCurrency(purchase);
      const flag     = CURRENCY_TO_ISO[currency] || '';

      const sortedPayments = agg.payments
        .filter(p => p.date > 0)
        .sort((a, b) => a.date - b.date)
        .map((p, i) => ({ ...p, index: i + 1 }))
        .slice(-48); // keep up to 48 payment records

      return {
        name:                buyerName.toUpperCase(),
        email:               buyerEmail,
        entryDate:           agg.firstTs || null,
        lastPayDate:         lastPayTs || null,
        turma:               firstPurchase.offer?.code || purchase.offer?.code || '—',
        valor,
        currency,
        flag,
        transaction:         firstPurchase.transaction || purchase.transaction || '',
        paymentType:         payType,
        paymentInstallments: install,
        paymentIsSub:        isSub,
        paymentRecurrency:   maxRecur,
        subStatus,
        paymentHistory:      sortedPayments,
      };

    }).sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

    const result = {
      students,
      turmas: Array.from(turmasSet).sort(),
      total: students.length,              // unique student count
    };
    setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });

    return NextResponse.json(
      turma ? { ...result, students: students.filter(s => s.turma === turma) } : result
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
