import { NextRequest, NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  HOTMART PAYMENT MODES (confirmed via API debug + documentation)
 * ═══════════════════════════════════════════════════════════════════
 *
 * offer.payment_mode = "SUBSCRIPTION"
 *   → Recurring monthly charges. Each charged month = new APPROVED transaction.
 *   → recurrency_number increments (1, 2, 3…).
 *   → Student is ACTIVE if last charge < 35 days ago.
 *
 * offer.payment_mode = "UNIQUE_PAYMENT" + installments_number = 1
 *   → One-time payment (PIX, Boleto, card à vista).
 *   → Single transaction. Fully PAID from Hotmart's perspective.
 *
 * offer.payment_mode = "UNIQUE_PAYMENT" + installments_number > 1 + maxRecurrency = 1
 *   → Standard bank card installments (e.g., 12×).
 *   → ONE Hotmart transaction. Bank handles splitting on buyer's card bill.
 *   → Hotmart received the FULL amount. From our perspective: PAID.
 *
 * offer.payment_mode = "UNIQUE_PAYMENT" + installments_number > 1 + maxRecurrency > 1
 *   → Smart Installments (Parcelamento Inteligente).
 *   → Each installment = new Hotmart charge = new APPROVED transaction.
 *   → recurrency_number increments. We can track actual paid vs remaining.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  STATUSES
 * ═══════════════════════════════════════════════════════════════════
 *  APPROVED / COMPLETE / PRODUCER_CONFIRMED → active student
 *  CANCELLED / REFUNDED / CHARGEBACK / EXPIRED / WAITING_PAYMENT → not a student
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
  return purchase?.price?.actual_value ?? purchase?.price?.converted_value ?? 0;
}

