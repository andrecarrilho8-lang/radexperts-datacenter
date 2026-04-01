'use client';

import React, { useState, useEffect, use } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

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
function PaymentCell({ s }: { s: Student }) {
  const status = getPayStatus(s);
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
function generatePDF(courseName: string, students: Student[]) {
  const rows = students.map((s, i) => {
    const status = getPayStatus(s);
    const stLabel = status === 'INADIMPLENTE' ? '⚠ INADIMPLENTE' : status === 'QUITADO' ? (s.paymentIsSub && s.subStatus === 'CANCELLED' ? 'Encerrado' : '✓ QUITADO') : '● ADIMPLENTE';
    const stColor = status === 'INADIMPLENTE' ? '#dc2626' : status === 'QUITADO' ? '#16a34a' : '#0ea5e9';
    const inst = s.paymentInstallments;
    const paid = s.paymentRecurrency;
    const monthsSince = s.entryDate ? Math.floor((Date.now() - s.entryDate) / (30 * 86_400_000)) : 0;
    const paidCard = !s.paymentIsSub && inst > 1 ? Math.min(monthsSince + 1, inst) : 0;
    const vParcela = s.paymentIsSub ? s.valor : inst > 1 ? s.valor / inst : s.valor;
    const vTotal   = s.paymentIsSub ? s.valor * paid : s.valor;
    const method   = s.paymentIsSub ? `Assinatura · ${paid} pgtos` : inst > 1 ? `Cartão ${inst}× · ${paidCard}/${inst}` : 'Pago';
    const rowBg = status === 'INADIMPLENTE' ? '#fff0f0' : i % 2 === 0 ? '#f8faff' : '#fff';
    return `<tr style="background:${rowBg}"><td style="color:#888;text-align:center">${i+1}</td><td><strong>${s.name}</strong></td><td>${s.email}</td><td>${fmtDate(s.entryDate)}</td><td>${fmtMoney(vParcela)}</td><td>${fmtMoney(vTotal)}</td><td style="color:${stColor};font-weight:900">${stLabel}</td><td style="color:#555">${method}</td></tr>`;
  }).join('');

  const active    = students.filter(s => getPayStatus(s) === 'ADIMPLENTE').length;
  const overdue   = students.filter(s => getPayStatus(s) === 'INADIMPLENTE').length;
  const quitado   = students.filter(s => getPayStatus(s) === 'QUITADO').length;
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
td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:top}.ftr{margin-top:18px;font-size:9px;color:#bbb;text-align:right;border-top:1px solid #eee;padding-top:8px}
@media print{body{padding:16px}}</style></head><body>
<div class="hdr"><div><div class="cn">${courseName}</div><div class="meta">${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</div></div><div class="logo">RadExperts<br/>Data Center</div></div>
<div class="stats">
<div class="stat" style="background:#f0f4ff;border:1px solid #c7d2fe"><div class="num" style="color:#3b82f6">${students.length}</div><div class="lbl">Total</div></div>
<div class="stat" style="background:#f0f9ff;border:1px solid #7dd3fc"><div class="num" style="color:#0ea5e9">${active}</div><div class="lbl">Adimplentes</div></div>
<div class="stat" style="background:#fff0f0;border:1px solid #fca5a5"><div class="num" style="color:#dc2626">${overdue}</div><div class="lbl">Inadimplentes</div></div>
<div class="stat" style="background:#f0fff4;border:1px solid #86efac"><div class="num" style="color:#16a34a">${quitado}</div><div class="lbl">Quitados</div></div>
</div>
<table><thead><tr><th>#</th><th>Nome</th><th>Email</th><th>Entrada</th><th>Valor Parcela</th><th>Total Pago</th><th>Status</th><th>Detalhe</th></tr></thead><tbody>${rows}</tbody></table>
<div class="ftr">RadExperts Data Center · Dados vitalícios</div>
<script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

// ── Grid ──────────────────────────────────────────────────────────────────────
const GRID = '120px 1fr 1fr 140px 160px 260px 64px';
const COLS = [
  { key: 'entryDate', label: 'Entrada',       sortable: true  },
  { key: 'name',      label: 'Nome',           sortable: false },
  { key: 'email',     label: 'Email',          sortable: false },
  { key: 'parcela',   label: 'Valor Parcela',  sortable: false },
  { key: 'total',     label: 'Total Pago',     sortable: false },
  { key: 'payment',   label: 'Status',         sortable: false },
  { key: 'actions',   label: '',               sortable: false },
];

// ── Convert ManualStudent → Student shape ────────────────────────────────────
function manualToStudent(ms: ManualStudent): Student {
  // IMPORTANT: Postgres returns bigint/numeric as strings in JSON. Always Number() cast.
  const dates   = (ms.installment_dates || []).map(d => ({
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
  return {
    name: ms.name, email: ms.email,
    entryDate:   Number(ms.entry_date), lastPayDate: lastPaid,
    turma: 'Manual', valor: instAmt, valorBRL: Number(ms.total_amount),
    currency: 'BRL', flag: 'br', transaction: `MANUAL_${ms.id}`,
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
  };
}

// ── Add Student Modal ─────────────────────────────────────────────────────────
function AddStudentModal({ courseName, onClose, onSaved }: {
  courseName: string;
  onClose: () => void;
  onSaved: (s: ManualStudent) => void;
}) {
  const [form, setForm] = useState({
    name:                '',
    email:               '',
    phone:               '',
    entry_date:          new Date().toISOString().slice(0, 10),
    first_payment_date:  new Date().toISOString().slice(0, 10),
    payment_type:        'PIX' as 'PIX' | 'CREDIT_CARD',
    total_amount:        '',
    installments:        1,
    notes:               '',
  });
  const [instDates, setInstDates] = useState<InstallmentDate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Auto-generate installment dates from first_payment_date (1 per month)
  useEffect(() => {
    if (form.payment_type !== 'CREDIT_CARD' || form.installments < 1) {
      setInstDates([]); return;
    }
    // Use first_payment_date as base; parse as local noon to avoid timezone shift
    const [py, pm, pd] = form.first_payment_date.split('-').map(Number);
    setInstDates(Array.from({ length: form.installments }, (_, i) => {
      const d = new Date(py, pm - 1 + i, pd, 12, 0, 0);
      return { due_ms: d.getTime(), paid: false, paid_ms: null };
    }));
  }, [form.installments, form.first_payment_date, form.payment_type]);

  const togglePaid = (idx: number) => {
    setInstDates(prev => prev.map((d, i) =>
      i !== idx ? d : { ...d, paid: !d.paid, paid_ms: !d.paid ? Date.now() : null }
    ));
  };

  const instAmt = parseFloat(form.total_amount || '0') / (form.installments || 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.total_amount) {
      setError('Preencha Nome, Email e Valor.'); return;
    }
    setSaving(true); setError('');
    try {
      const [ey, em, ed] = form.entry_date.split('-').map(Number);
      const entryTs = new Date(ey, em - 1, ed, 12, 0, 0).getTime();
      const body = {
        course_name:        courseName,
        name:               form.name,
        email:              form.email.toLowerCase().trim(),
        phone:              form.phone,
        entry_date:         entryTs,
        payment_type:       form.payment_type,
        total_amount:       parseFloat(form.total_amount),
        installments:       form.payment_type === 'PIX' ? 1 : form.installments,
        installment_amount: instAmt,
        installment_dates:  form.payment_type === 'PIX'
          ? [{ due_ms: entryTs, paid: true, paid_ms: entryTs }]
          : instDates,
        notes: form.notes,
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
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
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
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
              <label style={LABEL}>Telefone</label>
              <input style={INPUT} placeholder="(11) 99999-9999" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
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
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            {(['PIX', 'CREDIT_CARD'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setForm(f => ({ ...f, payment_type: t, installments: 1 }))}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12, fontWeight: 800, fontSize: 12,
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: form.payment_type === t ? (t === 'PIX' ? 'rgba(74,222,128,0.15)' : 'rgba(232,177,79,0.15)') : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${form.payment_type === t ? (t === 'PIX' ? GREEN : GOLD) : 'rgba(255,255,255,0.1)'}`,
                  color: form.payment_type === t ? (t === 'PIX' ? GREEN : GOLD) : SILVER,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {t === 'PIX' ? 'pix' : 'credit_card'}
                </span>
                {t === 'PIX' ? 'PIX' : 'Cartão de Crédito'}
              </button>
            ))}
          </div>

          {/* Valor + Parcelas */}
          <div style={{ display: 'grid', gridTemplateColumns: form.payment_type === 'CREDIT_CARD' ? '1fr 1fr 1fr' : '1fr', gap: 14, marginBottom: form.payment_type === 'CREDIT_CARD' ? 14 : 18 }}>
            <div>
              <label style={LABEL}>Valor Total (R$) *</label>
              <input style={INPUT} type="number" step="0.01" min="0" placeholder="997.00" value={form.total_amount}
                onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} required />
            </div>
            {form.payment_type === 'CREDIT_CARD' && (<>
              <div>
                <label style={LABEL}>Parcelas</label>
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.installments}
                  onChange={e => setForm(f => ({ ...f, installments: parseInt(e.target.value) }))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n} style={{ background: NAVY, color: 'white' }}>{n}×</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL}>Valor por Parcela</label>
                <div style={{ ...INPUT, color: GOLD, fontWeight: 900, display: 'flex', alignItems: 'center' }}>
                  {form.total_amount ? `R$ ${instAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                </div>
              </div>
            </>)}
          </div>

          {/* Data do 1º pagamento (cartão) */}
          {form.payment_type === 'CREDIT_CARD' && (
            <div style={{ marginBottom: 18 }}>
              <label style={LABEL}>Data do 1º Pagamento *</label>
              <input style={{ ...INPUT, maxWidth: 220 }} type="date" value={form.first_payment_date}
                onChange={e => setForm(f => ({ ...f, first_payment_date: e.target.value }))} required />
              <p style={{ fontSize: 10, color: SILVER, marginTop: 6, fontWeight: 600 }}>
                As demais parcelas serão calculadas mensalmente a partir desta data.
              </p>
            </div>
          )}

          {/* Installment tracker */}
          {form.payment_type === 'CREDIT_CARD' && instDates.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px 16px', marginBottom: 18 }}>
              <p style={{ ...LABEL, marginBottom: 12 }}>Marque as parcelas já pagas</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                      {form.total_amount ? `R$ ${instAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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

// ── Edit Student Modal ────────────────────────────────────────────────────────
function EditStudentModal({ student, onClose, onSaved }: {
  student: { name: string; email: string; phone: string; document: string; manualId?: string };
  onClose: () => void;
  onSaved: (updated: { phone: string; name: string; document: string }) => void;
}) {
  const [phone,    setPhone]    = React.useState(student.phone    || '');
  const [name,     setName]     = React.useState(student.name     || '');
  const [docNum,   setDocNum]   = React.useState(student.document || '');
  const [saving,   setSaving]   = React.useState(false);
  const [error,    setError]    = React.useState('');

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/alunos/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    student.email,
          phone:    phone.trim()    || null,
          name:     name.trim()     || null,
          document: docNum.trim()   || null,
          manualId: student.manualId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar');
      onSaved({ phone: phone.trim(), name: name.trim(), document: docNum.trim() });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally { setSaving(false); }
  };

  const Field = ({ label, value, onChange, placeholder, icon }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; icon: string;
  }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>{icon}</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder={placeholder || ''}
          style={{
            width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, fontSize: 13,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'white', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.9)', backdropFilter: 'blur(14px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 440, borderRadius: 24,
        background: 'linear-gradient(160deg, rgba(8,15,30,0.98) 0%, rgba(4,10,20,0.99) 100%)',
        border: '1px solid rgba(99,179,237,0.2)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(99,179,237,0.08), 0 1px 0 rgba(255,255,255,0.05) inset',
        padding: 32,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.25)',
            flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ color: '#63b3ed', fontSize: 20 }}>edit</span>
          </div>
          <div>
            <h3 style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: 0 }}>Editar Informações</h3>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, marginTop: 2 }}>{student.name}</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: SILVER, cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Fields */}
        <Field label="Telefone" icon="phone" value={phone} onChange={setPhone}
          placeholder="(11) 99999-9999" />
        <Field label="Nome" icon="person" value={name} onChange={setName}
          placeholder="Nome completo" />
        <Field label="CPF / Documento" icon="badge" value={docNum} onChange={setDocNum}
          placeholder="000.000.000-00" />

        {error && (
          <p style={{ color: '#f87171', fontSize: 11, marginBottom: 12, textAlign: 'center' }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12,
              cursor: 'pointer', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              background: 'rgba(99,179,237,0.15)', border: '1.5px solid rgba(99,179,237,0.4)', color: '#63b3ed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {saving ? 'progress_activity' : 'save'}
            </span>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────────────────
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
  const decoded = decodeURIComponent(courseName);
  const router  = useRouter();

  const [students,       setStudents]       = useState<Student[]>([]);
  const [manualStudents,  setManualStudents]  = useState<ManualStudent[]>([]);
  const [hiddenEmails,    setHiddenEmails]    = useState<Set<string>>(new Set());
  const [phoneCache,      setPhoneCache]      = useState<Record<string, string>>({});
  const [phonesLoading,   setPhonesLoading]   = useState(false);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<{ id: string; name: string; email: string; source: 'manual' | 'hotmart' } | null>(null);
  const [deleting,       setDeleting]       = useState(false);
  const [editTarget,     setEditTarget]     = useState<{ name: string; email: string; phone: string; document: string; manualId?: string } | null>(null);
  const [turmas,         setTurmas]         = useState<string[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [turmaFilter,  setTurmaFilter]  = useState('');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(0);
  const [pageSize,     setPageSize]     = useState(50);
  const [sortDir,      setSortDir]      = useState<'desc' | 'asc'>('desc');
  const [statusFilter, setStatusFilter] = useState<'' | 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO'>('');

  // Tooltip — single global mouse tracker, no React state for position
  const [tooltipSt,  setTooltipSt]  = useState<Student | null>(null);
  const tipTimer = React.useRef<any>(null);
  const openTip  = (_e: React.MouseEvent, s: Student) => { clearTimeout(tipTimer.current); setTooltipSt(s); };
  const closeTip = () => { tipTimer.current = setTimeout(() => setTooltipSt(null), 150); };

  // One listener tracks mouse and moves tooltip div directly — no React state involved
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const tip = document.getElementById('name-tooltip');
      if (!tip) return;
      const tw = tip.offsetWidth  || 300;
      const th = tip.offsetHeight || 200;
      let x = e.clientX + 16;
      let y = e.clientY + 12;
      if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 8;
      if (y + th > window.innerHeight - 8) y = e.clientY - th - 8;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
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
  }, [decoded, turmaFilter]);

  // Merge Hotmart + manual students, filter hidden
  const allStudents: Student[] = [
    ...manualStudents.map(ms => manualToStudent(ms)),
    ...students
      .filter(s => !hiddenEmails.has((s.email || '').toLowerCase()))
      .map(s => ({ ...s, source: 'hotmart' as const })),
  ];
  const filtered = allStudents.filter(s => {
    if (statusFilter && getPayStatus(s) !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.includes(q);
  });
  const sorted     = [...filtered].sort((a, b) => sortDir === 'desc' ? (b.entryDate||0)-(a.entryDate||0) : (a.entryDate||0)-(b.entryDate||0));
  const paginated  = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  // ── Background phone fetch for current page ────────────────────────────────
  // Run whenever paginated changes. Fetch only emails not yet cached.
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
      .then(({ phones }) => {
        if (!cancelled) {
          setPhoneCache(prev => ({ ...prev, ...(phones || {}) }));
          setPhonesLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setPhonesLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginated.map(s => s.email).join('|')]);

  const adimN   = allStudents.filter(s => getPayStatus(s) === 'ADIMPLENTE').length;
  const inadimN  = allStudents.filter(s => getPayStatus(s) === 'INADIMPLENTE').length;
  const quitN   = allStudents.filter(s => getPayStatus(s) === 'QUITADO').length;

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
    { label: 'Total',        val: students.length, color: '#60a5fa', icon: 'group',        f: '' as const },
    { label: 'Adimplentes',  val: adimN,           color: '#38bdf8', icon: 'check_circle', f: 'ADIMPLENTE' as const },
    { label: 'Inadimplentes',val: inadimN,         color: '#f87171', icon: 'warning',      f: 'INADIMPLENTE' as const },
    { label: 'Quitados',     val: quitN,           color: '#4ade80', icon: 'verified',     f: 'QUITADO' as const },
  ];

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[80px]" />
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
            <button onClick={() => generatePDF(decoded, sorted)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.1)')}>
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              Exportar PDF
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', color: GREEN }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.08)')}>
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              Adicionar Aluno
            </button>
          </div>

          {/* Summary cards */}
          {!loading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {SUMMARY_CARDS.map(card => (
                <button key={card.label}
                  onClick={() => { setStatusFilter(statusFilter === card.f ? '' : card.f); setPage(0); }}
                  className="rounded-2xl p-4 text-left transition-all"
                  style={{
                    ...TABLE_STYLE, borderRadius: 18,
                    border: `1px solid ${statusFilter === card.f ? card.color + '55' : 'rgba(255,255,255,0.1)'}`,
                    boxShadow: statusFilter === card.f ? `0 0 0 1px ${card.color}33, 0 1px 0 rgba(255,255,255,0.08) inset` : '0 1px 0 rgba(255,255,255,0.08) inset',
                  }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[16px]" style={{ color: card.color }}>{card.icon}</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: SILVER }}>{card.label}</p>
                  </div>
                  <p className="text-3xl font-black" style={{ color: card.color }}>{card.val.toLocaleString('pt-BR')}</p>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative min-w-[240px] max-w-[380px] flex-1">
              <span className="material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
              <input type="text" placeholder="Buscar aluno por nome ou email..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)', color: 'white' }} />
            </div>
          </div>


          {/* Table — no overflow:hidden so portaled tooltip renders above all elements */}
          <div style={{ ...TABLE_STYLE, overflow: 'visible' }}>
            <div className="pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)', borderRadius: '24px 24px 0 0', height: 4, marginBottom: -4 }} />

            {/* Header */}
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
              [...Array(10)].map((_, i) => (
                <div key={i} className="grid px-5 py-4 animate-pulse" style={{ gridTemplateColumns: GRID, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[...Array(6)].map((_, j) => <div key={j} className="h-4 rounded-lg mr-3" style={{ background: 'rgba(255,255,255,0.06)' }} />)}
                </div>
              ))
            ) : paginated.length === 0 ? (
              <div className="py-20 text-center">
                <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: SILVER }}>group</span>
                <p className="font-bold text-sm" style={{ color: SILVER }}>Nenhum aluno encontrado.</p>
              </div>
            ) : (
              paginated.map((s, idx) => {
                const status  = getPayStatus(s);
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
                      <div className="flex items-center gap-2 leading-tight">
                        {getStudentFlag(s.flag, 18)}
                        <button
                          onClick={() => router.push(`/alunos/${emailToId(s.email)}`)}
                          className="text-[12px] font-black text-white truncate text-left transition-colors"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                          onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
                          title={s.name}
                        >{s.name}</button>
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

                    {/* Email + phone */}
                    <div className="flex flex-col gap-0.5 pr-3 pt-1">
                      <span className="text-[11px] font-bold truncate" style={{ color: SILVER }}>{s.email}</span>
                      {(() => {
                        // Manual students use stored phone; Hotmart students use AC cache
                        const ph = (s as any).source === 'manual'
                          ? ((s as any).phone || '')
                          : (phoneCache[(s.email || '').toLowerCase()] || '');
                        return ph ? (
                          <span className="flex items-center gap-1" style={{ color: 'rgba(74,222,128,0.8)', fontSize: 10, fontWeight: 700 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>phone</span>
                            {ph}
                          </span>
                        ) : phonesLoading && !((s.email || '').toLowerCase() in phoneCache) ? (
                          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 600 }}>buscando...</span>
                        ) : null;
                      })()}
                    </div>
                    {/* Valor Parcela */}
                    <div className="flex flex-col gap-0.5 pt-1">
                      <span className="text-[12px] font-bold" style={{ color: GOLD }}>{fmtMoneyByCurrency(vParcela(s), s.currency)}</span>
                      {s.valorBRL != null && s.currency !== 'BRL' && (
                        <span className="text-[9px] font-bold" style={{ color: SILVER }}>≈ {fmtMoney(s.valorBRL)}</span>
                      )}
                    </div>
                    {/* Total Pago */}
                    <div className="flex flex-col gap-0.5 pt-1">
                      <span className="text-[12px] font-bold text-white">{fmtMoneyByCurrency(vTotal(s), s.currency)}</span>
                      {s.valorBRL != null && s.currency !== 'BRL' && (() => {
                        const totalBrl = s.paymentHistory.length > 0
                          ? s.valorBRL * s.paymentHistory.length
                          : s.valorBRL;
                        return <span className="text-[9px] font-bold" style={{ color: SILVER }}>≈ {fmtMoney(totalBrl)}</span>;
                      })()}
                    </div>
                    <PaymentCell s={s} />
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
                          document: (s as any).document || '',
                          manualId: (s as any).source === 'manual' ? (s as any).manualId : undefined,
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
          onSaved={({ phone, document }) => {
            const emailKey = (editTarget.email || '').toLowerCase();
            // Update phoneCache for Hotmart students
            if (phone) setPhoneCache(prev => ({ ...prev, [emailKey]: phone }));
            // Update manual_students phone for manual students
            if (editTarget.manualId) {
              setManualStudents(prev => prev.map(ms =>
                ms.id === editTarget.manualId ? { ...ms, phone } : ms
              ));
            }
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
          onHoverIn={() => clearTimeout(tipTimer.current)}
          onHoverOut={closeTip}
        />,
        document.body
      )}
    </LoginWrapper>
  );
}
