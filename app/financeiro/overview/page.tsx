'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

/* ─── Tab config ────────────────────────────────────────────────────────────── */
type Tab = 'entradas';
const TABS: { key: Tab; label: string; icon: string; accent: string; rowTint: string }[] = [
  { key: 'entradas', label: 'Últimas Entradas', icon: 'payments', accent: '#4ade80', rowTint: 'rgba(74,222,128,' },
];

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function emailToId(email: string) {
  return btoa((email || '').toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

function fmtLocalCurrency(amount: number, currency: string): string {
  const cur = (currency || 'BRL').toUpperCase();
  if (cur === 'BRL') return fmtBRL(amount);
  try {
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: cur, minimumFractionDigits: 2 });
  } catch {
    return `${cur} ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
}

function fmtDate(ts: number | string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateTime(ts: number | string | null) {
  if (!ts) return { date: '—', time: '' };
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}
const daysUntil = (ts: number) => Math.ceil((ts - Date.now()) / 86_400_000);
const daysSince  = (ts: number | null) => ts ? Math.floor((Date.now() - ts) / 86_400_000) : 0;

/* ─── Shared UI ─────────────────────────────────────────────────────────────── */
const cardBorder = 'rgba(255,255,255,0.08)';

function tabStyle(accent: string): React.CSSProperties {
  return {
    background: `linear-gradient(160deg, ${accent}10 0%, ${accent}04 50%, rgba(0,10,30,0.7) 100%)`,
    border: `1px solid ${accent}22`,
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    boxShadow: `0 1px 0 ${accent}18 inset, 0 24px 48px -12px rgba(0,0,0,0.5)`,
    borderRadius: 24,
    overflow: 'hidden',
  };
}

function PaymentBadge({ method, isManual = false }: { method: string; isManual?: boolean }) {
  const m = (method || '').toUpperCase();
  let label = method || '—', bg = 'rgba(255,255,255,0.08)', color = SILVER;
  if (isManual) {
    // Detailed labels for manual payment types
    if (m === 'PIX_MENSAL')  { label = 'Pix Mensal';   bg = 'rgba(192,132,252,0.12)'; color = '#c084fc'; }
    else if (m === 'PIX_CARTAO')  { label = 'Pix + Cartão'; bg = 'rgba(56,189,248,0.12)';  color = '#38bdf8'; }
    else if (m === 'CREDIT_CARD') { label = 'Cartão';       bg = 'rgba(232,177,79,0.12)';  color = GOLD; }
    else if (m.includes('PIX'))   { label = 'Pix';           bg = 'rgba(34,197,94,0.12)';   color = '#22c55e'; }
    else { label = method; }
  } else {
    if (m.includes('CREDIT') || m.includes('CARD'))  { label = 'Cartão';  bg = 'rgba(56,189,248,0.12)';  color = '#38bdf8'; }
    else if (m.includes('PIX'))    { label = 'Pix';    bg = 'rgba(34,197,94,0.12)';  color = '#22c55e'; }
    else if (m.includes('BOLETO')) { label = 'Boleto'; bg = 'rgba(232,177,79,0.12)'; color = GOLD; }
    else if (m.includes('PAYPAL')) { label = 'PayPal'; bg = 'rgba(99,102,241,0.14)'; color = '#818cf8'; }
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"
      style={{ background: bg, border: `1px solid ${color}30`, color }}>
      {label}
    </span>
  );
}

const CURRENCY_ISO: Record<string, string> = {
  BRL:'br', COP:'co', BOB:'bo', MXN:'mx', ARS:'ar', CLP:'cl',
  PEN:'pe', UYU:'uy', CRC:'cr', HNL:'hn', PYG:'py', GTQ:'gt',
  DOP:'do', CUP:'cu', VES:'ve', USD:'us',
};
function Flag({ currency, size = 18 }: { currency: string; size?: number }) {
  const iso = CURRENCY_ISO[(currency || 'BRL').toUpperCase()];
  if (!iso) return null;
  return <img src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/flags/4x3/${iso}.svg`}
    width={size} height={Math.round(size * 0.75)} alt={currency}
    style={{ borderRadius: 3, objectFit: 'cover', display: 'inline-block', flexShrink: 0 }} />;
}

function NameBtn({ name, email, router }: { name: string; email: string; router: ReturnType<typeof useRouter> }) {
  return (
    <button onClick={() => router.push(`/alunos/${emailToId(email)}`)}
      className="text-[15px] font-black text-white uppercase hover:underline text-left"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
      onMouseLeave={e => (e.currentTarget.style.color = '#fff')}>
      {name}
    </button>
  );
}

