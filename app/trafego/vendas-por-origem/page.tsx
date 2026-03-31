'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { useDashboard } from '@/app/lib/context';
import { R, P } from '@/app/lib/utils';

const GOLD   = '#E8B14F';
const SILVER = '#8899AA';
const GREEN  = '#4ade80';
const RED    = '#f87171';
const BLUE   = '#60a5fa';
const PURPLE = '#a78bfa';

/* ── Types ────────────────────────────────────────────────────────────────── */
type Row = {
  id: string | null; name: string; status: string;
  objective?: string; dailyBudget?: number; thumbnail?: string | null;
  spend: number; impressions: number; clicks: number;
  outboundClicks: number; landingPageViews: number; checkouts: number;
  connectRate: number; checkoutRate: number; purchaseRate: number; ctr: number;
  revenue: number; sales: number; matchedProducts?: string[];
  cac: number; roas: number;
};
type Data = {
  totalHotmartSales: number; totalHotmartRevenue: number; totalMetaSpend: number;
  campaigns: Row[]; adsets: Row[]; ads: Row[];
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const fmtN = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('pt-BR');

const RateCell = ({ val, red = 10, green = 50 }: { val: number; red?: number; green?: number }) => {
  const col = val < red ? RED : val < green ? GOLD : GREEN;
  return <span style={{ color: col, fontWeight: 900 }}>{val.toFixed(1)}%</span>;
};

const StatusPill = ({ status }: { status: string }) => {
  const s = (status || '').toUpperCase();
  const isActive = s === 'ACTIVE';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
      style={{
        background: isActive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)',
        color: isActive ? GREEN : s === 'PAUSED' ? GOLD : RED,
        border: `1px solid ${isActive ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.2)'}`,
      }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ background: isActive ? GREEN : s === 'PAUSED' ? GOLD : RED,
          animation: isActive ? 'pulse 2s infinite' : 'none' }} />
      {isActive ? 'Ativa' : s === 'PAUSED' ? 'Pausada' : s}
    </span>
  );
};

function SkelRow({ cols }: { cols: number }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="py-4 px-4">
          <div className="h-3 rounded-full animate-pulse"
            style={{ background: 'rgba(255,255,255,0.04)', width: i === 0 ? '60%' : '40%' }} />
        </td>
      ))}
    </tr>
  );
}

type SortDir = 'asc' | 'desc';

