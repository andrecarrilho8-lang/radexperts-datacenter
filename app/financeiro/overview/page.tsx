'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar }     from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function emailToId(email: string): string {
  return btoa((email || '').toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
function fmtDate(ts: number | string | null): string {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateTime(ts: number | string | null): { date: string; time: string } {
  if (!ts) return { date: '—', time: '' };
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}
function daysUntil(ts: number): number { return Math.ceil((ts - Date.now()) / 86_400_000); }
function daysSince(ts: number | null): number { return ts ? Math.floor((Date.now() - ts) / 86_400_000) : 0; }

/* ── Shared HOTMART-style components ─────────────────────────────────────── */
const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 24px 48px -12px rgba(0,0,0,0.5)',
  borderRadius: 24,
  position: 'relative',
  overflow: 'hidden',
};
const cardBorder = 'rgba(255,255,255,0.08)';

function PaymentBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  let label = method || '—', bg = 'rgba(255,255,255,0.08)', color = SILVER;
  if (m.includes('CREDIT') || m.includes('CARD'))  { label = 'Cartão Crédito'; bg = 'rgba(56,189,248,0.12)';  color = '#38bdf8'; }
  else if (m.includes('PIX'))    { label = 'Pix';    bg = 'rgba(34,197,94,0.12)';  color = '#22c55e'; }
  else if (m.includes('BOLETO')) { label = 'Boleto'; bg = 'rgba(232,177,79,0.12)'; color = GOLD; }
  else if (m.includes('PAYPAL')) { label = 'PayPal'; bg = 'rgba(99,102,241,0.14)'; color = '#818cf8'; }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
      style={{ background: bg, border: `1px solid ${color}30`, color }}>
      {label}
    </span>
  );
}

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  BRL: 'br', COP: 'co', BOB: 'bo', MXN: 'mx', ARS: 'ar',
  CLP: 'cl', PEN: 'pe', UYU: 'uy', CRC: 'cr', HNL: 'hn',
  PYG: 'py', GTQ: 'gt', DOP: 'do', CUP: 'cu', VES: 've', USD: 'us',
};
function FlagByCurrency({ currency, size = 20 }: { currency: string; size?: number }) {
  const iso = CURRENCY_TO_COUNTRY[(currency || 'BRL').toUpperCase()];
  if (!iso) return null;
  return (
    <img src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/flags/4x3/${iso}.svg`}
      width={size} height={Math.round(size * 0.75)} alt={currency}
      style={{ borderRadius: 3, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }} />
  );
}

/* ── Types ─────────────────────────────────────────────────────────────── */
type Transaction = {
  transaction: string; date: string;
  buyer: { name: string; email: string };
  product: { name: string; id: number };
  amount: number; currency: string; amountBRL: number | null;
  paymentType: string; status: string;
  isSubscription: boolean; installments: number; recurrencyNumber: number | null;
};
type Upcoming = {
  subscriberCode: string;
  subscriber: { name: string; email: string };
  product: { name: string; id: number };
  plan: string; dateNextCharge: number; amount: number; currency: string;
  accessionDate: number;
};
type Overdue = {
  subscriberCode: string;
  subscriber: { name: string; email: string };
  product: { name: string; id: number };
  plan: string; amount: number; currency: string;
  accessionDate: number; requestDate: number; lastTransaction: string;
};
type OverviewData = {
  totalTransactions: number;
  recentTransactions: Transaction[];
  upcoming: Upcoming[];
  overdue: Overdue[];
  statusCounts: Record<string, number>;
  totalSubs: number;
};

/* ── Section wrapper identical to HOTMART table wrapper ─────────────────── */
function SectionWrap({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-[28px] overflow-hidden mb-10" style={{ ...glossy, padding: 0 }}>
      {children}
    </div>
  );
}

function NameBtn({ name, email, router }: { name: string; email: string; router: ReturnType<typeof useRouter> }) {
  return (
    <button
      onClick={() => router.push(`/alunos/${emailToId(email)}`)}
      className="text-sm font-black text-white uppercase hover:underline text-left transition-colors"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
      onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
    >
      {name}
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function FinanceiroOverviewPage() {
  const router = useRouter();
  const [data,    setData]    = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/financeiro/overview')
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); } else { setData(d); } setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []); // ← no dependencies: atemporal, load once

  /* ── Skeleton helper ─────────────────────────────────────────────────── */
  function SkeletonRows({ cols, n = 5 }: { cols: number; n?: number }) {
    return <>{[...Array(n)].map((_, i) => (
      <tr key={i} style={{ borderBottom: `1px solid ${cardBorder}` }}>
        {[...Array(cols)].map((__, j) => (
          <td key={j} className="py-4 px-4">
            <div className="h-3 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: j === 0 ? '55%' : '80%' }} />
          </td>
        ))}
      </tr>
    ))}</>;
  }

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-24">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1600px] mx-auto pt-10">

          {/* ── Page Header ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>account_balance_wallet</span>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div>
              <h1 className="font-black text-3xl text-white leading-none">Financeiro</h1>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                {loading ? 'Carregando...' : `${data?.totalTransactions ?? 0} transações · ${data?.totalSubs ?? 0} assinaturas · ${data?.overdue?.length ?? 0} inadimplentes`}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-bold"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              Erro: {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 1 — ÚLTIMAS ENTRADAS
          ══════════════════════════════════════════════════════════════ */}
          <SectionWrap id="ultimas-entradas">
            {/* Toolbar */}
            <div className="p-5 flex items-center justify-between gap-4" style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <div>
                <p className="font-black text-white text-base">Últimas Entradas</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                  10 transações aprovadas mais recentes
                </p>
              </div>
            </div>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    {['Data / Hora', 'Faturamento', 'Pagamento', 'Cliente', 'Produto'].map(h => (
                      <th key={h} className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows cols={5} /> :
                    (data?.recentTransactions || []).length === 0 ? (
                      <tr><td colSpan={5} className="py-16 text-center font-bold uppercase text-[11px] tracking-widest" style={{ color: SILVER }}>
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
                      return (
                        <tr key={t.transaction || idx}
                          style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}>
                          {/* Data */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-white">{dt.date}</span>
                              <span className="text-[10px] font-bold mt-0.5 flex items-center gap-1" style={{ color: SILVER }}>
                                <span className="material-symbols-outlined text-[11px]">schedule</span>{dt.time}
                              </span>
                            </div>
                          </td>
                          {/* Faturamento */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-headline font-black text-xl" style={{ color: '#4ade80' }}>
                                {fmtBRL(t.currency === 'BRL' ? t.amount : (t.amountBRL ?? t.amount))}
                              </span>
                              {t.currency !== 'BRL' && (
                                <span className="text-[10px] font-bold" style={{ color: SILVER }}>
                                  {t.currency} {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={installStyle}>{installLabel}</span>
                            </div>
                          </td>
                          {/* Pagamento */}
                          <td className="py-3 px-4"><PaymentBadge method={t.paymentType} /></td>
                          {/* Cliente */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 leading-tight">
                                <FlagByCurrency currency={t.currency} size={18} />
                                <NameBtn name={t.buyer.name} email={t.buyer.email} router={router} />
                              </div>
                              <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{t.buyer.email}</span>
                            </div>
                          </td>
                          {/* Produto */}
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-black uppercase tracking-tight whitespace-normal leading-4 block" style={{ color: SILVER }}>
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
          </SectionWrap>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2 — PRÓXIMOS PAGAMENTOS
          ══════════════════════════════════════════════════════════════ */}
          <SectionWrap id="proximos-pagamentos">
            <div className="p-5 flex items-center justify-between gap-4" style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <div>
                <p className="font-black text-white text-base">Próximos Pagamentos</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                  10 cobranças de assinatura mais próximas de vencer
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    {['Assinante', 'Produto', 'Plano', 'Próxima Cobrança', 'Dias', 'Valor'].map(h => (
                      <th key={h} className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows cols={6} /> :
                    (data?.upcoming || []).length === 0 ? (
                      <tr><td colSpan={6} className="py-16 text-center font-bold uppercase text-[11px] tracking-widest" style={{ color: SILVER }}>
                        Nenhuma cobrança próxima.
                      </td></tr>
                    ) : data!.upcoming.map((u, idx) => {
                      const dias = daysUntil(u.dateNextCharge);
                      const urgentColor = dias <= 3 ? '#f87171' : dias <= 7 ? GOLD : '#22c55e';
                      return (
                        <tr key={u.subscriberCode || idx}
                          style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <FlagByCurrency currency={u.currency} size={18} />
                                <NameBtn name={u.subscriber.name} email={u.subscriber.email} router={router} />
                              </div>
                              <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{u.subscriber.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>{u.product.name}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-bold" style={{ color: SILVER }}>{u.plan}</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="text-sm font-bold text-white">{fmtDate(u.dateNextCharge)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black"
                              style={{ background: `${urgentColor}18`, border: `1px solid ${urgentColor}40`, color: urgentColor }}>
                              {dias}d
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-black text-base" style={{ color: '#38bdf8' }}>{fmtBRL(u.amount)}</span>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </SectionWrap>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3 — INADIMPLENTES
          ══════════════════════════════════════════════════════════════ */}
          <SectionWrap id="inadimplentes">
            <div className="p-5 flex items-center justify-between gap-4" style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <div>
                <p className="font-black text-white text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: '#f87171' }}>warning</span>
                  Inadimplentes{!loading && data ? ` — ${data.overdue.length}` : ''}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                  Assinaturas com pagamento em atraso (DELAYED)
                  {!loading && data?.statusCounts && (
                    <span className="ml-2 opacity-60">
                      [{Object.entries(data.statusCounts).map(([k, v]) => `${k}:${v}`).join(' · ')}]
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    {['Assinante', 'Produto', 'Plano', 'Início', 'Dias em atraso', 'Valor', 'Última Transação'].map(h => (
                      <th key={h} className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows cols={7} n={6} /> :
                    (data?.overdue || []).length === 0 ? (
                      <tr><td colSpan={7} className="py-16 text-center font-bold uppercase text-[11px] tracking-widest" style={{ color: SILVER }}>
                        🎉 Nenhum inadimplente encontrado.
                        {data?.statusCounts && (
                          <span className="block text-[10px] mt-2 font-normal normal-case tracking-normal opacity-60">
                            Statuses encontrados: {JSON.stringify(data.statusCounts)}
                          </span>
                        )}
                      </td></tr>
                    ) : data!.overdue.map((o, idx) => {
                      const dias     = daysSince(o.requestDate || o.accessionDate);
                      const severity = dias > 30 ? '#f87171' : dias > 14 ? GOLD : SILVER;
                      return (
                        <tr key={o.subscriberCode || idx}
                          style={{ background: idx % 2 === 0 ? 'rgba(248,113,113,0.02)' : 'rgba(248,113,113,0.04)', borderBottom: `1px solid rgba(248,113,113,0.08)` }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                          onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(248,113,113,0.02)' : 'rgba(248,113,113,0.04)')}>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <FlagByCurrency currency={o.currency} size={18} />
                                <NameBtn name={o.subscriber.name} email={o.subscriber.email} router={router} />
                              </div>
                              <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{o.subscriber.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>{o.product.name}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-bold" style={{ color: SILVER }}>{o.plan}</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="text-sm font-bold text-white">{fmtDate(o.accessionDate)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black"
                              style={{ background: `${severity}18`, border: `1px solid ${severity}40`, color: severity }}>
                              {dias}d
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-black text-base" style={{ color: '#f87171' }}>{fmtBRL(o.amount)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-mono" style={{ color: SILVER }}>{o.lastTransaction || '—'}</span>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </SectionWrap>

        </main>
      </div>
    </LoginWrapper>
  );
}
