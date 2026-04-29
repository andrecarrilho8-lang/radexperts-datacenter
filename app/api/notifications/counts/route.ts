import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getDb, ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

const APPROVED_STATUS = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const GRACE_15        = 15 * 24 * 60 * 60 * 1000; // 15 days grace for manual
const UPCOMING_DAYS   = 7;                          // show badge for next 7 days

/* ── same classifySub logic as overview API ─────────────────────────────── */
function classifySub(
  isSub: boolean, isSmartInstall: boolean,
  lastPayTs: number, maxRecur: number, inst: number,
  nowMs: number
): 'ACTIVE' | 'OVERDUE' | 'CANCELLED' {
  if (!isSub && !isSmartInstall) return 'ACTIVE';
  if (isSmartInstall && inst > 1 && maxRecur >= inst) return 'CANCELLED';
  if (!lastPayTs) return 'ACTIVE';
  const daysSince = (nowMs - lastPayTs) / 86_400_000;
  if (daysSince > 65) return 'CANCELLED';
  if (daysSince > 35) return 'OVERDUE';
  return 'ACTIVE';
}

export async function GET() {
  try {
    const nowMs      = Date.now();
    const windowEnd  = nowMs + UPCOMING_DAYS * 24 * 60 * 60 * 1000;

    /* ── 1. Hotmart overdue (from sales cache — no extra API call) ────────── */
    let hotmartOverdue = 0;
    let hotmartUpcoming = 0;

    try {
      const allSales = await getCachedAllSales();
      const approved = allSales.filter((s: any) => APPROVED_STATUS.has(s.purchase?.status));

      // Build subMap (same as overview)
      const subMap = new Map<string, {
        lastPayTs: number; isSub: boolean; isSmartInstall: boolean;
        maxRecurrency: number; installments: number;
      }>();

      for (const s of approved) {
        const email   = (s.buyer?.email || '').toLowerCase().trim();
        const product = s.product?.name || '—';
        if (!email || !product) continue;

        const ts    = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
        const mode  = (s.purchase?.offer?.payment_mode || 'UNIQUE_PAYMENT').toUpperCase();
        const recur = s.purchase?.recurrency_number || 1;
        const inst  = s.purchase?.payment?.installments_number || 1;
        const isSub = mode === 'SUBSCRIPTION';
        const isSmartInstall = !isSub && recur > 1;
        if (!isSub && !isSmartInstall) continue;

        const key = `${email}|${product}`;
        const cur = subMap.get(key);
        if (!cur) {
          subMap.set(key, { lastPayTs: ts, isSub, isSmartInstall, maxRecurrency: recur, installments: inst });
        } else {
          if (ts > cur.lastPayTs) cur.lastPayTs = ts;
          if (recur > cur.maxRecurrency) cur.maxRecurrency = recur;
          if (inst  > cur.installments)  cur.installments  = inst;
        }
      }

      for (const entry of subMap.values()) {
        const status = classifySub(
          entry.isSub, entry.isSmartInstall,
          entry.lastPayTs, entry.maxRecurrency, entry.installments, nowMs
        );
        if (status === 'OVERDUE') hotmartOverdue++;
      }
    } catch { /* sales cache may be unavailable */ }

    /* ── 2. Manual overdue + upcoming (from DB) ──────────────────────────── */
    let manualOverdue   = 0;
    let manualUpcoming  = 0;

    try {
      await ensureSchema();
      const db = getDb();
      const rows = await db`
        SELECT ms.installment_dates, ms.installments, ms.payment_type,
               bp.bp_proximo_pagamento, bp.bp_em_dia
        FROM manual_students ms
        LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
        WHERE COALESCE(ms.total_amount, 0) > 0
      ` as any[];

      for (const row of rows) {
        let instDates: any[] = [];
        try {
          const raw = typeof row.installment_dates === 'string'
            ? JSON.parse(row.installment_dates)
            : (row.installment_dates || []);
          if (Array.isArray(raw)) instDates = raw;
        } catch { /* ignore */ }

        if (instDates.length > 0) {
          const allPaid = instDates.every((d: any) => d.paid);
          if (allPaid) continue;

          const unpaid = instDates
            .filter((d: any) => !d.paid)
            .sort((a: any, b: any) => a.due_ms - b.due_ms);

          const next = unpaid[0];
          if (!next) continue;

          const due = Number(next.due_ms);
          if (due > nowMs && due <= windowEnd) {
            manualUpcoming++;
          } else if (due + GRACE_15 < nowMs) {
            manualOverdue++;
          }
        } else {
          // fallback: bp_proximo_pagamento
          const nextMs = (() => {
            const v = row.bp_proximo_pagamento;
            if (!v) return 0;
            const n = Number(v);
            if (!isNaN(n) && n > 1_000_000_000_000) return n;
            if (!isNaN(n) && n > 0) return n * 1000;
            const d = new Date(v);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          })();

          const emUp = (row.bp_em_dia || '').toUpperCase().trim();
          const isInadimplente = emUp === 'NÃO' || emUp === 'NAO' || emUp === 'INADIMPLENTE';

          if (nextMs > nowMs && nextMs <= windowEnd) {
            manualUpcoming++;
          } else if (isInadimplente && nextMs > 0 && nextMs <= nowMs) {
            manualOverdue++;
          }
        }
      }
    } catch { /* DB may be unavailable */ }

    const inadimplentes = hotmartOverdue  + manualOverdue;
    const proximos      = hotmartUpcoming + manualUpcoming;

    return NextResponse.json(
      { inadimplentes, proximos, total: inadimplentes + proximos },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );

  } catch (err: any) {
    return NextResponse.json(
      { inadimplentes: 0, proximos: 0, total: 0 },
      { status: 200 } // always return 200 so navbar never breaks
    );
  }
}