function getCurrency(purchase: any): string {
  return (purchase?.price?.currency_code || 'BRL').toUpperCase();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseName: string }> }
) {
  const { courseName: rawParam } = await params;
  const { searchParams } = new URL(req.url);
  const courseName = decodeURIComponent(rawParam);
  const turma      = searchParams.get('turma') || '';

  // v10: offer-aware payment mode detection
  const CACHE_KEY = `curso_v10_${courseName}`;
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
      ACTIVE_STATUSES.has(s.purchase?.status) && (s.product?.name || '') === courseName
    );

    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || '';
      if (t) turmasSet.add(t);
    });

    type Agg = {
      firstTs: number;
      latestTs: number;
      firstSale: any;
      latestSale: any;
      maxRecurrency: number;
      currency: string;
      payments: Array<{ date: number; valor: number; recurrencyNumber: number }>;
      // Per-offer tracking: a student may have multiple offers (re-purchase, plan change)
      // We store ALL offers seen, key = offerCode
      offers: Map<string, {
        offerCode: string;
        paymentMode: string;      // SUBSCRIPTION | UNIQUE_PAYMENT
        paymentType: string;      // CREDIT_CARD | PIX | BILLET | PAYPAL | WALLET
        paymentMethod: string;    // CREDIT_CARD_VISA, CREDIT_CARD_ELO, etc.
        installmentsNumber: number;
        maxRecurrency: number;
        firstTs: number;
        latestTs: number;
        payments: Array<{ date: number; valor: number; recurrencyNumber: number }>;
      }>;
    };

    const emailMap = new Map<string, Agg>();

    filtered.forEach((s: any) => {
      const buyerEmail = (s.buyer?.email || s.purchase?.buyer?.email || '').toLowerCase().trim();
      if (!buyerEmail) return;

      const ts          = s.purchase?.approved_date || s.purchase?.order_date || 0;
      const recur       = s.purchase?.recurrency_number || 1;
      const offerCode   = s.purchase?.offer?.code || 'default';
      const paymentMode = (s.purchase?.offer?.payment_mode || 'UNIQUE_PAYMENT').toUpperCase();
      const paymentType = (s.purchase?.payment?.type || '').toUpperCase();
      const paymentMethod = (s.purchase?.payment?.method || paymentType).toUpperCase();
      const installments  = s.purchase?.payment?.installments_number || 1;
      const brlVal        = getBRLValue(s.purchase);
      const currency      = getCurrency(s.purchase);

      const payRecord = { date: ts, valor: brlVal, recurrencyNumber: recur };

      const cur = emailMap.get(buyerEmail);
      if (!cur) {
        const offersMap = new Map();
        offersMap.set(offerCode, {
          offerCode, paymentMode, paymentType, paymentMethod,
          installmentsNumber: installments,
          maxRecurrency: recur,
          firstTs: ts, latestTs: ts,
          payments: [payRecord],
        });
        emailMap.set(buyerEmail, {
          firstTs: ts, latestTs: ts,
          firstSale: s, latestSale: s,
          maxRecurrency: recur,
          currency,
          payments: [payRecord],
          offers: offersMap,
        });
      } else {
        cur.payments.push(payRecord);
        if (ts > 0 && (ts < cur.firstTs || cur.firstTs === 0)) { cur.firstTs = ts; cur.firstSale = s; }
        if (ts > cur.latestTs) { cur.latestTs = ts; cur.latestSale = s; }
        if (recur > cur.maxRecurrency) cur.maxRecurrency = recur;

        // Update per-offer data
        const offerEntry = cur.offers.get(offerCode);
        if (!offerEntry) {
          cur.offers.set(offerCode, {
            offerCode, paymentMode, paymentType, paymentMethod,
            installmentsNumber: installments,
            maxRecurrency: recur,
            firstTs: ts, latestTs: ts,
            payments: [payRecord],
          });
        } else {
          offerEntry.payments.push(payRecord);
          if (ts > 0 && ts < offerEntry.firstTs) offerEntry.firstTs = ts;
          if (ts > offerEntry.latestTs) offerEntry.latestTs = ts;
          if (recur > offerEntry.maxRecurrency) offerEntry.maxRecurrency = recur;
          if (installments > offerEntry.installmentsNumber) offerEntry.installmentsNumber = installments;
        }
      }
    });

    const nowMs = Date.now();

    const students = Array.from(emailMap.entries()).map(([buyerEmail, agg]) => {
      const s        = agg.latestSale;
      const purchase = s.purchase || {};
      const buyerObj = typeof s.buyer === 'object' ? s.buyer : {};
      const buyerName = (buyerObj.name || (typeof s.buyer === 'string' ? s.buyer : '—')).trim();

      // Determine the PRIMARY offer for this student
      // Priority: most recent offer (by latestTs), or the subscription offer if any
      const allOffers = Array.from(agg.offers.values());
      const primaryOffer = allOffers.reduce((best, o) =>
        // prefer subscription offers, then most recently active
        (o.paymentMode === 'SUBSCRIPTION' && best.paymentMode !== 'SUBSCRIPTION')
          ? o
          : o.latestTs > best.latestTs ? o : best
        , allOffers[0]);

      // Determine payment mode from offer data
      // SUBSCRIPTION:      offer.payment_mode = SUBSCRIPTION
      // SMART_INSTALLMENT: UNIQUE_PAYMENT + maxRecurrency > 1 (multiple Hotmart charges)
      // CARD_INSTALLMENT:  UNIQUE_PAYMENT + installments > 1 + maxRecurrency = 1 (bank splits)
      // ONE_TIME:          UNIQUE_PAYMENT + installments = 1 + maxRecurrency = 1
      const isSub         = primaryOffer.paymentMode === 'SUBSCRIPTION';
      const inst          = primaryOffer.installmentsNumber;
      const maxRecur      = primaryOffer.maxRecurrency;
      const isSmartInstall = !isSub && maxRecur > 1;
      const isCardInstall  = !isSub && !isSmartInstall && inst > 1;
      // One-time: everything else

      const lastPayTs = primaryOffer.latestTs;
      const firstPayTs = primaryOffer.firstTs;

      // Subscription / Smart Installment health
      let subStatus: 'ACTIVE' | 'OVERDUE' | 'CANCELLED' = 'ACTIVE';
      if ((isSub || isSmartInstall) && lastPayTs) {
        const daysSince = (nowMs - lastPayTs) / (24 * 60 * 60 * 1000);
        if (daysSince > 65) subStatus = 'CANCELLED';
        else if (daysSince > 35) subStatus = 'OVERDUE';
      }
      // Smart installment: if all paid, mark as ACTIVE (no need for overdue check)
      if (isSmartInstall && maxRecur >= inst && inst > 1) subStatus = 'ACTIVE';

      // paymentHistory for this primary offer, sorted by date
      const sortedPayments = primaryOffer.payments
        .filter(p => p.date > 0)
        .sort((a, b) => a.date - b.date)
        .map((p, i) => ({ ...p, index: i + 1 }))
        .slice(-48);

      const valor    = getBRLValue(primaryOffer.payments[0] ? agg.firstSale?.purchase : purchase)
                    || primaryOffer.payments.reduce((s, p) => s || p.valor, 0);
      const currency = getCurrency(agg.firstSale?.purchase || purchase);
      const flag     = CURRENCY_TO_ISO[currency] || '';

      // Build human-readable payment method label
      const pm = primaryOffer.paymentMethod || primaryOffer.paymentType;
      let paymentLabel = 'Outro';
      if (pm.includes('VISA'))        paymentLabel = 'Cartão Visa';
      else if (pm.includes('MASTER')) paymentLabel = 'Cartão Mastercard';
      else if (pm.includes('ELO'))    paymentLabel = 'Cartão Elo';
      else if (pm.includes('AMEX'))   paymentLabel = 'Cartão Amex';
      else if (pm.includes('CREDIT_CARD')) paymentLabel = 'Cartão de Crédito';
      else if (pm.includes('DEBIT'))  paymentLabel = 'Cartão de Débito';
      else if (pm.includes('PIX'))    paymentLabel = 'Pix';
      else if (pm.includes('BILLET') || pm.includes('BOLETO')) paymentLabel = 'Boleto';
      else if (pm.includes('PAYPAL')) paymentLabel = 'PayPal';
      else if (pm.includes('WALLET')) paymentLabel = 'Carteira Digital';

      return {
        name:               buyerName.toUpperCase(),
        email:              buyerEmail,
        entryDate:          firstPayTs || null,
        lastPayDate:        lastPayTs || null,
        turma:              primaryOffer.offerCode,
        valor,
        currency,
        flag,
        transaction:        agg.firstSale?.purchase?.transaction || purchase.transaction || '',
        // Payment mode fields
        paymentType:        primaryOffer.paymentType,
        paymentMethod:      primaryOffer.paymentMethod,
        paymentLabel,                         // human-readable method
        offerCode:          primaryOffer.offerCode,
        paymentMode:        primaryOffer.paymentMode, // SUBSCRIPTION | UNIQUE_PAYMENT
        paymentInstallments: inst,
        paymentIsSub:       isSub,
        paymentIsSmartInstall: isSmartInstall,
        paymentIsCardInstall:  isCardInstall,
        paymentRecurrency:  maxRecur,
        subStatus,
        paymentHistory:     sortedPayments,
      };

    }).sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

    const result = {
      students,
      turmas: Array.from(turmasSet).sort(),
      total: students.length,
    };
    setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });

    return NextResponse.json(
      turma ? { ...result, students: students.filter(s => s.turma === turma) } : result
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
