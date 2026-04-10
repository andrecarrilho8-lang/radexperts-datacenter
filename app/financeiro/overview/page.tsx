'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar }       from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

/* ─── Tab config ────────────────────────────────────────────────────────────── */
type Tab = 'entradas' | 'proximos' | 'inadimplentes';
const TABS: { key: Tab; label: string; icon: string; accent: string; rowTint: string }[] = [
  { key: 'entradas',      label: 'Últimas Entradas',    icon: 'payments',         accent: '#4ade80', rowTint: 'rgba(74,222,128,' },
  { key: 'proximos',      label: 'Próximos Pagamentos', icon: 'event_upcoming',   accent: '#38bdf8', rowTint: 'rgba(56,189,248,' },
  { key: 'inadimplentes', label: 'Inadimplentes',       icon: 'warning',          accent: '#f87171', rowTint: 'rgba(248,113,113,' },
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

function PaymentBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  let label = method || '—', bg = 'rgba(255,255,255,0.08)', color = SILVER;
  if (m.includes('CREDIT') || m.includes('CARD'))  { label = 'Cartão';  bg = 'rgba(56,189,248,0.12)';  color = '#38bdf8'; }
  else if (m.includes('PIX'))    { label = 'Pix';    bg = 'rgba(34,197,94,0.12)';  color = '#22c55e'; }
  else if (m.includes('BOLETO')) { label = 'Boleto'; bg = 'rgba(232,177,79,0.12)'; color = GOLD; }
  else if (m.includes('PAYPAL')) { label = 'PayPal'; bg = 'rgba(99,102,241,0.14)'; color = '#818cf8'; }
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

/* ─── ManualOverdueRow — row with quick-pay action ──────────────────────────── */
function ManualOverdueRow({ o, onPaid, router }: {
  o: any;
  onPaid: (row: any) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [paying,  setPaying]  = React.useState(false);
  const [done,    setDone]    = React.useState(false);
  const [errMsg,  setErrMsg]  = React.useState('');

  const severity  = o.daysOverdue > 30 ? '#f87171' : o.daysOverdue > 14 ? '#fb923c' : GOLD;
  const rowBg     = 'rgba(232,177,79,0.04)';
  const isPix     = (o.paymentType || '').toUpperCase() === 'PIX' || (o.paymentType || '').toUpperCase() === 'PIX_AVISTA';
  const paidCount = o.paidCount ?? 0;

  // installmentNum is 1-based; the API expects 0-based index
  const installmentIndex = Math.max(0, (o.installmentNum ?? 1) - 1);

  async function handlePay() {
    if (paying || done) return;
    setPaying(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/alunos/manual/pay-installment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: o.email, installmentIndex }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao marcar');
      setDone(true);
      // Give a brief moment for the user to see the confirmation before row disappears
      setTimeout(() => onPaid(json), 900);
    } catch (e: any) {
      setErrMsg(e.message);
    } finally {
      setPaying(false);
    }
  }

  return (
    <tr style={{ background: done ? 'rgba(74,222,128,0.06)' : rowBg, borderBottom: `1px solid ${GOLD}15`, transition: 'background 0.3s' }}
      onMouseEnter={e => { if (!done) e.currentTarget.style.background = `${GOLD}0d`; }}
      onMouseLeave={e => { if (!done) e.currentTarget.style.background = rowBg; }}>
      {/* Vencimento — dueDate is the date of the overdue installment */}
      <td className="py-3 px-4 whitespace-nowrap">
        <span className="text-sm font-black text-white">{fmtDate(o.dueDate)}</span>
      </td>
      {/* Dias atraso */}
      <td className="py-3 px-4">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-black"
          style={{ background: `${severity}18`, border: `1px solid ${severity}40`, color: severity }}>
          {o.daysOverdue}d
        </span>
      </td>
      {/* Valor */}
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-black text-lg" style={{ color: GOLD }}>{fmtBRL(o.amount)}</span>
          {o.paymentLabel && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: `${GOLD}18`, color: GOLD }}>
              {o.paymentLabel}
            </span>
          )}
          {!isPix && o.totalInstallments > 1 && (
            <span className="text-[9px] font-bold" style={{ color: SILVER }}>
              {paidCount}/{o.totalInstallments} pagas · {o.totalInstallments - paidCount} restantes
            </span>
          )}
        </div>
      </td>
      {/* Parcela */}
      <td className="py-3 px-4">
        <span className="text-[11px] font-black" style={{ color: SILVER }}>
          {isPix ? 'PIX' : `${o.installmentNum}/${o.totalInstallments}`}
        </span>
      </td>
      {/* Nome */}
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <NameBtn name={o.name} email={o.email} router={router} />
          <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{o.email}</span>
        </div>
      </td>
      {/* Produto */}
      <td className="py-3 px-4">
        <span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>
          {o.product}
        </span>
      </td>
      {/* Ação rápida */}
      <td className="py-3 px-4">
        {done ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black px-3 py-1.5 rounded-xl" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
            <span className="material-symbols-outlined text-[12px]">check_circle</span>Pago!
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            <button onClick={handlePay} disabled={paying}
              className="inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-xl whitespace-nowrap transition-all"
              style={{
                background: paying ? 'rgba(255,255,255,0.05)' : 'rgba(74,222,128,0.12)',
                border: '1px solid rgba(74,222,128,0.3)',
                color: paying ? SILVER : '#4ade80',
                cursor: paying ? 'wait' : 'pointer',
              }}>
              {paying
                ? <><span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>Salvando…</>
                : <><span className="material-symbols-outlined text-[12px]">check_circle</span>Pago Hoje</>
              }
            </button>
            {errMsg && <span className="text-[9px] font-bold" style={{ color: '#f87171' }}>{errMsg}</span>}
          </div>
        )}
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

