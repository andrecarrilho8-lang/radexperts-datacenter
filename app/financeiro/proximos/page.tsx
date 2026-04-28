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

const daysUntil = (ts: number) => Math.ceil((ts - Date.now()) / 86_400_000);

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
    <button onClick={() => router.push(`/alunos/${btoa(email.toLowerCase().trim()).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`)
    }
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
  backgroundSize: '400px 100%',
  animation: 'shimmer 2s infinite linear',
  borderRadius: 8,
};
function SkelCell({ w = '70%', h = 14, delay = 0 }: { w?: string | number; h?: number; delay?: number }) {
  return <div style={{ ...SHIMMER, width: w, height: h, animationDelay: `${delay}ms`, maxWidth: '100%' }} />;
}
function SkelRow({ cols, accent }: { cols: number; accent: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${accent}10` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div className="flex flex-col gap-1.5">
            <SkelCell w={i === 0 ? '55%' : '75%'} delay={i * 60} />
          </div>
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

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type Upcoming = {
  subscriberCode: string;
  subscriber: { name: string; email: string };
  product: { name: string };
  plan: string; dateNextCharge: number;
  amount: number; currency: string; amountBRL: number | null;
  accessionDate: number;
};
type ManualUpcoming = {
  name: string; email: string; product: string;
  dueDate: number; amount: number;
  installmentNum: number; totalInstallments: number;
  paymentType?: string; paymentLabel?: string; paidCount?: number;
};
type Data = {
  upcoming: Upcoming[];
  manualUpcoming: ManualUpcoming[];
};

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export default function ProximosPage() {
  const router  = useRouter();
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalHotmart = data?.upcoming.length ?? 0;
  const totalManual  = data?.manualUpcoming.length ?? 0;

  return (
    <LoginWrapper>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(0,12,40,0.58) 0%, rgba(0,22,60,0.48) 100%)' }} />
      <div className="min-h-screen pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <div className="h-[146px]" />
        <main className="px-3 sm:px-6 max-w-[1600px] mx-auto pt-4 sm:pt-10">

          {/* Header */}
          <div className="flex items-center gap-5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)' }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: '#38bdf8' }}>event_upcoming</span>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div>
              <h1 className="font-black text-3xl text-white leading-none">Próximos Pagamentos</h1>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                {loading ? 'Carregando...' : `${totalHotmart} Hotmart · ${totalManual} PIX Manual`}
              </p>
            </div>
            <button onClick={fetchData}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: '#38bdf8' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.1)')}>
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

            {/* ─ Hotmart upcoming */}
            <div style={cardStyle('#38bdf8')}>
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
                  {loading ? '…' : totalHotmart}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 65 }} />
                    <col /><col style={{ width: 180 }} /><col style={{ width: 200 }} />
                  </colgroup>
                  <thead><tr style={{ background: '#38bdf808' }}>
                    <TH>Data Próx. Cobr.</TH><TH right>Valor</TH><TH>Dias</TH>
                    <TH>Nome</TH><TH>Oferta</TH><TH>Produto</TH>
                  </tr></thead>
                  <tbody>
                    {loading ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={6} accent="#38bdf8" />) :
                      (data?.upcoming || []).length === 0
                        ? <tr><td colSpan={6} className="py-12 text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Nenhuma cobrança próxima.</td></tr>
                        : (data!.upcoming).map((u, idx) => {
                            const dias = daysUntil(u.dateNextCharge);
                            const urgColor = dias <= 3 ? '#f87171' : dias <= 7 ? GOLD : '#38bdf8';
                            const rowBg = idx % 2 === 0 ? 'transparent' : '#38bdf805';
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
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>Assinatura</span>
                                    <span className="text-[9px] font-bold" style={{ color: SILVER }}>{u.accessionDate ? `Desde ${fmtDate(u.accessionDate)} · ${daysSinceJoin}d` : ''}</span>
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
            <div style={cardStyle(GOLD)}>
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
                  {loading ? '…' : totalManual}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 65 }} />
                    <col /><col style={{ width: 120 }} /><col style={{ width: 200 }} />
                  </colgroup>
                  <thead><tr style={{ background: `${GOLD}08` }}>
                    <TH>Data Vencimento</TH><TH right>Valor</TH><TH>Dias</TH>
                    <TH>Nome</TH><TH>Parcela</TH><TH>Produto</TH>
                  </tr></thead>
                  <tbody>
                    {loading ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={6} accent={GOLD} />) :
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
                                    {u.paymentLabel && <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background: `${GOLD}18`, color: GOLD }}>{u.paymentLabel}</span>}
                                    {!isPix && totalInst > 1 && <span className="text-[9px] font-bold" style={{ color: SILVER }}>{paidCount}/{totalInst} pagas</span>}
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
        </main>
      </div>
    </LoginWrapper>
  );
}