/* ─── Skeleton / Loading ─────────────────────────────────────────────────── */
const SHIMMER_STYLE: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.04) 100%)',
  backgroundSize: '400px 100%',
  animation: 'shimmer 2s infinite linear',
  borderRadius: 8,
};
function SkelCell({ w = '70%', h = 14, delay = 0 }: { w?: string | number; h?: number; delay?: number }) {
  return (
    <div style={{ ...SHIMMER_STYLE, width: w, height: h, animationDelay: `${delay}ms`, maxWidth: '100%' }} />
  );
}
function SkelRow({ cols, accent }: { cols: number; accent: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${accent}10` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div className="flex flex-col gap-1.5">
            <SkelCell w={i === 0 ? '55%' : i === cols - 1 ? '40%' : '75%'} delay={i * 60} />
            {(i === 0 || i === cols - 2) && <SkelCell w="45%" h={10} delay={i * 60 + 80} />}
          </div>
        </td>
      ))}
    </tr>
  );
}

/* ─── ManualOverdueRow — inline installment grid with per-installment quitar ─ */
function ManualOverdueRow({ o: initialO, onPaid, router }: {
  o: any;
  onPaid: (row: any) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [o, setO]           = React.useState(initialO);
  const [paying, setPaying]  = React.useState<number | null>(null); // index being paid
  const [errMsg, setErrMsg]  = React.useState('');
  const [allDone, setAllDone]= React.useState(false);

  const severity = o.daysOverdue > 30 ? '#f87171' : o.daysOverdue > 14 ? '#fb923c' : GOLD;
  const rowBg    = allDone ? 'rgba(74,222,128,0.05)' : 'rgba(232,177,79,0.03)';
  const isPix    = (o.paymentType || '').toUpperCase() === 'PIX' || (o.paymentType || '').toUpperCase() === 'PIX_AVISTA';
  const paidCount= (o.paidCount ?? 0);
  const dates: any[] = o.installment_dates || [];
  const GRACE = 15 * 24 * 60 * 60 * 1000;
  const now   = Date.now();

  async function handleQuitar(idx: number) {
    if (paying != null) return;
    setPaying(idx);
    setErrMsg('');
    try {
      const res  = await fetch('/api/alunos/manual/pay-installment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: o.email,
          installmentIndex: idx,
          manualStudentId: o.manualStudentId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao marcar');

      // Update local state
      const newDates = (json.updatedDates || dates).map((d: any, i: number) =>
        i === idx ? { ...d, paid: true, paid_ms: json.paidMs } : d
      );
      const newPaidCount = newDates.filter((d: any) => d.paid).length;
      const stillOverdue = newDates.some((d: any) => !d.paid && Number(d.due_ms) + GRACE < now);

  if (json.allPaid || !stillOverdue) {
        // Flash green then remove row
        setAllDone(true);
        setTimeout(() => onPaid(json), 1100);
      } else {
        // Still has overdue installments — update data in place
        setO((prev: any) => ({
          ...prev,
          paidCount: newPaidCount,
          installment_dates: newDates,
          installmentNum: newDates.findIndex((d: any) => !d.paid && Number(d.due_ms) + GRACE < now) + 1,
          daysOverdue: Math.floor((now - Math.min(...newDates.filter((d: any) => !d.paid && Number(d.due_ms) + GRACE < now).map((d: any) => Number(d.due_ms)))) / 86_400_000),
        }));
      }
    } catch (e: any) {
      setErrMsg(e.message);
    } finally {
      setPaying(null);
    }
  }

  return (
    <tr style={{ background: rowBg, borderBottom: `1px solid ${GOLD}15`, transition: 'background 0.4s' }}>
      {/* Vencimento */}
      <td className="py-3 px-4 whitespace-nowrap" style={{ verticalAlign: 'top' }}>
        <span className="text-sm font-black text-white">{fmtDate(o.dueDate)}</span>
      </td>
      {/* Valor */}
      <td className="py-3 px-4 text-right whitespace-nowrap" style={{ verticalAlign: 'top' }}>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-black text-lg" style={{ color: GOLD }}>{fmtBRL(o.amount)}</span>
          {o.paymentLabel && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: `${GOLD}18`, color: GOLD }}>
              {o.paymentLabel}
            </span>
          )}
        </div>
      </td>
      {/* NOME — limpo */}
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <NameBtn name={o.name} email={o.email} router={router} />
        <div className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{o.email}</div>
      </td>

      {/* PAGAMENTO — chips + resumo financeiro */}
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <div className="flex flex-col gap-2">

          {/* Resumo: forma · pagas · total pago */}
          <div className="flex flex-wrap items-center gap-2">
            {o.paymentLabel && (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-md"
                style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}>
                {o.paymentLabel}
              </span>
            )}
            {!isPix && o.totalInstallments > 1 && (
              <span className="text-[9px] font-bold" style={{ color: SILVER }}>
                {paidCount}/{o.totalInstallments} parcelas pagas
              </span>
            )}
            {!isPix && o.totalInstallments > 1 && paidCount > 0 && (
              <span className="text-[9px] font-bold" style={{ color: '#4ade80' }}>
                · {fmtBRL(o.amount * paidCount)} pagos
              </span>
            )}
          </div>

          {/* Chips de parcelas com botão Quitar */}
          {dates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dates.map((d: any, di: number) => {
                const due      = Number(d.due_ms);
                const overdue  = !d.paid && due + GRACE < now;
                const future   = !d.paid && due > now;
                const grace    = !d.paid && !overdue && !future;
                const isPaying = paying === di;

                const bg     = d.paid ? 'rgba(74,222,128,0.08)'  : overdue ? 'rgba(239,68,68,0.08)'  : 'rgba(255,255,255,0.04)';
                const border = d.paid ? 'rgba(74,222,128,0.25)'  : overdue ? 'rgba(239,68,68,0.25)'  : 'rgba(255,255,255,0.08)';
                const clr    = d.paid ? '#4ade80'                 : overdue ? '#f87171'               : SILVER;

                return (
                  <div key={di} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1"
                    style={{ background: bg, border: `1px solid ${border}` }}>
                    <div className="flex flex-col leading-none">
                      <span className="text-[8px] font-black uppercase" style={{ color: clr }}>
                        {d.paid ? '✓' : overdue ? '⚠' : '◷'} P{di + 1}
                      </span>
                      <span className="text-[8px]" style={{ color: clr }}>
                        {due > 0 ? fmtDate(due) : '—'}
                      </span>
                      {d.paid && d.paid_ms && (
                        <span className="text-[7px]" style={{ color: '#4ade8070' }}>≪ {fmtDate(d.paid_ms)}</span>
                      )}
                    </div>
                    {!d.paid && (overdue || grace) && (
                      <button onClick={() => handleQuitar(di)} disabled={paying != null}
                        className="inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-lg whitespace-nowrap transition-all"
                        style={{
                          fontSize: '11px',
                          background: isPaying ? 'rgba(255,255,255,0.05)' : `${GOLD}25`,
                          border: `1px solid ${GOLD}60`,
                          color: isPaying ? SILVER : GOLD,
                          cursor: paying != null ? 'wait' : 'pointer',
                          opacity: paying != null && !isPaying ? 0.45 : 1,
                          flexShrink: 0,
                          letterSpacing: '0.02em',
                        }}>
                        {isPaying
                          ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: 13 }}>progress_activity</span>
                          : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>payments</span>
                        }
                        {isPaying ? 'Salvando…' : 'Quitar'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {errMsg && <span className="text-[9px] font-bold" style={{ color: '#f87171' }}>{errMsg}</span>}
        </div>
      </td>

      {/* Produto */}
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <span className="text-[11px] font-black uppercase tracking-tight leading-tight block" style={{ color: SILVER }}>
          {o.product}
        </span>
      </td>
      {/* Dias atraso — no fim, igual Hotmart */}
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-black"
          style={{ background: `${severity}18`, border: `1px solid ${severity}40`, color: severity }}>
          {o.daysOverdue}d
        </span>
      </td>
    </tr>
  );
}
function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-4 px-4 text-[12px] font-black uppercase tracking-widest whitespace-nowrap${right ? ' text-right' : ''}`}
      style={{ color: SILVER, borderBottom: `1px solid ${cardBorder}` }}>
      {children}
    </th>
  );
}



