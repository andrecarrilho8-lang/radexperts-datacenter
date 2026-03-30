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
      className="text-sm font-black text-white uppercase hover:underline text-left"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
      onMouseLeave={e => (e.currentTarget.style.color = '#fff')}>
      {name}
    </button>
  );
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap${right ? ' text-right' : ''}`}
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
};
type Upcoming = {
  subscriberCode: string;
  subscriber: { name: string; email: string };
  product: { name: string };
  plan: string; dateNextCharge: number; amount: number; currency: string;
  accessionDate: number;
};
type Overdue = {
  subscriberCode?: string;
  subscriber: { name: string; email: string };
  product: { name: string };
  plan: string; amount: number; currency: string; amountBRL: number | null;
  accessionDate: number; lastPayDate: number; daysSinceLast: number;
  lastTransaction: string;
};
type Data = {
  totalTransactions: number; totalSubs: number;
  recentTransactions: Transaction[];
  upcoming: Upcoming[];
  overdue: Overdue[];
  statusCounts: Record<string, number>;
};

/* ─── Page ──────────────────────────────────────────────────────────────────── */
export default function FinanceiroOverviewPage() {
  const router = useRouter();
  const [data,       setData]       = useState<Data | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>('entradas');
  const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);

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
  const counts = { entradas: 10, proximos: data?.upcoming.length ?? 0, inadimplentes: data?.overdue.length ?? 0 };

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-24">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1600px] mx-auto pt-10">

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
            <div style={tabStyle(tab.accent)}>
              {/* Title bar */}
              <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${tab.accent}22` }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${tab.accent}15`, border: `1px solid ${tab.accent}35` }}>
                  <span className="material-symbols-outlined text-xl" style={{ color: tab.accent }}>payments</span>
                </div>
                <div>
                  <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>Últimas Entradas</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                    10 transações aprovadas mais recentes · todos os tempos
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: `${tab.accent}08` }}>
                      <TH>Data / Hora</TH>
                      <TH right>Faturamento</TH>
                      <TH>Pagamento</TH>
                      <TH>Cliente</TH>
                      <TH>Produto</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={5} accent={tab.accent} />) :
                      (data?.recentTransactions || []).length === 0 ? (
                        <tr><td colSpan={5} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                          Nenhuma transação encontrada.
                        </td></tr>
                      ) : data!.recentTransactions.map((t, idx) => {
                        const dt = fmtDateTime(t.date);
                        let installLabel = '', installStyle: React.CSSProperties = {};
                        if (t.isSubscription) {
                          installLabel = t.recurrencyNumber ? `Assinatura · Ciclo ${t.recurrencyNumber}` : 'Assinatura';
                          installStyle = { background: 'rgba(56,189,248,0.12)', color: '#38bdf8' };
                        } else if (t.installments > 1) {
                          installLabel = `${t.installments}× parcelado`;
                          installStyle = { background: 'rgba(99,102,241,0.15)', color: '#818cf8' };
                        } else {
                          installLabel = 'À vista';
                          installStyle = { background: 'rgba(34,197,94,0.08)', color: '#86efac' };
                        }
                        const rowBg = idx % 2 === 0 ? 'transparent' : `${tab.accent}05`;
                        return (
                          <tr key={t.transaction || idx}
                            style={{ background: rowBg, borderBottom: `1px solid ${tab.accent}15` }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${tab.accent}0d`)}
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
                                <span className="font-black text-xl" style={{ color: tab.accent }}>
                                  {/* Main: always local currency – never raw 150000 shown as BRL */}
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
                                  <Flag currency={t.currency} />
                                  <NameBtn name={t.buyer.name} email={t.buyer.email} router={router} />
                                </div>
                                <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{t.buyer.email}</span>
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
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: PRÓXIMOS PAGAMENTOS
              Columns: Data Próx. Cobrança | Valor | Dias | Nome | Oferta | Produto
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'proximos' && (
            <div style={tabStyle(tab.accent)}>
              <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${tab.accent}22` }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${tab.accent}15`, border: `1px solid ${tab.accent}35` }}>
                  <span className="material-symbols-outlined text-xl" style={{ color: tab.accent }}>event_upcoming</span>
                </div>
                <div>
                  <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>Próximos Pagamentos</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                    10 cobranças de assinatura ativa mais próximas
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: `${tab.accent}08` }}>
                      <TH>Data Próx. Cobrança</TH>
                      <TH right>Valor</TH>
                      <TH>Dias</TH>
                      <TH>Nome</TH>
                      <TH>Oferta</TH>
                      <TH>Produto</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={6} accent={tab.accent} />) :
                      (data?.upcoming || []).length === 0 ? (
                        <tr><td colSpan={6} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                          Nenhuma cobrança próxima.
                        </td></tr>
                      ) : data!.upcoming.map((u, idx) => {
                        const dias = daysUntil(u.dateNextCharge);
                        const urgColor = dias <= 3 ? '#f87171' : dias <= 7 ? GOLD : tab.accent;
                        const rowBg = idx % 2 === 0 ? 'transparent' : `${tab.accent}05`;
                        return (
                          <tr key={u.subscriberCode || idx}
                            style={{ background: rowBg, borderBottom: `1px solid ${tab.accent}15` }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${tab.accent}0d`)}
                            onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                            {/* Data Próx. Cobrança */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-sm font-black text-white">{fmtDate(u.dateNextCharge)}</span>
                            </td>
                            {/* Valor */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <span className="font-black text-lg" style={{ color: tab.accent }}>{fmtBRL(u.amount)}</span>
                            </td>
                            {/* Dias */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black"
                                style={{ background: `${urgColor}18`, border: `1px solid ${urgColor}40`, color: urgColor }}>
                                {dias}d
                              </span>
                            </td>
                            {/* Nome */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <Flag currency={u.currency} />
                                  <NameBtn name={u.subscriber.name} email={u.subscriber.email} router={router} />
                                </div>
                                <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{u.subscriber.email}</span>
                              </div>
                            </td>
                            {/* Oferta */}
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-bold" style={{ color: SILVER }}>{u.plan}</span>
                            </td>
                            {/* Produto */}
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>
                                {u.product.name}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: INADIMPLENTES
              Columns: Última Transação | Valor | Nome | Produto | Plano | Início | Dias em Atraso
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'inadimplentes' && (
            <div style={tabStyle(tab.accent)}>
              <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${tab.accent}22` }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${tab.accent}15`, border: `1px solid ${tab.accent}35` }}>
                  <span className="material-symbols-outlined text-xl" style={{ color: tab.accent }}>warning</span>
                </div>
                <div>
                  <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                    Inadimplentes{!loading && data ? ` — ${data.overdue.length}` : ''}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                    Assinaturas e parcelamentos com pagamento atrasado · últ. cobrança há +35 dias
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: `${tab.accent}08` }}>
                      <TH>Última Transação</TH>
                      <TH right>Valor</TH>
                      <TH>Nome</TH>
                      <TH>Produto</TH>
                      <TH>Oferta</TH>
                      <TH>Início</TH>
                      <TH>Dias em Atraso</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? [...Array(6)].map((_, i) => <SkelRow key={i} cols={7} accent={tab.accent} />) :
                      (data?.overdue || []).length === 0 ? (
                        <tr><td colSpan={7} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                          🎉 Nenhum inadimplente.
                          {data?.statusCounts && (
                            <span className="block text-[10px] mt-2 font-normal normal-case tracking-normal opacity-50">
                              Statuses: {JSON.stringify(data.statusCounts)}
                            </span>
                          )}
                        </td></tr>
                      ) : data!.overdue.map((o, idx) => {
                        const dias     = o.daysSinceLast ?? 0;
                        const severity = dias > 50 ? '#f87171' : dias > 40 ? GOLD : SILVER;
                        const rowBg    = idx % 2 === 0 ? `${tab.accent}04` : `${tab.accent}08`;
                        return (
                          <tr key={o.subscriberCode || idx}
                            style={{ background: rowBg, borderBottom: `1px solid ${tab.accent}18` }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${tab.accent}14`)}
                            onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                            {/* Última Transação */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-mono" style={{ color: SILVER }}>{o.lastTransaction || '—'}</span>
                                <span className="text-[9px] font-bold" style={{ color: SILVER }}>últ. pgto: {fmtDate(o.lastPayDate)}</span>
                              </div>
                            </td>
                            {/* Valor */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-black text-lg" style={{ color: tab.accent }}>
                                  {fmtLocalCurrency(o.amount, o.currency)}
                                </span>
                                {o.currency !== 'BRL' && o.amountBRL && (
                                  <span className="text-[9px] font-bold" style={{ color: SILVER }}>
                                    ≈ {fmtBRL(o.amountBRL)}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Nome */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <Flag currency={o.currency} />
                                  <NameBtn name={o.subscriber.name} email={o.subscriber.email} router={router} />
                                </div>
                                <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{o.subscriber.email}</span>
                              </div>
                            </td>
                            {/* Produto */}
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>
                                {o.product.name}
                              </span>
                            </td>
                            {/* Plano */}
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-bold" style={{ color: SILVER }}>{o.plan}</span>
                            </td>
                            {/* Início */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-sm font-bold text-white">{fmtDate(o.accessionDate)}</span>
                            </td>
                            {/* Dias em Atraso */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black"
                                style={{ background: `${severity}18`, border: `1px solid ${severity}40`, color: severity }}>
                                {dias}d
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>
    </LoginWrapper>
  );
}
