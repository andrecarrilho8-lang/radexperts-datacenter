'use client';

import React, { useState, useEffect } from 'react';
import { useDashboard }    from '@/app/lib/context';
import { Navbar }          from '@/components/dashboard/navbar';
import { LoginWrapper }    from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

/* ── Style helpers identical to HOTMART page  ──────────────────────────── */
const TABLE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(0,22,55,0.96) 0%, rgba(0,15,40,0.93) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 20px 40px -8px rgba(0,0,0,0.55)',
  borderRadius: 24,
};
const HEADER_STYLE: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.07) 0%, rgba(180,195,220,0.05) 100%)',
  borderBottom: '1px solid rgba(255,255,255,0.09)',
};
const ROW_BASE: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

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
function daysUntil(ts: number): number {
  return Math.ceil((ts - Date.now()) / 86_400_000);
}
function daysSince(ts: number | null): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

function PaymentBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  let label = method || '—';
  let bg    = 'rgba(255,255,255,0.08)';
  let color = SILVER;
  if (m.includes('CREDIT') || m.includes('CARD')) { label = 'Cartão Crédito'; bg = 'rgba(56,189,248,0.12)'; color = '#38bdf8'; }
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

function SectionHeader({ icon, title, subtitle, accent = GOLD }: { icon: string; title: string; subtitle?: string; accent?: string }) {
  return (
    <div className="flex items-center gap-3 px-7 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
        <span className="material-symbols-outlined text-[20px]" style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <p className="text-sm font-black text-white">{title}</p>
        {subtitle && <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{subtitle}</p>}
      </div>
    </div>
  );
}