/* ─── Types ─────────────────────────────────────────────────────────────────── */
type Transaction = {
  transaction: string; date: string;
  buyer: { name: string; email: string };
  product: { name: string };
  amount: number; currency: string; amountBRL: number | null;
  paymentType: string; status: string;
  isSubscription: boolean; installments: number; recurrencyNumber: number | null;
  source?: 'hotmart' | 'manual';
  notes?: string;
};
type Upcoming = {
  subscriberCode: string;
  subscriber: { name: string; email: string };
  product: { name: string };
  plan: string; dateNextCharge: number;
  amount: number; currency: string; amountBRL: number | null;
  accessionDate: number;
};
type Overdue = {
  subscriberCode?: string;
  subscriber: { name: string; email: string };
  product: { name: string };
  plan: string; status?: string;
  amount: number; currency: string; amountBRL: number | null;
  accessionDate: number; lastPayDate: number; daysSinceLast: number;
  lastTransaction: string;
  isSub: boolean; isSmartInstall: boolean;
  paidCount: number; paidTotal: number; installments: number;
};
type Data = {
  totalTransactions: number; totalSubs: number;
  hotmartEntries: Transaction[];
  manualEntries: Transaction[];
  upcoming: Upcoming[];
  manualUpcoming: ManualUpcoming[];
  overdue: Overdue[];
  manualOverdue: ManualOverdue[];
  statusCounts: Record<string, number>;
};
type ManualUpcoming = {
  name: string; email: string; product: string;
  dueDate: number; amount: number;
  installmentNum: number; totalInstallments: number;
  paymentType?: string; paymentLabel?: string; paidCount?: number;
};
type ManualOverdue = {
  name: string; email: string; product: string;
  dueDate: number; daysOverdue: number; amount: number;
  installmentNum: number; totalInstallments: number;
  paymentType?: string; paymentLabel?: string; paidCount?: number;
};