function DataTable({
  rows, loading, cols, accent, onRowClick, selectedId, showThumb = false,
}: {
  rows: Row[]; loading: boolean; cols: number; accent: string;
  onRowClick?: (id: string | null, name: string) => void;
  selectedId?: string | null; showThumb?: boolean;
}) {
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : bv - av;
      return sortDir === 'desc' ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const TH = ({ col, children, right }: { col: string; children: React.ReactNode; right?: boolean }) => {
    const active = sortCol === col;
    return (
      <th onClick={() => handleSort(col)}
        className={`py-3 px-3 text-[9px] font-black uppercase tracking-widest cursor-pointer select-none whitespace-nowrap${right ? ' text-right' : ''}`}
        style={{ color: active ? accent : SILVER, borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'color 0.15s' }}>
        {children}{active && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: `${accent}08` }}>
            {showThumb && <th className="py-3 px-3 w-12" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />}
            <TH col="name">Nome</TH>
            <TH col="status">Status</TH>
            <TH col="spend" right>Investido</TH>
            <TH col="impressions" right>Impressões</TH>
            <TH col="clicks" right>Cliques</TH>
            <TH col="sales" right>Vendas HM</TH>
            <TH col="revenue" right>Receita HM</TH>
            <TH col="cac" right>CAC</TH>
            <TH col="connectRate" right>Connect</TH>
            <TH col="checkoutRate" right>Checkout</TH>
            <TH col="purchaseRate" right>Purchase</TH>
            <TH col="roas" right>ROAS</TH>
          </tr>
        </thead>
        <tbody>
          {loading
            ? [...Array(6)].map((_, i) => <SkelRow key={i} cols={cols} />)
            : sorted.length === 0
              ? <tr><td colSpan={cols} className="py-16 text-center text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: SILVER }}>Nenhum dado no período</td></tr>
              : sorted.map((row, idx) => {
                  const isSel = selectedId === row.id || (selectedId === row.name);
                  const rowBg = isSel ? `${accent}18` : idx % 2 === 0 ? 'transparent' : `${accent}04`;
                  const roasColor = row.roas >= 3 ? GREEN : row.roas >= 1.5 ? GOLD : row.spend > 0 ? RED : SILVER;
                  const isClickable = !!onRowClick;
                  return (
                    <tr key={row.id || row.name}
                      style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: isClickable ? 'pointer' : 'default',
                        outline: isSel ? `1px solid ${accent}40` : 'none',
                        transition: 'background 0.12s' }}
                      onClick={() => isClickable && onRowClick?.(row.id, row.name)}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = `${accent}10`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSel ? `${accent}18` : rowBg; }}>
                      {/* Thumbnail (ads only) */}
                      {showThumb && (
                        <td className="py-2 px-3">
                          {row.thumbnail
                            ? <img src={row.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover"
                                style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                            : <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className="material-symbols-outlined text-[14px]" style={{ color: SILVER }}>image</span>
                              </div>
                          }
                        </td>
                      )}
                      {/* Nome */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-0.5 max-w-[280px]">
                          <span className="text-[12px] font-black leading-tight truncate"
                            style={{ color: isSel ? accent : '#fff' }}>
                            {row.name}
                          </span>
                          {row.dailyBudget && row.dailyBudget > 0 && (
                            <span className="text-[9px] font-bold" style={{ color: SILVER }}>
                              Budget diário: {R(row.dailyBudget)}
                            </span>
                          )}
                          {row.matchedProducts && row.matchedProducts.length > 0 && (
                            <span className="text-[9px] font-bold truncate" style={{ color: `${GOLD}99` }}>
                              {row.matchedProducts.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="py-3 px-3"><StatusPill status={row.status} /></td>
                      {/* Investido */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className="font-black text-[13px]" style={{ color: BLUE }}>{R(row.spend)}</span>
                      </td>
                      {/* Impressões */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-black text-[12px] text-white">{fmtN(row.impressions)}</span>
                      </td>
                      {/* Cliques */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-black text-[12px] text-white">{fmtN(row.clicks)}</span>
                      </td>
                      {/* Vendas HM */}
                      <td className="py-3 px-3 text-right">
                        {row.sales > 0
                          ? <span className="font-black text-[13px]" style={{ color: GREEN }}>{row.sales}</span>
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* Receita HM */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {row.revenue > 0
                          ? <span className="font-black text-[13px]" style={{ color: GOLD }}>{R(row.revenue)}</span>
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* CAC */}
                      <td className="py-3 px-3 text-right">
                        {row.cac > 0
                          ? <span className="font-black text-[12px] text-white">{R(row.cac)}</span>
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* Connect Rate */}
                      <td className="py-3 px-3 text-right">
                        {row.impressions > 0
                          ? <RateCell val={row.connectRate} red={5} green={30} />
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* Checkout Rate */}
                      <td className="py-3 px-3 text-right">
                        {row.outboundClicks > 0
                          ? <RateCell val={row.checkoutRate} red={20} green={60} />
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* Purchase Rate */}
                      <td className="py-3 px-3 text-right">
                        {row.checkouts > 0
                          ? <RateCell val={row.purchaseRate} red={1} green={5} />
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* ROAS */}
                      <td className="py-3 px-3 text-right">
                        {row.spend > 0 && row.revenue > 0
                          ? <span className="font-black text-[14px]" style={{ color: roasColor }}>
                              {row.roas.toFixed(2)}×
                            </span>
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                    </tr>
                  );
                })
          }
        </tbody>
      </table>
    </div>
  );
}

/* ── Glossy card ──────────────────────────────────────────────────────────── */
function Card({ title, subtitle, icon, accent, chipText, children }:
  { title: string; subtitle: string; icon: string; accent: string;
    chipText?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(0,10,30,0.92) 100%)',
        border: `1px solid ${accent}22`,
        backdropFilter: 'blur(24px)',
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(0,0,0,0.5), 0 0 40px ${accent}08`,
      }}>
      <div className="flex items-center justify-between px-6 py-5"
        style={{ borderBottom: `1px solid ${accent}18` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
            <span className="material-symbols-outlined text-xl" style={{ color: accent }}>{icon}</span>
          </div>
          <div>
            <p className="text-[16px] font-black text-white tracking-tight">{title}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{subtitle}</p>
          </div>
        </div>
        {chipText && (
          <span className="text-[11px] font-black px-3 py-1 rounded-full"
            style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
            {chipText}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Hero stat ────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex flex-col p-4 rounded-2xl"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>{label}</span>
      <span className="text-[24px] font-black mt-0.5" style={{ color }}>{value}</span>
      {sub && <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{sub}</span>}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function VendasPorOrigemPage() {
  const { dateFrom, dateTo } = useDashboard();
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [selCamp, setSelCamp] = useState<string | null>(null); // campaign name for adset filter
  const [selAdset, setSelAdset] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setSelCamp(null);
    setSelAdset(null);
    window.dispatchEvent(new CustomEvent('dashboard:loading', { detail: { show: true } }));
    const qs = new URLSearchParams({ dateFrom, dateTo }).toString();
    fetch(`/api/trafego/vendas-por-origem?${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => {
        setLoading(false);
        window.dispatchEvent(new CustomEvent('dashboard:loading', { detail: { show: false } }));
      });
  }, [dateFrom, dateTo]);

  /* Filter adsets by selected campaign */
  const filteredAdsets = useMemo(() => {
    if (!data?.adsets || !selCamp) return data?.adsets || [];
    return data.adsets.filter(a =>
      a.name.toLowerCase().includes(selCamp.toLowerCase().split('_')[0]?.toLowerCase() || '') ||
      selCamp.split(/[_\-\s]+/).some(tok => tok.length > 3 && a.name.toLowerCase().includes(tok.toLowerCase()))
    );
  }, [data, selCamp]);

  /* Filter ads by selected adset */
  const filteredAds = useMemo(() => {
    if (!data?.ads) return [];
    if (selAdset) {
      return data.ads.filter(a =>
        selAdset.split(/[_\-\s]+/).some(tok => tok.length > 3 && a.name.toLowerCase().includes(tok.toLowerCase()))
      );
    }
    if (selCamp) {
      return data.ads.filter(a =>
        selCamp.split(/[_\-\s]+/).some(tok => tok.length > 3 && a.name.toLowerCase().includes(tok.toLowerCase()))
      );
    }
    return data.ads;
  }, [data, selCamp, selAdset]);

  const handleCampClick = (_id: string | null, name: string) => {
    setSelCamp(prev => prev === name ? null : name);
    setSelAdset(null);
  };
  const handleAdsetClick = (_id: string | null, name: string) => {
    setSelAdset(prev => prev === name ? null : name);
  };

  const ActiveChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full text-[10px] font-black"
      style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}40`, color: GOLD }}>
      {label.length > 50 ? label.slice(0, 50) + '…' : label}
      <button onClick={onClear} className="ml-1 hover:text-white transition-colors">✕</button>
    </span>
  );

  const COLS = 13;

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-4 md:px-8 max-w-[1900px] mx-auto pt-10 pb-24">

          {/* Header */}
          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl" style={{ color: GOLD }}>route</span>
                Vendas por Origem
              </h1>
              <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                Meta Ads · Funil de Conversão · Receita Hotmart por Campanha
              </p>
            </div>

            {/* Stats hero */}
            {!loading && data && (
              <div className="flex items-center gap-3 flex-wrap">
                <StatCard label="Total Investido" value={R(data.totalMetaSpend)} sub="Meta Ads no período" color={BLUE} />
                <StatCard label="Receita Hotmart" value={R(data.totalHotmartRevenue)} sub={`${data.totalHotmartSales} vendas`} color={GOLD} />
                <StatCard label="ROAS Geral"
                  value={data.totalMetaSpend > 0 ? `${(data.totalHotmartRevenue / data.totalMetaSpend).toFixed(2)}×` : '—'}
                  sub="Receita / Investido" color={data.totalHotmartRevenue / Math.max(data.totalMetaSpend, 1) >= 1.5 ? GREEN : RED} />
              </div>
            )}
          </div>

          {/* Active filters */}
          {(selCamp || selAdset) && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Filtros:</span>
              {selCamp && <ActiveChip label={selCamp} onClear={() => { setSelCamp(null); setSelAdset(null); }} />}
              {selAdset && <ActiveChip label={selAdset} onClear={() => setSelAdset(null)} />}
            </div>
          )}

          {error && (
            <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-black"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: RED }}>
              Erro: {error}
            </div>
          )}

          <div className="flex flex-col gap-8">

            {/* 1. Campanhas */}
            <Card title="Campanhas" icon="campaign" accent={GOLD}
              subtitle="Clique para filtrar conjuntos e anúncios · Receita Hotmart por nome de produto"
              chipText={!loading && data ? `${data.campaigns.length} campanhas` : undefined}>
              <DataTable rows={data?.campaigns || []} loading={loading} cols={COLS}
                accent={GOLD} onRowClick={handleCampClick} selectedId={selCamp} />
            </Card>

            {/* 2. Conjuntos */}
            <Card title="Conjuntos de Anúncios" icon="folder_special" accent={BLUE}
              subtitle={selCamp ? `Filtrado pela campanha selecionada · clique para filtrar anúncios` : 'Clique para filtrar anúncios'}
              chipText={!loading ? `${filteredAdsets.length} conjuntos` : undefined}>
              <DataTable rows={filteredAdsets} loading={loading} cols={COLS}
                accent={BLUE} onRowClick={handleAdsetClick} selectedId={selAdset} />
            </Card>

            {/* 3. Anúncios */}
            <Card title="Anúncios" icon="play_circle" accent={PURPLE}
              subtitle="Dados individuais por anúncio com preview do criativo"
              chipText={!loading ? `${filteredAds.length} anúncios` : undefined}>
              <DataTable rows={filteredAds} loading={loading} cols={COLS + 1}
                accent={PURPLE} showThumb />
            </Card>

          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
