'use client';

import React, { useState, useEffect, use } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import * as XLSX from 'xlsx';
import { resolveCourseName } from '@/app/lib/slug';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';
const GREEN  = '#4ade80';
const TEAL   = '#38bdf8';

function emailToId(email: string): string {
  return btoa((email || '').toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Flag image — exactly how Hotmart page does it ─────────────────────────────
const CURRENCY_TO_ISO: Record<string, string> = {
  BRL: 'br', USD: 'us', EUR: 'eu', COP: 'co', MXN: 'mx',
  ARS: 'ar', PEN: 'pe', CLP: 'cl', PYG: 'py', BOB: 'bo',
  UYU: 'uy', VES: 've', CRC: 'cr', DOP: 'do', GTQ: 'gt',
  HNL: 'hn', NIO: 'ni', PAB: 'pa', GBP: 'gb', CAD: 'ca',
};
function getFlagImg(iso: string, size = 18) {
  if (!iso) return null;
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/flags/4x3/${iso.toLowerCase()}.svg`}
      width={size} height={Math.round(size * 0.75)}
      alt={iso.toUpperCase()}
      style={{ borderRadius: 3, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    />
  );
}
// Direct flag from ISO code (stored in s.flag by backend)
// s.flag is 'br','co','ar','' etc — empty string = unknown = no flag
function getStudentFlag(flag: string, size = 18) {
  if (!flag) return null;
  return getFlagImg(flag, size);
}

// ── Manual student type (from DB) ───────────────────────────────────────────
type InstallmentDate = { due_ms: number; paid: boolean; paid_ms: number | null };
type ManualStudent = {
  id: string;
  course_name: string;
  name: string;
  email: string;
  phone: string;
  entry_date: number;
  payment_type: 'PIX' | 'CREDIT_CARD';
  total_amount: number;
  installments: number;
  installment_amount: number;
  installment_dates: InstallmentDate[];
  notes: string;
  created_at: number;

  bp_em_dia?:             string | null;
  bp_proximo_pagamento?:  string | number | null;
};

// ── Types ─────────────────────────────────────────────────────────────────────
type SubStatus = 'ACTIVE' | 'OVERDUE' | 'CANCELLED';
type PayHist   = { date: number; valor: number; recurrencyNumber: number; index: number };
type Student   = {
  name: string; email: string;
  entryDate: number | null; lastPayDate: number | null;
  turma: string; valor: number; valorBRL: number | null; currency: string; flag: string; transaction: string;
  phone?: string;
  source?: 'hotmart' | 'manual';
  manualId?: string;
  manualInstallments?: InstallmentDate[];
  // Payment fields
  paymentType: string;
  paymentMethod: string;
  paymentLabel: string;
  offerCode: string;
  paymentMode: string;
  paymentInstallments: number;
  paymentIsSub: boolean;
  paymentIsSmartInstall: boolean;
  paymentIsCardInstall: boolean;
  paymentRecurrency: number;
  subStatus: SubStatus;
  paymentHistory: PayHist[];

  bpEmDia?:            string;  // from buyer_profiles JOIN (status calc server-side)
  bpProximoPagamento?: number;  // epoch ms
};

// ── Glossy table style ────────────────────────────────────────────────────────
const TABLE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(0,22,55,0.96) 0%, rgba(0,15,40,0.93) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 20px 40px -8px rgba(0,0,0,0.55)',
  borderRadius: 24,
  // NOTE: no backdropFilter here — it creates a stacking context that traps fixed-position children
};
const HEADER_STYLE: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.07) 0%, rgba(180,195,220,0.05) 100%)',
  borderBottom: '1px solid rgba(255,255,255,0.09)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMoney(val: number): string {
  if (!val) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
// For LATAM: show value in original currency when not BRL
function fmtMoneyByCurrency(val: number, currency: string): string {
  if (!val || val === 0) return '—';
  const cur = (currency || 'BRL').toUpperCase();
  if (cur === 'BRL') {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  }
  try {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: cur, minimumFractionDigits: 2 });
  } catch {
    return `${cur} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
}
function daysSince(ts: number | null): number {
  return ts ? Math.floor((Date.now() - ts) / 86_400_000) : 9999;
}
function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

// ── Payment Status ─────────────────────────────────────────────────────────────
// Simple logic: ADIMPLENTE | INADIMPLENTE | QUITADO
type PayStatus = 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO';

function getPayStatus(s: Student): PayStatus {
  // 0. Manual-only student (no Hotmart history) → base = ADIMPLENTE so bp_em_dia controls it
  if ((s as any).source === 'manual' && s.paymentHistory.length === 0) return 'ADIMPLENTE';
  // 1. ONE_TIME (PIX, Boleto, card à vista) → QUITADO
  if (!s.paymentIsSub && !s.paymentIsSmartInstall && s.paymentInstallments <= 1) return 'QUITADO';
  // 2. Standard bank card installments → QUITADO (Hotmart received full amount, bank splits)
  if (s.paymentIsCardInstall) return 'QUITADO';
  // 3. Smart Installments: track actual paid vs total
  if (s.paymentIsSmartInstall) {
    if (s.paymentHistory.length >= s.paymentInstallments && s.paymentInstallments > 1) return 'QUITADO';
    if (s.subStatus === 'OVERDUE')   return 'INADIMPLENTE';
    if (s.subStatus === 'CANCELLED') return 'QUITADO';
    return 'ADIMPLENTE';
  }
  // 4. Subscription
  if (s.subStatus === 'ACTIVE')    return 'ADIMPLENTE';
  if (s.subStatus === 'OVERDUE')   return 'INADIMPLENTE';
  if (s.subStatus === 'CANCELLED') return 'QUITADO';
  return 'ADIMPLENTE';
}
function PaymentCell({ s, statusOverride }: { s: Student; statusOverride?: 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO' }) {
  const status = statusOverride ?? getPayStatus(s);
  const days   = daysSince(s.lastPayDate);
  const inst   = s.paymentInstallments;
  const paid   = s.paymentHistory.length;
  const method = s.paymentLabel || s.paymentType || 'Outro';

  const showProgress = s.paymentIsSmartInstall && inst > 1;
  const paidSoFar    = showProgress ? Math.min(paid, inst) : 0;
  const leftover     = inst - paidSoFar;

  const modeInfo = s.paymentIsSub
    ? `Assinatura · Ciclo ${s.paymentRecurrency}`
    : s.paymentIsSmartInstall
      ? `Parcelamento · ${paid}/${inst}`
      : s.paymentIsCardInstall
        ? `${method} · ${inst}× (banco)`
        : method;

  if (status === 'INADIMPLENTE') return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider w-fit animate-pulse"
        style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}>
        <span className="material-symbols-outlined text-[12px]">warning</span>
        Inadimplente
      </span>
      <span className="text-[10px]" style={{ color: '#fbbf24' }}>{days} dias sem pagamento</span>
      <span className="text-[9px] uppercase tracking-wider" style={{ color: SILVER }}>{modeInfo}</span>
    </div>
  );

  if (status === 'QUITADO') return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider w-fit"
        style={{ background: 'rgba(74,222,128,0.14)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', boxShadow: '0 0 10px rgba(74,222,128,0.1)' }}>
        <span className="material-symbols-outlined text-[12px]">verified</span>
        {s.paymentIsSub && s.subStatus === 'CANCELLED' ? 'Encerrado' : 'Quitado'}
      </span>
      <span className="text-[9px] uppercase tracking-wider" style={{ color: SILVER }}>
        {s.paymentIsSmartInstall ? `${inst}/${inst} parcelas` : s.paymentIsCardInstall ? `${method} · ${inst}×` : method}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider w-fit"
        style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: '#38bdf8' }} />
        Adimplente
      </span>
      {showProgress ? (
        <div className="flex flex-col gap-1" style={{ maxWidth: 200, overflow: 'hidden' }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${(paidSoFar / inst) * 100}%`, background: `linear-gradient(90deg, ${GOLD}, #f59e0b)` }} />
            </div>
            <span className="text-[10px] font-black flex-shrink-0" style={{ color: GOLD }}>{paidSoFar}/{inst}</span>
          </div>
          <span className="text-[9px]" style={{ color: SILVER }}>{leftover} parcela{leftover !== 1 ? 's' : ''} restante{leftover !== 1 ? 's' : ''}</span>
        </div>
      ) : (
        <span className="text-[9px] uppercase tracking-wider" style={{ color: SILVER }}>{modeInfo}</span>
      )}
    </div>
  );
}