function SkelRow({ cols, accent }: { cols: number; accent: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${accent}18` }}>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="py-4 px-4">
          <div className="h-3 rounded animate-pulse" style={{ background: `${accent}18`, width: i === 0 ? '50%' : '75%' }} />
        </td>
      ))}
    </tr>
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
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={installStyle}>{installLabel}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4"><PaymentBadge method={t.paymentType} /></td>
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

  useEffect(() => {
    // Tie into the global golden loading bar
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dashboard:loading'));
    }
    fetch('/api/financeiro/overview')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const tab = TABS.find(t => t.key === activeTab)!;
  const counts = {
    entradas:       (data?.hotmartEntries.length ?? 0) + (data?.manualEntries.length ?? 0),
    proximos:       (data?.upcoming.length ?? 0) + (data?.manualUpcoming?.length ?? 0),
    inadimplentes:  (data?.overdue.length ?? 0) + (data?.manualOverdue?.length ?? 0),
  };

  return (
    <LoginWrapper>
      {/* Navy overlay — corporativo financeiro */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(0,12,40,0.58) 0%, rgba(0,22,60,0.48) 100%)' }} />
      <div className="min-h-screen pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
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
                  `${data?.totalTransactions ?? 0} transações · ${data?.totalSubs ?? 0} assinaturas · ${data?.overdue.length ?? 0} inadimplentes`}
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

          {/* ══════════════════════════════════════════════════════════════════
              TAB: PRÓXIMOS PAGAMENTOS
              Columns: Data Próx. Cobrança | Valor | Dias | Nome | Oferta | Produto
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'proximos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                              {/* ─ Hotmart upcoming */}
              <div style={tabStyle('#38bdf8')}>
                <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid #38bdf822' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: '#38bdf815', border: '1px solid #38bdf835' }}>
                    <span className="material-symbols-outlined text-xl" style={{ color: '#38bdf8' }}>event_upcoming</span>
                  </div>
                  <div>
                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>Próximos Pagamentos Hotmart</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>cobranças de assinatura ativa ordenadas por data</p>
                  </div>
                  <span className="ml-auto px-3 py-1 rounded-full text-[11px] font-black" style={{ background: '#38bdf818', color: '#38bdf8' }}>
                    {loading ? '…' : (data?.upcoming || []).length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 120 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 65 }} />
                      <col />
                      <col style={{ width: 180 }} />
                      <col style={{ width: 200 }} />
                    </colgroup>
                    <thead><tr style={{ background: '#38bdf808' }}>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Data Próx. Cobr.</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest text-right" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Valor</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Dias</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Nome</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Oferta</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Produto</th>
                    </tr></thead>
                    <tbody>
                      {loading ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={6} accent="#38bdf8" />) :
                        (data?.upcoming || []).length === 0
                          ? <tr><td colSpan={6} className="py-12 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Nenhuma cobrança próxima.</td></tr>
                          : (data!.upcoming).map((u, idx) => {
                              const dias = daysUntil(u.dateNextCharge);
                              const urgColor = dias <= 3 ? '#f87171' : dias <= 7 ? GOLD : '#38bdf8';
                              const rowBg = idx % 2 === 0 ? 'transparent' : '#38bdf805';
                              const cycleNum = u.plan ? `Assinatura` : 'Assinatura';
                              const daysSinceJoin = u.accessionDate ? Math.floor((Date.now() - u.accessionDate) / 86_400_000) : 0;
                              return (
                                <tr key={u.subscriberCode || idx} style={{ background: rowBg, borderBottom: '1px solid #38bdf815' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#38bdf80d')}
                                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                                  <td className="py-3 px-4 whitespace-nowrap"><span className="text-sm font-black text-white">{fmtDate(u.dateNextCharge)}</span></td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="font-black text-lg" style={{ color: '#38bdf8' }}>{fmtLocalCurrency(u.amount, u.currency)}</span>
                                      {u.currency !== 'BRL' && u.amountBRL && <span className="text-[9px] font-bold" style={{ color: SILVER }}>≈ {fmtBRL(u.amountBRL)}</span>}
                                      <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>
                                        {cycleNum}
                                      </span>
                                      <span className="text-[9px] font-bold" style={{ color: SILVER }}>
                                        {u.accessionDate ? `Desde ${fmtDate(u.accessionDate)} · ${daysSinceJoin}d` : ''}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black" style={{ background: `${urgColor}18`, border: `1px solid ${urgColor}40`, color: urgColor }}>{dias}d</span></td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-2"><Flag currency={u.currency} /><NameBtn name={u.subscriber.name} email={u.subscriber.email} router={router} /></div>
                                      <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{u.subscriber.email}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4"><span className="text-[11px] font-bold" style={{ color: SILVER }}>{u.plan}</span></td>
                                  <td className="py-3 px-4"><span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>{u.product.name}</span></td>
                                </tr>
                              );
                            })
                      }
                    </tbody>
                  </table>
                </div>
              </div>

                            {/* ─ PIX Manual upcoming */}
              <div style={tabStyle(GOLD)}>
                <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${GOLD}22` }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}35` }}>
                    <span className="material-symbols-outlined text-xl" style={{ color: GOLD }}>edit_note</span>
                  </div>
                  <div>
                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>Próximos Pagamentos PIX Manual</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>próxima parcela não paga de cada aluno manual</p>
                  </div>
                  <span className="ml-auto px-3 py-1 rounded-full text-[11px] font-black" style={{ background: `${GOLD}18`, color: GOLD }}>
                    {loading ? '…' : (data?.manualUpcoming || []).length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 120 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 65 }} />
                      <col />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 200 }} />
                    </colgroup>
                    <thead><tr style={{ background: `${GOLD}08` }}>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Data Vencimento</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest text-right" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Valor</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Dias</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Nome</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Parcela</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Produto</th>
                    </tr></thead>
                    <tbody>
                      {loading ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={7} accent={GOLD} />) :
                        (data?.manualUpcoming || []).length === 0
                          ? <tr><td colSpan={6} className="py-12 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Nenhum próximo pagamento manual encontrado.</td></tr>
                          : (data!.manualUpcoming).map((u, idx) => {
                              const dias = daysUntil(u.dueDate);
                              const urgColor = dias <= 3 ? '#f87171' : dias <= 7 ? '#fb923c' : GOLD;
                              const rowBg = idx % 2 === 0 ? 'transparent' : `${GOLD}05`;
                              const isPix = (u.paymentType || '').toUpperCase() === 'PIX' || (u.paymentType || '').toUpperCase() === 'PIX_AVISTA';
                              const paidCount = u.paidCount ?? 0;
                              const totalInst = u.totalInstallments ?? 1;
                              return (
                                <tr key={`${u.email}-${idx}`} style={{ background: rowBg, borderBottom: `1px solid ${GOLD}15` }}
                                  onMouseEnter={e => (e.currentTarget.style.background = `${GOLD}0d`)}
                                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                                  <td className="py-3 px-4 whitespace-nowrap"><span className="text-sm font-black text-white">{fmtDate(u.dueDate)}</span></td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="font-black text-lg" style={{ color: GOLD }}>{fmtBRL(u.amount)}</span>
                                      {u.paymentLabel && (
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: `${GOLD}18`, color: GOLD }}>
                                          {u.paymentLabel}
                                        </span>
                                      )}
                                      {!isPix && totalInst > 1 && (
                                        <span className="text-[9px] font-bold" style={{ color: SILVER }}>
                                          {paidCount}/{totalInst} pagas
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black" style={{ background: `${urgColor}18`, border: `1px solid ${urgColor}40`, color: urgColor }}>{dias}d</span></td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                      <NameBtn name={u.name} email={u.email} router={router} />
                                      <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{u.email}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="text-[11px] font-black" style={{ color: SILVER }}>
                                      {isPix ? 'PIX à Vista' : `${u.installmentNum}/${totalInst}`}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4"><span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>{u.product}</span></td>
                                </tr>
                              );
                            })
                      }
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: INADIMPLENTES
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'inadimplentes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ─ Hotmart overdue */}
              <div style={tabStyle('#f87171')}>
                <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid #f8717122' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: '#f8717115', border: '1px solid #f8717135' }}>
                    <span className="material-symbols-outlined text-xl" style={{ color: '#f87171' }}>warning</span>
                  </div>
                  <div>
                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                      Inadimplentes Hotmart{!loading && data ? ` — ${data.overdue.length}` : ''}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                      assinaturas e parcelamentos com pagamento atrasado · últ. cobrança há +35 dias
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 120 }} />
                      <col style={{ width: 160 }} />
                      <col />
                      <col style={{ width: 200 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 80 }} />
                    </colgroup>
                    <thead><tr style={{ background: '#f8717108' }}>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Último Pagamento</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest text-right" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Valor</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Nome</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Produto</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Oferta</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Início</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Dias em Atraso</th>
                    </tr></thead>
                    <tbody>
                      {loading ? [...Array(6)].map((_, i) => <SkelRow key={i} cols={7} accent="#f87171" />) :
                        (data?.overdue || []).length === 0
                          ? <tr><td colSpan={7} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>🎉 Nenhum inadimplente Hotmart.</td></tr>
                          : data!.overdue.map((o, idx) => {
                              const dias     = o.daysSinceLast ?? 0;
                              const severity = dias > 50 ? '#f87171' : dias > 40 ? GOLD : SILVER;
                              const rowBg    = idx % 2 === 0 ? '#f8717104' : '#f8717108';
                              return (
                                <tr key={o.subscriberCode || idx} style={{ background: rowBg, borderBottom: '1px solid #f8717118' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f8717114')}
                                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-sm font-black text-white">{fmtDate(o.lastPayDate)}</span>
                                      <span className="text-[9px] font-bold" style={{ color: SILVER }}>{o.lastTransaction.slice(0, 14)}…</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="font-black text-lg" style={{ color: '#f87171' }}>{fmtLocalCurrency(o.amount, o.currency)}</span>
                                      {o.currency !== 'BRL' && o.amountBRL && <span className="text-[9px] font-bold" style={{ color: SILVER }}>≈ {fmtBRL(o.amountBRL)}</span>}
                                      <div className="mt-1 flex flex-col items-end gap-0.5 border-t pt-1" style={{ borderColor: '#f8717122', width: '100%' }}>
                                        <span className="text-[9px] font-black" style={{ color: '#4ade80' }}>✓ {o.isSub ? `${o.paidCount}× pagos` : o.isSmartInstall ? `${o.paidCount}/${o.installments} parcelas` : `${o.paidCount}× pago`}</span>
                                        <span className="text-[9px]" style={{ color: '#4ade8090' }}>{fmtLocalCurrency(o.paidTotal, o.currency)}</span>
                                        {o.isSmartInstall && o.installments > o.paidCount && <span className="text-[9px] font-black" style={{ color: '#fbbf24' }}>◷ {o.installments - o.paidCount} restantes</span>}
                                        {o.isSub && <span className="text-[9px] font-black" style={{ color: '#fbbf24' }}>◷ {o.daysSinceLast}d sem pagar</span>}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-2"><Flag currency={o.currency} /><NameBtn name={o.subscriber.name} email={o.subscriber.email} router={router} /></div>
                                      <span className="text-[11px] font-bold mt-0.5" style={{ color: SILVER }}>{o.subscriber.email}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4"><span className="text-[12px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>{o.product.name}</span></td>
                                  <td className="py-3 px-4"><span className="text-[12px] font-bold" style={{ color: SILVER }}>{o.plan}</span></td>
                                  <td className="py-3 px-4 whitespace-nowrap"><span className="text-sm font-bold text-white">{fmtDate(o.accessionDate)}</span></td>
                                  <td className="py-3 px-4"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-black" style={{ background: `${severity}18`, border: `1px solid ${severity}40`, color: severity }}>{dias}d</span></td>
                                </tr>
                              );
                            })
                      }
                    </tbody>
                  </table>
                </div>
              </div>

                            {/* ─ PIX Manual overdue */}
              <div style={tabStyle(GOLD)}>
                <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${GOLD}22` }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}35` }}>
                    <span className="material-symbols-outlined text-xl" style={{ color: GOLD }}>edit_note</span>
                  </div>
                  <div>
                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                      Inadimplentes PIX Manual{!loading && data ? ` — ${(data.manualOverdue || []).length}` : ''}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                      parcelas vencidas e não pagas · alunos marcados como inadimplente
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 110 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 140 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 240 }} />
                      <col />
                      <col style={{ width: 130 }} />
                    </colgroup>
                    <thead><tr style={{ background: `${GOLD}08` }}>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Vencimento</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Dias Atraso</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest text-right" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Valor</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Parcela</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Nome</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Produto</th>
                      <th className="py-4 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Ação</th>
                    </tr></thead>
                    <tbody>
                      {loading ? [...Array(4)].map((_, i) => <SkelRow key={i} cols={7} accent={GOLD} />) :
                        (data?.manualOverdue || []).length === 0
                          ? <tr><td colSpan={6} className="py-12 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>🎉 Nenhum inadimplente PIX Manual.</td></tr>
                          : (() => {
                            // Local state for optimistic pay updates — track paid emails+index
                            // We use a ref-and-forcerender pattern inside the map via closure
                            return data!.manualOverdue.map((o, idx) => (
                              <ManualOverdueRow
                                key={`${o.email}-${o.installmentNum}-${idx}`}
                                o={o}
                                router={router}
                                onPaid={(updatedRow) => {
                                  setData((prev: any) => prev ? {
                                    ...prev,
                                    manualOverdue: prev.manualOverdue.filter((_: any, i: number) => i !== idx)
                                  } : prev);
                                }}
                              />
                            ));
                          })()
                      }
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </main>
      </div>
    </LoginWrapper>
  );
}
