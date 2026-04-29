'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

// ── Constants ─────────────────────────────────────────────────────────────────
const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const GREEN  = '#4ade80';
const RED    = '#f87171';
const BLUE   = '#38bdf8';

const MONTHS_FULL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function fmtRoas(v: number | null) {
  if (v === null) return '—';
  return `${v.toFixed(2)}×`;
}

function roasColor(v: number | null): string {
  if (v === null || v === 0) return SILVER;
  if (v >= 3)  return GREEN;
  if (v >= 1.5) return GOLD;
  return RED;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  );
}

// ── Month Row ─────────────────────────────────────────────────────────────────
type MonthRow = {
  month: number; label: string;
  spend: number; revenue: number;
  roas: number | null; isFuture: boolean;
};

function MonthRowUI({ row, idx, isCurrent }: { row: MonthRow; idx: number; isCurrent: boolean }) {
  const bg  = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
  const rc  = roasColor(row.roas);
  const dim = row.isFuture;

  return (
    <tr key={row.month}
      style={{
        background: isCurrent ? 'rgba(232,177,79,0.06)' : bg,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        opacity: dim ? 0.38 : 1,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!dim) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isCurrent ? 'rgba(232,177,79,0.06)' : bg; }}
    >
      {/* Mês */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-2">
          {isCurrent && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ background: GOLD }} />
          )}
          <span className="font-black text-sm" style={{ color: isCurrent ? GOLD : '#fff' }}>
            {MONTHS_FULL[row.month - 1]}
          </span>
          {dim && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: SILVER }}>
              futuro
            </span>
          )}
        </div>
      </td>

      {/* Investimento */}
      <td className="py-4 px-6 text-right">
        {row.spend > 0
          ? <span className="font-black text-sm" style={{ color: RED }}>{fmtBRL(row.spend)}</span>
          : <span className="text-xs font-bold" style={{ color: SILVER }}>—</span>
        }
      </td>

      {/* Faturamento */}
      <td className="py-4 px-6 text-right">
        {row.revenue > 0
          ? <span className="font-black text-sm" style={{ color: GREEN }}>{fmtBRL(row.revenue)}</span>
          : <span className="text-xs font-bold" style={{ color: SILVER }}>—</span>
        }
      </td>

      {/* ROAS */}
      <td className="py-4 px-6 text-right">
        <div className="flex items-center justify-end gap-2">
          {row.roas !== null && (
            <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[80px]"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (row.roas / 5) * 100)}%`,
                  background: rc,
                  boxShadow: `0 0 8px ${rc}60`,
                }} />
            </div>
          )}
          <span className="font-black text-sm min-w-[48px] text-right" style={{ color: rc }}>
            {fmtRoas(row.roas)}
          </span>
        </div>
      </td>
    </tr>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, sub }: {
  label: string; value: string; icon: string; color: string; sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl p-5" style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}20`,
      boxShadow: `0 4px 24px ${color}10`,
    }}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{label}</p>
      </div>
      <p className="font-black text-2xl leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] font-bold" style={{ color: SILVER }}>{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExtratoMensalPage() {
  const currentYear = new Date().getFullYear();
  const [year,    setYear]    = useState(currentYear);
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const currentMonth = new Date().getMonth() + 1; // 1-12

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/trafego/extrato-mensal?year=${y}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  const rows: MonthRow[] = data?.rows || [];

  return (
    <LoginWrapper>
      <div className="min-h-screen" style={{ background: NAVY }}>

        <main className="pt-[96px] pb-16 px-4 md:px-8 max-w-5xl mx-auto">

          {/* ── Header ───────────────────────────────────────────── */}
          <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="material-symbols-outlined text-[22px]" style={{ color: GOLD }}>table_chart</span>
                <h1 className="font-black text-2xl text-white tracking-tight">Extrato Mensal</h1>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                Investimento · Faturamento · ROAS — por mês
              </p>
            </div>

            {/* Year tabs */}
            <div className="flex items-center gap-2 p-1 rounded-2xl border" style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}>
              {[2025, 2026].map(y => (
                <button key={y} onClick={() => setYear(y)}
                  className="px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
                  style={year === y
                    ? { background: GOLD, color: NAVY, boxShadow: '0 4px 16px rgba(232,177,79,0.4)' }
                    : { color: SILVER }
                  }>
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* ── KPI Cards ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', height: 104 }}>
                  <Skel h={10} w="60%" />
                  <div className="mt-3"><Skel h={28} w="80%" /></div>
                </div>
              ))
            ) : data ? (
              <>
                <KpiCard
                  label="Investimento Total"
                  value={fmtBRL(data.totalSpend ?? 0)}
                  icon="trending_down"
                  color={RED}
                  sub={`Tráfego pago — ${year}`}
                />
                <KpiCard
                  label="Faturamento Hotmart (Líq.)"
                  value={fmtBRL(data.totalRevenue ?? 0)}
                  icon="payments"
                  color={GREEN}
                  sub={`Receita líquida — ${year}`}
                />
                <KpiCard
                  label="ROAS Anual"
                  value={fmtRoas(data.totalRoas ?? null)}
                  icon="show_chart"
                  color={roasColor(data.totalRoas ?? null)}
                  sub="Retorno sobre investimento"
                />
              </>
            ) : null}
          </div>

          {/* ── Error ────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-2xl p-6 mb-6 text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-sm font-bold" style={{ color: RED }}>⚠ {error}</p>
            </div>
          )}

          {/* ── Table ────────────────────────────────────────────── */}
          <div className="rounded-3xl overflow-hidden" style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}>
            {/* Table header */}
            <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <span className="material-symbols-outlined text-[18px]" style={{ color: GOLD }}>calendar_month</span>
              <p className="font-black text-[11px] uppercase tracking-widest" style={{ color: GOLD }}>
                Extrato {year}
              </p>
              <div className="flex-1 h-px" style={{ background: 'rgba(232,177,79,0.12)' }} />
              {!loading && data && (
                <span className="text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                  {rows.filter(r => r.spend > 0 || r.revenue > 0).length} meses com dados
                </span>
              )}
            </div>

            <table className="w-full text-left" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {[
                    { label: 'Mês',                         align: 'left'  },
                    { label: 'Investimento Tráfego',        align: 'right' },
                    { label: 'Faturamento Hotmart (Líq.)',  align: 'right' },
                    { label: 'ROAS',                        align: 'right' },
                  ].map(col => (
                    <th key={col.label}
                      className={`py-4 px-6 text-[10px] font-black uppercase tracking-widest whitespace-nowrap text-${col.align}`}
                      style={{ color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {[28, 24, 24, 24].map((w, j) => (
                          <td key={j} className="py-4 px-6">
                            <Skel h={14} w={`${40 + (i + j) * 7}%`} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row, idx) => (
                      <MonthRowUI
                        key={row.month}
                        row={row}
                        idx={idx}
                        isCurrent={year === currentYear && row.month === currentMonth}
                      />
                    ))
                }
              </tbody>

              {/* Totals footer */}
              {!loading && data && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(232,177,79,0.2)', background: 'rgba(232,177,79,0.04)' }}>
                    <td className="py-4 px-6">
                      <span className="font-black text-[11px] uppercase tracking-widest" style={{ color: GOLD }}>Total {year}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="font-black text-sm" style={{ color: RED }}>{fmtBRL(data.totalSpend ?? 0)}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="font-black text-sm" style={{ color: GREEN }}>{fmtBRL(data.totalRevenue ?? 0)}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="font-black text-sm" style={{ color: roasColor(data.totalRoas) }}>
                        {fmtRoas(data.totalRoas)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-5 px-2">
            {[
              { color: RED,    label: 'Investimento = gasto em anúncios Meta Ads' },
              { color: GREEN,  label: 'Faturamento = receita líquida Hotmart (após taxas)' },
              { color: GOLD,   label: 'ROAS ≥ 3× — excelente' },
              { color: RED,    label: 'ROAS < 1.5× — abaixo do ideal' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                <span className="text-[10px] font-bold" style={{ color: SILVER }}>{l.label}</span>
              </div>
            ))}
          </div>
        </main>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </LoginWrapper>
  );
}