/* ── Types ─────────────────────────────────────────────────────────────── */
type Transaction = {
  transaction: string; date: string;
  buyer: { name: string; email: string };
  product: { name: string; id: number };
  amount: number; currency: string; amountBRL: number | null;
  paymentType: string; status: string;
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
  period: { from: string; to: string };
  totalInPeriod: number;
  recentTransactions: Transaction[];
  upcoming: Upcoming[];
  overdue: Overdue[];
};

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function FinanceiroOverviewPage() {
  const { dateFrom, dateTo } = useDashboard();
  const [data, setData]     = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/financeiro/overview?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFrom, dateTo]);

  const skeletonRow = (cols: number, key: number) => (
    <tr key={key}>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-3 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: i === 0 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  );

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-24">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1600px] mx-auto pt-10">

          {/* ── Page Header ─────────────────────────────────────── */}
          <div className="flex items-center gap-5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>account_balance_wallet</span>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div>
              <h1 className="font-black text-3xl text-white leading-none">Financeiro</h1>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                Overview · {loading ? 'Carregando...' : `${data?.totalInPeriod ?? 0} transações no período`}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              Erro ao carregar dados: {error}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              SECTION 1 — ÚLTIMAS ENTRADAS
          ════════════════════════════════════════════════════════ */}
          <section className="mb-8" style={TABLE_STYLE}>
            <SectionHeader icon="payments" title="Últimas Entradas" subtitle={`10 mais recentes · ${dateFrom} → ${dateTo}`} accent={GOLD} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={HEADER_STYLE}>
                    {['Data / Hora', 'Comprador', 'Produto', 'Valor', 'Pagamento', 'Status'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? [...Array(5)].map((_, i) => skeletonRow(6, i)) :
                    (data?.recentTransactions || []).length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-bold" style={{ color: SILVER }}>
                        Nenhuma transação no período selecionado.
                      </td></tr>
                    ) : data!.recentTransactions.map((t, i) => {
                      const dt = fmtDateTime(t.date);
                      return (
                        <tr key={t.transaction || i}
                          className="transition-colors"
                          style={{ ...ROW_BASE, background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-white font-bold text-xs">{dt.date}</p>
                            <p className="text-[10px] font-semibold mt-0.5" style={{ color: SILVER }}>{dt.time}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-white font-bold text-xs truncate max-w-[180px]">{t.buyer.name}</p>
                            <p className="text-[10px] font-semibold mt-0.5 truncate max-w-[180px]" style={{ color: SILVER }}>{t.buyer.email}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-white font-bold text-xs line-clamp-2 max-w-[220px]">{t.product.name}</p>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="font-black text-sm" style={{ color: GOLD }}>
                              {fmtBRL(t.currency === 'BRL' ? t.amount : (t.amountBRL ?? t.amount))}
                            </p>
                            {t.currency !== 'BRL' && (
                              <p className="text-[10px] font-semibold mt-0.5" style={{ color: SILVER }}>
                                {t.currency} {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4"><PaymentBadge method={t.paymentType} /></td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
                              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════
              SECTION 2 — PRÓXIMOS PAGAMENTOS
          ════════════════════════════════════════════════════════ */}
          <section className="mb-8" style={TABLE_STYLE}>
            <SectionHeader icon="event_upcoming" title="Próximos Pagamentos" subtitle="10 cobranças de assinatura mais próximas" accent="#38bdf8" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={HEADER_STYLE}>
                    {['Assinante', 'Produto', 'Plano', 'Próxima Cobrança', 'Dias', 'Valor'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? [...Array(5)].map((_, i) => skeletonRow(6, i)) :
                    (data?.upcoming || []).length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-bold" style={{ color: SILVER }}>
                        Nenhuma cobrança próxima encontrada.
                      </td></tr>
                    ) : data!.upcoming.map((u, i) => {
                      const dias = daysUntil(u.dateNextCharge);
                      const urgentColor = dias <= 3 ? '#f87171' : dias <= 7 ? GOLD : '#22c55e';
                      return (
                        <tr key={u.subscriberCode || i}
                          className="transition-colors"
                          style={{ ...ROW_BASE, background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td className="px-5 py-4">
                            <p className="text-white font-bold text-xs truncate max-w-[180px]">{u.subscriber.name}</p>
                            <p className="text-[10px] font-semibold mt-0.5 truncate max-w-[180px]" style={{ color: SILVER }}>{u.subscriber.email}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-white font-bold text-xs line-clamp-2 max-w-[200px]">{u.product.name}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[11px] font-bold" style={{ color: SILVER }}>{u.plan}</span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-white font-bold text-xs">{fmtDate(u.dateNextCharge)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black"
                              style={{ background: `${urgentColor}15`, border: `1px solid ${urgentColor}40`, color: urgentColor }}>
                              {dias}d
                            </span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="font-black text-sm" style={{ color: '#38bdf8' }}>
                              {fmtBRL(u.amount)}
                            </p>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════
              SECTION 3 — INADIMPLENTES
          ════════════════════════════════════════════════════════ */}
          <section style={TABLE_STYLE}>
            <SectionHeader
              icon="warning"
              title={`Inadimplentes${!loading && data ? ` — ${data.overdue.length}` : ''}`}
              subtitle="Assinaturas com status DELAYED (cobrança atrasada)"
              accent="#f87171"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={HEADER_STYLE}>
                    {['Assinante', 'Produto', 'Plano', 'Início', 'Dias inadimplente', 'Valor', 'Última Transação'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? [...Array(6)].map((_, i) => skeletonRow(7, i)) :
                    (data?.overdue || []).length === 0 ? (
                      <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-bold" style={{ color: SILVER }}>
                        Nenhum inadimplente encontrado. 🎉
                      </td></tr>
                    ) : data!.overdue.map((o, i) => {
                      const dias = daysSince(o.requestDate || o.accessionDate);
                      const severity = dias > 30 ? '#f87171' : dias > 14 ? GOLD : SILVER;
                      return (
                        <tr key={o.subscriberCode || i}
                          className="transition-colors"
                          style={{ ...ROW_BASE, background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.03)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td className="px-5 py-4">
                            <p className="text-white font-bold text-xs truncate max-w-[180px]">{o.subscriber.name}</p>
                            <p className="text-[10px] font-semibold mt-0.5 truncate max-w-[180px]" style={{ color: SILVER }}>{o.subscriber.email}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-white font-bold text-xs line-clamp-2 max-w-[200px]">{o.product.name}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[11px] font-bold" style={{ color: SILVER }}>{o.plan}</span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-white font-bold text-xs">{fmtDate(o.accessionDate)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black"
                              style={{ background: `${severity}15`, border: `1px solid ${severity}40`, color: severity }}>
                              {dias}d
                            </span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="font-black text-sm" style={{ color: '#f87171' }}>{fmtBRL(o.amount)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[10px] font-mono" style={{ color: SILVER }}>{o.lastTransaction || '—'}</span>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </section>

        </main>
      </div>
    </LoginWrapper>
  );
}