// ── Tooltip ─────────────────────────────────────────────────────
function NameTooltip({ s, onHoverIn, onHoverOut }: {
  s: Student;
  onHoverIn: () => void;
  onHoverOut: () => void;
}) {
  const isManual = (s as any).source === 'manual';

  // ── Manual student path ────────────────────────────────────────
  if (isManual) {
    const dates     = ((s as any).manualInstallments || []) as InstallmentDate[];
    const paidDates = dates.filter((d: InstallmentDate) => d.paid);
    const pendDates = dates.filter((d: InstallmentDate) => !d.paid);
    const instAmt   = s.valor || 0;
    const totalAmt  = s.valorBRL || instAmt || 0;
    const pt        = (s as any).paymentType || 'PIX';
    const isPix     = pt === 'PIX' || pt === 'PIX_AVISTA';
    const isPxCard  = pt === 'PIX_CARTAO';
    const isMensal  = pt === 'PIX_MENSAL';
    const insts     = (s as any).paymentInstallments || 1;
    const sc = s.bpEmDia != null
      ? (String(s.bpEmDia).toLowerCase().startsWith('inadim') ? '#f87171' :
         String(s.bpEmDia).toLowerCase().startsWith('quit')   ? '#4ade80' : '#38bdf8')
      : '#38bdf8';
    const sl = s.bpEmDia != null
      ? (String(s.bpEmDia).toLowerCase().startsWith('inadim') ? 'Inadimplente' :
         String(s.bpEmDia).toLowerCase().startsWith('quit')   ? 'Quitado' : 'Adimplente')
      : 'Manual';
    const modeLabel = isPix ? 'PIX à Vista' : isPxCard ? `PIX + Cartão ${insts}×` : isMensal ? `PIX Mensal ${insts}×` : `Cartão ${insts}×`;
    return (
      <div id="name-tooltip" onMouseEnter={onHoverIn} onMouseLeave={onHoverOut}
        style={{ position: 'fixed', left: -9999, top: -9999, zIndex: 2147483647, width: 300,
          background: 'linear-gradient(160deg, rgba(0,22,55,0.99) 0%, rgba(0,15,40,0.97) 100%)',
          border: '1px solid rgba(74,222,128,0.22)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 32px 64px rgba(0,0,0,0.85)',
          borderRadius: 18, backdropFilter: 'blur(32px)', pointerEvents: 'auto' }}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
              style={{ background: `${sc}20`, color: sc, border: `1px solid ${sc}40` }}>{sl}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(74,222,128,0.1)', color: GREEN, border: '1px solid rgba(74,222,128,0.25)' }}>MANUAL</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: SILVER }}>{s.email}</p>
          <p className="text-[9px] mt-0.5 font-bold" style={{ color: GOLD }}>{modeLabel}</p>
        </div>
        <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex justify-between items-center">
            <span className="text-[10px]" style={{ color: SILVER }}>Valor Total</span>
            <span className="text-[12px] font-black" style={{ color: GOLD }}>{fmtMoneyByCurrency(totalAmt, s.currency)}</span>
          </div>
          {!isPix && <div className="flex justify-between items-center mt-1">
            <span className="text-[10px]" style={{ color: SILVER }}>Valor/Parcela</span>
            <span className="text-[11px] font-bold text-white">{fmtMoneyByCurrency(instAmt, s.currency)}</span>
          </div>}
          {!isPix && <div className="flex justify-between items-center mt-1">
            <span className="text-[10px]" style={{ color: SILVER }}>Pagas / Total</span>
            <span className="text-[11px] font-bold" style={{ color: GREEN }}>{paidDates.length} / {insts}</span>
          </div>}
        </div>
        {paidDates.length > 0 && (
          <div className="px-5 py-3" style={{ borderBottom: pendDates.length > 0 ? '1px solid rgba(255,255,255,0.07)' : undefined, maxHeight: 200, overflowY: 'auto' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>✓ Já Pagou ({paidDates.length})</p>
            {paidDates.map((d: InstallmentDate, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5"
                style={{ borderBottom: i < paidDates.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#4ade80' }} />
                  <div>
                    <p className="text-[10px] font-black text-white">{isPix ? 'À Vista' : `Parcela ${i + 1}/${insts}`}</p>
                    <p className="text-[9px]" style={{ color: SILVER }}>{fmtDate(d.paid_ms ?? d.due_ms)}</p>
                  </div>
                </div>
                <span className="text-[10px] font-black" style={{ color: '#4ade80' }}>{fmtMoneyByCurrency(isPix ? totalAmt : instAmt, s.currency)}</span>
              </div>
            ))}
          </div>
        )}
        {pendDates.length > 0 && (
          <div className="px-5 py-3" style={{ maxHeight: 160, overflowY: 'auto' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>◷ Falta Pagar ({pendDates.length})</p>
            {pendDates.slice(0, 5).map((d: InstallmentDate, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5"
                style={{ borderBottom: i < Math.min(pendDates.length, 5) - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: GOLD }} />
                  <span className="text-[9px] font-bold text-white">{fmtDate(d.due_ms)}</span>
                </div>
                <span className="text-[10px] font-bold" style={{ color: GOLD }}>{fmtMoneyByCurrency(instAmt, s.currency)}</span>
              </div>
            ))}
            {pendDates.length > 5 && <p className="text-[9px] mt-2" style={{ color: SILVER }}>+ {pendDates.length - 5} mais...</p>}
          </div>
        )}
      </div>
    );
  }

  // ── Hotmart student path ──────────────────────────────────────
  const paid       = s.paymentHistory || [];
  const isSub      = s.paymentIsSub;
  const inst       = s.paymentInstallments;
  const status     = getPayStatus(s);
  const actualPaid = paid.length;

  const upcoming: { date: number; label: string }[] = [];
  const isSmartInstall = s.paymentIsSmartInstall;
  if ((isSub || isSmartInstall) && s.lastPayDate && status !== 'QUITADO') {
    for (let i = 1; i <= (isSub ? 3 : inst - actualPaid); i++) {
      upcoming.push({
        date: addMonths(s.lastPayDate, i),
        label: isSub ? 'Mês estimado' : `Parcela ${actualPaid + i}/${inst}`,
      });
    }
  }

  const statusColor = status === 'INADIMPLENTE' ? '#f87171' : status === 'QUITADO' ? '#4ade80' : '#38bdf8';
  const statusLabel = status === 'INADIMPLENTE' ? 'Inadimplente' : status === 'QUITADO' ? (s.paymentIsSub && s.subStatus === 'CANCELLED' ? 'Encerrado' : 'Quitado') : 'Adimplente';
  const offerLabel = s.offerCode && s.offerCode !== 'default' ? `Oferta: ${s.offerCode}` : '';
  const modeLabel = s.paymentIsSub ? `Assinatura · Ciclo ${s.paymentRecurrency}`
    : isSmartInstall ? `Parcel. Inteligente ${actualPaid}/${inst}`
    : s.paymentIsCardInstall ? `${s.paymentLabel} · ${inst}×`
    : s.paymentLabel || s.paymentType;

  return (
    <div
      id="name-tooltip"
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      style={{
        position: 'fixed',
        left: -9999,
        top: -9999,
        zIndex: 2147483647,
        width: 300,
        background: 'linear-gradient(160deg, rgba(0,22,55,0.99) 0%, rgba(0,15,40,0.97) 100%)',
        border: '1px solid rgba(232,177,79,0.22)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 32px 64px rgba(0,0,0,0.85)',
        borderRadius: 18,
        backdropFilter: 'blur(32px)',
        pointerEvents: 'auto',
      }}>
      {/* Header: status badge + email + offer */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
            style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
            {statusLabel}
          </span>
          {offerLabel && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.06)', color: SILVER }}>
              {offerLabel}
            </span>
          )}
        </div>
        <p className="text-[10px] mt-1" style={{ color: SILVER }}>{s.email}</p>
        {modeLabel && <p className="text-[9px] mt-0.5 font-bold" style={{ color: GOLD }}>{modeLabel}</p>}
      </div>

      {/* Paid */}
      <div className="px-5 py-3" style={{ borderBottom: upcoming.length > 0 ? '1px solid rgba(255,255,255,0.07)' : undefined, maxHeight: 240, overflowY: 'auto' }}>
        <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>
          ✓ Já Pagou ({paid.length})
        </p>
        {paid.length === 0
          ? <p className="text-[10px]" style={{ color: SILVER }}>Sem registros</p>
          : paid.map((p, i) => {
              // Use p.index (sequential position) for label — avoids duplicate "Parcela 1/Parcela 1"
              // when recurrencyNumber is 1 for multiple separate transactions
              const label = isSub ? `Mês ${p.index}` : inst > 1 ? `Parcela ${p.index}` : 'Pago';
              return (
                <div key={i} className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: i < paid.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#4ade80' }} />
                    <div>
                      <p className="text-[10px] font-black text-white">{label}</p>
                      <p className="text-[9px]" style={{ color: SILVER }}>{fmtDate(p.date)}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black" style={{ color: '#4ade80' }}>{fmtMoneyByCurrency(p.valor, s.currency)}</span>
                </div>
              );
            })
        }
      </div>

      {/* Remaining */}
      {upcoming.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>
            ◷ Falta Pagar ({upcoming.length})
          </p>
          {upcoming.slice(0, 6).map((u, i) => (
            <div key={i} className="flex items-center justify-between py-1.5"
              style={{ borderBottom: i < Math.min(upcoming.length, 6) - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: GOLD }} />
                <span className="text-[9px] font-bold text-white">{fmtDate(u.date)}</span>
              </div>
              <span className="text-[10px] font-bold" style={{ color: GOLD }}>{u.label}</span>
            </div>
          ))}
          {upcoming.length > 6 && (
            <p className="text-[9px] mt-2" style={{ color: SILVER }}>+ {upcoming.length - 6} mais...</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── PDF ───────────────────────────────────────────────────────────────────────
// Standalone status helper used by PDF / CSV / XLS exports
const GRACE_DAYS_EXPORT = 15;
const DAY_MS_EXPORT = 86_400_000;
// Helper: parse either epoch-ms number or ISO date string into epoch ms (or null)
function toEpochMs(val: any): number | null {
  if (!val) return null;
  const n = Number(val);
  if (!isNaN(n) && n > 1_000_000_000_000) return n; // looks like epoch ms
  if (!isNaN(n) && n > 0 && n < 1_000_000_000_000) return n * 1000; // epoch seconds
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.getTime();
}


function effectiveStatusFor(s: Student, bpCache: Record<string, Record<string, any>> = {}): PayStatus {
  // Use BOTH sources: server-side JOIN (s.bpEmDia) + client-side async cache (bpCache)
  const cacheEntry = bpCache[(s.email || '').toLowerCase()] || {};
  const rawEmDia = ((s as any).bpEmDia ?? cacheEntry.em_dia);

  // ── MANUAL STUDENTS WITH installment_dates: highest priority ──────────────
  // installment_dates are the ground truth for payment control.
  // Check them BEFORE bp_em_dia to avoid stale bp_proximo_pagamento overriding correct data.
  if ((s as any).source === 'manual') {
    const dates: InstallmentDate[] = (s as any).manualInstallments || [];
    if (dates.length > 0) {
      const allPaid = dates.every(d => d.paid);
      if (allPaid) return 'QUITADO';
      const GRACE_15 = 15 * 24 * 60 * 60 * 1000;
      const hasOverdue = dates.some(d => !d.paid && Number(d.due_ms) + GRACE_15 < Date.now());
      if (hasOverdue) return 'INADIMPLENTE';
      return 'ADIMPLENTE';
    }
    // No installment_dates: fall back to bp_em_dia
    if (rawEmDia != null && rawEmDia !== '') {
      const up = String(rawEmDia).toUpperCase().trim();
      if (up === 'QUITADO') return 'QUITADO';
      if (up === 'NÃO' || up === 'NAO' || up === 'NÂO' || up === 'INADIMPLENTE') return 'INADIMPLENTE';
      if (up === 'SIM' || up === 'ADIMPLENTE') return 'ADIMPLENTE';
    }
    return 'ADIMPLENTE';
  }

  // ── HOTMART / non-manual students: bp_em_dia is authoritative ─────────────
  if (rawEmDia != null && rawEmDia !== '') {
    const up = String(rawEmDia).toUpperCase().trim();
    const proxRaw = (s as any).bpProximoPagamento ?? cacheEntry.proximo_pagamento;
    const proxMs  = toEpochMs(proxRaw);
    const notYetOverdue = proxMs != null && !isNaN(proxMs) && (proxMs + GRACE_DAYS_EXPORT * DAY_MS_EXPORT) > Date.now();

    if (up === 'SIM' || up === 'ADIMPLENTE') {
      if (proxMs != null && !isNaN(proxMs) && (proxMs + GRACE_DAYS_EXPORT * DAY_MS_EXPORT) < Date.now()) return 'INADIMPLENTE';
      return 'ADIMPLENTE';
    }
    if (up === 'QUITADO') return 'QUITADO';
    if (up === 'NÃO' || up === 'NAO' || up === 'NÂO' || up === 'INADIMPLENTE') {
      if (notYetOverdue) return 'ADIMPLENTE';
      return 'INADIMPLENTE';
    }
    if (notYetOverdue) return 'ADIMPLENTE';
    return 'INADIMPLENTE';
  }

  return getPayStatus(s);
}

// ── Shared helper: compute all export fields for one student row ─────────────
function exportRowData(
  s: Student, i: number,
  bpCache: Record<string, Record<string, any>>,
  phoneCache: Record<string, string>,
  docCache: Record<string, string>
) {
  const status   = effectiveStatusFor(s, bpCache);
  const stLabel  = status === 'INADIMPLENTE' ? 'Inadimplente' : status === 'QUITADO' ? 'Quitado' : 'Adimplente';
  const stColor  = status === 'INADIMPLENTE' ? '#dc2626' : status === 'QUITADO' ? '#16a34a' : '#0ea5e9';
  const emailKey = (s.email || '').toLowerCase();
  const bp       = bpCache[emailKey] || {};
  const phone    = (s as any).source === 'manual' ? ((s as any).phone || '') : (phoneCache[emailKey] || '');
  const cpf      = docCache[emailKey] || (s as any).document || '';
  const isManual = (s as any).source === 'manual';

  // Payment type label (human-readable)
  const ptRaw = (s as any).paymentType || '';
  const payLabel = isManual
    ? (ptRaw === 'PIX' || ptRaw === 'PIX_AVISTA' ? 'PIX à Vista'
      : ptRaw === 'PIX_CARTAO'  ? 'PIX + Cartão'
      : ptRaw === 'CREDIT_CARD' ? 'Cartão de Crédito'
      : ptRaw === 'PIX_MENSAL'  ? 'PIX Mensal' : 'PIX')
    : (bp.pagamento ||
       (s.paymentIsSub ? `Assinatura · ciclo ${s.paymentRecurrency}`
        : s.paymentIsSmartInstall ? 'Parcelamento Inteligente'
        : s.paymentIsCardInstall  ? `Cartão ${s.paymentInstallments}× (banco)`
        : (s.paymentLabel || s.paymentType || '')));

  const inst  = s.paymentInstallments || 1;
  const isPix = isManual && (ptRaw === 'PIX' || ptRaw === 'PIX_AVISTA');

  // Installment value
  const vParc = isManual
    ? (isPix ? (s.valorBRL || s.valor || Number(bp.valor || 0)) : (s.valor || 0))
    : (s.valor || 0);

  // Total paid
  const manualDates = ((s as any).manualInstallments || []) as Array<{paid: boolean; paid_ms: number | null}>;
  const paidCount   = isManual ? manualDates.filter(d => d.paid).length : s.paymentHistory.length;
  const vTotal      = isManual
    ? (isPix ? vParc : paidCount * vParc || Number(bp.valor || 0))
    : (s.paymentHistory.reduce((a, p) => a + p.valor, 0) || Number(bp.valor || 0));

  // Date helper — handles ISO strings AND epoch ms
  const D = (val: any) => { const ms = toEpochMs(val); return ms ? new Date(ms).toLocaleDateString('pt-BR') : ''; };

  // em_dia normalized label
  const emUp = (bp.em_dia || '').toUpperCase().trim();
  const emDiaLabel = emUp === 'SIM' || emUp === 'ADIMPLENTE' ? 'Em dia'
    : emUp === 'QUITADO' ? 'Quitado'
    : emUp === 'NÃO' || emUp === 'NAO' || emUp === 'INADIMPLENTE' ? 'Inadimplente'
    : bp.em_dia || '';

  return { status, stLabel, stColor, emailKey, bp, phone, cpf, isManual, payLabel, inst, isPix, vParc, paidCount, vTotal, D, emDiaLabel };
}

function generatePDF(
  courseName: string,
  students: Student[],
  phoneCache: Record<string, string> = {},
  documentCache: Record<string, string> = {},
  bpCache: Record<string, Record<string, any>> = {}
) {
  const rows = students.map((s, i) => {
    const { stLabel, stColor, phone, cpf, bp, payLabel, inst, isPix,
            vParc, paidCount, vTotal, emDiaLabel, isManual } = exportRowData(s, i, bpCache, phoneCache, documentCache);
    const rowBg    = stLabel === 'Inadimplente' ? '#fff0f0' : i % 2 === 0 ? '#f8faff' : '#fff';
    const stHtml   = stLabel === 'Inadimplente' ? '⚠ INADIMPLENTE' : stLabel === 'Quitado' ? '✓ QUITADO' : '● ADIMPLENTE';
    const vendedor = bp.vendedor || '';
    const modelo   = bp.modelo   || '';
    const instInfo = isManual
      ? (isPix ? 'PIX à Vista' : `${paidCount}/${inst} pagas`)
      : (s.paymentIsSub ? `Assin. · ciclo ${s.paymentRecurrency}` : inst > 1 ? `${paidCount}/${inst}` : 'Pago');
    const dadosPessoais = [
      `<b>${s.email}</b>`,
      phone ? `<span style="color:#16a34a">📞 ${phone}</span>` : '',
      cpf   ? `<span style="color:#0369a1">🪪 ${cpf}</span>`  : '',
    ].filter(Boolean).join('<br/>');
    return `<tr style="background:${rowBg}"><td style="color:#888;text-align:center">${i+1}</td><td><strong>${s.name.toUpperCase()}</strong></td><td>${dadosPessoais}</td><td>${fmtDate(s.entryDate)}</td><td style="color:#92400e;font-weight:700">${vendedor}</td><td>${payLabel}${modelo ? ` · ${modelo}` : ''}</td><td style="font-weight:700">${vParc ? fmtMoney(vParc) : '—'}</td><td>${vTotal ? fmtMoney(vTotal) : '—'}</td><td style="color:${stColor};font-weight:900">${stHtml}</td><td style="color:#888">${emDiaLabel}</td><td style="color:#555">${instInfo}</td></tr>`;
  }).join('');

  const active    = students.filter(s => effectiveStatusFor(s, bpCache) === 'ADIMPLENTE').length;
  const overdue   = students.filter(s => effectiveStatusFor(s, bpCache) === 'INADIMPLENTE').length;
  const quitado   = students.filter(s => effectiveStatusFor(s, bpCache) === 'QUITADO').length;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${courseName} — Alunos</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;color:#1a2035;background:#fff;padding:32px;font-size:11px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid #E8B14F}
.cn{font-size:20px;font-weight:900;color:#001a35}.meta{font-size:10px;color:#888;margin-top:4px}
.logo{font-size:10px;font-weight:900;color:#E8B14F;letter-spacing:3px;text-transform:uppercase;text-align:right}
.stats{display:flex;gap:12px;margin-bottom:20px}.stat{padding:10px 16px;border-radius:8px;flex:1}
.num{font-size:22px;font-weight:900}.lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-top:2px}
table{width:100%;border-collapse:collapse}th{background:#001a35;color:#E8B14F;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:1px;padding:8px 6px;text-align:left}
td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:top;line-height:1.7}.ftr{margin-top:18px;font-size:9px;color:#bbb;text-align:right;border-top:1px solid #eee;padding-top:8px}
@media print{body{padding:16px}}</style></head><body>
<div class="hdr"><div><div class="cn">${courseName}</div><div class="meta">${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</div></div><div class="logo">RadExperts<br/>Data Center</div></div>
<div class="stats">
<div class="stat" style="background:#f0f4ff;border:1px solid #c7d2fe"><div class="num" style="color:#3b82f6">${students.length}</div><div class="lbl">Total</div></div>
<div class="stat" style="background:#f0f9ff;border:1px solid #7dd3fc"><div class="num" style="color:#0ea5e9">${active}</div><div class="lbl">Adimplentes</div></div>
<div class="stat" style="background:#fff0f0;border:1px solid #fca5a5"><div class="num" style="color:#dc2626">${overdue}</div><div class="lbl">Inadimplentes</div></div>
<div class="stat" style="background:#f0fff4;border:1px solid #86efac"><div class="num" style="color:#16a34a">${quitado}</div><div class="lbl">Quitados</div></div>
</div>
<table><thead><tr><th>#</th><th>Nome</th><th>Dados Pessoais</th><th>Entrada</th><th>Vendedor</th><th>Pagamento</th><th>Valor/Parcela</th><th>Total Pago</th><th>Status</th><th>Em Dia</th><th>Detalhe</th></tr></thead><tbody>${rows}</tbody></table>
<div class="ftr">RadExperts Data Center · Dados vitalícios</div>
<script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

// ── CSV Export ────────────────────────────────────────────────────────────────────────
function generateCSV(
  courseName: string,
  students: Student[],
  phoneCacheArg: Record<string, string>,
  docCacheArg:   Record<string, string>,
  bpCacheArg:    Record<string, Record<string, any>>,
) {
  const headers = [
    '#','NOME','EMAIL','TELEFONE','CPF',
    'DATA ENTRADA','STATUS','ORIGEM',
    'FORMA PAGAMENTO','VALOR PARCELA (R$)','TOTAL PAGO (R$)',
    'Nº PARCELAS','PAGAS','RESTANTES',
    'MOEDA','TURMA',
    // Buyer Persona
    'VENDEDOR','BP VALOR TOTAL','BP PAGAMENTO','BP MODELO','BP PARCELA',
    '1ª PARCELA','Últ. PAGAMENTO','PRÓX. PAGAMENTO','EM DIA',
  ];
  const rows = students.map((s, i) => {
    const { stLabel, phone, cpf, bp, payLabel, inst, isPix,
            vParc, paidCount, vTotal, D, emDiaLabel } = exportRowData(s, i, bpCacheArg, phoneCacheArg, docCacheArg);
    return [
      i + 1,
      s.name,
      s.email,
      phone,
      cpf,
      s.entryDate ? new Date(s.entryDate).toLocaleDateString('pt-BR') : '',
      stLabel,
      (s as any).source === 'manual' ? 'Manual' : 'Hotmart',
      payLabel,
      +vParc.toFixed(2),
      +vTotal.toFixed(2),
      isPix ? 1 : inst,
      paidCount,
      isPix ? 0 : Math.max(0, inst - paidCount),
      s.currency || 'BRL',
      (s as any).turma || 'Manual',
      bp.vendedor           || '',
      bp.valor              ? Number(bp.valor).toFixed(2) : '',
      bp.pagamento          || '',
      bp.modelo             || '',
      bp.parcela            ? Number(bp.parcela).toFixed(2) : '',
      D(bp.primeira_parcela),
      D(bp.ultimo_pagamento),
      D(bp.proximo_pagamento),
      emDiaLabel,
    ];
  });
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${courseName.replace(/[^a-z0-9]/gi, '_')}_alunos.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── XLS Export (SheetJS) ────────────────────────────────────────────────────
function generateXLS(
  courseName: string,
  students: Student[],
  phoneCacheArg: Record<string, string>,
  docCacheArg:   Record<string, string>,
  bpCacheArg:    Record<string, Record<string, any>>,
) {
  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: Alunos ────────────────── */
  const headers = [
    '#', 'NOME', 'EMAIL', 'TELEFONE', 'CPF',
    'DATA ENTRADA', 'STATUS', 'ORIGEM', 'FORMA PAGAMENTO',
    'VALOR PARCELA (R$)', 'TOTAL PAGO (R$)',
    'Nº PARCELAS', 'PAGAS', 'RESTANTES',
    'MOEDA', 'TURMA',
    // Buyer Persona
    'VENDEDOR', 'BP VALOR TOTAL', 'BP PAGAMENTO', 'BP MODELO', 'BP PARCELA',
    '1ª PARCELA', 'ÜLT. PAGAMENTO', 'PRÓX. PAGAMENTO', 'EM DIA',
  ];

  const data = students.map((s, i) => {
    const { stLabel, phone, cpf, bp, payLabel, inst, isPix,
            vParc, paidCount, vTotal, D, emDiaLabel } = exportRowData(s, i, bpCacheArg, phoneCacheArg, docCacheArg);
    return [
      i + 1,
      s.name,
      s.email,
      phone,
      cpf,
      s.entryDate ? new Date(s.entryDate).toLocaleDateString('pt-BR') : '',
      stLabel,
      (s as any).source === 'manual' ? 'Manual' : 'Hotmart',
      payLabel,
      +vParc.toFixed(2),
      +vTotal.toFixed(2),
      isPix ? 1 : inst,
      paidCount,
      isPix ? 0 : Math.max(0, inst - paidCount),
      s.currency || 'BRL',
      (s as any).turma || 'Manual',
      bp.vendedor           || '',
      bp.valor              ? +Number(bp.valor).toFixed(2) : '',
      bp.pagamento          || '',
      bp.modelo             || '',
      bp.parcela            ? +Number(bp.parcela).toFixed(2) : '',
      D(bp.primeira_parcela),
      D(bp.ultimo_pagamento),
      D(bp.proximo_pagamento),
      emDiaLabel,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [
    { wch: 4  }, { wch: 38 }, { wch: 36 }, { wch: 18 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 28 },
    { wch: 18 }, { wch: 14 },
    { wch: 10 }, { wch: 8  }, { wch: 10 },
    { wch: 8  }, { wch: 18 },
    // BP cols
    { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Alunos');

  /* ── Sheet 2: Resumo ───────────────── */
  const adim      = students.filter(s => effectiveStatusFor(s, bpCacheArg) === 'ADIMPLENTE').length;
  const inadim    = students.filter(s => effectiveStatusFor(s, bpCacheArg) === 'INADIMPLENTE').length;
  const quit      = students.filter(s => effectiveStatusFor(s, bpCacheArg) === 'QUITADO').length;
  const totalPago = students.reduce((acc, s) => acc + s.paymentHistory.reduce((a, p) => a + p.valor, 0), 0);
  const comPhone  = students.filter(s => {
    const ph = (s as any).source === 'manual' ? (s as any).phone : phoneCacheArg[(s.email || '').toLowerCase()];
    return !!ph;
  }).length;
  const hotmartN  = students.filter(s => (s as any).source !== 'manual').length;
  const manualN   = students.filter(s => (s as any).source === 'manual').length;

  const resData: any[][] = [
    ['RESUMO', courseName],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
    ['INDICADOR', 'VALOR'],
    ['Total de Alunos', students.length],
    ['Via Hotmart', hotmartN],
    ['Via Manual/Planilha', manualN],
    [],
    ['Adimplentes', adim],
    ['Inadimplentes', inadim],
    ['Quitados / Encerrados', quit],
    [],
    ['Total Pago (histórico)', +totalPago.toFixed(2)],
    ['Alunos com Telefone', comPhone],
    ['Alunos sem Telefone', students.length - comPhone],
  ];

  const wsRes = XLSX.utils.aoa_to_sheet(resData);
  wsRes['!cols'] = [{ wch: 26 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumo');

  /* ── Download ── */
  XLSX.writeFile(wb, `${courseName.replace(/[^a-z0-9]/gi, '_')}_alunos.xlsx`);
}

// ── Grid ──────────────────────────────────────────────────────────────────────
const GRID = 'minmax(100px,120px) minmax(160px,1fr) minmax(220px,280px) minmax(110px,140px) minmax(110px,140px) minmax(200px,260px) 60px';
const COLS = [
  { key: 'entryDate', label: 'Entrada',        sortable: true  },
  { key: 'name',      label: 'Nome',            sortable: false },
  { key: 'email',     label: 'Dados Pessoais',  sortable: false },
  { key: 'parcela',   label: 'Valor Parcela',   sortable: false },
  { key: 'total',     label: 'Total Pago',      sortable: false },
  { key: 'payment',   label: 'Status',          sortable: false },
  { key: 'actions',   label: '',                sortable: false },
];

// ── Detect country flag + currency from phone prefix ────────────────────────
function detectFlagAndCurrency(phone: string): { flag: string; currency: string } {
  const digits = (phone || '').replace(/\\D/g, '');
  const PREFIX_MAP: Array<{ prefix: string; flag: string; currency: string }> = [
    { prefix: '5400', flag: 'ar', currency: 'USD' },
    { prefix: '5401', flag: 'ar', currency: 'USD' },
    { prefix: '5402', flag: 'ar', currency: 'USD' },
    { prefix: '5403', flag: 'ar', currency: 'USD' },
    { prefix: '5492', flag: 'ar', currency: 'USD' },
    { prefix: '5493', flag: 'ar', currency: 'USD' },
    { prefix: '5494', flag: 'ar', currency: 'USD' },
    { prefix: '598', flag: 'uy', currency: 'USD' },
    { prefix: '593', flag: 'ec', currency: 'USD' },
    { prefix: '591', flag: 'bo', currency: 'USD' },
    { prefix: '595', flag: 'py', currency: 'USD' },
    { prefix: '507', flag: 'pa', currency: 'USD' },
    { prefix: '506', flag: 'cr', currency: 'USD' },
    { prefix: '504', flag: 'hn', currency: 'USD' },
    { prefix: '503', flag: 'sv', currency: 'USD' },
    { prefix: '502', flag: 'gt', currency: 'USD' },
    { prefix: '501', flag: 'bz', currency: 'USD' },
    { prefix: '55',  flag: 'br', currency: 'BRL' },
    { prefix: '57',  flag: 'co', currency: 'USD' },
    { prefix: '56',  flag: 'cl', currency: 'USD' },
    { prefix: '54',  flag: 'ar', currency: 'USD' },
    { prefix: '52',  flag: 'mx', currency: 'USD' },
    { prefix: '51',  flag: 'pe', currency: 'USD' },
    { prefix: '58',  flag: 've', currency: 'USD' },
    { prefix: '53',  flag: 'cu', currency: 'USD' },
    { prefix: '50',  flag: '',   currency: 'USD' },
  ];
  for (const { prefix, flag, currency } of PREFIX_MAP) {
    if (digits.startsWith(prefix)) return { flag, currency };
  }
  // No international prefix detected = local Brazilian number (no +55 prefix stored)
  return { flag: 'br', currency: 'BRL' };
}

// ── Convert ManualStudent → Student shape ────────────────────────────────────
function manualToStudent(ms: any): Student {
  // IMPORTANT: Postgres returns bigint/numeric as strings in JSON. Always Number() cast.
  const dates   = ((ms.installment_dates || []) as any[]).map((d: any) => ({
    ...d,
    due_ms:  Number(d.due_ms),
    paid_ms: d.paid_ms != null ? Number(d.paid_ms) : null,
  }));
  const paid     = dates.filter(d => d.paid);
  const lastPaid = paid.length > 0 ? Math.max(...paid.map(d => d.paid_ms ?? 0)) : null;
  const overdue  = dates.some(d => !d.paid && d.due_ms < Date.now());

  const subStatus: SubStatus =
    ms.payment_type === 'PIX' ? 'CANCELLED' :
    paid.length >= Number(ms.installments) ? 'CANCELLED' :
    overdue ? 'OVERDUE' : 'ACTIVE';

  const instAmt = Number(ms.installment_amount) || Number(ms.total_amount);
  const msCurrency = ms.currency || detectFlagAndCurrency(ms.phone || '').currency;
  const msFlag     = detectFlagAndCurrency(ms.phone || '').flag;

  return {
    name: ms.name, email: ms.email,
    entryDate:   Number(ms.entry_date), lastPayDate: lastPaid,
    turma: 'Manual', valor: instAmt, valorBRL: Number(ms.total_amount),
    currency: msCurrency, flag: msFlag,
    transaction: `MANUAL_${ms.id}`,
    phone: ms.phone, source: 'manual', manualId: ms.id,
    manualInstallments: dates,
    paymentType: ms.payment_type,
    paymentMethod: ms.payment_type === 'PIX' ? 'PIX' : 'Cartão',
    paymentLabel: ms.payment_type === 'PIX' ? 'PIX Avulso' : `Cartão ${Number(ms.installments)}×`,
    offerCode: '', paymentMode: ms.payment_type === 'PIX' ? 'single' : 'installment',
    paymentInstallments: Number(ms.installments),
    paymentIsSub: false,
    paymentIsSmartInstall: ms.payment_type === 'CREDIT_CARD' && Number(ms.installments) > 1,
    paymentIsCardInstall: false,
    paymentRecurrency: paid.length,
    subStatus,
    paymentHistory: paid.map((d, i) => ({
      date: d.paid_ms ?? d.due_ms, valor: instAmt,
      recurrencyNumber: i + 1, index: i,
    })),
    // Extra fields for pre-filling the edit modal (not in Student type, accessed via `as any`)
    down_payment:       Number(ms.down_payment)       || 0,
    installment_amount: Number(ms.installment_amount) || 0,
    installment_dates:  dates,
    notes:              ms.notes    || '',
    document:           ms.document || '',

    bpEmDia:            ms.bp_em_dia ?? undefined,
    bpModelo:           ms.bp_modelo ?? undefined,
    bpProximoPagamento: ms.bp_proximo_pagamento != null ? Number(ms.bp_proximo_pagamento) : undefined,
  } as any as Student;

}


// ── Add Student Modal ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// BATCH PARSER
// ══════════════════════════════════════════════════════════════════════════════
interface ParsedRow {
  name: string; email: string; phone: string; cpf: string;
  paymentMethod: string; totalAmount: string;
  installments: string; installmentAmount: string; installmentsPaid: string;
  entryDate: string; // YYYY-MM-DD
  // buyer_persona fields
  vendedor: string; bp_valor: string; bp_pagamento: string; bp_modelo: string;
  bp_parcela: string; bp_primeira_parcela: string;
  bp_ultimo_pagamento: string; bp_proximo_pagamento: string; bp_em_dia: string;
  /** 'new' = brand new | 'enrich' = same email already enrolled | 'name_conflict' = different email but same name */
  dupStatus: 'new' | 'enrich' | 'name_conflict';
  /** Name(s) of existing student(s) that triggered a name_conflict, if any */
  conflictWith?: string[];
  confidence: 'high' | 'medium' | 'low';
}

const RE_EMAIL   = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const RE_CPF_FMT = /\d{3}\.\d{3}\.\d{3}[\-.\s]\d{2}/;          // formatted CPF
const RE_CPF_RAW = /\b\d{11}\b(?![\w.\-])/;                     // 11-digit raw (low priority)
const RE_PHONE   = /(?:\+?55\s?)?(?:\(?\d{2}\)?[\s.\-]?)?(?:9[\s.\-]?)?\d{4}[\s.\-]?\d{4}/;
// Payment detection — ORDER MATTERS: most specific first
function detectPayment(text: string): string {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Specific combos first
  if (t.includes('debito') || t.includes('debit'))  return 'CARTAO_DEBITO';
  if (t.includes('credito') || t.includes('credit')) return 'CARTAO_CREDITO';
  if (t.includes('cartao') || t.includes('card'))    return 'CARTAO_CREDITO'; // bare "cartao" = crédito
  if (t.includes('boleto') || t.includes('billet'))  return 'BOLETO';
  if (t.includes('pix'))                             return 'PIX';
  if (t.includes('picpay'))                          return 'PIX';
  if (t.includes('transfer'))                        return 'PIX';
  return 'PIX';
}

function parseSingleLine(raw: string): ParsedRow {
  let work = raw;
  const remove = (match: string | undefined) => { if (match) work = work.replace(match, ' '); };

  const emailM   = RE_EMAIL.exec(work);
  const email    = emailM?.[0] || '';  remove(email);

  const cpfFmtM  = RE_CPF_FMT.exec(work);
  const cpfFmt   = cpfFmtM?.[0] || ''; remove(cpfFmt);

  const phoneM   = RE_PHONE.exec(work);
  const phone    = phoneM?.[0] || '';  remove(phone);

  // Raw CPF only if phone was already found (so 11-digit doesn't become phone twice)
  const cpfRawM  = cpfFmt ? null : RE_CPF_RAW.exec(work.replace(phone, ''));
  const cpf      = (cpfFmt || cpfRawM?.[0] || '').replace(/[\s]/g, '').trim();
  if (cpfRawM?.[0]) remove(cpfRawM[0]);

  const payment  = detectPayment(raw);
  // Remove payment keywords from work
  work = work.replace(/\b(pix|boleto|cart[aã]o|cr[eé]dito|d[eé]bito|picpay|transfer[eê]ncia)\b/gi, ' ');

  // Remove amounts like R$ 1.000,00 or 1500.00
  work = work.replace(/R\$\s?[\d.,]+/gi, ' ').replace(/\b\d{1,6}[.,]\d{2}\b/g, ' ');

  // Clean separators
  const name = work
    .replace(/[\|,;:\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\W_]+|[\W_]+$/g, '')
    .trim();

  // Detect installments pattern: '12x', '12 vezes', 'x12'
  const instMatch = raw.match(/\b(\d{1,2})\s*[xX×]\b|\b[xX]\s*(\d{1,2})\b|\b(\d{1,2})\s+vez(?:es)?\b/i);
  const installments = instMatch ? String(parseInt(instMatch[1] || instMatch[2] || instMatch[3] || '1', 10)) : '1';

  const confidence: ParsedRow['confidence'] =
    email && name ? 'high' :
    email         ? 'medium' : 'low';

  return { name, email, phone, cpf, paymentMethod: payment,
    totalAmount: '', installments, installmentAmount: '', installmentsPaid: '0',
    entryDate: new Date().toISOString().slice(0, 10),
    vendedor: '', bp_valor: '', bp_pagamento: '', bp_modelo: '',
    bp_parcela: '', bp_primeira_parcela: '', bp_ultimo_pagamento: '',
    bp_proximo_pagamento: '', bp_em_dia: '',
    dupStatus: 'new' as const,
    confidence };
}

function parseBatchText(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];

  // ─ Strategy A: blank-line-separated blocks (each block = one student) ─────
  if (/\n[ \t]*\n/.test(text)) {
    const blocks = text.split(/\n[ \t]*\n/).map(b => b.trim()).filter(Boolean);
    for (const block of blocks) {
      // Combine all lines in the block; strip leading commas/semicolons from each line
      const combined = block
        .split(/\r?\n/)
        .map(l => l.trim().replace(/^[,;\s]+/, ''))
        .filter(Boolean)
        .join(' ');
      const parsed = parseSingleLine(combined);
      if (parsed.email || parsed.name) rows.push(parsed);
    }
    return rows;
  }

  // ─ Strategy B: one student per line (strip leading commas) ────────────
  const rawLines = text
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^[,;\s]+/, ''))
    .filter(Boolean);
  let i = 0;
  while (i < rawLines.length) {
    let line = rawLines[i];
    // If this line has no email, try merging with next line (which might have the email)
    if (!RE_EMAIL.test(line) && i + 1 < rawLines.length && RE_EMAIL.test(rawLines[i + 1])) {
      line = line + ' ' + rawLines[i + 1];
      i += 2;
    } else {
      i++;
    }
    const parsed = parseSingleLine(line);
    if (parsed.email || parsed.name) rows.push(parsed);
  }
  return rows;
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function ConfBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cfg = level === 'high'   ? { c: '#4ade80', bg: 'rgba(74,222,128,0.1)',  label: '✓ OK' }
            : level === 'medium' ? { c: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  label: '⚠ Rev' }
            :                      { c: '#f87171', bg: 'rgba(248,113,113,0.1)', label: '✕ Erro' };
  return <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 99,
    background: cfg.bg, color: cfg.c, whiteSpace: 'nowrap' }}>{cfg.label}</span>;
}

// ── Dup status badge ─────────────────────────────────────────────────────────
function DupBadge({ status, conflictWith }: { status: 'new' | 'enrich' | 'name_conflict'; conflictWith?: string[] }) {
  if (status === 'name_conflict') return (
    <span title={conflictWith ? `Mesmo nome que: ${conflictWith.join(', ')}` : 'Nome já cadastrado com outro email'}
      style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 99,
        background: 'rgba(251,191,36,0.12)', color: '#fbbf24', whiteSpace: 'nowrap', cursor: 'help',
        border: '1px solid rgba(251,191,36,0.3)' }}>⚠ Nome duplicado</span>
  );
  return status === 'new'
    ? <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 99,
        background: 'rgba(74,222,128,0.1)', color: '#4ade80', whiteSpace: 'nowrap' }}>🆕 Novo</span>
    : <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 99,
        background: 'rgba(99,179,237,0.1)', color: '#63b3ed', whiteSpace: 'nowrap' }}>🔄 Atualizar</span>;
}

// ── CSV / XLS Import Modal ────────────────────────────────────────────────────
type CsvField =
  'name'|'email'|'phone'|'cpf'|'entryDate'|
  'paymentMethod'|'totalAmount'|'installments'|'installmentsPaid'|
  'vendedor'|'bp_valor'|'bp_pagamento'|'bp_modelo'|'bp_parcela'|
  'bp_primeira_parcela'|'bp_ultimo_pagamento'|'bp_proximo_pagamento'|'bp_em_dia'|
  '_ignore';

const CSV_FIELD_LABELS: Record<CsvField, string> = {
  name:                 'Nome',
  email:                'Email',
  phone:                'Telefone',
  cpf:                  'CPF',
  entryDate:            'Data de Entrada',
  paymentMethod:        'Tipo de Pagamento',
  totalAmount:          'Valor Parcela (R$)',
  installments:         'Nº de Parcelas',
  installmentsPaid:     'Parcelas Pagas',
  vendedor:             'Vendedor',
  bp_valor:             'Valor',
  bp_pagamento:         'Pagamento',
  bp_modelo:            'Modelo',
  bp_parcela:           'Parcela (R$)',
  bp_primeira_parcela:  'Primeira Parcela',
  bp_ultimo_pagamento:  'Último Pagamento',
  bp_proximo_pagamento: 'Próximo Pagamento',
  bp_em_dia:            'Em Dia',
  _ignore:              '— Ignorar —',
};

// Auto-detect column mapping from header name
function guessField(header: string): CsvField {
  const h = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (/^nome$|^name$/.test(h))                                      return 'name';
  if (/e.*mail/.test(h))                                            return 'email';
  if (/tel|fone|phone|celular|whatsapp|contato/.test(h))            return 'phone';
  if (/cpf|documento|document|doc/.test(h))                         return 'cpf';
  if (/vendedor|seller|corretor/.test(h))                           return 'vendedor';
  if (/^valor$|^value$|^amount$/.test(h))                           return 'bp_valor';
  if (/^pagamento$|^payment$|^forma/.test(h))                       return 'bp_pagamento';
  if (/^modelo$/.test(h))                                           return 'bp_modelo';
  if (/^parcela$|^installment$/.test(h))                            return 'bp_parcela';
  if (/1.*parc|primeir|first.*parc|parc.*1/.test(h))               return 'bp_primeira_parcela';
  if (/ultim|last.*parc|parc.*ult/.test(h))                         return 'bp_ultimo_pagamento';
  if (/prox|next.*parc|parc.*prox/.test(h))                         return 'bp_proximo_pagamento';
  if (/em.dia|adimpl|day|current/.test(h))                          return 'bp_em_dia';
  if (/data|entrada|ingresso|date|inicio/.test(h))                  return 'entryDate';
  if (/pag|tipo.*pag|metodo/.test(h))                               return 'paymentMethod';
  if (/valor.*parc|parc.*valor|mensalidade/.test(h))                return 'totalAmount';
  if (/n.*parc|num.*parc|installments/.test(h))                     return 'installments';
  if (/pag.*parc|pagas?|paid/.test(h))                              return 'installmentsPaid';
  return '_ignore';
}

// Normalise raw payment cell value to our enum
function normalisePayment(raw: string): string {
  const v = (raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/pix/.test(v))                                return 'PIX';
  if (/boleto/.test(v))                             return 'BOLETO';
  if (/debito|debit/.test(v))                       return 'CARTAO_DEBITO';
  if (/credito|credit|cartao|card/.test(v))         return 'CARTAO_CREDITO';
  return 'PIX';
}

// Parse a raw Excel serial date or string date → YYYY-MM-DD
function parseDateCell(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (typeof val === 'number') {
    // Excel serial: days since 1900-01-00
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof val === 'string') {
    // Try DD/MM/YYYY
    const m = val.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const [, d, mo, y] = m;
      const yr = y.length === 2 ? `20${y}` : y;
      return `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    // ISO already
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function CSVImportModal({ courseName, existingEmails, existingNames, onClose, onSaved }: {
  courseName: string;
  existingEmails: Set<string>;
  /** Normalized (UPPERCASE, trimmed) names already in the course — used for name-based duplicate detection */
  existingNames:  Set<string>;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  type Step = 'upload' | 'map' | 'preview' | 'done';
  const [step,       setStep]       = React.useState<Step>('upload');
  const [dragging,   setDragging]   = React.useState(false);
  const [headers,    setHeaders]    = React.useState<string[]>([]);
  const [rawRows,    setRawRows]    = React.useState<any[][]>([]); // first 5 rows for preview
  const [allRaw,     setAllRaw]     = React.useState<any[][]>([]);
  const [mapping,    setMapping]    = React.useState<Record<string, CsvField>>({});
  const [saving,     setSaving]     = React.useState(false);
  const [progress,   setProgress]   = React.useState(0); // 0–100 for loading bar
  const [result,     setResult]     = React.useState<{saved:number;enriched:number;failed:number;errors:string[]}|null>(null);
  const [error,      setError]      = React.useState('');
  /** Set of row indexes (0-based) the user chose to SKIP due to name_conflict */
  const [skippedIdx, setSkippedIdx] = React.useState<Set<number>>(new Set());
  const fileRef   = React.useRef<HTMLInputElement>(null);
  const progTimer = React.useRef<any>(null);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        if (rows.length < 2) { setError('Arquivo vazio ou sem dados.'); return; }
        const hdrs = (rows[0] as any[]).map(h => String(h || '').trim());
        const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
        setHeaders(hdrs);
        setAllRaw(dataRows);
        setRawRows(dataRows.slice(0, 5));
        // Auto-detect mapping
        const auto: Record<string, CsvField> = {};
        hdrs.forEach(h => { auto[h] = guessField(h); });
        setMapping(auto);
        setError('');
        setStep('map');
      } catch (e: any) { setError(`Erro ao ler arquivo: ${e.message}`); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Build ParsedRows from allRaw + mapping
  const buildRows = (): ParsedRow[] => {
    const fieldFor = (col: string): CsvField => mapping[col] || '_ignore';
    const pickRaw  = (field: CsvField, row: any[]) => {
      const idx = headers.findIndex(h => fieldFor(h) === field);
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };
    return allRaw.map(row => {
      const name  = (pickRaw('name', row) || '').toUpperCase(); // normalize to UPPERCASE on import
      const email = pickRaw('email', row).toLowerCase().trim();
      const conf: ParsedRow['confidence'] = name && email ? 'high' : email ? 'medium' : 'low';
      const entryIdx = headers.findIndex(h => fieldFor(h) === 'entryDate');
      return {
        name, email,
        phone:                pickRaw('phone', row),
        cpf:                  pickRaw('cpf', row),
        entryDate:            parseDateCell(entryIdx >= 0 ? row[entryIdx] : ''),
        paymentMethod:        normalisePayment(pickRaw('paymentMethod', row)),
        totalAmount:          pickRaw('totalAmount', row).replace(/[^\d.,]/g, ''),
        installments:         pickRaw('installments', row) || '1',
        installmentAmount:    '',
        installmentsPaid:     pickRaw('installmentsPaid', row) || '0',
        // buyer_persona fields — raw strings, API will parse
        vendedor:             pickRaw('vendedor', row),
        bp_valor:             pickRaw('bp_valor', row).replace(/[^\d.,]/g, ''),
        bp_pagamento:         pickRaw('bp_pagamento', row),
        bp_modelo:            pickRaw('bp_modelo', row),
        bp_parcela:           pickRaw('bp_parcela', row).replace(/[^\d.,]/g, ''),
        bp_primeira_parcela:  parseDateCell(headers.findIndex(h => fieldFor(h) === 'bp_primeira_parcela') >= 0
                                ? row[headers.findIndex(h => fieldFor(h) === 'bp_primeira_parcela')] : ''),
        bp_ultimo_pagamento:  parseDateCell(headers.findIndex(h => fieldFor(h) === 'bp_ultimo_pagamento') >= 0
                                ? row[headers.findIndex(h => fieldFor(h) === 'bp_ultimo_pagamento')] : ''),
        bp_proximo_pagamento: parseDateCell(headers.findIndex(h => fieldFor(h) === 'bp_proximo_pagamento') >= 0
                                ? row[headers.findIndex(h => fieldFor(h) === 'bp_proximo_pagamento')] : ''),
        bp_em_dia:            pickRaw('bp_em_dia', row).toUpperCase() === 'SIM' ? 'SIM'
                                : pickRaw('bp_em_dia', row).toUpperCase() === 'NAO' || pickRaw('bp_em_dia', row).toUpperCase() === 'NÃO' ? 'NÃO'
                                : pickRaw('bp_em_dia', row),
        dupStatus:            existingEmails.has(email.toLowerCase())
                                ? 'enrich' as const
                                : (name && existingNames.has(name.toUpperCase().trim()))
                                  ? 'name_conflict' as const
                                  : 'new' as const,
        conflictWith:         (name && existingNames.has(name.toUpperCase().trim()) && !existingEmails.has(email.toLowerCase()))
                                ? [name.toUpperCase().trim()]
                                : undefined,
        confidence:           conf,
      };
    }).filter(r => r.name || r.email);
  };

  const handleImport = async () => {
    const allBuilt = buildRows().filter(r => r.name && r.email);
    // Exclude rows the user chose to skip (name_conflict + manually skipped)
    const rows = allBuilt.filter((_, idx) => !skippedIdx.has(idx));
    if (rows.length === 0) { setError('Nenhuma linha válida (nome + email obrigatórios).'); return; }
    setSaving(true); setProgress(5); setError('');

    // Animate progress bar: fills 5→85% during upload, then 100% on completion
    const totalMs = Math.max(8000, rows.length * 350);
    const interval = 200;
    const perTick = (80 / (totalMs / interval));
    progTimer.current = setInterval(() => {
      setProgress(prev => Math.min(85, prev + perTick));
    }, interval);

    try {
      const res = await fetch('/api/alunos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName,
          students: rows.map(r => ({
            name: r.name, email: r.email, phone: r.phone,
            cpf: r.cpf, paymentMethod: r.paymentMethod,
            totalAmount:  r.totalAmount || '0',
            installments: r.installments || '1',
            installmentAmount: '0',
            installmentsPaid: r.installmentsPaid || '0',
            entryDate: r.entryDate ? new Date(r.entryDate).getTime() : Date.now(),
            isExisting: r.dupStatus === 'enrich',
            // buyer_persona
            vendedor:             r.vendedor    || null,
            bp_valor:             r.bp_valor    || null,
            bp_pagamento:         r.bp_pagamento || null,
            bp_modelo:            r.bp_modelo   || null,
            bp_parcela:           r.bp_parcela  || null,
            bp_primeira_parcela:  r.bp_primeira_parcela  ? new Date(r.bp_primeira_parcela).getTime()  : null,
            bp_ultimo_pagamento:  r.bp_ultimo_pagamento  ? new Date(r.bp_ultimo_pagamento).getTime()  : null,
            bp_proximo_pagamento: r.bp_proximo_pagamento ? new Date(r.bp_proximo_pagamento).getTime() : null,
            bp_em_dia:            r.bp_em_dia   || null,
          })),
        }),
      });
      clearInterval(progTimer.current);
      setProgress(100);
      const data = await res.json();
      await new Promise(r => setTimeout(r, 500)); // brief pause so 100% is visible
      setResult(data);
      setStep('done');
      if (data.saved > 0 || data.enriched > 0) onSaved(data.saved + (data.enriched || 0));
    } catch (e: any) {
      clearInterval(progTimer.current);
      setProgress(0);
      setError(`Erro ao importar: ${e.message}`);
    }
    finally { setSaving(false); }
  };

  const previewRows = buildRows().slice(0, 5);
  const totalValid  = step === 'preview' || step === 'map' ? buildRows().filter(r => r.name && r.email).length : 0;

  const BOX: React.CSSProperties = {
    position: 'relative', width: '100%',
    maxWidth: step === 'map' || step === 'preview' ? 1100 : 560,
    maxHeight: '90vh', overflowY: 'auto', borderRadius: 24,
    background: 'linear-gradient(160deg, rgba(8,15,30,0.99) 0%, rgba(4,10,20,0.99) 100%)',
    border: '1px solid rgba(99,179,237,0.25)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
    padding: 32, transition: 'max-width 0.3s',
  };
  const IN2: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, color: 'white', fontSize: 11, padding: '4px 8px',
    outline: 'none', width: '100%',
  };
  const BLUE = '#63b3ed';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10003, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.92)', backdropFilter: 'blur(16px)' }} />
      <div style={BOX}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.25)', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ color: BLUE, fontSize: 20 }}>table_view</span>
          </div>
          <div>
            <h3 style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: 0 }}>Importar Planilha CSV / XLS</h3>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, marginTop: 2 }}>
              {step === 'upload'  ? 'Faça upload da planilha e mapeie os campos'            :
               step === 'map'    ? `${headers.length} colunas detectadas — associe os campos` :
               step === 'preview'? `${totalValid} aluno${totalValid !== 1 ? 's' : ''} prontos para importar` :
               'Importação concluída'}
            </p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: SILVER, cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {(['upload','map','preview','done'] as Step[]).map((s, i) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 3,
              background: ['upload','map','preview','done'].indexOf(step) >= i
                ? 'rgba(99,179,237,0.8)' : 'rgba(255,255,255,0.1)' }} />
          ))}
        </div>

        {/* ── STEP 1: UPLOAD ─────────────────────────────────────────────── */}
        {step === 'upload' && (<>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? BLUE : 'rgba(99,179,237,0.3)'}`,
              borderRadius: 16, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'rgba(99,179,237,0.06)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.2s', marginBottom: 20,
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: BLUE, display: 'block', marginBottom: 12 }}>upload_file</span>
            <p style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: '0 0 6px' }}>Arraste o arquivo aqui</p>
            <p style={{ color: SILVER, fontSize: 12, margin: '0 0 16px' }}>ou clique para selecionar</p>
            <span style={{ fontSize: 10, fontWeight: 800, color: BLUE, background: 'rgba(99,179,237,0.1)',
              border: '1px solid rgba(99,179,237,0.3)', borderRadius: 8, padding: '4px 12px' }}>
              .CSV · .XLS · .XLSX
            </span>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx"
              style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: SILVER, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Dica</p>
            <p style={{ fontSize: 11, color: SILVER, margin: 0, lineHeight: 1.7 }}>
              A planilha pode ter qualquer cabeçalho — você vai associar cada coluna ao campo correto na próxima etapa. <br/>
              Campos reconhecidos: <strong style={{ color: 'white' }}>Nome, Email, Telefone, CPF, Data de Entrada, Tipo de Pagamento, Valor Parcela, Nº Parcelas, Parcelas Pagas</strong>.
            </p>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>{error}</p>}
        </>)}

        {/* ── STEP 2: MAP COLUMNS ─────────────────────────────────────────── */}
        {step === 'map' && (<>
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 900, fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.1em', color: SILVER, whiteSpace: 'nowrap' }}>
                    Coluna da planilha
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 900, fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.1em', color: SILVER, whiteSpace: 'nowrap' }}>
                    Mapear para
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 900, fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.1em', color: SILVER }}>
                    Exemplo (1ª linha)
                  </th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, hi) => (
                  <tr key={hi} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '5px 10px', color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</td>
                    <td style={{ padding: '5px 6px', minWidth: 180 }}>
                      <select
                        value={mapping[h] || '_ignore'}
                        onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value as CsvField }))}
                        style={{ ...IN2, cursor: 'pointer', colorScheme: 'dark' }}>
                        {(Object.keys(CSV_FIELD_LABELS) as CsvField[]).map(f => (
                          <option key={f} value={f} style={{ background: '#010d1f', color: 'white' }}>
                            {CSV_FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '5px 10px', color: SILVER, fontSize: 10, maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(rawRows[0]?.[hi] ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mini preview of first 3 rows */}
          {rawRows.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: SILVER, textTransform: 'uppercase',
                letterSpacing: '0.1em', margin: '0 0 8px' }}>Pré-visualização (3 primeiras linhas)</p>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {headers.map((h, i) => (
                        <th key={i} style={{ padding: '5px 8px', fontWeight: 800, color: mapping[h] !== '_ignore' ? BLUE : 'rgba(255,255,255,0.3)',
                          whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {h}{mapping[h] !== '_ignore' ? ` → ${CSV_FIELD_LABELS[mapping[h]]}` : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0,3).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {headers.map((_, ci) => (
                          <td key={ci} style={{ padding: '4px 8px', color: SILVER, whiteSpace: 'nowrap' }}>
                            {String(row[ci] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setStep('upload'); setError(''); }}
              style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12,
                cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
              ← Voltar
            </button>
            <button onClick={() => {
                const has = Object.values(mapping).some(v => v === 'name');
                const hasE = Object.values(mapping).some(v => v === 'email');
                if (!has || !hasE) { setError('Mapeie pelo menos as colunas Nome e Email.'); return; }
                setError(''); setStep('preview');
              }}
              style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12,
                cursor: 'pointer', background: 'rgba(99,179,237,0.12)', border: '1.5px solid rgba(99,179,237,0.4)', color: BLUE,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
              Confirmar mapeamento
            </button>
          </div>
        </>)}

        {/* ── STEP 3: PREVIEW ──────────────────────────────────────────────── */}
        {step === 'preview' && (<>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['#','Nome','Email','Telefone','CPF','Pagamento','Valor (R$)','Parcelas','Data Entrada','Vendedor','Valor BP','Pag. BP','Modelo','Parcela BP','1ª Parcela','Últ. Pag.','Próx. Pag.','Em Dia','Status','OK','Ação'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 900,
                      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: SILVER, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Disclaimer for name conflicts */}
                {buildRows().some(r => r.dupStatus === 'name_conflict') && (
                  <tr>
                    <td colSpan={21} style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                        background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}>
                        <span className="material-symbols-outlined" style={{ color: '#fbbf24', fontSize: 18, flexShrink: 0 }}>warning</span>
                        <div>
                          <p style={{ color: '#fbbf24', fontWeight: 900, fontSize: 11, margin: 0 }}>
                            ⚠ {buildRows().filter(r => r.dupStatus === 'name_conflict').length} registro{buildRows().filter(r => r.dupStatus === 'name_conflict').length !== 1 ? 's' : ''} com nome já cadastrado (email diferente)
                          </p>
                          <p style={{ color: SILVER, fontSize: 10, margin: '3px 0 0' }}>
                            Esses registros têm o mesmo nome de um aluno existente mas com email diferente — pode ser duplicata ou pessoa diferente. Use a coluna Ação para decidir: <strong style={{color:'white'}}>Pular</strong> descarta o registro, <strong style={{color:'white'}}>Incluir assim mesmo</strong> cadastra normalmente.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {buildRows().map((r, i) => {
                  const isConflict = r.dupStatus === 'name_conflict';
                  const isSkipped  = skippedIdx.has(i);
                  return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: isSkipped ? 0.4 : 1 }}>
                    <td style={{ padding: '5px 8px', color: SILVER, fontSize: 10 }}>{i+1}</td>
                    <td style={{ padding: '5px 8px', color: 'white', fontWeight: 700 }}>{r.name || <span style={{color:'#f87171'}}>—</span>}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.email || <span style={{color:'#f87171'}}>—</span>}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.phone || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.cpf || '—'}</td>
                    <td style={{ padding: '5px 8px', color: GOLD, fontWeight: 700 }}>
                      {{PIX:'PIX',BOLETO:'Boleto',CARTAO_CREDITO:'Crédito',CARTAO_DEBITO:'Débito'}[r.paymentMethod] || r.paymentMethod}
                    </td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.totalAmount || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.installments}×</td>
                    <td style={{ padding: '5px 8px', color: SILVER, whiteSpace:'nowrap' }}>{r.entryDate || '—'}</td>
                    <td style={{ padding: '5px 8px', color: GOLD, fontWeight: 700 }}>{r.vendedor || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.bp_valor || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.bp_pagamento || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.bp_modelo || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER }}>{r.bp_parcela || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER, whiteSpace:'nowrap' }}>{r.bp_primeira_parcela || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER, whiteSpace:'nowrap' }}>{r.bp_ultimo_pagamento || '—'}</td>
                    <td style={{ padding: '5px 8px', color: SILVER, whiteSpace:'nowrap' }}>{r.bp_proximo_pagamento || '—'}</td>
                    <td style={{ padding: '5px 8px' }}>
                      {r.bp_em_dia === 'SIM'
                        ? <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 99, background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>✓ SIM</span>
                        : r.bp_em_dia
                        ? <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 99, background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>✗ {r.bp_em_dia}</span>
                        : <span style={{ color: SILVER }}>—</span>}
                    </td>
                    <td style={{ padding: '5px 8px' }}><DupBadge status={r.dupStatus} conflictWith={r.conflictWith} /></td>
                    <td style={{ padding: '5px 8px' }}><ConfBadge level={r.confidence} /></td>
                    <td style={{ padding: '5px 8px' }}>
                      {isConflict && (
                        <button
                          onClick={() => setSkippedIdx(prev => {
                            const n = new Set(prev);
                            if (n.has(i)) n.delete(i); else n.add(i);
                            return n;
                          })}
                          style={{
                            fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 8,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: isSkipped ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                            color: isSkipped ? '#4ade80' : '#f87171',
                            border: `1px solid ${isSkipped ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          }}
                        >
                          {isSkipped ? '✓ Incluir assim mesmo' : '✕ Pular'}
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: SILVER, marginBottom: 14 }}>
            <strong style={{ color: 'white' }}>{totalValid}</strong> aluno{totalValid !== 1 ? 's' : ''} válidos de {allRaw.length} linhas
            {' '}({buildRows().filter(r => r.dupStatus === 'enrich').length > 0 && (
              <span style={{ color: '#63b3ed' }}>
                {buildRows().filter(r => r.dupStatus === 'enrich').length} 🔄 serão enriquecidos
              </span>
            )})
          </p>
          {/* Loading bar */}
          {saving && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ fontSize: 11, color: BLUE, fontWeight: 700, margin: 0 }}>Importando... aguarde</p>
                <p style={{ fontSize: 11, color: SILVER, margin: 0 }}>{Math.round(progress)}%</p>
              </div>
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  width: `${progress}%`, height: '100%', borderRadius: 99,
                  background: `linear-gradient(90deg, rgba(99,179,237,0.7) 0%, #63b3ed 100%)`,
                  transition: 'width 0.2s ease',
                  boxShadow: '0 0 8px rgba(99,179,237,0.6)',
                }} />
              </div>
              <p style={{ fontSize: 10, color: 'rgba(168,178,192,0.6)', margin: '5px 0 0', textAlign: 'center' }}>
                Processando {totalValid} aluno{totalValid !== 1 ? 's' : ''}... não feche esta janela.
              </p>
            </div>
          )}
          {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setStep('map'); setError(''); }} disabled={saving}
              style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
              ← Ajustar
            </button>
            <button onClick={handleImport} disabled={saving || totalValid === 0}
              style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || totalValid === 0 ? 0.7 : 1,
                background: saving ? 'rgba(99,179,237,0.08)' : 'rgba(99,179,237,0.15)',
                border: '1.5px solid rgba(99,179,237,0.4)', color: BLUE,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15,
                animation: saving ? 'spin 1s linear infinite' : 'none' }}>
                {saving ? 'progress_activity' : 'upload'}
              </span>
              {saving ? `Importando ${Math.round(progress)}%...` : `Importar ${totalValid} aluno${totalValid !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>)}

        {/* ── STEP 4: DONE ────────────────────────────────────────────────── */}
        {step === 'done' && result && (<>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56,
              color: result.saved > 0 ? BLUE : result.enriched > 0 ? BLUE : '#f87171' }}>
              {result.saved > 0 || result.enriched > 0 ? 'task_alt' : 'error'}
            </span>
            {result.saved > 0 && (
              <p style={{ color: 'white', fontWeight: 900, fontSize: 20, margin: '14px 0 4px' }}>
                {result.saved} novo{result.saved !== 1 ? 's' : ''} adicionado{result.saved !== 1 ? 's' : ''}!
              </p>
            )}
            {result.enriched > 0 && (
              <p style={{ color: BLUE, fontSize: 14, fontWeight: 700, margin: '8px 0 4px' }}>
                🔄 {result.enriched} cadastro{result.enriched !== 1 ? 's' : ''} enriquecido{result.enriched !== 1 ? 's' : ''} com dados faltantes
              </p>
            )}
            {result.saved === 0 && result.enriched === 0 && result.failed === 0 && (
              <p style={{ color: SILVER, fontSize: 14, margin: '14px 0 4px' }}>Nenhum registro processado.</p>
            )}
            {result.failed > 0 && (
              <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>
                {result.failed} linha{result.failed !== 1 ? 's' : ''} com erro
              </p>
            )}
          </div>
          <button onClick={onClose}
            style={{ width: '100%', padding: '13px 0', borderRadius: 14, fontWeight: 900, fontSize: 13,
              cursor: 'pointer', background: 'rgba(99,179,237,0.15)', border: `1.5px solid ${BLUE}`, color: BLUE }}>
            Fechar
          </button>
        </>)}
      </div>
    </div>,
    document.body
  );
}

// ── Batch Add Modal ───────────────────────────────────────────────────────────
function BatchAddModal({ courseName, existingEmails, onClose, onSaved }: {
  courseName: string;
  existingEmails: Set<string>;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [step,     setStep]     = React.useState<'paste' | 'preview' | 'done'>('paste');
  const [rawText,  setRawText]  = React.useState('');
  const [rows,     setRows]     = React.useState<ParsedRow[]>([]);
  const [saving,   setSaving]   = React.useState(false);
  const [result,   setResult]   = React.useState<{ saved: number; enriched: number; failed: number; errors: string[] } | null>(null);
  const [error,    setError]    = React.useState('');

  const [useBp, setUseBp] = React.useState(false);
  const [bpVendedor, setBpVendedor] = React.useState('');
  const [bpModelo, setBpModelo] = React.useState('');
  const [bpEmDia, setBpEmDia] = React.useState('');

  const handleParse = () => {
    const parsed = parseBatchText(rawText).map(r => ({
      ...r,
      dupStatus: existingEmails.has(r.email.toLowerCase()) ? 'enrich' as const : 'new' as const,
    }));
    if (parsed.length === 0) { setError('Nenhum aluno identificado. Verifique o formato.'); return; }
    setRows(parsed); setError(''); setStep('preview');
  };

  const updateRow = (i: number, field: keyof ParsedRow, value: string) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleImport = async () => {
    const valid = rows.filter(r => r.name && r.email);
    if (valid.length === 0) { setError('Nenhuma linha válida (nome + email obrigatórios).'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/alunos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName,
          students: valid.map(r => ({
            name: r.name, email: r.email, phone: r.phone,
            cpf: r.cpf, paymentMethod: r.paymentMethod,
            totalAmount:       r.totalAmount       || '0',
            installments:      r.installments      || '1',
            installmentAmount: r.installmentAmount || '0',
            installmentsPaid:  r.installmentsPaid  || '0',
            entryDate: r.entryDate ? new Date(r.entryDate).getTime() : Date.now(),
            isExisting: r.dupStatus === 'enrich',
            vendedor:      r.vendedor?.trim()  || (useBp ? bpVendedor : null),
            bp_modelo:     r.bp_modelo?.trim() || (useBp ? bpModelo : null),
            bp_em_dia:     r.bp_em_dia?.trim() || (useBp ? bpEmDia : null),
            bp_valor:      r.bp_valor             || null,
            bp_pagamento:  r.bp_pagamento         || null,
            bp_parcela:    r.bp_parcela           || null,
            bp_primeira_parcela:  r.bp_primeira_parcela  ? new Date(r.bp_primeira_parcela).getTime()  : null,
            bp_ultimo_pagamento:  r.bp_ultimo_pagamento  ? new Date(r.bp_ultimo_pagamento).getTime()  : null,
            bp_proximo_pagamento: r.bp_proximo_pagamento ? new Date(r.bp_proximo_pagamento).getTime() : null,
          })),
        }),
      });
      const data = await res.json();
      setResult(data);
      setStep('done');
      if (data.saved > 0) onSaved(data.saved + (data.enriched || 0));
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const IN = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, color: 'white', fontSize: 11, padding: '4px 7px', outline: 'none', boxSizing: 'border-box' as const };
  const SEL = { ...IN, cursor: 'pointer' };
  const PAYMENT_OPTS = [
    { v: 'PIX',           l: 'PIX' },
    { v: 'CARTAO_CREDITO', l: 'Cartão Crédito' },
    { v: 'CARTAO_DEBITO',  l: 'Cartão Débito' },
    { v: 'BOLETO',         l: 'Boleto' },
  ];

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.92)', backdropFilter: 'blur(16px)' }} />
      <div style={{
        position: 'relative', width: '100%',
        maxWidth: step === 'preview' ? 1000 : 560,
        maxHeight: '90vh', overflowY: 'auto',
        borderRadius: 24,
        background: 'linear-gradient(160deg, rgba(8,15,30,0.99) 0%, rgba(4,10,20,0.99) 100%)',
        border: '1px solid rgba(74,222,128,0.2)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        padding: 32, transition: 'max-width 0.3s',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)',
            flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ color: GREEN, fontSize: 20 }}>upload_file</span>
          </div>
          <div>
            <h3 style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: 0 }}>Adicionar por Lote</h3>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, marginTop: 2 }}>
              {step === 'paste'   ? 'Cole os dados — a plataforma identifica os campos automaticamente' :
               step === 'preview' ? `${rows.length} aluno${rows.length !== 1 ? 's' : ''} identificado${rows.length !== 1 ? 's' : ''} — revise e confirme` :
               'Importação concluída'}
            </p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: SILVER, cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* ─── STEP 1: PASTE ─────────────────────────────────────────────── */}
        {step === 'paste' && (<>
          {/* Examples */}
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: SILVER, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Formatos aceitos</p>
            {["João Silva, joao@email.com, (11) 99999-0000, 123.456.789-00, PIX",
              "Maria Souza\naria.souza@gmail.com\n(21) 98765-4321\nCartão Crédito",
              "joao@email.com 11 99999-0000 João da Silva 123.456.789-00 boleto",
            ].map((ex, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(74,222,128,0.8)',
                background: 'rgba(74,222,128,0.05)', borderRadius: 7, padding: '6px 10px',
                marginBottom: i < 2 ? 6 : 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ex}</div>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: SILVER,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Cole os dados aqui</label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder={"João Silva, joao@gmail.com, (11) 99999-0000\nMaria Santos, maria@hotmail.com, 987.654.321-00, Boleto\n..."}
            style={{ width: '100%', minHeight: 220, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: 'white',
              fontSize: 12, padding: 14, outline: 'none', resize: 'vertical',
              fontFamily: 'monospace', lineHeight: 1.7, boxSizing: 'border-box' }}
          />
          {error && <p style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12,
                cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
              Cancelar
            </button>
            <button onClick={handleParse} disabled={!rawText.trim()}
              style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12,
                cursor: rawText.trim() ? 'pointer' : 'not-allowed', opacity: rawText.trim() ? 1 : 0.5,
                background: 'rgba(74,222,128,0.15)', border: '1.5px solid rgba(74,222,128,0.4)', color: GREEN,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>auto_awesome</span>
              Processar e Identificar
            </button>
          </div>
        </>)}

        {/* ─── STEP 2: PREVIEW ───────────────────────────────────────────── */}
        {step === 'preview' && (<>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['#','Nome','Email','Telefone','CPF','Pagamento','Valor (R$)','Data Entrada','Status','OK',''].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 900,
                      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: SILVER,
                      whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isCard = r.paymentMethod === 'CARTAO_CREDITO' || r.paymentMethod === 'CREDIT_CARD';
                  const numCols = 9; // total columns in thead
                  return (
                    <React.Fragment key={i}>
                      {/* Main row */}
                      <tr style={{ borderBottom: isCard ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '5px 8px', color: SILVER, fontSize: 10 }}>{i + 1}</td>
                        <td style={{ padding: '5px 4px' }}>
                          <input value={r.name} onChange={e => updateRow(i, 'name', e.target.value)} style={IN} />
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <input value={r.email} onChange={e => updateRow(i, 'email', e.target.value)} style={IN} />
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <input value={r.phone} onChange={e => updateRow(i, 'phone', e.target.value)} style={{ ...IN, width: 130 }} />
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <input value={r.cpf} onChange={e => updateRow(i, 'cpf', e.target.value)} style={{ ...IN, width: 118 }} />
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <select value={r.paymentMethod} onChange={e => updateRow(i, 'paymentMethod', e.target.value)} style={SEL}>
                            {PAYMENT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <input value={r.totalAmount} onChange={e => updateRow(i, 'totalAmount', e.target.value)}
                            placeholder={isCard ? 'Total' : '0,00'} style={{ ...IN, width: 80 }} />
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <input type="date" value={r.entryDate} onChange={e => updateRow(i, 'entryDate', e.target.value)}
                            style={{ ...IN, width: 120, colorScheme: 'dark' }} />
                        </td>
                        <td style={{ padding: '5px 8px' }}><DupBadge status={r.dupStatus} /></td>
                        <td style={{ padding: '5px 8px' }}><ConfBadge level={r.confidence} /></td>
                        <td style={{ padding: '5px 4px' }}>
                          <button onClick={() => removeRow(i)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14, padding: 2 }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                      {/* Sub-row for card installments */}
                      {isCard && (
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(232,177,79,0.04)' }}>
                          <td />
                          <td colSpan={numCols - 1} style={{ padding: '4px 4px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 9, fontWeight: 900, color: GOLD, textTransform: 'uppercase',
                                letterSpacing: '0.1em', marginRight: 4, whiteSpace: 'nowrap' }}>💳 Parcelamento:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <label style={{ fontSize: 9, color: SILVER, whiteSpace: 'nowrap' }}>Nº Parcelas</label>
                                <input type="number" min="1" max="36"
                                  value={r.installments}
                                  onChange={e => updateRow(i, 'installments', e.target.value)}
                                  style={{ ...IN, width: 52, textAlign: 'center' }} />
                              </div>
                              <span style={{ color: SILVER, fontSize: 11 }}>×</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <label style={{ fontSize: 9, color: SILVER, whiteSpace: 'nowrap' }}>R$ / parcela</label>
                                <input
                                  value={r.installmentAmount}
                                  onChange={e => updateRow(i, 'installmentAmount', e.target.value)}
                                  placeholder="0,00" style={{ ...IN, width: 80 }} />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                <label style={{ fontSize: 9, color: SILVER, whiteSpace: 'nowrap' }}>Pagas</label>
                                <input type="number" min="0"
                                  value={r.installmentsPaid}
                                  onChange={e => updateRow(i, 'installmentsPaid', e.target.value)}
                                  style={{ ...IN, width: 52, textAlign: 'center' }} />
                              </div>
                              {r.installments && r.installmentAmount && (
                                <span style={{ fontSize: 9, color: GOLD, marginLeft: 4 }}>
                                  Total: R$ {(parseFloat(r.installments) * parseFloat(r.installmentAmount.replace(',', '.'))).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, color: SILVER, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
              <input type="checkbox" checked={useBp} onChange={e => setUseBp(e.target.checked)} />
              Incluir Informações Adicionais para TODOS OS ALUNOS do lote (Modelo / Vendedor / Status)
            </label>
            {useBp && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 12 }}>
                 <div>
                  <label style={{ display: 'block', fontSize: 10, color: SILVER, marginBottom: 4 }}>Vendedor</label>
                  <select style={IN} value={bpVendedor} onChange={e => setBpVendedor(e.target.value)}>
                    <option value="">— Selecione —</option>
                    {['Nackson','Samuel','Alba','Pacheco','Ana'].map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                 </div>
                 <div>
                  <label style={{ display: 'block', fontSize: 10, color: SILVER, marginBottom: 4 }}>Modelo</label>
                  <input style={IN} placeholder="1x / 3x" value={bpModelo} onChange={e => setBpModelo(e.target.value)} />
                 </div>
                 <div>
                  <label style={{ display: 'block', fontSize: 10, color: SILVER, marginBottom: 4 }}>Status</label>
                  <input style={IN} placeholder="SIM / QUITO" value={bpEmDia} onChange={e => setBpEmDia(e.target.value)} />
                 </div>
              </div>
            )}
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setStep('paste'); setError(''); }}
              style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12,
                cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
              ← Voltar
            </button>
            <button onClick={handleImport} disabled={saving || rows.filter(r => r.name && r.email).length === 0}
              style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                background: 'rgba(74,222,128,0.15)', border: '1.5px solid rgba(74,222,128,0.4)', color: GREEN,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                {saving ? 'progress_activity' : 'upload'}
              </span>
              {saving ? 'Importando...' : `Importar ${rows.filter(r => r.name && r.email).length} aluno${rows.filter(r => r.name && r.email).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>)}

        {/* ─── STEP 3: DONE ──────────────────────────────────────────────── */}
        {step === 'done' && result && (<>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: (result as any).saved > 0 ? GREEN : '#63b3ed' }}>
              {(result as any).saved > 0 || (result as any).enriched > 0 ? 'task_alt' : 'error'}
            </span>
            <p style={{ color: 'white', fontWeight: 900, fontSize: 18, margin: '12px 0 4px' }}>
              {(result as any).saved} novo{(result as any).saved !== 1 ? 's' : ''} importado{(result as any).saved !== 1 ? 's' : ''}!
            </p>
            {(result as any).enriched > 0 && (
              <p style={{ color: '#63b3ed', fontSize: 13, margin: '4px 0' }}>
                🔄 {(result as any).enriched} cadastro{(result as any).enriched !== 1 ? 's' : ''} enriquecido{(result as any).enriched !== 1 ? 's' : ''} com dados faltantes
              </p>
            )}
            {(result as any).failed > 0 && (
              <p style={{ color: '#fbbf24', fontSize: 12 }}>{(result as any).failed} falha{(result as any).failed !== 1 ? 's' : ''}</p>
            )}
            {result.errors.length > 0 && (
              <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 12, textAlign: 'left',
                background: 'rgba(248,113,113,0.07)', borderRadius: 10, padding: '10px 14px' }}>
                {result.errors.map((e, i) => <p key={i} style={{ color: '#f87171', fontSize: 10, margin: '2px 0' }}>{e}</p>)}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: '100%', marginTop: 20, padding: '12px 0', borderRadius: 12,
            fontWeight: 900, fontSize: 13, cursor: 'pointer',
            background: 'rgba(74,222,128,0.15)', border: '1.5px solid rgba(74,222,128,0.4)', color: GREEN }}>
            Fechar
          </button>
        </>)}
      </div>
    </div>,
    document.body
  );
}

// ── Add Student Modal ─────────────────────────────────────────────────────────
function AddStudentModal({ courseName, onClose, onSaved }: {
  courseName: string;
  onClose: () => void;
  onSaved: (s: ManualStudent) => void;
}) {
  type PayType = 'PIX_AVISTA' | 'PIX_CARTAO' | 'CREDIT_CARD' | 'PIX_MENSAL';

  const [form, setForm] = useState({
    name:               '',
    email:              '',
    phone:              '',
    entry_date:         new Date().toISOString().slice(0, 10),
    first_payment_date: new Date().toISOString().slice(0, 10),
    payment_type:       'PIX_AVISTA' as PayType,
    currency:           'BRL',
    total_amount:       '',
    down_payment:       '',
    installments:       1,
    notes:              '',
    bp_vendedor:        '',
    bp_modelo:          '',
    bp_em_dia:          'Adimplente',
    bp_cpf:             '',
  });
  const [instDates, setInstDates] = useState<InstallmentDate[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Auto-generate installment dates whenever relevant fields change
  useEffect(() => {
    const needsDates = ['PIX_CARTAO', 'CREDIT_CARD', 'PIX_MENSAL'].includes(form.payment_type);
    if (!needsDates || form.installments < 1) { setInstDates([]); return; }
    const [py, pm, pd] = form.first_payment_date.split('-').map(Number);
    setInstDates(Array.from({ length: form.installments }, (_, i) => {
      const d = new Date(py, pm - 1 + i, pd, 12, 0, 0);
      return { due_ms: d.getTime(), paid: false, paid_ms: null } as InstallmentDate;
    }));
  }, [form.installments, form.first_payment_date, form.payment_type, form.total_amount, form.down_payment]);

  // Auto-set first_payment_date = entry_date + 30 days for PIX_CARTAO and PIX_MENSAL
  useEffect(() => {
    if (form.payment_type === 'PIX_CARTAO' || form.payment_type === 'PIX_MENSAL') {
      const [ey, em, ed] = form.entry_date.split('-').map(Number);
      const d = new Date(ey, em - 1, ed + 30);
      const iso = d.toISOString().slice(0, 10);
      setForm(f => ({ ...f, first_payment_date: iso }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.payment_type, form.entry_date]);

  // Editable installment amount state — must be declared before derived values per hook rules
  const [manualInstAmt, setManualInstAmt] = useState('');

  const togglePaid = (idx: number) => {
    setInstDates(prev => prev.map((d, i) =>
      i !== idx ? d : { ...d, paid: !d.paid, paid_ms: !d.paid ? Date.now() : null }
    ));
  };

  // Derived amounts
  const totalAmt  = parseFloat(form.total_amount || '0');
  const downAmt   = (form.payment_type === 'PIX_CARTAO' || form.payment_type === 'PIX_MENSAL') ? parseFloat(form.down_payment || '0') : 0;
  const remaining = Math.max(0, totalAmt - downAmt);
  const instAmt   = form.installments > 0 ? remaining / form.installments : remaining;

  // Sync manualInstAmt when derived instAmt changes
  useEffect(() => {
    if (instAmt > 0) setManualInstAmt(instAmt.toFixed(2));
    else setManualInstAmt('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.total_amount, form.down_payment, form.installments, form.payment_type]);

  const displayInstAmt = parseFloat(manualInstAmt || '0') || instAmt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.total_amount) {
      setError('Preencha Nome, Email e Valor.'); return;
    }
    setSaving(true); setError('');
    try {
      const [ey, em, ed] = form.entry_date.split('-').map(Number);
      const entryTs = new Date(ey, em - 1, ed, 12, 0, 0).getTime();
      const isPix     = form.payment_type === 'PIX_AVISTA';
      const dbPayType = (
        form.payment_type === 'PIX_AVISTA'  ? 'PIX' :
        form.payment_type === 'PIX_MENSAL'  ? 'PIX_MENSAL' :
        form.payment_type === 'PIX_CARTAO'  ? 'PIX_CARTAO' : 'CREDIT_CARD'
      );
      const body = {
        course_name:        courseName,
        name:               form.name,
        email:              form.email.toLowerCase().trim(),
        phone:              form.phone,
        entry_date:         entryTs,
        payment_type:       dbPayType,
        currency:           form.currency,
        total_amount:       totalAmt,
        down_payment:       downAmt,
        installments:       isPix ? 1 : form.installments,
        installment_amount: isPix ? totalAmt : displayInstAmt,
        installment_dates:  isPix
          ? [{ due_ms: entryTs, paid: true, paid_ms: entryTs }]
          : instDates,
        notes:        form.notes,
        bp_vendedor:  form.bp_vendedor,
        bp_modelo:    form.bp_modelo,
        bp_em_dia:    isPix ? 'Quitado' : (form.bp_em_dia || 'Adimplente'),
        bp_valor:     form.total_amount,
        bp_pagamento: (
          form.payment_type === 'PIX_AVISTA'  ? 'Pix' :
          form.payment_type === 'PIX_CARTAO'  ? 'Pix + Cartao' :
          form.payment_type === 'CREDIT_CARD' ? 'Cartao' : 'Pix Mensal'
        ),
        document:     form.bp_cpf || null,
      };
      const r = await fetch('/api/alunos/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Erro ao salvar'); return; }
      onSaved(j.student as ManualStudent);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const GLASS: React.CSSProperties = {
    background: 'linear-gradient(160deg, rgba(0,22,55,0.97) 0%, rgba(0,12,35,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.08) inset',
    borderRadius: 28,
  };
  const INPUT: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: 'white', padding: '10px 14px', width: '100%', outline: 'none',
    fontSize: 13, fontWeight: 600,
  };
  const LABEL: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: SILVER,
    display: 'block', marginBottom: 6,
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.85)', backdropFilter: 'blur(12px)' }} />
      <div style={{ ...GLASS, position: 'relative', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', padding: 32 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)' }}>
              <span className="material-symbols-outlined" style={{ color: GREEN, fontSize: 22 }}>person_add</span>
            </div>
            <div>
              <h2 style={{ color: 'white', fontWeight: 900, fontSize: 18, margin: 0 }}>Adicionar Aluno</h2>
              <p style={{ color: SILVER, fontSize: 11, margin: '3px 0 0', fontWeight: 700 }}>{courseName}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: SILVER, fontSize: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Row 1: nome + email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={LABEL}>Nome *</label>
              <input style={INPUT} placeholder="Nome completo" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label style={LABEL}>Email *</label>
              <input style={INPUT} type="email" placeholder="email@exemplo.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          </div>

          {/* Row 2: telefone + data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={LABEL}>Telefone *</label>
              <input style={INPUT} placeholder="(11) 99999-9999" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div>
              <label style={LABEL}>Data de Entrada *</label>
              <input style={INPUT} type="date" value={form.entry_date}
                onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} required />
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 20 }} />

          {/* Forma de Pagamento */}
          <label style={{ ...LABEL, marginBottom: 12 }}>Forma de Pagamento *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {([
              { key: 'PIX_AVISTA',  icon: 'pix',              label: 'PIX a Vista',       col: GREEN      },
              { key: 'PIX_CARTAO',  icon: 'currency_exchange', label: 'PIX + Cartao',      col: '#38bdf8'  },
              { key: 'CREDIT_CARD', icon: 'credit_card',       label: 'Cartao de Credito', col: GOLD       },
              { key: 'PIX_MENSAL',  icon: 'autorenew',         label: 'PIX Mensal',        col: '#c084fc'  },
            ] as { key: string; icon: string; label: string; col: string }[]).map(({ key, icon, label, col }) => (
              <button key={key} type="button"
                onClick={() => {
                  const next: Partial<typeof form> = { payment_type: key as PayType, installments: 1 };
                  // Bug 03: for PIX_MENSAL, auto-advance first_payment_date by 30 days from entry_date
                  if (key === 'PIX_MENSAL') {
                    const [ey, em, ed] = form.entry_date.split('-').map(Number);
                    const d = new Date(ey, em - 1, ed + 30);
                    next.first_payment_date = d.toISOString().slice(0, 10);
                  }
                  setForm(f => ({ ...f, ...next }));
                }}
                style={{
                  padding: '10px 12px', borderRadius: 12, fontWeight: 800, fontSize: 11, cursor: 'pointer',
                  background: form.payment_type === key ? `${col}22` : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${form.payment_type === key ? col : 'rgba(255,255,255,0.1)'}`,
                  color: form.payment_type === key ? col : SILVER,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s',
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {/* Moeda */}
          <div style={{ marginBottom: 18 }}>
            <label style={LABEL}>Moeda *</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['BRL', 'USD', 'ARS', 'COP', 'CLP', 'EUR', 'MXN', 'PEN'] as const).map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, currency: c }))}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                    background: form.currency === c ? 'rgba(232,177,79,0.18)' : 'rgba(255,255,255,0.05)',
                    border: `1.5px solid ${form.currency === c ? GOLD : 'rgba(255,255,255,0.1)'}`,
                    color: form.currency === c ? GOLD : SILVER, transition: 'all 0.2s',
                  }}>{c}
                </button>
              ))}
            </div>
          </div>

          {/* Valor + Parcelas */}
          <div style={{ display: 'grid',
            gridTemplateColumns: form.payment_type === 'PIX_AVISTA' ? '1fr' :
              form.payment_type === 'PIX_CARTAO' ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr',
            gap: 14, marginBottom: 14 }}>
            <div>
              <label style={LABEL}>Valor Total ({form.currency}) *</label>
              <input style={INPUT} type="number" step="0.01" min="0" placeholder="997.00" value={form.total_amount}
                onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} required />
            </div>
            {(form.payment_type === 'PIX_CARTAO' || form.payment_type === 'PIX_MENSAL') && (
              <div>
                <label style={LABEL}>Entrada PIX ({form.currency})</label>
                <input style={INPUT} type="number" step="0.01" min="0" placeholder="0.00" value={form.down_payment}
                  onChange={e => setForm(f => ({ ...f, down_payment: e.target.value }))} />
              </div>
            )}
            {form.payment_type !== 'PIX_AVISTA' && (<>
              <div>
                <label style={LABEL}>{form.payment_type === 'PIX_MENSAL' ? 'Meses' : 'Parcelas'}</label>
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.installments}
                  onChange={e => setForm(f => ({ ...f, installments: parseInt(e.target.value) }))}>
                  {Array.from({ length: form.payment_type === 'PIX_MENSAL' ? 60 : 24 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n} style={{ background: NAVY, color: 'white' }}>{n}x</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL}>{form.payment_type === 'PIX_CARTAO' ? 'Parcela Cartao' : 'Valor/Parcela'}</label>
                <input
                  style={{ ...INPUT, color: GOLD, fontWeight: 900 }}
                  type="number" step="0.01" min="0"
                  placeholder={instAmt > 0 ? instAmt.toFixed(2) : '--'}
                  value={manualInstAmt}
                  onChange={e => setManualInstAmt(e.target.value)}
                />
              </div>
            </>)}
          </div>

          {/* Data do 1o pagamento */}
          {form.payment_type !== 'PIX_AVISTA' && (
            <div style={{ marginBottom: 18 }}>
              <label style={LABEL}>Data do 1o pagamento *</label>
              <input style={{ ...INPUT, maxWidth: 220 }} type="date" value={form.first_payment_date}
                onChange={e => setForm(f => ({ ...f, first_payment_date: e.target.value }))} required />
              <p style={{ fontSize: 10, color: SILVER, marginTop: 6, fontWeight: 600 }}>
                As demais parcelas serao calculadas mensalmente a partir desta data.
              </p>
            </div>
          )}

          {/* Installment tracker */}
          {form.payment_type !== 'PIX_AVISTA' && instDates.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px 16px', marginBottom: 18 }}>
              <p style={{ ...LABEL, marginBottom: 12 }}>Parcelas geradas - marque as ja pagas</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {instDates.map((d, i) => (
                  <div key={i} onClick={() => togglePaid(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
                      cursor: 'pointer', transition: 'all 0.15s',
                      background: d.paid ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${d.paid ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                    <div style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${d.paid ? GREEN : 'rgba(255,255,255,0.2)'}`,
                      background: d.paid ? GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', flexShrink: 0 }}>
                      {d.paid && <span className="material-symbols-outlined" style={{ fontSize: 12, color: NAVY }}>check</span>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: d.paid ? GREEN : SILVER }}>Parcela {i + 1}</span>
                    <span style={{ fontSize: 11, color: SILVER, marginLeft: 4 }}>
                      {new Date(d.due_ms).toLocaleDateString('pt-BR')}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: d.paid ? GREEN : GOLD }}>
                      {form.currency} {displayInstAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
              {(form.payment_type === 'PIX_CARTAO' || form.payment_type === 'PIX_MENSAL') && downAmt > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 10,
                  fontSize: 11, fontWeight: 700, color: '#38bdf8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Entrada PIX paga no ato</span>
                  <span>{form.currency} {downAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          )}

          {/* Buyer Persona */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '20px 0' }} />
          <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(168,178,192,0.8)', marginBottom: 12 }}>
            Informações Adicionais (Planilha)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={LABEL}>Vendedor *</label>
              <select style={{ ...INPUT, cursor: 'pointer' }} value={form.bp_vendedor}
                onChange={e => setForm(f => ({ ...f, bp_vendedor: e.target.value }))} required>
                <option value="" style={{ background: NAVY }}>— Selecione —</option>
                {['Nackson','Samuel','Alba','Pacheco','Ana'].map(v => (
                  <option key={v} value={v} style={{ background: NAVY }}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Modelo *</label>
              <input style={INPUT} placeholder="Recorrência, Assinatura, 1x…" value={form.bp_modelo}
                onChange={e => setForm(f => ({ ...f, bp_modelo: e.target.value }))} required />
            </div>
            <div>
              <label style={LABEL}>Status *</label>
              <select style={{ ...INPUT, cursor: 'pointer' }} value={form.bp_em_dia}
                onChange={e => setForm(f => ({ ...f, bp_em_dia: e.target.value }))} required>
                <option value="Adimplente" style={{ background: NAVY, color: 'white' }}>Adimplente</option>
                <option value="Inadimplente" style={{ background: NAVY, color: 'white' }}>Inadimplente</option>
                <option value="Quitado" style={{ background: NAVY, color: 'white' }}>Quitado</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <label style={LABEL}>CPF / Documento</label>
              <input style={INPUT} placeholder="000.000.000-00" value={form.bp_cpf || ''}
                onChange={e => setForm(f => ({ ...f, bp_cpf: e.target.value }))} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 24 }}>
            <label style={LABEL}>Observações</label>
            <textarea style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} placeholder="Anotações extras..."
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
              padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 12, fontWeight: 700 }}>
              {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '12px 0', borderRadius: 14, fontWeight: 800, fontSize: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: '12px 0', borderRadius: 14, fontWeight: 900, fontSize: 13,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                background: 'rgba(74,222,128,0.12)', border: `1.5px solid ${GREEN}`, color: GREEN,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {saving ? 'progress_activity' : 'person_add'}
              </span>
              {saving ? 'Salvando...' : 'Adicionar Aluno'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Date format helpers ──────────────────────────────────────────────────────
// YYYY-MM-DD  →  DD/MM/AAAA  (for display inside the modal)
function isoToDMY(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // already in DD/MM/YYYY?
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
  return iso;
}
// DD/MM/AAAA  →  YYYY-MM-DD  (for the backend API)
function dmyToISO(dmy: string): string {
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return dmy; // if incomplete, return as-is (backend will ignore)
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ── Date field with auto-mask DD/MM/AAAA ─────────────────────────────────────
function EditDateField({ label, value, onChange, icon }: {
  label: string; value: string; onChange: (v: string) => void; icon: string;
}) {
  const handleChange = (raw: string) => {
    // Strip everything except digits
    const digits = raw.replace(/\D/g, '');
    // Rebuild: DD / MM / YYYY
    let masked = '';
    if (digits.length <= 2) {
      masked = digits;
    } else if (digits.length <= 4) {
      masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }
    onChange(masked);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>{icon}</span>
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          maxLength={10}
          placeholder="DD/MM/AAAA"
          inputMode="numeric"
          style={{
            width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, fontSize: 13,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'white', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}

// ── Field helper for EditStudentModal (must be at module scope — NOT inside render) ──
function EditField({ label, value, onChange, placeholder, icon, onEnter, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon: string; onEnter?: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>{icon}</span>
        <input
          value={value}
          onChange={e => !disabled && onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
          placeholder={placeholder || ''}
          disabled={disabled}
          style={{
            width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, fontSize: 13,
            background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: disabled ? 'rgba(255,255,255,0.35)' : 'white',
            outline: 'none', boxSizing: 'border-box', cursor: disabled ? 'default' : 'text',
          }}
        />
      </div>
    </div>
  );
}

const VENDEDORES = ['Nackson', 'Samuel', 'Alba', 'Pacheco', 'Ana'];

function EditSelect({ label, value, onChange, icon, options }: {
  label: string; value: string; onChange: (v: string) => void;
  icon: string; options: string[];
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>{icon}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, fontSize: 13,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'white', outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
          }}
        >
          <option value="" style={{ background: '#001a35' }}>— Selecione —</option>
          {options.map(v => (
            <option key={v} value={v} style={{ background: '#001a35' }}>{v}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Edit Student Modal ────────────────────────────────────────────────────────
function normaliseEmDia(v?: string): string {
  const raw = (v || '').trim(); const u = raw.toUpperCase();
  if (u === 'SIM') return 'Adimplente';
  if (u === 'NÃO' || u === 'NAO' || u === 'NÂO') return 'Inadimplente';
  if (u === 'QUITADO') return 'Quitado';
  if (['Adimplente', 'Inadimplente', 'Quitado'].includes(raw)) return raw;
  return 'Adimplente';
}

function EditStudentModal({ student, onClose, onSaved }: {
  student: {
    name: string; email: string; phone: string; document: string; manualId?: string;
    vendedor?: string; bp_valor?: string; bp_pagamento?: string; bp_modelo?: string;
    bp_parcela?: string; bp_em_dia?: string; bp_primeira_parcela?: string;
    bp_ultimo_pagamento?: string; bp_proximo_pagamento?: string; notes?: string;
    // payment fields (manual only)
    payment_type?: string; currency?: string; total_amount?: number;
    down_payment?: number; installments?: number; installment_amount?: number;
    installment_dates?: InstallmentDate[]; entry_date?: number;
  };
  onClose: () => void;
  onSaved: (updated: {
    phone: string; name: string; document: string; vendedor: string;
    bp_modelo: string; bp_em_dia: string; notes: string;
    // payment fields
    payment_type?: string; currency?: string; total_amount?: number;
    down_payment?: number; installments?: number; installment_amount?: number;
    installment_dates?: InstallmentDate[];
  }) => void;
}) {
  const isManual = !!student.manualId;

  // ── Personal ────────────────────────────────────────────────────
  const [phone,    setPhone]    = React.useState(student.phone    || '');
  const [name,     setName]     = React.useState(student.name     || '');
  const [docNum,   setDocNum]   = React.useState(student.document || '');
  const [notes,    setNotes]    = React.useState(student.notes    || '');

  // ── Buyer Persona ────────────────────────────────────────────────
  const [vendedor,   setVendedor]   = React.useState(student.vendedor      || '');
  const [bpValor,    setBpValor]    = React.useState(student.bp_valor      || '');
  const [bpPag,      setBpPag]      = React.useState(student.bp_pagamento  || '');
  const [bpModelo,   setBpModelo]   = React.useState(student.bp_modelo     || '');
  const [bpParcela,  setBpParcela]  = React.useState(student.bp_parcela    || '');
  const [bpEmDia,    setBpEmDia]    = React.useState(normaliseEmDia(student.bp_em_dia));
  const [bpPrimeira, setBpPrimeira] = React.useState(isoToDMY(student.bp_primeira_parcela  || ''));
  const [bpUltimo,   setBpUltimo]   = React.useState(isoToDMY(student.bp_ultimo_pagamento  || ''));
  const [bpProximo,  setBpProximo]  = React.useState(isoToDMY(student.bp_proximo_pagamento || ''));

  // ── Payment (manual only) ───────────────────────────────────────
  const [payType,    setPayType]    = React.useState(student.payment_type || 'PIX');
  const [currency,   setCurrency]   = React.useState(student.currency || 'BRL');
  const [totalAmt,   setTotalAmt]   = React.useState(student.total_amount != null ? String(student.total_amount) : '');
  const [downPay,    setDownPay]    = React.useState(student.down_payment != null ? String(student.down_payment) : '0');
  const [insts,      setInsts]      = React.useState(student.installments ?? 1);
  const [instDates,  setInstDates]  = React.useState<InstallmentDate[]>(student.installment_dates || []);
  const [entryDate,  setEntryDate]  = React.useState(student.entry_date ? new Date(student.entry_date).toISOString().slice(0,10) : '');

  const isPix   = payType === 'PIX';
  const autoInstAmt = (!isPix && insts > 0 && Number(totalAmt) > 0) ? ((Number(totalAmt) - Number(downPay || 0)) / insts) : 0;

  // Editable installment amount — manual entry only, no auto-recalc on field changes
  const [manualInstAmt, setManualInstAmt] = React.useState(
    student.installment_amount != null && student.installment_amount > 0
      ? String(student.installment_amount)
      : ''
  );

  const instAmt = parseFloat(manualInstAmt || '0') || autoInstAmt;

  // Sync installment_dates count when insts changes (preserve existing)
  React.useEffect(() => {
    if (isPix) { setInstDates([]); return; }
    const entry = entryDate ? new Date(entryDate).getTime() : Date.now();
    setInstDates(prev => {
      const next: InstallmentDate[] = [];
      for (let i = 0; i < insts; i++) {
        const existing = prev[i];
        const due_ms = existing?.due_ms ?? (entry + (i + 1) * 30 * 86400000);
        next.push({ due_ms, paid: existing?.paid ?? false, paid_ms: existing?.paid_ms ?? null });
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insts, isPix, entryDate]);

  const togglePaid = (idx: number) => setInstDates(prev =>
    prev.map((d, i) => i === idx ? { ...d, paid: !d.paid, paid_ms: !d.paid ? Date.now() : null } : d)
  );

  // ── Attachments ─────────────────────────────────────────────────
  const [attachments,  setAttachments]  = React.useState<any[]>([]);
  const [uploading,    setUploading]    = React.useState(false);
  const [uploadError,  setUploadError]  = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [saving, setSaving] = React.useState(false);
  const [error,  setError]  = React.useState('');

  React.useEffect(() => {
    fetch(`/api/alunos/attachments?email=${encodeURIComponent(student.email)}`)
      .then(r => r.json()).then(d => setAttachments(d.attachments || [])).catch(() => {});
  }, [student.email]);

  const handleUpload = async (file: File) => {
    setUploading(true); setUploadError('');
    try {
      const fd = new FormData(); fd.append('email', student.email); fd.append('file', file);
      const res = await fetch('/api/alunos/attachments', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      setAttachments(prev => [data.attachment, ...prev]);
    } catch (e: any) { setUploadError(e.message); }
    finally { setUploading(false); }
  };
  const handleDeleteAttachment = async (id: string) => {
    await fetch(`/api/alunos/attachments?id=${id}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const body: any = {
        email: student.email, phone: phone.trim() || null, name: name.trim() || null,
        document: docNum.trim() || null, manualId: student.manualId || null, notes: notes.trim() || null,
        vendedor: vendedor.trim() || null, bp_valor: bpValor.trim() || null,
        bp_pagamento: bpPag.trim() || null, bp_modelo: bpModelo.trim() || null,
        bp_parcela: bpParcela.trim() || null, bp_em_dia: bpEmDia || null,
        bp_primeira_parcela:  dmyToISO(bpPrimeira.trim()) || null,
        bp_ultimo_pagamento:  dmyToISO(bpUltimo.trim())   || null,
        bp_proximo_pagamento: dmyToISO(bpProximo.trim())  || null,
      };
      if (isManual && student.manualId) {
        // Also update the manual_students payment fields via the dedicated endpoint
        const manualRes = await fetch(`/api/alunos/manual/${student.manualId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_type: payType, currency, total_amount: Number(totalAmt) || null,
            down_payment: Number(downPay) || 0, installments: insts,
            installment_amount: instAmt || null, installment_dates: instDates,
            entry_date: entryDate ? new Date(entryDate + 'T12:00:00').getTime() : null,
            phone: phone.trim() || null, name: name.trim() || null, notes: notes.trim() || null,
          }),
        });
        if (!manualRes.ok) throw new Error((await manualRes.json()).error || 'Erro ao salvar pagamento');
      }
      const res = await fetch('/api/alunos/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar');
      onSaved({
        phone: phone.trim(), name: name.trim(), document: docNum.trim(),
        vendedor: vendedor.trim(), bp_modelo: bpModelo.trim(), bp_em_dia: bpEmDia, notes: notes.trim(),
        // payment fields — used to update row in real-time
        ...(isManual ? {
          payment_type: payType, currency,
          total_amount: Number(totalAmt) || undefined,
          down_payment: Number(downPay) || 0,
          installments: insts,
          installment_amount: instAmt || undefined,
          installment_dates: instDates,
        } : {}),
      });
      onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const PAY_TYPES = [
    { key: 'PIX',        label: 'PIX',            icon: 'bolt',         color: '#38bdf8' },
    { key: 'PIX_CARTAO', label: 'PIX + Cartão',   icon: 'credit_card',  color: '#a78bfa' },
    { key: 'CREDIT_CARD',label: 'Cartão',          icon: 'credit_score', color: GOLD     },
    { key: 'PIX_MENSAL', label: 'PIX Mensal',      icon: 'repeat',       color: GREEN    },
  ];
  const CURRENCIES = ['BRL','USD','ARS','EUR','GBP','COP','MXN','PEN','CLP','BOB','PYG','UYU'];

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.9)', backdropFilter: 'blur(14px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 540, borderRadius: 24,
        background: 'linear-gradient(160deg, rgba(8,15,30,0.98) 0%, rgba(4,10,20,0.99) 100%)',
        border: '1px solid rgba(99,179,237,0.2)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(99,179,237,0.08), 0 1px 0 rgba(255,255,255,0.05) inset',
        padding: 32, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.25)', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ color: '#63b3ed', fontSize: 20 }}>edit</span>
          </div>
          <div>
            <h3 style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: 0 }}>Editar Informações</h3>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, marginTop: 2 }}>{student.name} · {student.email}</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: SILVER, cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Dados Pessoais — manual only */}
        {isManual && (<>
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: TEAL, marginBottom: 12 }}>Dados Pessoais</p>
        <EditField label="Nome" icon="person" value={name} onChange={setName} onEnter={handleSave} placeholder="Nome completo" />
        <EditField label="Telefone" icon="phone" value={phone} onChange={setPhone} onEnter={handleSave} placeholder="(11) 99999-9999" />
        <EditField label="CPF / Documento" icon="badge" value={docNum} onChange={setDocNum} onEnter={handleSave} placeholder="000.000.000-00" />
        </>)}
        {!isManual && (<>
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: TEAL, marginBottom: 12 }}>Dados Pessoais</p>
        <EditField label="Nome" icon="person" value={name} onChange={setName} onEnter={handleSave} placeholder="Nome completo" disabled />
        <EditField label="Telefone" icon="phone" value={phone} onChange={setPhone} onEnter={handleSave} placeholder="(11) 99999-9999" />
        <EditField label="CPF / Documento" icon="badge" value={docNum} onChange={setDocNum} onEnter={handleSave} placeholder="000.000.000-00" />
        </>)}


        {/* Pagamento — manual students only */}
        {isManual && (<>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#38bdf8', marginBottom: 12, marginTop: 20 }}>Pagamento</p>

          {/* Payment type buttons */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 8 }}>Forma de Pagamento</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {PAY_TYPES.map(pt => (
                <button key={pt.key} type="button" onClick={() => setPayType(pt.key)} style={{
                  padding: '10px 6px', borderRadius: 12, fontWeight: 900, fontSize: 10, cursor: 'pointer',
                  background: payType === pt.key ? `${pt.color}18` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${payType === pt.key ? pt.color : 'rgba(255,255,255,0.1)'}`,
                  color: payType === pt.key ? pt.color : SILVER, transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{pt.icon}</span>
                  <span style={{ textAlign: 'center', lineHeight: 1.2 }}>{pt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Currency + Entry Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>Moeda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none' }}>
                {CURRENCIES.map(c => <option key={c} value={c} style={{ background: NAVY }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>Data de Entrada</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Total + Down payment */}
          <div style={{ display: 'grid', gridTemplateColumns: isPix ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <EditField label={`Valor Total (${currency})`} icon="payments" value={totalAmt} onChange={setTotalAmt} placeholder="Ex: 30000" />
            {(payType === 'PIX_CARTAO' || payType === 'PIX_MENSAL') && <EditField label={`Entrada (${currency})`} icon="arrow_downward" value={downPay} onChange={setDownPay} placeholder="0" />}
          </div>

          {/* Installments — select + editable amount + list with checkboxes */}
          {!isPix && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>Nº de Parcelas</label>
                <select value={insts} onChange={e => setInsts(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none', cursor: 'pointer' }}>
                  {Array.from({ length: 60 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n} style={{ background: NAVY }}>{n}x</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>Valor da Parcela</label>
                <input type="number" step="0.01" min="0"
                  value={manualInstAmt}
                  onChange={e => setManualInstAmt(e.target.value)}
                  placeholder={autoInstAmt > 0 ? autoInstAmt.toFixed(2) : '--'}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 900, color: GOLD, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            {instDates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER }}>Parcelas Geradas — marque as já pagas</label>
                  <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 99, background: 'rgba(74,222,128,0.12)', color: GREEN }}>
                    {instDates.filter(d => d.paid).length}/{insts} pagas
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {instDates.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
                      background: d.paid ? 'rgba(74,222,128,0.07)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${d.paid ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      transition: 'all 0.15s',
                    }}>
                      {/* Checkbox */}
                      <div onClick={() => togglePaid(i)} style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: d.paid ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)',
                        border: `1.5px solid ${d.paid ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 11, color: '#4ade80',
                      }}>
                        {d.paid && <span className="material-symbols-outlined" style={{ fontSize: 12, color: NAVY, fontVariationSettings: '"FILL" 1' }}>check</span>}
                      </div>
                      {/* Label */}
                      <span style={{ fontSize: 11, fontWeight: 700, color: d.paid ? '#4ade80' : SILVER, flexShrink: 0, minWidth: 52 }}>Parcela {i + 1}</span>
                      {/* Date */}
                      <input type="date" value={new Date(d.due_ms).toISOString().slice(0, 10)}
                        onChange={e => {
                          const ms = new Date(e.target.value + 'T12:00:00').getTime();
                          if (!isNaN(ms)) setInstDates(prev => prev.map((x, idx) => idx === i ? { ...x, due_ms: ms } : x));
                        }}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: d.paid ? '#4ade80' : 'white', fontSize: 11, fontWeight: 700, outline: 'none' }} />
                      {/* Amount */}
                      <span style={{ fontSize: 11, fontWeight: 900, color: GOLD, flexShrink: 0, minWidth: 76, textAlign: 'right' }}>
                        {fmtMoneyByCurrency(instAmt, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </>)}

        {/* Buyer Persona */}
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: GOLD, marginBottom: 12, marginTop: 20 }}>Vendedor</p>
        <EditSelect label="Vendedor" icon="sell" value={vendedor} onChange={setVendedor} options={VENDEDORES} />
        {isManual && (<>
          <EditField label="Modelo" icon="layers" value={bpModelo} onChange={setBpModelo} onEnter={handleSave} placeholder="Recorrência, Assinatura, 1x…" />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>Status</label>
            <select value={bpEmDia} onChange={e => setBpEmDia(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
              <option value="Adimplente" style={{ background: NAVY }}>Adimplente</option>
              <option value="Inadimplente" style={{ background: NAVY }}>Inadimplente</option>
              <option value="Quitado" style={{ background: NAVY }}>Quitado</option>
            </select>
          </div>
        </>)}

        {/* Observações */}
        <div style={{ marginBottom: 16, marginTop: 4 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>Observações</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações extras..." style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }} />
        </div>

        {/* Arquivos Anexos */}
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 12, marginTop: 20 }}>Arquivos Anexos</p>
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', borderRadius: 12, fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', marginBottom: 12, background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.28)', color: '#a78bfa', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{uploading ? 'progress_activity' : 'attach_file'}</span>
          {uploading ? 'Enviando...' : 'Anexar Arquivo (JPG, PDF, PNG)'}
        </button>
        {uploadError && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>{uploadError}</p>}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {attachments.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#a78bfa', flexShrink: 0 }}>{a.mimetype === 'application/pdf' ? 'picture_as_pdf' : 'image'}</span>
                <a href={`/api/alunos/attachments?id=${a.id}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 11, fontWeight: 700, color: '#a78bfa', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</a>
                <span style={{ fontSize: 10, color: SILVER, flexShrink: 0 }}>{(a.size_bytes / 1024).toFixed(0)} KB</span>
                <button onClick={() => handleDeleteAttachment(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
        {attachments.length === 0 && !uploading && <p style={{ color: SILVER, fontSize: 11, textAlign: 'center', marginBottom: 16 }}>Nenhum arquivo anexado</p>}

        {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{error}</p>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, background: 'rgba(99,179,237,0.12)', border: '1.5px solid rgba(99,179,237,0.4)', color: '#63b3ed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{saving ? 'progress_activity' : 'save'}</span>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


function DeleteConfirmModal({ name, source, onConfirm, onCancel, loading }: {
  name: string;
  source: 'manual' | 'hotmart';
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const isHotmart = source === 'hotmart';
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.9)', backdropFilter: 'blur(14px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420, borderRadius: 24,
        background: 'linear-gradient(160deg, rgba(30,8,8,0.98) 0%, rgba(20,4,4,0.99) 100%)',
        border: '1px solid rgba(239,68,68,0.25)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(239,68,68,0.1), 0 1px 0 rgba(255,255,255,0.05) inset',
        padding: 32,
      }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', margin: '0 auto 20px' }}>
          <span className="material-symbols-outlined" style={{ color: '#f87171', fontSize: 26 }}>person_remove</span>
        </div>
        <h3 style={{ color: 'white', fontWeight: 900, fontSize: 17, textAlign: 'center', margin: '0 0 10px' }}>
          {isHotmart ? 'Ocultar aluno desta lista?' : 'Remover aluno do curso?'}
        </h3>
        <p style={{ color: SILVER, fontSize: 13, textAlign: 'center', lineHeight: 1.6, margin: '0 0 8px' }}>
          <span style={{ color: 'white', fontWeight: 800 }}>{name}</span>{' '}
          {isHotmart
            ? 'será ocultado desta lista. Vendas e acesso à plataforma não são afetados.'
            : 'será removido permanentemente da lista de alunos manuais.'}
        </p>
        <p style={{ color: 'rgba(168,178,192,0.6)', fontSize: 11, textAlign: 'center', lineHeight: 1.5, margin: '0 0 26px' }}>
          {isHotmart
            ? 'Esta ação não cancela a venda na Hotmart nem remove o acesso do aluno ao produto.'
            : 'Isso não afeta dados da Hotmart, vendas, assinaturas ou acesso à plataforma.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.5)', color: '#f87171',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {loading ? 'progress_activity' : isHotmart ? 'visibility_off' : 'delete'}
            </span>
            {loading ? 'Processando...' : isHotmart ? 'Sim, ocultar' : 'Sim, remover'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CursoDetailPage({ params }: { params: Promise<{ courseName: string }> }) {
  const { courseName } = use(params);
  // Support both slug (e.g. 'skeletal-expert') and legacy %XX encoded names
  const slugOrRaw = decodeURIComponent(courseName).trim();
  const router  = useRouter();

  const [allCourseNames, setAllCourseNames] = useState<string[]>([]);
  const [decoded, setDecoded] = useState(slugOrRaw); // updated once courses load

  const [students,       setStudents]       = useState<Student[]>([]);
  const [manualStudents,  setManualStudents]  = useState<ManualStudent[]>([]);
  const [hiddenEmails,    setHiddenEmails]    = useState<Set<string>>(new Set());
  const [phoneCache,      setPhoneCache]      = useState<Record<string, string>>({});
  const [phonesLoading,   setPhonesLoading]   = useState(false);
  const [documentCache,   setDocumentCache]   = useState<Record<string, string>>({});
  const [buyerPersonaCache, setBuyerPersonaCache] = useState<Record<string, Record<string, any>>>({});
  const [showExportMenu,  setShowExportMenu]  = useState(false);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showCSVModal,   setShowCSVModal]   = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<{ id: string; name: string; email: string; source: 'manual' | 'hotmart' } | null>(null);
  const [deleting,       setDeleting]       = useState(false);
  const [editTarget,     setEditTarget]     = useState<{
    name: string; email: string; phone: string; document: string; manualId?: string;
    vendedor?: string; bp_valor?: string; bp_pagamento?: string; bp_modelo?: string;
    bp_parcela?: string; bp_em_dia?: string; bp_primeira_parcela?: string;
    bp_ultimo_pagamento?: string; bp_proximo_pagamento?: string; notes?: string;
    payment_type?: string; currency?: string; total_amount?: number;
    down_payment?: number; installments?: number; installment_amount?: number;
    installment_dates?: InstallmentDate[]; entry_date?: number;
  } | null>(null);
  const [turmas,         setTurmas]         = useState<string[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [turmaFilter,  setTurmaFilter]  = useState('');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(0);
  const [pageSize,     setPageSize]     = useState(50);
  const [sortDir,      setSortDir]      = useState<'desc' | 'asc'>('desc');
  const [statusFilter, setStatusFilter] = useState<'' | 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO'>('');

  // Tooltip — single global mouse tracker, no React state for position
  const [tooltipSt,   setTooltipSt]  = useState<Student | null>(null);
  const tipTimer   = React.useRef<any>(null);
  const tipPinned  = React.useRef(false);

  // Open: renders the tooltip then pins its position on the next frame so it never moves
  const openTip = (e: React.MouseEvent, s: Student) => {
    clearTimeout(tipTimer.current);
    const cx = e.clientX;
    const cy = e.clientY;
    tipPinned.current = false;
    setTooltipSt(s);
    // After React renders the tooltip, pin its position immediately
    requestAnimationFrame(() => {
      const tip = document.getElementById('name-tooltip');
      if (!tip) return;
      const tw = tip.offsetWidth  || 320;
      const th = tip.offsetHeight || 240;
      let x = cx + 20;
      let y = cy + 14;
      if (x + tw > window.innerWidth  - 8) x = cx - tw - 12;
      if (y + th > window.innerHeight - 8) y = cy - th - 8;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
      tipPinned.current = true; // freeze immediately — tooltip no longer follows cursor
    });
  };
  const closeTip = () => { tipTimer.current = setTimeout(() => { tipPinned.current = false; setTooltipSt(null); }, 400); };

  // mousemove listener only moves tooltip when NOT pinned (i.e. while tooltip is hidden)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (tipPinned.current) return;
      const tip = document.getElementById('name-tooltip');
      if (!tip) return;
      const tw = tip.offsetWidth  || 320;
      const th = tip.offsetHeight || 240;
      let x = e.clientX + 20;
      let y = e.clientY + 14;
      if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 12;
      if (y + th > window.innerHeight - 8) y = e.clientY - th - 8;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // Resolve slug → real course name, then load students (single sequential flow)
  useEffect(() => {
    fetch('/api/cursos')
      .then(r => r.json())
      .then(d => {
        const names: string[] = (d.courses || []).map((c: any) => c.name as string);
        setAllCourseNames(names);
        const resolved = resolveCourseName(slugOrRaw, names);
        setDecoded(resolved);
      })
      .catch(() => {
        // If courses can't load, try using slugOrRaw directly (legacy encoded URL)
        setDecoded(slugOrRaw);
      });
  }, [slugOrRaw]);

  useEffect(() => {
    // Wait until decoded is the REAL course name (not just the slug).
    // We know it's resolved when allCourseNames is populated OR decoded !== slugOrRaw.
    const isResolved = allCourseNames.length > 0 || decoded !== slugOrRaw;
    if (!decoded || !isResolved) return;
    setLoading(true);
    const p = turmaFilter ? `?turma=${encodeURIComponent(turmaFilter)}` : '';
    Promise.all([
      fetch(`/api/cursos/${encodeURIComponent(decoded)}${p}`).then(r => r.json()),
      fetch(`/api/alunos/manual?course=${encodeURIComponent(decoded)}`).then(r => r.json()),
      fetch(`/api/alunos/hide?course=${encodeURIComponent(decoded)}`).then(r => r.json()),
    ]).then(([hotmartData, manualData, hideData]) => {
      setStudents(hotmartData.students || []);
      setTurmas(hotmartData.turmas || []);
      setManualStudents(manualData.students || []);
      setHiddenEmails(new Set((hideData.hidden || []).map((e: string) => e.toLowerCase())));
      setLoading(false);
      setPage(0);
    }).catch(() => setLoading(false));
  }, [decoded, turmaFilter, allCourseNames.length]);

  // Merge Hotmart + manual students — manual has priority (dedup by email)
  // hiddenEmails applies to BOTH sources (hidden = not shown anywhere)
  const manualVisible = manualStudents.filter(ms => !hiddenEmails.has((ms.email || '').toLowerCase()));
  const manualEmailSet = new Set(manualVisible.map(ms => ms.email.toLowerCase()));
  const allStudents: Student[] = [
    ...manualVisible.map(ms => manualToStudent(ms)),
    ...students
      .filter(s => !hiddenEmails.has((s.email || '').toLowerCase()))
      .filter(s => !manualEmailSet.has((s.email || '').toLowerCase())) // skip if already in manual
      .map(s => ({ ...s, source: 'hotmart' as const })),
  ];
    const DAY_MS = 24 * 60 * 60 * 1000;
  const GRACE_DAYS = 15; // days past proximo_pagamento before marking as overdue

  // Effective status: considers bp_em_dia from cache WITH 15-day grace period
  function getEffectiveStatus(s: Student): 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO' {
    return effectiveStatusFor(s, buyerPersonaCache);
  }

  const filtered = allStudents.filter(s => {
    if (statusFilter && getEffectiveStatus(s) !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.includes(q);
  });
  const sorted     = [...filtered].sort((a, b) => sortDir === 'desc' ? (b.entryDate||0)-(a.entryDate||0) : (a.entryDate||0)-(b.entryDate||0));
  const paginated  = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  // ── Pre-load buyerPersonaCache for ALL students on initial load (for correct pill counts) ────────────
  useEffect(() => {
    if (allStudents.length === 0) return;
    const allEmails = allStudents
      .map(s => (s.email || '').toLowerCase())
      .filter(Boolean);
    const uncachedAll = allEmails.filter(e => !(e in buyerPersonaCache));
    if (uncachedAll.length === 0) return;
    // Load in batches of 100 to avoid oversized requests
    const BATCH = 100;
    for (let i = 0; i < uncachedAll.length; i += BATCH) {
      const batch = uncachedAll.slice(i, i + BATCH);
      fetch('/api/alunos/phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: batch }),
      })
        .then(r => r.json())
        .then(({ phones, documents, buyerPersona }) => {
          setPhoneCache(prev        => ({ ...prev, ...(phones       || {}) }));
          setDocumentCache(prev     => ({ ...prev, ...(documents    || {}) }));
          setBuyerPersonaCache(prev => ({ ...prev, ...(buyerPersona || {}) }));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStudents.length]);

  // ── Background contact fetch (phone + CPF + buyer_persona) for current page ──
  useEffect(() => {
    const uncached = paginated
      .map(s => (s.email || '').toLowerCase())
      .filter(e => e && !(e in phoneCache));
    if (uncached.length === 0) return;
    let cancelled = false;
    setPhonesLoading(true);
    fetch('/api/alunos/phones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: uncached }),
    })
      .then(r => r.json())
      .then(({ phones, documents, buyerPersona }) => {
        if (!cancelled) {
          setPhoneCache(prev         => ({ ...prev, ...(phones       || {}) }));
          setDocumentCache(prev      => ({ ...prev, ...(documents    || {}) }));
          setBuyerPersonaCache(prev  => ({ ...prev, ...(buyerPersona || {}) }));
          setPhonesLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setPhonesLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginated.map(s => s.email).join('|')]);

  const adimN   = allStudents.filter(s => effectiveStatusFor(s, buyerPersonaCache) === 'ADIMPLENTE').length;
  const inadimN  = allStudents.filter(s => effectiveStatusFor(s, buyerPersonaCache) === 'INADIMPLENTE').length;
  const quitN   = allStudents.filter(s => effectiveStatusFor(s, buyerPersonaCache) === 'QUITADO').length;

  // vParcela: for BRL = price.value; for LATAM = price.value in original currency
  // We use paymentHistory to get the avg per-payment amount
  function vParcela(s: Student): number {
    // If history has values, use last payment amount (most accurate installment value)
    const hist = s.paymentHistory;
    if (hist && hist.length > 0 && hist[hist.length - 1].valor > 0) {
      return hist[hist.length - 1].valor;
    }
    return s.valor || 0;
  }
  function vTotal(s: Student): number {
    const hist = s.paymentHistory;
    if (hist && hist.length > 0) {
      const sum = hist.reduce((acc, p) => acc + p.valor, 0);
      if (sum > 0) return sum;
    }
    return s.valor || 0;
  }

  const SUMMARY_CARDS = [
    { label: 'Total',        val: allStudents.length, color: '#60a5fa', icon: 'group',        f: '' as const },
    { label: 'Adimplentes',  val: adimN,           color: '#38bdf8', icon: 'check_circle', f: 'ADIMPLENTE' as const },
    { label: 'Inadimplentes',val: inadimN,         color: '#f87171', icon: 'warning',      f: 'INADIMPLENTE' as const },
    { label: 'Quitados',     val: quitN,           color: '#4ade80', icon: 'verified',     f: 'QUITADO' as const },
  ];

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[110px]" />
        <main className="px-4 md:px-6 max-w-[1700px] mx-auto pt-10 pb-24">

          {/* Page header */}
          <div className="flex items-start justify-between mb-7 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/cursos')}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(232,177,79,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: SILVER }}>arrow_back</span>
              </button>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>menu_book</span>
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">{decoded}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: SILVER }}>
                    {loading ? 'Carregando...' : `${sorted.length.toLocaleString('pt-BR')} aluno${sorted.length !== 1 ? 's' : ''}`}
                  </p>
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(232,177,79,0.1)', color: GOLD, border: '1px solid rgba(232,177,79,0.2)' }}>
                    dados vitalícios
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Action toolbar (row 2) ───────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 28 }}>

            {/* ── Group 1: Gerar Relatórios ──────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
                color: 'rgba(168,178,192,0.6)', margin: 0, paddingLeft: 2 }}>Gerar Relatórios</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* PDF */}
                <button onClick={() => generatePDF(decoded, sorted, phoneCache, documentCache, buyerPersonaCache)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                    borderRadius: 12, fontWeight: 900, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.12em', cursor: 'pointer', transition: 'all 0.2s',
                    background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
                  PDF
                </button>
                {/* Planilha dropdown */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowExportMenu(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                      borderRadius: 12, fontWeight: 900, fontSize: 11, textTransform: 'uppercase',
                      letterSpacing: '0.12em', cursor: 'pointer', transition: 'all 0.2s',
                      background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.28)', color: GREEN }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_chart</span>
                    Planilha
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{showExportMenu ? 'expand_less' : 'expand_more'}</span>
                  </button>
                  {showExportMenu && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
                      background: 'linear-gradient(160deg, rgba(8,18,38,0.99) 0%, rgba(4,12,26,0.99) 100%)',
                      border: '1px solid rgba(74,222,128,0.25)',
                      borderRadius: 14, padding: '6px', minWidth: 160,
                      boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
                      backdropFilter: 'blur(20px)',
                    }}>
                      {[{
                        label: 'CSV', icon: 'csv', desc: 'Simples, universal',
                        action: () => { generateCSV(decoded, allStudents, phoneCache, documentCache, buyerPersonaCache); setShowExportMenu(false); },
                      }, {
                        label: 'XLS (Excel)', icon: 'grid_on', desc: 'Planilha completa',
                        action: () => { generateXLS(decoded, allStudents, phoneCache, documentCache, buyerPersonaCache); setShowExportMenu(false); },
                      }].map(opt => (
                        <button key={opt.label} onClick={opt.action}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                            borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer',
                            color: 'white', textAlign: 'left', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.12)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: GREEN }}>{opt.icon}</span>
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 900, color: 'white', margin: 0 }}>{opt.label}</p>
                            <p style={{ fontSize: 9, color: SILVER, margin: 0, marginTop: 1 }}>{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.09)', flexShrink: 0 }} />

            {/* ── Group 2: Importar Alunos ────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
                color: 'rgba(168,178,192,0.6)', margin: 0, paddingLeft: 2 }}>Importar Alunos</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Adicionar aluno único */}
                <button onClick={() => setShowAddModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                    borderRadius: 12, fontWeight: 900, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.12em', cursor: 'pointer', transition: 'all 0.2s',
                    background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.28)', color: GREEN }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                  Aluno único
                </button>
                {/* Adicionar em Lote */}
                <button onClick={() => setShowBatchModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                    borderRadius: 12, fontWeight: 900, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.12em', cursor: 'pointer', transition: 'all 0.2s',
                    background: 'rgba(99,179,237,0.07)', border: '1px solid rgba(99,179,237,0.28)', color: '#63b3ed' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
                  Em Lote
                </button>
                {/* Importar Planilha */}
                <button onClick={() => setShowCSVModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                    borderRadius: 12, fontWeight: 900, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.12em', cursor: 'pointer', transition: 'all 0.2s',
                    background: 'rgba(99,179,237,0.07)', border: '1px solid rgba(99,179,237,0.28)', color: '#63b3ed' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_view</span>
                  Importar Planilha
                </button>
              </div>
            </div>

          </div>
          {/* Search + Status filter pills — same row */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {/* Search box */}
            <div className="relative min-w-[200px] max-w-[300px] flex-1">
              <span className="material-symbols-outlined text-[14px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
              <input type="text" placeholder="Buscar por nome ou email..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl text-[12px] font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)', color: 'white' }} />
            </div>

            {/* Status filter pills */}
            {([
              { f: '' as const,            label: 'Todos',         icon: 'group',        color: '#E8B14F', count: allStudents.length },
              { f: 'ADIMPLENTE' as const,  label: 'Adimplentes',   icon: 'check_circle', color: '#7dd3fc', count: adimN   },
              { f: 'INADIMPLENTE' as const,label: 'Inadimplentes', icon: 'warning',      color: '#f87171', count: inadimN },
              { f: 'QUITADO' as const,     label: 'Quitados',      icon: 'verified',     color: '#4ade80', count: quitN   },
            ] as const).map(pill => {
              const active = statusFilter === pill.f;
              return (
                <button key={pill.f}
                  onClick={() => { setStatusFilter(active ? '' : pill.f); setPage(0); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all"
                  style={{
                    background: active ? `${pill.color}18` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${active ? pill.color + '55' : 'rgba(255,255,255,0.1)'}`,
                    color: active ? pill.color : SILVER,
                    fontWeight: 900, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12, color: active ? pill.color : SILVER }}>{pill.icon}</span>
                  {pill.label}
                  <span style={{
                    background: active ? pill.color : 'rgba(255,255,255,0.12)',
                    color: active ? '#000e1f' : SILVER,
                    borderRadius: 99, padding: '0px 5px', fontSize: 9, fontWeight: 900,
                  }}>{pill.count}</span>
                </button>
              );
            })}
          </div>


          {/* Table — no overflow:hidden so portaled tooltip renders above all elements */}
          <div style={{ overflowX: 'auto', borderRadius: 24 }}>
          <div style={{ ...TABLE_STYLE, overflow: 'visible', minWidth: 900 }}>
            <div className="pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)', borderRadius: '24px 24px 0 0', height: 4, marginBottom: -4 }} />

            {/* Top pagination bar */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Por página:</span>
                {[50, 100, 150, 200].map(n => (
                  <button key={n} onClick={() => { setPageSize(n); setPage(0); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
                    style={{ background: pageSize === n ? GOLD : 'rgba(255,255,255,0.07)', color: pageSize === n ? NAVY : SILVER, border: `1px solid ${pageSize === n ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                    {n}
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-4 py-1.5 rounded-xl text-[11px] font-black transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>← Anterior</button>
                  <span className="text-[12px] font-bold px-3" style={{ color: SILVER }}>{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-4 py-1.5 rounded-xl text-[11px] font-black transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>Próxima →</button>
                </div>
              )}
              <span className="text-[11px] font-bold" style={{ color: SILVER }}>{sorted.length.toLocaleString('pt-BR')} alunos</span>
            </div>

            <div className="grid px-5 py-3.5" style={{ gridTemplateColumns: GRID, ...HEADER_STYLE }}>
              {COLS.map(col => (
                <div key={col.key}
                  className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                  onClick={col.sortable ? () => { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); setPage(0); } : undefined}>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: col.sortable ? GOLD : SILVER }}>{col.label}</span>
                  {col.sortable && <span className="material-symbols-outlined text-[13px]" style={{ color: GOLD }}>{sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span>}
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', width: 56, height: 56 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(232,177,79,0.15)', borderTopColor: GOLD, animation: 'spin 1s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '2px solid rgba(232,177,79,0.08)', borderBottomColor: 'rgba(232,177,79,0.5)', animation: 'spin 1.5s linear infinite reverse' }} />
                  <span className="material-symbols-outlined" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: GOLD }}>group</span>
                </div>
                <p style={{ color: SILVER, fontSize: 13, fontWeight: 700, margin: 0 }}>Carregando alunos...</p>
                <div style={{ width: 280, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, backgroundSize: '200% 100%', animation: 'shimmerBar 1.4s ease-in-out infinite' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2].map(dotI => <div key={dotI} style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, opacity: 0.4, animation: `dotPulse 1.2s ease-in-out ${dotI * 0.2}s infinite` }} />)}
                </div>
                <style>{`
                  @keyframes spin { to { transform: rotate(360deg); } }
                  @keyframes shimmerBar { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                  @keyframes dotPulse { 0%,100% { opacity:0.2; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.2); } }
                `}</style>
              </div>
            ) : paginated.length === 0 ? (
              <div className="py-20 text-center">
                <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: SILVER }}>group</span>
                <p className="font-bold text-sm" style={{ color: SILVER }}>Nenhum aluno encontrado.</p>
              </div>
            ) : (
              paginated.map((s, idx) => {
                const status  = getEffectiveStatus(s);
                const rowBase = status === 'INADIMPLENTE' ? 'rgba(239,68,68,0.04)'
                  : idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                return (
                  <div key={s.transaction || s.email + idx}
                    className="grid px-5 py-3.5 items-start transition-all"
                    style={{ gridTemplateColumns: GRID, background: rowBase, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBase)}>

                    {/* Date */}
                    <span className="text-[11px] font-bold pt-1" style={{ color: SILVER }}>{fmtDate(s.entryDate)}</span>

                    {/* Name + flag — exactly like Hotmart page */}
                    <div className="pr-3 pt-0.5"
                      onMouseEnter={e => openTip(e, s)}
                      onMouseLeave={closeTip}>
                      <div className="flex items-center gap-2 leading-tight min-w-0">
                        {getStudentFlag(s.flag, 18)}
                        <button
                          onClick={() => router.push(`/alunos/${emailToId(s.email)}`)}
                          className="text-[12px] font-black text-white truncate text-left transition-colors max-w-[400px]"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                          onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
                          title={s.name.toUpperCase()}
                        >{s.name.toUpperCase()}</button>
                        {(s as any).source === 'manual' && (
                          <span style={{ fontSize: 8, fontWeight: 900, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)',
                            color: GREEN, borderRadius: 99, padding: '1px 6px', flexShrink: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            MANUAL
                          </span>
                        )}
                      </div>
                      {status === 'INADIMPLENTE' && (
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#f87171' }}>
                          ⚠ Pagamento em atraso
                        </span>
                      )}
                    </div>

                    {/* Dados Pessoais: Email + Telefone + CPF */}
                    <div className="flex flex-col gap-1 pr-3 pt-1">
                      {/* Email */}
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 11, color: SILVER, flexShrink: 0 }}>mail</span>
                        <span className="text-[12px] font-bold truncate" style={{ color: 'white' }}>{s.email}</span>
                      </div>
                      {/* Telefone — buyer_persona overrides */}
                      {(() => {
                        const bpData = buyerPersonaCache[(s.email || '').toLowerCase()] || {};
                        const ph = bpData.phone
                          || ((s as any).source === 'manual' ? ((s as any).phone || '') : '')
                          || phoneCache[(s.email || '').toLowerCase()]
                          || '';
                        return ph ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'rgba(74,222,128,0.8)', flexShrink: 0 }}>phone</span>
                            <span style={{ color: 'rgba(74,222,128,0.9)', fontSize: 12, fontWeight: 700 }}>{ph}</span>
                          </div>
                        ) : phonesLoading && !((s.email || '').toLowerCase() in phoneCache) ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>phone</span>
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 500 }}>buscando...</span>
                          </div>
                        ) : null;
                      })()}
                      {/* CPF */}
                      {(() => {
                        const cpf = documentCache[(s.email || '').toLowerCase()] || (s as any).document || '';
                        return cpf ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 11, color: TEAL, flexShrink: 0 }}>badge</span>
                            <span style={{ color: TEAL, fontSize: 12, fontWeight: 700 }}>{cpf}</span>
                          </div>
                        ) : null;
                      })()}
                      {/* Vendedor (buyer_persona) */}
                      {(() => {
                        const bp = buyerPersonaCache[(s.email || '').toLowerCase()] || {};
                        return bp.vendedor ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 11, color: GOLD, flexShrink: 0 }}>sell</span>
                            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>{bp.vendedor}</span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {/* Valor Parcela — for manual: PIX label or installment amount */}
                    <div className="flex flex-col gap-0.5 pt-1">
                      {(() => {
                        if ((s as any).source === 'manual') {
                          const pt = (s as any).paymentType || 'PIX';
                          const isPix = pt === 'PIX' || pt === 'PIX_AVISTA';
                          if (isPix) {
                            return <span className="text-[11px] font-black" style={{ color: '#38bdf8' }}>PIX</span>;
                          }
                          const instAmt = s.valor || 0;
                          const insts = (s as any).paymentInstallments || 1;
                          return (
                            <>
                              <span className="text-[12px] font-bold" style={{ color: GOLD }}>{fmtMoneyByCurrency(instAmt, s.currency)}</span>
                              <span className="text-[9px] font-bold" style={{ color: SILVER }}>{insts}× parcelas</span>
                            </>
                          );
                        }
                        // Hotmart: buyer_persona.parcela overrides, otherwise use Hotmart pricing
                        const bp = buyerPersonaCache[(s.email || '').toLowerCase()] || {};
                        const isHotmartBRL = s.currency === 'BRL';
                        const parcela = isHotmartBRL ? null : (bp.parcela ?? bp.valor);
                        if (parcela != null) {
                          return (
                            <>
                              <span className="text-[12px] font-bold" style={{ color: GOLD }}>{fmtMoneyByCurrency(Number(parcela), s.currency)}</span>
                              {bp.modelo && <span className="text-[9px] font-bold" style={{ color: SILVER }}>{bp.modelo}</span>}
                            </>
                          );
                        }
                        return (
                          <>
                            <span className="text-[12px] font-bold" style={{ color: GOLD }}>{fmtMoneyByCurrency(vParcela(s), s.currency)}</span>
                            {s.valorBRL != null && s.currency !== 'BRL' && (
                              <span className="text-[9px] font-bold" style={{ color: SILVER }}>≈ {fmtMoney(s.valorBRL)}</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    {/* Total Pago — for manual: sum of paid installment_dates */}
                    <div className="flex flex-col gap-0.5 pt-1">
                      {(() => {
                        if ((s as any).source === 'manual') {
                          const pt = (s as any).paymentType || 'PIX';
                          const isPix = pt === 'PIX' || pt === 'PIX_AVISTA';
                          if (isPix) {
                            // PIX à vista: total_amount is what was paid
                            // Fallback to bp_valor from cache for legacy records where total_amount was NULL
                            const bpCacheEntry = buyerPersonaCache[(s.email || '').toLowerCase()] || {};
                            const pixTotal = s.valorBRL || s.valor || Number(bpCacheEntry.valor || bpCacheEntry.bp_valor || 0);
                            return <span className="text-[12px] font-bold text-white">{fmtMoneyByCurrency(pixTotal, s.currency)}</span>;
                          }
                          const dates = ((s as any).manualInstallments || []) as InstallmentDate[];
                          const paidCount = dates.filter((d: InstallmentDate) => d.paid).length;
                          const instAmt   = s.valor || 0;
                          const downAmt   = Number((s as any).down_payment || 0);
                          // Total = entrada já paga (down_payment) + parcelas pagas × valor parcela
                          const totalPaid = downAmt + paidCount * instAmt;
                          return (
                            <>
                              <span className="text-[12px] font-bold text-white">{fmtMoneyByCurrency(totalPaid, s.currency)}</span>
                              {paidCount > 0
                                ? <span className="text-[9px] font-bold" style={{ color: SILVER }}>{paidCount} paga{paidCount !== 1 ? 's' : ''}{downAmt > 0 ? ' + entrada' : ''}</span>
                                : downAmt > 0
                                  ? <span className="text-[9px] font-bold" style={{ color: SILVER }}>Entrada paga</span>
                                  : <span className="text-[9px] font-bold" style={{ color: SILVER }}>0 pagas</span>
                              }
                            </>
                          );
                        }
                        return (
                          <>
                            <span className="text-[12px] font-bold text-white">{fmtMoneyByCurrency(vTotal(s), s.currency)}</span>
                            {s.valorBRL != null && s.currency !== 'BRL' && (() => {
                              const totalBrl = s.paymentHistory.length > 0 ? s.valorBRL * s.paymentHistory.length : s.valorBRL;
                              return <span className="text-[9px] font-bold" style={{ color: SILVER }}>≈ {fmtMoney(totalBrl)}</span>;
                            })()}
                          </>
                        );
                      })()}
                    </div>
                    {/* STATUS coluna — manual: só badge + modelo + obs · Hotmart LATAM: display completo */}
                    {(() => {
                      const bp = buyerPersonaCache[(s.email || '').toLowerCase()] || {};
                      const isManual = (s as any).source === 'manual';
                      const isHotmartBRLpay = !isManual && s.currency === 'BRL';

                      // ── Manual students: show Status badge using effectiveStatusFor() ──
                      if (isManual) {
                        // Use the already-computed 'status' (effectiveStatusFor result) for consistency
                        // This prevents the badge showing ADIMPLENTE while the row shows 'PAGAMENTO EM ATRASO'
                        const isOk   = status === 'ADIMPLENTE';
                        const isNok  = status === 'INADIMPLENTE';
                        const isQuit = status === 'QUITADO';
                        const badgeBg    = isOk ? 'rgba(74,222,128,0.12)' : isQuit ? 'rgba(56,189,248,0.12)' : isNok ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)';
                        const badgeColor = isOk ? GREEN : isQuit ? '#38bdf8' : isNok ? '#f87171' : SILVER;
                        const badgeBorder= isOk ? 'rgba(74,222,128,0.3)' : isQuit ? 'rgba(56,189,248,0.3)' : isNok ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.15)';
                        const badgeLabel = isOk ? '● Adimplente' : isQuit ? '✔ Quitado' : isNok ? '✗ Inadimplente' : '—';
                        const modelo = (s as any).bpModelo ?? bp.modelo ?? '';
                        // Filter out legacy CPF data that was stored in notes during migration
                        const rawObs = (s as any).notes ?? '';
                        const obs = rawObs.split('\n')
                          .filter((line: string) => !line.trim().toUpperCase().startsWith('CPF:'))
                          .join('\n')
                          .trim();
                        return (
                          <div className="flex flex-col gap-0.5 pt-1">
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{
                              background: badgeBg, color: badgeColor,
                              border: `1px solid ${badgeBorder}`, width: 'fit-content',
                            }}>{badgeLabel}</span>
                            {modelo && <span className="text-[9px] font-bold" style={{ color: SILVER }}>{modelo}</span>}
                            {obs    && <span className="text-[9px] italic" style={{ color: SILVER }}>{obs}</span>}
                          </div>
                        );
                      }

                      // ── Hotmart LATAM (non-BRL): show buyer_persona payment info ──
                      if (!isHotmartBRLpay && (bp.pagamento || bp.em_dia != null || bp.proximo_pagamento || bp.ultimo_pagamento)) {
                        const emDia = bp.em_dia;
                        return (
                          <div className="flex flex-col gap-0.5 pt-1">
                            {bp.pagamento && <span className="text-[11px] font-bold" style={{ color: 'white' }}>{bp.pagamento}</span>}
                            {emDia != null && (() => {
                              const emUp = String(emDia).toUpperCase().trim();
                              const isOk   = emUp === 'SIM' || emUp === 'ADIMPLENTE';
                              const isQuit = emUp === 'QUITADO';
                              const proxRawBp = bp.proximo_pagamento;
                              const proxMsBp  = toEpochMs(proxRawBp);
                              const notYetBp  = proxMsBp != null && !isNaN(proxMsBp) && (proxMsBp + GRACE_DAYS_EXPORT * DAY_MS_EXPORT) > Date.now();
                              const effectiveGreen = isOk || isQuit || (!isQuit && notYetBp);
                              const label = isOk ? '✓ Em dia' : isQuit ? '✓ Quitado' : notYetBp ? '✓ Em dia' : '✗ Atrasado';
                              return (
                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{
                                  background: effectiveGreen ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)',
                                  color:      effectiveGreen ? GREEN : '#f87171',
                                  border:     `1px solid ${effectiveGreen ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                  width: 'fit-content',
                                }}>{label}</span>
                              );
                            })()}
                            {bp.proximo_pagamento && (
                              <span className="text-[9px]" style={{ color: SILVER }}>
                                Próx: {new Date(bp.proximo_pagamento).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        );
                      }

                      return <PaymentCell s={s} statusOverride={status} />;
                    })()}
                    {/* Delete action — all students */}
                    <div className="flex items-center justify-center gap-1 pt-0.5">
                      {/* Edit button */}
                      <button
                        onClick={() => setEditTarget({
                          name:     s.name,
                          email:    s.email,
                          phone:    (s as any).source === 'manual'
                                      ? ((s as any).phone || '')
                                      : (phoneCache[(s.email || '').toLowerCase()] || ''),
                          document: documentCache[(s.email || '').toLowerCase()] || (s as any).document || '',
                          manualId: (s as any).source === 'manual' ? (s as any).manualId : undefined,
                          // pass current BP data so fields are pre-filled
                          ...(() => {
                            const bp = buyerPersonaCache[(s.email || '').toLowerCase()] || {};
                            const isManualS = (s as any).source === 'manual';
                            return {
                              vendedor:      bp.vendedor     || '',
                              bp_valor:      bp.valor     != null ? String(bp.valor)   : '',
                              bp_pagamento:  bp.pagamento    || '',
                              bp_modelo:     bp.modelo       || '',
                              bp_parcela:    bp.parcela   != null ? String(bp.parcela) : '',
                              bp_em_dia:     bp.em_dia       || '',
                              notes:         bp.notes        || '',
                              bp_primeira_parcela:  bp.primeira_parcela  ? new Date(Number(bp.primeira_parcela)).toISOString().slice(0,10)  : '',
                              bp_ultimo_pagamento:  bp.ultimo_pagamento  ? new Date(Number(bp.ultimo_pagamento)).toISOString().slice(0,10)  : '',
                              bp_proximo_pagamento: bp.proximo_pagamento ? new Date(Number(bp.proximo_pagamento)).toISOString().slice(0,10) : '',
                              ...(isManualS ? {
                                payment_type:      (s as any).paymentType || 'PIX',
                                currency:          s.currency || 'BRL',
                                total_amount:      s.valorBRL ?? (s.valor ?? undefined),
                                down_payment:      (s as any).down_payment ?? 0,
                                installments:      (s as any).paymentInstallments ?? 1,
                                installment_amount: s.valor ?? undefined,
                                installment_dates: (s as any).manualInstallments ?? [],
                                entry_date:        s.entryDate ?? undefined,
                              } : {}),
                            };
                          })()
                        })}
                        title="Editar informações"
                        style={{ background: 'none', border: '1px solid rgba(99,179,237,0.2)', borderRadius: 8,
                          width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: 'rgba(99,179,237,0.5)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.12)'; e.currentTarget.style.color = '#63b3ed'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.5)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(99,179,237,0.5)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.2)'; }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={() => setDeleteTarget({
                          id:     (s as any).manualId || '',
                          name:   s.name,
                          email:  s.email,
                          source: ((s as any).source || 'hotmart') as 'manual' | 'hotmart',
                        })}
                        title="Remover da lista"
                        style={{ background: 'none', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, width: 28, height: 28,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'rgba(239,68,68,0.5)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(239,68,68,0.5)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          </div>
          {/* Footer */}
          <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Por página:</span>
              {[50, 100, 150, 200].map(n => (
                <button key={n} onClick={() => { setPageSize(n); setPage(0); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
                  style={{ background: pageSize === n ? GOLD : 'rgba(255,255,255,0.07)', color: pageSize === n ? NAVY : SILVER, border: `1px solid ${pageSize === n ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                  {n}
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-4 py-2 rounded-xl text-[11px] font-black transition-all disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>← Anterior</button>
                <span className="text-[12px] font-bold px-3" style={{ color: SILVER }}>{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-xl text-[11px] font-black transition-all disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>Próxima →</button>
              </div>
            )}
            <span className="text-[11px] font-bold" style={{ color: SILVER }}>{sorted.length.toLocaleString('pt-BR')} alunos</span>
          </div>
        </main>
      </div>

      {/* CSV/XLS import modal */}
      {showCSVModal && typeof window !== 'undefined' && (
        <CSVImportModal
          courseName={decoded}
          existingEmails={new Set(allStudents.map(s => (s.email || '').toLowerCase()))}
          existingNames={new Set(allStudents.map(s => (s.name || '').toUpperCase().trim()).filter(Boolean))}
          onClose={() => setShowCSVModal(false)}
          onSaved={() => {
            setShowCSVModal(false);
            fetch(`/api/alunos/manual?course=${encodeURIComponent(decoded)}`)
              .then(r => r.json())
              .then(d => setManualStudents(d.students || []));
          }}
        />
      )}

      {/* Batch add modal */}
      {showBatchModal && typeof window !== 'undefined' && (
        <BatchAddModal
          courseName={decoded}
          existingEmails={new Set(allStudents.map(s => (s.email || '').toLowerCase()))}
          onClose={() => setShowBatchModal(false)}
          onSaved={() => {
            setShowBatchModal(false);
            fetch(`/api/alunos/manual?course=${encodeURIComponent(decoded)}`)
              .then(r => r.json())
              .then(d => setManualStudents(d.students || []));
          }}
        />
      )}

      {/* Add student modal */}
      {showAddModal && typeof window !== 'undefined' && (
        <AddStudentModal
          courseName={decoded}
          onClose={() => setShowAddModal(false)}
          onSaved={(ms) => {
            setManualStudents(prev => [ms, ...prev]);
          }}
        />
      )}

      {/* Edit modal */}
      {editTarget && typeof window !== 'undefined' && (
        <EditStudentModal
          student={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={({ phone, name, document, vendedor, bp_modelo, bp_em_dia, notes,
            payment_type, currency, total_amount, down_payment, installments, installment_amount, installment_dates }) => {
            const emailKey = (editTarget.email || '').toLowerCase();
            // Always update phoneCache (even when cleared)
            setPhoneCache(prev => ({ ...prev, [emailKey]: phone }));
            // Always update documentCache
            setDocumentCache(prev => ({ ...prev, [emailKey]: document }));
            // Update manual_students for manual students — includes payment fields
            if (editTarget.manualId) {
              setManualStudents(prev => prev.map(ms => {
                if (ms.id !== editTarget.manualId) return ms;
                const paymentPatch = payment_type !== undefined ? {
                  payment_type:       payment_type as 'PIX' | 'CREDIT_CARD',
                  currency:           currency ?? (ms as any).currency,
                  total_amount:       total_amount ?? ms.total_amount,
                  down_payment:       down_payment ?? (ms as any).down_payment,
                  installments:       installments ?? ms.installments,
                  installment_amount: installment_amount ?? ms.installment_amount,
                  installment_dates:  installment_dates ?? ms.installment_dates,
                } : {};
                return { ...ms, phone, name: name || ms.name, notes, ...paymentPatch } as any;
              }));
            }
            // Always update buyerPersonaCache — use the saved value directly (no || fallback)
            setBuyerPersonaCache(prev => ({
              ...prev,
              [emailKey]: {
                ...(prev?.[emailKey] || {}),
                phone,
                document,
                vendedor,
                modelo:  bp_modelo,
                em_dia:  bp_em_dia,
                notes,
              },
            }));
            setEditTarget(null);
          }}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && typeof window !== 'undefined' && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          source={deleteTarget.source}
          loading={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              if (deleteTarget.source === 'manual') {
                // Truly delete from DB
                await fetch(`/api/alunos/manual/${deleteTarget.id}`, { method: 'DELETE' });
                setManualStudents(prev => prev.filter(ms => ms.id !== deleteTarget.id));
              } else {
                // Hide Hotmart student from this course
                await fetch('/api/alunos/hide', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ course_name: decoded, email: deleteTarget.email }),
                });
                setHiddenEmails(prev => new Set([...prev, deleteTarget.email.toLowerCase()]));
              }
              setDeleteTarget(null);
            } finally { setDeleting(false); }
          }}
        />
      )}

      {tooltipSt && typeof window !== 'undefined' && createPortal(
        <NameTooltip
          s={tooltipSt}
          onHoverIn={() => { tipPinned.current = true; clearTimeout(tipTimer.current); }}
          onHoverOut={() => { tipPinned.current = false; closeTip(); }}
        />,
        document.body
      )}
    </LoginWrapper>
  );
}
