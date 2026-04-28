'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar }       from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
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

function emailToId(email: string) {
  return btoa((email || '').toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

const SHIMMER: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.04) 100%)',
  backgroundSize: '400px 100%', animation: 'shimmer 2s infinite linear', borderRadius: 8,
};
function SkelRow({ cols, accent }: { cols: number; accent: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${accent}10` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div style={{ ...SHIMMER, width: i === 0 ? '55%' : '75%', height: 14 }} />
        </td>
      ))}
    </tr>
  );
}

function cardStyle(accent: string): React.CSSProperties {
  return {
    background: `linear-gradient(160deg, ${accent}09 0%, ${accent}03 50%, rgba(0,10,30,0.7) 100%)`,
    border: `1px solid ${accent}22`,
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    boxShadow: `0 1px 0 ${accent}18 inset, 0 24px 48px -12px rgba(0,0,0,0.5)`,
    borderRadius: 24, overflow: 'hidden',
  };
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-4 px-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap${right ? ' text-right' : ''}`}
      style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      {children}
    </th>
  );
}

/* ─── ManualOverdueRow ──────────────────────────────────────────────────────── */
function ManualOverdueRow({ o: initialO, onPaid, router }: {
  o: any; onPaid: (row: any) => void; router: ReturnType<typeof useRouter>;
}) {
  const [o, setO]          = React.useState(initialO);
  const [paying, setPaying] = React.useState<number | null>(null);
  const [errMsg, setErrMsg] = React.useState('');
  const [allDone, setAllDone] = React.useState(false);

  const severity = o.daysOverdue > 30 ? '#f87171' : o.daysOverdue > 14 ? '#fb923c' : GOLD;
  const rowBg    = allDone ? 'rgba(74,222,128,0.05)' : 'rgba(232,177,79,0.03)';
  const isPix    = (o.paymentType || '').toUpperCase() === 'PIX' || (o.paymentType || '').toUpperCase() === 'PIX_AVISTA';
  const paidCount = (o.paidCount ?? 0);
  const dates: any[] = o.installment_dates || [];
  const GRACE = 15 * 24 * 60 * 60 * 1000;
  const now   = Date.now();

  async function handleQuitar(idx: number) {
    if (paying != null) return;
    setPaying(idx); setErrMsg('');
    try {
      const res = await fetch('/api/alunos/manual/pay-installment', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: o.email, installmentIndex: idx, manualStudentId: o.manualStudentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao marcar');
      const newDates = (json.updatedDates || dates).map((d: any, i: number) =>
        i === idx ? { ...d, paid: true, paid_ms: json.paidMs } : d
      );
      const newPaidCount = newDates.filter((d: any) => d.paid).length;
      const stillOverdue = newDates.some((d: any) => !d.paid && Number(d.due_ms) + GRACE < now);
      if (json.allPaid || !stillOverdue) {
        setAllDone(true);
        setTimeout(() => onPaid(json), 1100);
      } else {
        setO((prev: any) => ({
          ...prev, paidCount: newPaidCount, installment_dates: newDates,
          installmentNum: newDates.findIndex((d: any) => !d.paid && Number(d.due_ms) + GRACE < now) + 1,
          daysOverdue: Math.floor((now - Math.min(...newDates.filter((d: any) => !d.paid && Number(d.due_ms) + GRACE < now).map((d: any) => Number(d.due_ms)))) / 86_400_000),
        }));
      }
    } catch (e: any) { setErrMsg(e.message); } finally { setPaying(null); }
  }

  return (
    <tr style={{ background: rowBg, borderBottom: `1px solid ${GOLD}15`, transition: 'background 0.4s' }}>
      <td className="py-3 px-4 whitespace-nowrap" style={{ verticalAlign: 'top' }}>
        <span className="text-sm font-black text-white">{fmtDate(o.dueDate)}</span>
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap" style={{ verticalAlign: 'top' }}>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-black text-lg" style={{ color: GOLD }}>{fmtBRL(o.amount)}</span>
          {o.paymentLabel && <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: `${GOLD}18`, color: GOLD }}>{o.paymentLabel}</span>}
        </div>
      </td>
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <NameBtn name={o.name} email={o.email} router={router} />
        <div className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{o.email}</div>
      </td>
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {o.paymentLabel && <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}>{o.paymentLabel}</span>}
            {!isPix && o.totalInstallments > 1 && <span className="text-[9px] font-bold" style={{ color: SILVER }}>{paidCount}/{o.totalInstallments} parcelas pagas</span>}
            {!isPix && o.totalInstallments > 1 && paidCount > 0 && <span className="text-[9px] font-bold" style={{ color: '#4ade80' }}>· {fmtBRL(o.amount * paidCount)} pagos</span>}
          </div>
          {dates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dates.map((d: any, di: number) => {
                const due     = Number(d.due_ms);
                const overdue = !d.paid && due + GRACE < now;
                const future  = !d.paid && due > now;
                const grace   = !d.paid && !overdue && !future;
                const isPaying = paying === di;
                const bg     = d.paid ? 'rgba(74,222,128,0.08)' : overdue ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)';
                const border = d.paid ? 'rgba(74,222,128,0.25)' : overdue ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)';
                const clr    = d.paid ? '#4ade80'               : overdue ? '#f87171'               : SILVER;
                return (
                  <div key={di} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1"
                    style={{ background: bg, border: `1px solid ${border}` }}>
                    <div className="flex flex-col leading-none">
                      <span className="text-[8px] font-black uppercase" style={{ color: clr }}>
                        {d.paid ? '✓' : overdue ? '⚠' : '◷'} P{di + 1}
                      </span>
                      <span className="text-[8px]" style={{ color: clr }}>{due > 0 ? fmtDate(due) : '—'}</span>
                      {d.paid && d.paid_ms && <span className="text-[7px]" style={{ color: '#4ade8070' }}>≪ {fmtDate(d.paid_ms)}</span>}
                    </div>
                    {!d.paid && (overdue || grace) && (
                      <button onClick={() => handleQuitar(di)} disabled={paying != null}
                        className="inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-lg whitespace-nowrap transition-all"
                        style={{ fontSize: '11px', background: isPaying ? 'rgba(255,255,255,0.05)' : `${GOLD}25`,
                          border: `1px solid ${GOLD}60`, color: isPaying ? SILVER : GOLD,
                          cursor: paying != null ? 'wait' : 'pointer', opacity: paying != null && !isPaying ? 0.45 : 1, flexShrink: 0, letterSpacing: '0.02em' }}>
                        {isPaying
                          ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: 13 }}>progress_activity</span>
                          : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>payments</span>}
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
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <span className="text-[11px] font-black uppercase tracking-tight leading-tight block" style={{ color: SILVER }}>{o.product}</span>
      </td>
      <td className="py-3 px-4" style={{ verticalAlign: 'top' }}>
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-black"
          style={{ background: `${severity}18`, border: `1px solid ${severity}40`, color: severity }}>
          {o.daysOverdue}d
        </span>
      </td>
    </tr>
  );
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */
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
type ManualOverdue = {
  name: string; email: string; product: string;
  dueDate: number; daysOverdue: number; amount: number;
  installmentNum: number; totalInstallments: number;
  paymentType?: string; paymentLabel?: string; paidCount?: number;
};
type Data = {
  overdue: Overdue[];
  manualOverdue: ManualOverdue[];
};

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export default function InadimplentesPage() {
  const router = useRouter();
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch('/api/financeiro/overview')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const silentRefetch = useCallback(() => {
    fetch('/api/financeiro/overview')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalHotmart = data?.overdue.length ?? 0;
  const totalManual  = data?.manualOverdue.length ?? 0;

  return (
    <LoginWrapper>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(40,0,0,0.4) 0%, rgba(0,8,30,0.5) 100%)' }} />
      <div className="min-h-screen pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <div className="h-[146px]" />
        <main className="px-3 sm:px-6 max-w-[1600px] mx-auto pt-4 sm:pt-10">

          {/* Header */}
          <div className="flex items-center gap-5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: '#f87171' }}>warning</span>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div>
              <h1 className="font-black text-3xl text-white leading-none">Inadimplentes</h1>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                {loading ? 'Carregando...' : `${totalHotmart} Hotmart · ${totalManual} PIX Manual`}
              </p>
            </div>
            <button onClick={fetchData}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}>
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Atualizar
            </button>
          </div>

          {error && (
            <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-bold"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              Erro: {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ─ Hotmart overdue */}
            <div style={cardStyle('#f87171')}>
              <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid #f8717122' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#f8717115', border: '1px solid #f8717135' }}>
                  <span className="material-symbols-outlined text-xl" style={{ color: '#f87171' }}>warning</span>
                </div>
                <div>
                  <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                    Inadimplentes Hotmart{!loading && data ? ` — ${totalHotmart}` : ''}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                    assinaturas e parcelamentos com pagamento atrasado · últ. cobrança há +35 dias
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 120 }} /><col style={{ width: 155 }} />
                    <col /><col /><col style={{ width: 100 }} /><col style={{ width: 80 }} />
                  </colgroup>
                  <thead><tr style={{ background: '#f8717108' }}>
                    <TH>Últ. Pagamento</TH><TH right>Valor</TH>
                    <TH>Nome</TH><TH>Produto</TH><TH>Início</TH><TH>Dias</TH>
                  </tr></thead>
                  <tbody>
                    {loading ? [...Array(6)].map((_, i) => <SkelRow key={i} cols={6} accent="#f87171" />) :
                      (data?.overdue || []).length === 0
                        ? <tr><td colSpan={6} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>🎉 Nenhum inadimplente Hotmart.</td></tr>
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
                                    <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{o.subscriber.email}</span>
                                    {o.plan && <span className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>Oferta: {o.plan}</span>}
                                  </div>
                                </td>
                                <td className="py-3 px-4"><span className="text-[12px] font-black uppercase tracking-tight leading-4 block" style={{ color: SILVER }}>{o.product.name}</span></td>
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
            <div style={cardStyle(GOLD)}>
              <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${GOLD}22` }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}35` }}>
                  <span className="material-symbols-outlined text-xl" style={{ color: GOLD }}>edit_note</span>
                </div>
                <div>
                  <p style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                    Inadimplentes PIX Manual{!loading && data ? ` — ${totalManual}` : ''}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                    parcelas vencidas e não pagas · alunos marcados como inadimplente
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 120 }} /><col style={{ width: 155 }} />
                    <col /><col /><col style={{ width: 220 }} /><col style={{ width: 80 }} />
                  </colgroup>
                  <thead><tr style={{ background: `${GOLD}08` }}>
                    <TH>Vencimento</TH><TH right>Valor</TH>
                    <TH>Nome</TH><TH>Pagamento</TH><TH>Produto</TH><TH>Dias</TH>
                  </tr></thead>
                  <tbody>
                    {loading ? [...Array(4)].map((_, i) => <SkelRow key={i} cols={6} accent={GOLD} />) :
                      (data?.manualOverdue || []).length === 0
                        ? <tr><td colSpan={6} className="py-12 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>🎉 Nenhum inadimplente PIX Manual.</td></tr>
                        : data!.manualOverdue.map((o, idx) => (
                            <ManualOverdueRow
                              key={`${o.email}-${o.installmentNum}-${idx}`}
                              o={o}
                              router={router}
                              onPaid={() => {
                                setData((prev: any) => prev ? {
                                  ...prev,
                                  manualOverdue: prev.manualOverdue.filter((_: any, i: number) => i !== idx)
                                } : prev);
                                setTimeout(() => silentRefetch(), 800);
                              }}
                            />
                          ))
                    }
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