/* ── Paginator ──────────────────────────────────────────────────────────── */
function Paginator({ page, total, perPage, onPage, accent }: {
  page: number; total: number; perPage: number;
  onPage: (p: number) => void; accent: string;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const start  = Math.max(0, Math.min(page - 3, pages - 7));
  const window = Array.from({ length: Math.min(7, pages) }, (_, i) => start + i);
  const btn = (disabled: boolean, active = false): React.CSSProperties => ({
    minWidth: 32, height: 32, borderRadius: 8, fontSize: 11, fontWeight: 900,
    cursor: disabled ? 'default' : 'pointer',
    border: active ? `1px solid ${accent}80` : '1px solid rgba(255,255,255,0.1)',
    background: active ? `${accent}22` : 'rgba(255,255,255,0.04)',
    color: active ? accent : disabled ? 'rgba(255,255,255,0.2)' : SILVER,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 0' }}>
      <button onClick={() => onPage(0)} disabled={page === 0} style={btn(page === 0)}>«</button>
      <button onClick={() => onPage(page - 1)} disabled={page === 0} style={btn(page === 0)}>‹</button>
      {window.map(p => <button key={p} onClick={() => onPage(p)} style={btn(false, page === p)}>{p + 1}</button>)}
      <button onClick={() => onPage(page + 1)} disabled={page >= pages - 1} style={btn(page >= pages - 1)}>›</button>
      <button onClick={() => onPage(pages - 1)} disabled={page >= pages - 1} style={btn(page >= pages - 1)}>»</button>
      <span style={{ fontSize: 10, fontWeight: 700, color: SILVER, marginLeft: 6 }}>
        {page * perPage + 1}–{Math.min((page + 1) * perPage, total)} de {total}
      </span>
    </div>
  );
}


const PAGE_SIZE = 15;
function EntryTable({
  title, subtitle, accent, entries, loading, router, isManual = false,
}: {
  title: string; subtitle: string; accent: string;
  entries: Transaction[]; loading: boolean;
  router: ReturnType<typeof useRouter>; isManual?: boolean;
}) {
  const [search, setSearch] = React.useState('');
  const [page, setPage]     = React.useState(0);
  React.useEffect(() => { setPage(0); }, [search]);
  const filtered    = search.trim()
    ? entries.filter(e =>
        e.buyer.name.toLowerCase().includes(search.toLowerCase()) ||
        e.buyer.email.toLowerCase().includes(search.toLowerCase())
      )
    : entries;
  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{
      background: `linear-gradient(160deg, ${accent}09 0%, ${accent}03 50%, rgba(0,10,30,0.7) 100%)`,
      border: `1px solid ${accent}22`,
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      boxShadow: `0 1px 0 ${accent}18 inset, 0 24px 48px -12px rgba(0,0,0,0.5)`,
      borderRadius: 24, overflow: 'hidden',
    }}>
      <div className="px-7 py-5 flex items-center gap-3 flex-wrap" style={{ borderBottom: `1px solid ${accent}22` }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}15`, border: `1px solid ${accent}35` }}>
          <span className="material-symbols-outlined text-xl" style={{ color: accent }}>
            {isManual ? 'edit_note' : 'payments'}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{title}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{subtitle}</p>
        </div>
        {/* Search */}
        <div style={{ position: 'relative', minWidth: 200 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: SILVER, fontSize: 16, pointerEvents: 'none' }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome..."
            style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${accent}30`, borderRadius: 10,
              padding: '7px 10px 7px 32px', color: '#fff', fontSize: 11, fontWeight: 600, width: '100%', outline: 'none' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: SILVER, cursor: 'pointer', fontSize: 16 }}>×</button>}
        </div>
        <span className="px-3 py-1 rounded-full text-[11px] font-black" style={{ background: `${accent}18`, color: accent }}>
          {loading ? '…' : search ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` : `${entries.length} entradas`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 148 }} />
            <col style={{ width: 148 }} />
            <col />
            <col style={{ width: 360 }} />
          </colgroup>
          <thead>
            <tr style={{ background: `${accent}08` }}>
              <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Data / Hora</th>
              <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap text-right" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Faturamento</th>
              <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Pagamento</th>
              <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Cliente</th>
              <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Produto</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={5} accent={accent} />)
              : pageEntries.length === 0
                ? <tr><td colSpan={5} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                    {search ? `Nenhum resultado para "${search}"` : 'Nenhuma entrada encontrada.'}
                  </td></tr>
                : pageEntries.map((t, idx) => {
                    const dt = fmtDateTime(t.date);
                    let installLabel = '', installStyle: React.CSSProperties = {};
                    if (t.isSubscription) {
                      installLabel = t.recurrencyNumber ? `Assinatura · Ciclo ${t.recurrencyNumber}` : 'Assinatura';
                      installStyle = { background: 'rgba(56,189,248,0.12)', color: '#38bdf8' };
                    } else if (t.installments > 1) {
                      installLabel = t.recurrencyNumber
                        ? `Parcela ${t.recurrencyNumber}/${t.installments}`
                        : `${t.installments}× parcelado`;
                      installStyle = { background: 'rgba(99,102,241,0.15)', color: '#818cf8' };
                    } else {
                      installLabel = 'À vista';
                      installStyle = { background: 'rgba(34,197,94,0.08)', color: '#86efac' };
                    }
                    const rowBg = idx % 2 === 0 ? 'transparent' : `${accent}05`;
                    return (
                      <tr key={t.transaction || idx}
                        style={{ background: rowBg, borderBottom: `1px solid ${accent}15` }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${accent}0d`)}
                        onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white">{dt.date}</span>
                            <span className="text-[10px] font-bold flex items-center gap-1 mt-0.5" style={{ color: SILVER }}>
                              <span className="material-symbols-outlined text-[11px]">schedule</span>{dt.time}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-black text-xl" style={{ color: accent }}>
                              {fmtLocalCurrency(t.amount, t.currency)}
                            </span>
                            {t.currency !== 'BRL' && t.amountBRL && (
                              <span className="text-[10px] font-bold" style={{ color: SILVER }}>
                                ≈ {fmtBRL(t.amountBRL)}
                              </span>
                            )}
                            {/* installLabel from API (manual) or derived (hotmart) */}
                            {(() => {
                              let lbl = (t as any).installLabel || '';
                              let lstyle: React.CSSProperties = { background: 'rgba(167,139,250,0.12)', color: '#a78bfa' };
                              if (!lbl) {
                                // hotmart fallback
                                if (t.isSubscription) { lbl = t.recurrencyNumber ? `Ass. Ciclo ${t.recurrencyNumber}` : 'Assinatura'; lstyle = { background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }; }
                                else if (t.installments > 1) { lbl = t.recurrencyNumber ? `Parcela ${t.recurrencyNumber}/${t.installments}` : `${t.installments}× parc.`; lstyle = { background: 'rgba(99,102,241,0.15)', color: '#818cf8' }; }
                                else { lbl = 'À vista'; lstyle = { background: 'rgba(34,197,94,0.08)', color: '#86efac' }; }
                              }
                              return <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={lstyle}>{lbl}</span>;
                            })()}
                          </div>
                        </td>
                        <td className="py-3 px-4"><PaymentBadge method={t.paymentType} isManual={isManual} /></td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              {!isManual && <Flag currency={t.currency} />}
                              {t.buyer.email && t.buyer.email !== '—'
                                ? <NameBtn name={t.buyer.name} email={t.buyer.email} router={router} />
                                : <span className="text-[15px] font-black text-white uppercase">{t.buyer.name}</span>}
                            </div>
                            {t.buyer.email && t.buyer.email !== '—' && (
                              <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{t.buyer.email}</span>
                            )}
                            {isManual && (t as any).vendedor && (
                              <span className="text-[9px] font-black mt-0.5 uppercase" style={{ color: GOLD }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 9, verticalAlign: 'middle' }}>sell</span> {(t as any).vendedor}
                              </span>
                            )}
                            {t.notes && (
                              <span className="text-[9px] italic mt-0.5" style={{ color: SILVER }}>{t.notes}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>
                            {t.product.name}
                          </span>
                        </td>
                      </tr>
                    );
                  })
            }
          </tbody>
        </table>
      </div>
      <Paginator page={page} total={filtered.length} perPage={PAGE_SIZE} onPage={setPage} accent={accent} />
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
export default function FinanceiroOverviewPage() {
  const router = useRouter();
  const [data,       setData]       = useState<Data | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>('entradas');
  const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const fetchData = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dashboard:loading'));
    }
    setLoading(true);
    fetch('/api/financeiro/overview')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Silent refetch — does not show loading skeletons, used after Quitar to update Vendas / Entradas
  const silentRefetch = React.useCallback(() => {
    fetch('/api/financeiro/overview')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tab = TABS.find(t => t.key === activeTab)!;
  const counts = {
    entradas: (data?.hotmartEntries.length ?? 0) + (data?.manualEntries.length ?? 0),
  };

  return (
    <LoginWrapper>
      {/* Navy overlay — corporativo financeiro */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(0,12,40,0.58) 0%, rgba(0,22,60,0.48) 100%)' }} />
      <div className="min-h-screen pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <div className="h-[146px]" />
        <main className="px-3 sm:px-6 max-w-[1600px] mx-auto pt-4 sm:pt-10">

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>account_balance_wallet</span>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div>
              <h1 className="font-black text-3xl text-white leading-none">Financeiro</h1>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                {loading ? 'Carregando...' :
                  `${data?.totalTransactions ?? 0} transações · ${data?.totalSubs ?? 0} assinaturas`}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-bold"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              Erro: {error}
            </div>
          )}

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {TABS.map(t => {
              const isActive  = activeTab === t.key;
              const isHovered = hoveredTab === t.key;
              return (
                <button key={t.key} id={`fin-tab-${t.key}`}
                  onClick={() => setActiveTab(t.key)}
                  onMouseEnter={() => setHoveredTab(t.key)}
                  onMouseLeave={() => setHoveredTab(null)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black"
                  style={{
                    fontSize: '13px',
                    transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                    background: isActive
                      ? `${t.accent}22`
                      : isHovered
                        ? `${t.accent}12`
                        : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${
                      isActive ? `${t.accent}60`
                      : isHovered ? `${t.accent}38`
                      : 'rgba(255,255,255,0.08)'
                    }`,
                    color: isActive || isHovered ? t.accent : SILVER,
                    boxShadow: isActive
                      ? `0 0 24px ${t.accent}22, 0 4px 12px rgba(0,0,0,0.3)`
                      : isHovered
                        ? `0 0 14px ${t.accent}14`
                        : 'none',
                    transform: isHovered && !isActive ? 'translateY(-1px)' : 'none',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{t.icon}</span>
                  {t.label}
                  {!loading && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black"
                      style={{
                        background: `${t.accent}22`,
                        color: isActive || isHovered ? t.accent : SILVER,
                        transition: 'color 0.18s',
                      }}>
                      {counts[t.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: ÚLTIMAS ENTRADAS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'entradas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ─ HOTMART table ────────────────────────────────── */}
              <EntryTable
                title="💳 Últimas Entradas Hotmart"
                subtitle="20 mais recentes · ordenado por data de aprovação"
                accent="#4ade80"
                entries={data?.hotmartEntries || []}
                loading={loading}
                router={router}
              />

              {/* ─ PIX MANUAL table ────────────────────────────── */}
              <EntryTable
                title="✎️ Últimas Entradas PIX Manual"
                subtitle="20 mais recentes · ordenado por última edição"
                accent={GOLD}
                entries={(data?.manualEntries || [])}
                loading={loading}
                router={router}
                isManual
              />

            </div>
          )}
        </main>
      </div>
    </LoginWrapper>
  );
}
