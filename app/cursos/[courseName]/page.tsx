'use client';

import React, { useState, useEffect, use } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

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

// ── Types ─────────────────────────────────────────────────────────────────────
type SubStatus = 'ACTIVE' | 'OVERDUE' | 'CANCELLED';
type PayHist   = { date: number; valor: number; recurrencyNumber: number; index: number };
type Student   = {
  name: string; email: string;
  entryDate: number | null; lastPayDate: number | null;
  turma: string; valor: number; valorBRL: number | null; currency: string; flag: string; transaction: string;
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${(paidSoFar / inst) * 100}%`, background: `linear-gradient(90deg, ${GOLD}, #f59e0b)` }} />
            </div>
            <span className="text-[10px] font-black" style={{ color: GOLD }}>{paidSoFar}/{inst}</span>
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
const GRID = '120px 1fr 1fr 140px 160px 260px';
const COLS = [
  { key: 'entryDate', label: 'Entrada',       sortable: true  },
  { key: 'name',      label: 'Nome',           sortable: false },
  { key: 'email',     label: 'Email',          sortable: false },
  { key: 'parcela',   label: 'Valor Parcela',  sortable: false },
  { key: 'total',     label: 'Total Pago',     sortable: false },
  { key: 'payment',   label: 'Status',         sortable: false },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CursoDetailPage({ params }: { params: Promise<{ courseName: string }> }) {
  const { courseName } = use(params);
  const decoded = decodeURIComponent(courseName);
  const router  = useRouter();

  const [students,     setStudents]     = useState<Student[]>([]);
  const [turmas,       setTurmas]       = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
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
    fetch(`/api/cursos/${encodeURIComponent(decoded)}${p}`)
      .then(r => r.json())
      .then(d => { setStudents(d.students || []); setTurmas(d.turmas || []); setLoading(false); setPage(0); })
      .catch(() => setLoading(false));
  }, [decoded, turmaFilter]);

  const filtered = students.filter(s => {
    if (statusFilter && getPayStatus(s) !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.includes(q);
  });
  const sorted     = [...filtered].sort((a, b) => sortDir === 'desc' ? (b.entryDate||0)-(a.entryDate||0) : (a.entryDate||0)-(b.entryDate||0));
  const paginated  = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const adimN  = students.filter(s => getPayStatus(s) === 'ADIMPLENTE').length;
  const inadimN = students.filter(s => getPayStatus(s) === 'INADIMPLENTE').length;
  const quitN  = students.filter(s => getPayStatus(s) === 'QUITADO').length;

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
                    <div className="pr-3 pt-0.5 cursor-default"
                      onMouseEnter={e => openTip(e, s)}
                      onMouseLeave={closeTip}>
                      <div className="flex items-center gap-2 leading-tight">
                        {getStudentFlag(s.flag, 18)}
                        <p className="text-[12px] font-black text-white truncate" title={s.name}>{s.name}</p>
                      </div>
                      {status === 'INADIMPLENTE' && (
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#f87171' }}>
                          ⚠ Pagamento em atraso
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-bold truncate pr-3 pt-1" style={{ color: SILVER }}>{s.email}</span>
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
