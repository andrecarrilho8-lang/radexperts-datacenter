import { NextRequest, NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

// Currency → country flag emoji
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  BRL: 'BR', USD: 'US', EUR: 'EU', COP: 'CO', MXN: 'MX',
  ARS: 'AR', PEN: 'PE', CLP: 'CL', PYG: 'PY', BOB: 'BO',
  UYU: 'UY', VES: 'VE', CRC: 'CR', DOP: 'DO', GTQ: 'GT',
  HNL: 'HN', NIO: 'NI', PAB: 'PA', GBP: 'GB', CAD: 'CA',
};
function countryFlag(currencyCode: string): string {
  const cc = CURRENCY_TO_COUNTRY[currencyCode.toUpperCase()] || '';
  if (!cc || cc === 'EU') return cc === 'EU' ? '🇪🇺' : '';
  return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Returns BRL value from Hotmart purchase.
 * Hotmart stores `actual_value` = value already converted to BRL (producer's currency).
 * Falls back to `value` if not present (BRL-only sales usually only have `value`).
 */
function getBRLValue(purchase: any): number {
  return purchase?.price?.actual_value ?? purchase?.price?.value ?? 0;
}
function getFlag(purchase: any): string {
  const currency = (purchase?.price?.currency_code || 'BRL').toUpperCase();
  return countryFlag(currency);
}


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseName: string }> }
) {
  const { courseName: rawParam } = await params;
  const { searchParams } = new URL(req.url);
  const courseName = decodeURIComponent(rawParam);
  const turma      = searchParams.get('turma') || '';

  const CACHE_KEY = `curso_v7_${courseName}`;
  const hit = getCache(CACHE_KEY);
  if (hit?.expires_at > Date.now()) {
    const result = hit.data;
    return NextResponse.json(
      turma ? { ...result, students: result.students.filter((s: any) => s.turma === turma) } : result
    );
  }

  try {
    // ── Shared global cache — NO extra fetch ──────────────────────────────
    const sales = await getCachedAllSales();

    // Filter to this course only
    const filtered = sales.filter((s: any) =>
      APPROVED.has(s.purchase?.status) && (s.product?.name || '') === courseName
    );

    // Collect turmas
    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || '';
      if (t) turmasSet.add(t);
    });

    // Aggregate per email: ALL payments counted (so subscription recurrency is accurate)
    type Agg = {
      latestTs: number; latestSale: any;
      maxRecurrency: number; isSub: boolean;
      totalInstallments: number;
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

      const cur = emailMap.get(buyerEmail);
      if (!cur) {
        emailMap.set(buyerEmail, {
          latestTs: ts, latestSale: s, maxRecurrency: recur, isSub,
          totalInstallments: install,
          payments: [{ date: ts, valor: brlVal, recurrencyNumber: recur }],
        });
      } else {
        cur.payments.push({ date: ts, valor: brlVal, recurrencyNumber: recur });
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

      const payType = (purchase.payment?.type || '').toUpperCase();
      const isSub   = agg.isSub;
      const install = agg.totalInstallments;
      const maxRecur = agg.maxRecurrency;
      const lastPayTs = agg.latestTs;

      // Status for subscriptions
      let subStatus: 'ACTIVE' | 'OVERDUE' | 'CANCELLED' = 'ACTIVE';
      if (isSub && lastPayTs) {
        const daysSince = (nowMs - lastPayTs) / (24 * 60 * 60 * 1000);
        if (daysSince > 65) subStatus = 'CANCELLED';
        else if (daysSince > 35) subStatus = 'OVERDUE';
      }

      const vi     = { value: getBRLValue(purchase), flag: getFlag(purchase) };

      return {
        name:               buyerName.toUpperCase(),
        email:              buyerEmail,
        entryDate:          purchase.approved_date || purchase.order_date || null,
        lastPayDate:        lastPayTs || null,
        turma:              purchase.offer?.code || '—',
        valor:              vi.value,
        currency:           'BRL',
        flag:               vi.flag,
        transaction:        purchase.transaction || '',
        paymentType:        payType,
        paymentInstallments: install,
        paymentIsSub:       isSub,
        paymentRecurrency:  maxRecur,
        subStatus,
        paymentHistory: agg.payments
          .filter(p => p.date > 0)
          .sort((a, b) => a.date - b.date)
          .map((p, i) => ({ ...p, index: i + 1 })) // add 1-based index for "Parcela N"
          .slice(-24),
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
