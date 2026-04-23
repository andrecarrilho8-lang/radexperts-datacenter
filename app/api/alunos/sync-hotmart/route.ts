import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { fetchActiveSubscriptionsByProduct } from '@/app/lib/hotmartApi';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ACTIVE_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/alunos/sync-hotmart
   Body: { courseName: string, emails?: string[] }

   For all Hotmart students of a course (or a subset via emails[]):
   - Computes payment info from the sales cache (value, installments, dates, status)
   - Upserts buyer_profiles with bp_valor, bp_pagamento, bp_parcela,
     bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento, bp_em_dia

   Does NOT overwrite vendedor, bp_modelo, notes, phone, document (those are
   user-managed fields — we only fill in Hotmart-derived financial data).
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const courseName: string = (body.courseName || '').trim();
  const emailFilter: string[] | undefined = body.emails?.map((e: string) => e.toLowerCase().trim());

  if (!courseName) {
    return NextResponse.json({ error: 'courseName required' }, { status: 400 });
  }

  try {
    await ensureWebhookSchema();
    const sql = getDb();

    // ── 1. Load sales from cache ────────────────────────────────────────────
    const [allSales, activeSubsMap] = await Promise.all([
      getCachedAllSales(),
      fetchActiveSubscriptionsByProduct().catch(() => new Map<string, Set<string>>()),
    ]);

    // ── 2. Resolve course name (slug-tolerant) ──────────────────────────────
    function slugify(name: string): string {
      return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
    }
    const allProductNames = Array.from(
      new Set(allSales.map((s: any) => (s.product?.name || '').trim()).filter(Boolean))
    ) as string[];
    let resolvedName = courseName;
    if (!allProductNames.includes(courseName)) {
      const match = allProductNames.find(n => slugify(n) === slugify(courseName));
      if (match) resolvedName = match;
    }

    // ── 3. Filter sales for this course ────────────────────────────────────
    const courseSales = allSales.filter(
      (s: any) => ACTIVE_STATUSES.has(s.purchase?.status) &&
                  (s.product?.name || '').trim() === resolvedName
    );

    if (courseSales.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, errors: [], warning: 'No sales found for this course' });
    }

    // ── 4. Group by buyer email — same logic as /api/cursos/[courseName] ───
    type OfferAgg = {
      offerCode: string;
      paymentMode: string;
      paymentType: string;
      paymentMethod: string;
      installmentsNumber: number;
      maxRecurrency: number;
      firstTs: number;
      latestTs: number;
      payments: Array<{ date: number; valor: number }>;
    };
    type EmailAgg = {
      firstTs: number;
      latestTs: number;
      firstSale: any;
      latestSale: any;
      offers: Map<string, OfferAgg>;
    };

    const emailMap = new Map<string, EmailAgg>();

    for (const s of courseSales) {
      const buyerEmail = (s.buyer?.email || '').toLowerCase().trim();
      if (!buyerEmail) continue;
      if (emailFilter && !emailFilter.includes(buyerEmail)) continue;

      const ts         = s.purchase?.approved_date || s.purchase?.order_date || 0;
      const recur      = s.purchase?.recurrency_number || 1;
      const offerCode  = s.purchase?.offer?.code || 'default';
      const payMode    = (s.purchase?.offer?.payment_mode || 'UNIQUE_PAYMENT').toUpperCase();
      const payType    = (s.purchase?.payment?.type || '').toUpperCase();
      const payMethod  = (s.purchase?.payment?.method || payType).toUpperCase();
      const instNum    = s.purchase?.payment?.installments_number || 1;
      const valor      = s.purchase?.price?.value ?? 0;
      const payRecord  = { date: ts, valor };

      const cur = emailMap.get(buyerEmail);
      if (!cur) {
        const offers = new Map<string, OfferAgg>();
        offers.set(offerCode, {
          offerCode, paymentMode: payMode, paymentType: payType, paymentMethod: payMethod,
          installmentsNumber: instNum, maxRecurrency: recur,
          firstTs: ts, latestTs: ts, payments: [payRecord],
        });
        emailMap.set(buyerEmail, { firstTs: ts, latestTs: ts, firstSale: s, latestSale: s, offers });
      } else {
        if (ts > 0 && (ts < cur.firstTs || cur.firstTs === 0)) { cur.firstTs = ts; cur.firstSale = s; }
        if (ts > cur.latestTs) { cur.latestTs = ts; cur.latestSale = s; }
        const oe = cur.offers.get(offerCode);
        if (!oe) {
          cur.offers.set(offerCode, {
            offerCode, paymentMode: payMode, paymentType: payType, paymentMethod: payMethod,
            installmentsNumber: instNum, maxRecurrency: recur,
            firstTs: ts, latestTs: ts, payments: [payRecord],
          });
        } else {
          oe.payments.push(payRecord);
          if (ts > 0 && ts < oe.firstTs) oe.firstTs = ts;
          if (ts > oe.latestTs)          oe.latestTs = ts;
          if (recur > oe.maxRecurrency)  oe.maxRecurrency = recur;
          if (instNum > oe.installmentsNumber) oe.installmentsNumber = instNum;
        }
      }
    }

    // Active subs by product — to determine ADIMPLENTE for subscription students
    const activeSubEmails = new Set<string>();
    for (const [productName, emailSet] of activeSubsMap.entries()) {
      if (slugify(productName) === slugify(resolvedName) || productName.trim() === resolvedName) {
        for (const e of emailSet) activeSubEmails.add(e.toLowerCase());
      }
    }

    // ── 5. Build buyer_profile rows and upsert ──────────────────────────────
    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];
    const nowMs = Date.now();

    for (const [buyerEmail, agg] of emailMap.entries()) {
      try {
        // Pick primary offer (prefer subscription, then most recently active)
        const allOffers = Array.from(agg.offers.values());
        const primary = allOffers.reduce((best, o) =>
          (o.paymentMode === 'SUBSCRIPTION' && best.paymentMode !== 'SUBSCRIPTION')
            ? o : o.latestTs > best.latestTs ? o : best
          , allOffers[0]);

        const isSub          = primary.paymentMode === 'SUBSCRIPTION';
        const inst           = primary.installmentsNumber;
        const maxRecur       = primary.maxRecurrency;
        const isSmartInstall = !isSub && maxRecur > 1;
        const isCardInstall  = !isSub && !isSmartInstall && inst > 1;

        // Payment label
        const pm = primary.paymentMethod || primary.paymentType;
        let pagamento = 'Outro';
        if (isSub) {
          pagamento = 'Assinatura Mensal';
        } else if (isSmartInstall) {
          pagamento = `Parcelamento Inteligente ${inst}×`;
        } else if (isCardInstall) {
          if (pm.includes('VISA'))        pagamento = `Cartão Visa ${inst}×`;
          else if (pm.includes('MASTER')) pagamento = `Cartão Mastercard ${inst}×`;
          else if (pm.includes('ELO'))    pagamento = `Cartão Elo ${inst}×`;
          else                            pagamento = `Cartão de Crédito ${inst}×`;
        } else if (pm.includes('PIX'))   { pagamento = 'PIX'; }
        else if (pm.includes('BILLET') || pm.includes('BOLETO')) { pagamento = 'Boleto'; }
        else if (pm.includes('CREDIT_CARD')) { pagamento = 'Cartão de Crédito'; }

        // Sorted payments → first/last dates + individual installment value
        const sortedPay = primary.payments
          .filter(p => p.date > 0)
          .sort((a, b) => a.date - b.date);

        const primeiraParcela  = sortedPay[0]?.date ?? null;
        const ultimoPagamento  = sortedPay[sortedPay.length - 1]?.date ?? null;
        const valorParcela     = sortedPay[0]?.valor ?? agg.firstSale?.purchase?.price?.value ?? 0;

        // Total contract value
        let bpValor: number;
        if (isSmartInstall) {
          bpValor = valorParcela * inst;
        } else if (isCardInstall) {
          bpValor = valorParcela; // Hotmart received full gross amount as single transaction
        } else if (isSub) {
          bpValor = valorParcela; // monthly — valor = monthly amount
        } else {
          bpValor = valorParcela; // one-time PIX/boleto
        }

        // Próximo pagamento estimate (for subscriptions/smart-installments)
        let proximoPagamento: number | null = null;
        if ((isSub || isSmartInstall) && ultimoPagamento) {
          const d = new Date(ultimoPagamento);
          d.setMonth(d.getMonth() + 1);
          proximoPagamento = d.getTime();
        }

        // bp_em_dia
        let bpEmDia: string;
        if (isSub) {
          const isActive = activeSubEmails.has(buyerEmail);
          if (isActive) {
            bpEmDia = 'SIM';
          } else {
            // Check last payment recency
            const daysSince = ultimoPagamento ? (nowMs - ultimoPagamento) / 86_400_000 : 999;
            bpEmDia = daysSince > 65 ? 'QUITADO' : daysSince > 35 ? 'NÃO' : 'SIM';
          }
        } else if (isSmartInstall) {
          if (maxRecur >= inst && inst > 1) {
            bpEmDia = 'QUITADO';
          } else {
            const daysSince = ultimoPagamento ? (nowMs - ultimoPagamento) / 86_400_000 : 999;
            bpEmDia = daysSince > 65 ? 'QUITADO' : daysSince > 35 ? 'NÃO' : 'SIM';
          }
        } else {
          // One-time or card installment = fully paid from Hotmart's perspective
          bpEmDia = 'QUITADO';
        }

        // UPSERT — only overwrite financial/payment fields; preserve user fields (vendedor, modelo, notes, phone, document)
        await sql`
          INSERT INTO buyer_profiles (
            email,
            bp_valor, bp_pagamento, bp_parcela,
            bp_primeira_parcela, bp_ultimo_pagamento, bp_proximo_pagamento,
            bp_em_dia,
            purchase_count, created_at, updated_at
          ) VALUES (
            ${buyerEmail},
            ${bpValor || null}, ${pagamento}, ${valorParcela || null},
            ${primeiraParcela}, ${ultimoPagamento}, ${proximoPagamento},
            ${bpEmDia},
            1, ${nowMs}, ${nowMs}
          )
          ON CONFLICT (email) DO UPDATE SET
            bp_valor             = ${bpValor || null},
            bp_pagamento         = ${pagamento},
            bp_parcela           = ${valorParcela || null},
            bp_primeira_parcela  = ${primeiraParcela},
            bp_ultimo_pagamento  = ${ultimoPagamento},
            bp_proximo_pagamento = ${proximoPagamento},
            bp_em_dia            = ${bpEmDia},
            updated_at           = ${nowMs}
        `;
        synced++;
      } catch (e: any) {
        errors.push(`${buyerEmail}: ${e.message}`);
      }
    }

    skipped = (emailFilter?.length ?? 0) > 0
      ? Math.max(0, (emailFilter?.length ?? 0) - synced)
      : 0;

    return NextResponse.json({
      synced,
      skipped,
      total: emailMap.size,
      courseName: resolvedName,
      errors: errors.slice(0, 20), // cap for response size
    });

  } catch (e: any) {
    console.error('[sync-hotmart]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
