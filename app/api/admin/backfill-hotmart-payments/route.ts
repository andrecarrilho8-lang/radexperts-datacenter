import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ACTIVE_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/**
 * POST /api/admin/backfill-hotmart-payments
 * Body: { courseName: string, dryRun?: boolean }
 *
 * For each manual_student whose email matches a Hotmart sale for the same course:
 *  - Updates manual_students payment fields: payment_type, total_amount,
 *    installment_amount, installments, installment_dates, entry_date
 *  - Upserts buyer_profiles: bp_valor, bp_pagamento, bp_parcela,
 *    bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia
 *
 * Does NOT touch: name, email, phone, notes, vendedor, currency, document.
 * Does NOT delete any records.
 *
 * With dryRun=true: returns preview only, no DB writes.
 */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const courseName: string = (body.courseName || '').trim();
  const dryRun: boolean = body.dryRun === true;

  if (!courseName) {
    return NextResponse.json({ error: 'courseName required' }, { status: 400 });
  }

  try {
    const sql = getDb();

    // ── 1. Load Hotmart salesCache ─────────────────────────────────────────
    const allSales = await getCachedAllSales();

    function slugify(name: string): string {
      return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
    }

    // Resolve exact or slug-matched course name
    const allProductNames = Array.from(
      new Set(allSales.map((s: any) => (s.product?.name || '').trim()).filter(Boolean))
    ) as string[];
    let resolvedName = courseName;
    if (!allProductNames.includes(courseName)) {
      const match = allProductNames.find(n => slugify(n) === slugify(courseName));
      if (match) resolvedName = match;
    }

    // Filter active sales for this course
    const courseSales = allSales.filter(
      (s: any) => ACTIVE_STATUSES.has(s.purchase?.status) &&
                  (s.product?.name || '').trim() === resolvedName
    );

    if (courseSales.length === 0) {
      return NextResponse.json({
        dryRun, matched: 0, unmatched: 0, updated: 0,
        warning: `No Hotmart sales found for course: "${resolvedName}"`,
      });
    }

    // ── 2. Group Hotmart data by buyer email ──────────────────────────────
    type PayRecord = { date: number; valor: number };
    type OfferAgg = {
      paymentMode: string; paymentType: string; paymentMethod: string;
      installmentsNumber: number; maxRecurrency: number;
      firstTs: number; latestTs: number;
      payments: PayRecord[];
    };
    type EmailAgg = {
      firstTs: number; latestTs: number; firstSale: any;
      offers: Map<string, OfferAgg>;
    };

    const hotmartMap = new Map<string, EmailAgg>();

    for (const s of courseSales) {
      const buyerEmail = (s.buyer?.email || '').toLowerCase().trim();
      if (!buyerEmail) continue;

      const ts       = s.purchase?.approved_date || s.purchase?.order_date || 0;
      const recur    = s.purchase?.recurrency_number || 1;
      const offerCode = s.purchase?.offer?.code || 'default';
      const payMode  = (s.purchase?.offer?.payment_mode || 'UNIQUE_PAYMENT').toUpperCase();
      const payType  = (s.purchase?.payment?.type || '').toUpperCase();
      const payMethod = (s.purchase?.payment?.method || payType).toUpperCase();
      const instNum  = s.purchase?.payment?.installments_number || 1;
      const valor    = s.purchase?.price?.value ?? 0;

      const cur = hotmartMap.get(buyerEmail);
      if (!cur) {
        const offers = new Map<string, OfferAgg>();
        offers.set(offerCode, {
          paymentMode: payMode, paymentType: payType, paymentMethod: payMethod,
          installmentsNumber: instNum, maxRecurrency: recur,
          firstTs: ts, latestTs: ts, payments: [{ date: ts, valor }],
        });
        hotmartMap.set(buyerEmail, { firstTs: ts, latestTs: ts, firstSale: s, offers });
      } else {
        if (ts > 0 && (ts < cur.firstTs || cur.firstTs === 0)) { cur.firstTs = ts; cur.firstSale = s; }
        if (ts > cur.latestTs) cur.latestTs = ts;
        const oe = cur.offers.get(offerCode);
        if (!oe) {
          cur.offers.set(offerCode, {
            paymentMode: payMode, paymentType: payType, paymentMethod: payMethod,
            installmentsNumber: instNum, maxRecurrency: recur,
            firstTs: ts, latestTs: ts, payments: [{ date: ts, valor }],
          });
        } else {
          oe.payments.push({ date: ts, valor });
          if (ts > 0 && ts < oe.firstTs) oe.firstTs = ts;
          if (ts > oe.latestTs)          oe.latestTs = ts;
          if (recur > oe.maxRecurrency)  oe.maxRecurrency = recur;
          if (instNum > oe.installmentsNumber) oe.installmentsNumber = instNum;
        }
      }
    }

    // ── 3. Load manual_students for this course ────────────────────────────
    const manualRows = (await sql`
      SELECT id, email, name, payment_type, total_amount, installments,
             installment_amount, installment_dates, entry_date
      FROM manual_students
      WHERE course_name = ${resolvedName}
    `) as any[];

    const nowMs = Date.now();
    const matched: string[] = [];
    const unmatched: string[] = [];
    const updates: Array<{ email: string; preview: any }> = [];

    for (const row of manualRows) {
      const email = (row.email || '').toLowerCase();
      const agg   = hotmartMap.get(email);

      if (!agg) {
        unmatched.push(email);
        continue;
      }

      matched.push(email);

      // Pick primary offer
      const allOffers = Array.from(agg.offers.values());
      const primary   = allOffers.reduce((best, o) =>
        (o.paymentMode === 'SUBSCRIPTION' && best.paymentMode !== 'SUBSCRIPTION')
          ? o : o.latestTs > best.latestTs ? o : best
        , allOffers[0]);

      const isSub          = primary.paymentMode === 'SUBSCRIPTION';
      const inst           = primary.installmentsNumber;
      const maxRecur       = primary.maxRecurrency;
      // Smart Installment = Hotmart charges monthly AND each charge is 1 of N installments.
      // Requires BOTH maxRecur > 1 (multiple charges) AND inst > 1 (installment plan).
      // If inst = 1 but maxRecur > 1 → it's a subscription/recurring charge, not smart installment.
      const isSmartInstall = !isSub && maxRecur > 1 && inst > 1;
      // It's subscription-like recurring payment when recurrency > 1 but installments = 1
      const isRecurring    = !isSub && maxRecur > 1 && inst <= 1;
      const isCardInstall  = !isSub && !isSmartInstall && !isRecurring && inst > 1;

      // Map Hotmart payment type → manual_students payment_type enum
      let dbPaymentType: string;
      const pm = primary.paymentMethod || primary.paymentType;
      if (isSub || isRecurring) {
        dbPaymentType = 'PIX_MENSAL'; // subscription/recurring → monthly
      } else if (pm.includes('PIX') || pm.includes('WALLET')) {
        dbPaymentType = 'PIX';
      } else if (pm.includes('BILLET') || pm.includes('BOLETO')) {
        dbPaymentType = 'PIX'; // boleto treated as one-time
      } else {
        // Credit card — use CREDIT_CARD for bank installments, PIX_CARTAO for smart install
        dbPaymentType = isSmartInstall ? 'PIX_CARTAO' : 'CREDIT_CARD';
      }

      // Sorted payments → installment_dates
      const sortedPay = primary.payments
        .filter(p => p.date > 0)
        .sort((a, b) => a.date - b.date);

      const firstDate  = sortedPay[0]?.date  ?? agg.firstTs ?? nowMs;
      const lastDate   = sortedPay[sortedPay.length - 1]?.date ?? agg.latestTs ?? nowMs;
      const valorParc  = sortedPay[0]?.valor ?? agg.firstSale?.purchase?.price?.value ?? 0;

      // Total contract value
      // - Smart install: parcela × total installments
      // - Card install: the single authorized amount (already the total)
      // - Recurring/sub: value of the most recent charge (each charge is independent)
      // - PIX/boleto: single payment value
      const dbTotalAmount = isSmartInstall
        ? valorParc * inst
        : (isRecurring || isSub)
          ? sortedPay[sortedPay.length - 1]?.valor ?? valorParc  // last charge
          : valorParc;

      // Build installment_dates from actual payment history
      const dbInstallmentDates = sortedPay.map(p => ({
        due_ms:  p.date,
        paid:    true,
        paid_ms: p.date,
      }));

      // If smart-installment: add remaining unpaid slots
      if (isSmartInstall && maxRecur < inst) {
        for (let i = maxRecur; i < inst; i++) {
          const d = new Date(lastDate);
          d.setMonth(d.getMonth() + (i - maxRecur + 1));
          dbInstallmentDates.push({ due_ms: d.getTime(), paid: false, paid_ms: null as any });
        }
      }

      // Human-readable payment label (for buyer_profiles)
      let bpPagamento = 'Outro';
      if (isSub)               bpPagamento = 'Assinatura Mensal';
      else if (isRecurring)    bpPagamento = `Recorrência${maxRecur > 1 ? ` (${maxRecur}× cobranças)` : ''}`;
      else if (isSmartInstall) bpPagamento = `Parcelamento Inteligente ${inst}×`;
      else if (pm.includes('PIX') || pm.includes('WALLET')) bpPagamento = 'PIX';
      else if (pm.includes('BILLET') || pm.includes('BOLETO')) bpPagamento = 'Boleto';
      else if (isCardInstall) {
        if (pm.includes('VISA'))        bpPagamento = `Cartão Visa ${inst}×`;
        else if (pm.includes('MASTER')) bpPagamento = `Cartão Mastercard ${inst}×`;
        else if (pm.includes('ELO'))    bpPagamento = `Cartão Elo ${inst}×`;
        else                            bpPagamento = `Cartão de Crédito ${inst}×`;
      } else if (pm.includes('CREDIT_CARD')) bpPagamento = 'Cartão de Crédito';

      // bp_em_dia
      const daysSinceLastPay = (nowMs - lastDate) / 86_400_000;
      let bpEmDia: string;
      if (isSub || isRecurring) {
        bpEmDia = daysSinceLastPay > 65 ? 'QUITADO' : daysSinceLastPay > 35 ? 'NÃO' : 'SIM';
      } else if (isSmartInstall) {
        bpEmDia = maxRecur >= inst && inst > 1 ? 'QUITADO'
                  : daysSinceLastPay > 65 ? 'QUITADO'
                  : daysSinceLastPay > 35 ? 'NÃO' : 'SIM';
      } else {
        bpEmDia = 'QUITADO'; // one-time / card installment = fully paid
      }

      // Próximo pagamento
      let proximoPagamento: number | null = null;
      if ((isSub || isSmartInstall) && lastDate && bpEmDia !== 'QUITADO') {
        const d = new Date(lastDate);
        d.setMonth(d.getMonth() + 1);
        proximoPagamento = d.getTime();
      }

      const preview = {
        email,
        name: row.name,
        dbPaymentType,
        dbTotalAmount,
        installmentAmount: valorParc,
        installments: inst,
        entryDate: firstDate,
        installmentDatesCount: dbInstallmentDates.length,
        bpPagamento, bpEmDia,
        bpValor: dbTotalAmount,
        bpParcela: valorParc,
        bpPrimeiraParcela: firstDate,
        bpUltimoPagamento: lastDate,
        bpProximoPagamento: proximoPagamento,
      };
      updates.push({ email, preview });

      if (!dryRun) {
        // ── UPDATE manual_students payment fields ──────────────────────────
        await sql`
          UPDATE manual_students SET
            payment_type        = ${dbPaymentType},
            total_amount        = ${dbTotalAmount},
            installment_amount  = ${valorParc},
            installments        = ${inst},
            installment_dates   = ${JSON.stringify(dbInstallmentDates)},
            entry_date          = ${firstDate},
            updated_at          = ${nowMs}
          WHERE id = ${row.id}
        `;

        // ── UPSERT buyer_profiles financial fields ─────────────────────────
        await sql`
          INSERT INTO buyer_profiles (
            email,
            bp_valor, bp_pagamento, bp_parcela,
            bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento,
            bp_em_dia,
            purchase_count, created_at, updated_at
          ) VALUES (
            ${email},
            ${dbTotalAmount}, ${bpPagamento}, ${valorParc},
            ${firstDate}, ${lastDate}, ${proximoPagamento},
            ${bpEmDia},
            1, ${nowMs}, ${nowMs}
          )
          ON CONFLICT (email) DO UPDATE SET
            bp_valor             = ${dbTotalAmount},
            bp_pagamento         = ${bpPagamento},
            bp_parcela           = ${valorParc},
            bp_primeira_parcela  = ${firstDate},
            bp_ultimo_pagamento  = ${lastDate},
            bp_proximo_pagamento = ${proximoPagamento},
            bp_em_dia            = ${bpEmDia},
            updated_at           = ${nowMs}
        `;
      }
    }

    return NextResponse.json({
      dryRun,
      courseName: resolvedName,
      hotmartStudents: hotmartMap.size,
      manualStudents:  manualRows.length,
      matched:   matched.length,
      unmatched: unmatched.length,
      updated:   dryRun ? 0 : updates.length,
      // Sample preview (first 10)
      sample: updates.slice(0, 10).map(u => u.preview),
      unmatchedEmails: unmatched,
    });

  } catch (e: any) {
    console.error('[backfill-hotmart-payments]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
