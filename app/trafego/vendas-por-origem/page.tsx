'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { useDashboard } from '@/app/lib/context';
import { R, P } from '@/app/lib/utils';

const GOLD   = '#E8B14F';
const NAVY   = '#001220';
const SILVER = '#8899AA';
const GREEN  = '#4ade80';
const RED    = '#f87171';

/* ── Shared types ─────────────────────────────────────────────────────────── */
type Row = {
  key: string; name: string; id: string | null; status: string;
  objective?: string; dailyBudget?: number; thumbnail?: string | null;
  sales: number; revenue: number; spend: number;
  impressions: number; clicks: number; outboundClicks: number;
  connectRate: number; checkoutRate: number; purchaseRate: number;
  cac: number; roas: number;
};
type Data = {
  totalSales: number; parametrized: number; parametrizedPct: number;
  sources: Row[]; campaigns: Row[]; adsets: Row[]; ads: Row[];
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
        color: isActive ? GREEN : RED,
        border: `1px solid ${isActive ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.2)'}`,
      }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ background: isActive ? GREEN : RED,
          animation: isActive ? 'pulse 2s infinite' : 'none' }} />
      {isActive ? 'Ativa' : s === 'PAUSED' ? 'Pausada' : s}
    </span>
  );
};

const SKELETON_BG = 'rgba(255,255,255,0.04)';
function SkelRow({ cols }: { cols: number }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="py-4 px-4">
          <div className="h-3 rounded-full animate-pulse" style={{ background: SKELETON_BG, width: i === 0 ? '60%' : '40%' }} />
        </td>
      ))}
    </tr>
  );
}

/* ── Column header ────────────────────────────────────────────────────────── */
type SortDir = 'asc' | 'desc';
function TH({ children, col, sortCol, sortDir, onSort, right }:
  { children: React.ReactNode; col: string; sortCol: string; sortDir: SortDir;
    onSort: (c: string) => void; right?: boolean }) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)}
      className={`py-3 px-4 text-[10px] font-black uppercase tracking-widest cursor-pointer select-none whitespace-nowrap${right ? ' text-right' : ''}`}
      style={{ color: active ? GOLD : SILVER, borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'color 0.2s' }}>
      {children}
      {active && <span className="ml-1 text-[9px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  );
}

/* ── Main table ───────────────────────────────────────────────────────────── */
function DataTable({
  rows, loading, cols, onRowClick, selectedKey, accent, showThumbnail = false,
}: {
  rows: Row[]; loading: boolean; cols: number;
  onRowClick?: (key: string) => void;
  selectedKey?: string; accent: string; showThumbnail?: boolean;
}) {
  const [sortCol, setSortCol] = useState('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    if (!rows.length) return rows;
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv)
        : bv - av;
      return sortDir === 'desc' ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const thProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: `${accent}08` }}>
            {showThumbnail && <th className="py-3 px-4 w-12" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />}
            <TH col="name"         {...thProps}>Nome</TH>
            <TH col="status"       {...thProps}>Status</TH>
            <TH col="spend"        {...thProps} right>Investido</TH>
            <TH col="sales"        {...thProps} right>Vendas</TH>
            <TH col="revenue"      {...thProps} right>Valor Vendas</TH>
            <TH col="cac"         {...thProps} right>CAC</TH>
            <TH col="connectRate"  {...thProps} right>Connect Rate</TH>
            <TH col="checkoutRate" {...thProps} right>Checkout Rate</TH>
            <TH col="purchaseRate" {...thProps} right>Purchase Rate</TH>
            <TH col="roas"         {...thProps} right>ROAS</TH>
          </tr>
        </thead>
        <tbody>
          {loading
            ? [...Array(5)].map((_, i) => <SkelRow key={i} cols={cols} />)
            : sorted.length === 0
              ? <tr><td colSpan={cols}
                  className="py-16 text-center text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: SILVER }}>
                  Nenhum dado no período
                </td></tr>
              : sorted.map((row, idx) => {
                  const isSelected = selectedKey === row.key;
                  const isClickable = !!onRowClick;
                  const rowBg = isSelected
                    ? `${accent}18`
                    : idx % 2 === 0 ? 'transparent' : `${accent}04`;
                  const roasColor = row.roas >= 3 ? GREEN : row.roas >= 1 ? GOLD : row.spend > 0 ? RED : SILVER;
                  return (
                    <tr key={row.key}
                      style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: isClickable ? 'pointer' : 'default',
                        outline: isSelected ? `1px solid ${accent}40` : 'none',
                        transition: 'background 0.15s' }}
                      onClick={() => isClickable && onRowClick?.(row.key)}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${accent}0d`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? `${accent}18` : rowBg; }}>
                      {showThumbnail && (
                        <td className="py-2 px-4">
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
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5 max-w-[300px]">
                          <span className="text-[12px] font-black text-white leading-tight truncate"
                            style={{ color: isSelected ? GOLD : '#fff' }}>
                            {row.name || row.key || '—'}
                          </span>
                          {row.dailyBudget && row.dailyBudget > 0 && (
                            <span className="text-[9px] font-bold" style={{ color: SILVER }}>
                              Budget diário: {R(row.dailyBudget)}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusPill status={row.status} />
                      </td>
                      {/* Valor Investido */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {row.spend > 0
                          ? <span className="font-black text-[13px]" style={{ color: '#60a5fa' }}>{R(row.spend)}</span>
                          : <span className="text-[11px]" style={{ color: SILVER }}>—</span>}
                      </td>
                      {/* Vendas */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-black text-[13px] text-white">{row.sales}</span>
                      </td>
                      {/* Valor Vendas */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-black text-[13px]" style={{ color: GOLD }}>{R(row.revenue)}</span>
                      </td>
                      {/* CAC */}
                      <td className="py-3 px-4 text-right">
                        {row.cac > 0
                          ? <span className="font-black text-[12px] text-white">{R(row.cac)}</span>
                          : <span className="text-[11px]" style={{ color: SILVER }}>—</span>}
                      </td>
                      {/* Connect Rate */}
                      <td className="py-3 px-4 text-right">
                        {row.impressions > 0
                          ? <RateCell val={row.connectRate} red={5} green={30} />
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* Checkout Rate */}
                      <td className="py-3 px-4 text-right">
                        {row.outboundClicks > 0
                          ? <RateCell val={row.checkoutRate} red={20} green={60} />
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* Purchase Rate */}
                      <td className="py-3 px-4 text-right">
                        {row.outboundClicks > 0
                          ? <RateCell val={row.purchaseRate} red={1} green={5} />
                          : <span style={{ color: SILVER, fontSize: 11 }}>—</span>}
                      </td>
                      {/* ROAS */}
                      <td className="py-3 px-4 text-right">
                        {row.spend > 0
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

/* ── Card wrapper ─────────────────────────────────────────────────────────── */
function Card({ title, subtitle, icon, children, accent, chipLabel }:
  { title: string; subtitle?: string; icon: string; children: React.ReactNode;
    accent: string; chipLabel?: React.ReactNode }) {
  return (
    <div className="rounded-[20px] overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(0,18,48,0.95) 0%, rgba(0,10,28,0.98) 100%)',
        border: `1px solid ${accent}22`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(0,0,0,0.6), 0 0 40px ${accent}08`,
      }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5"
        style={{ borderBottom: `1px solid ${accent}18` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
            <span className="material-symbols-outlined text-xl" style={{ color: accent }}>{icon}</span>
          </div>
          <div>
            <p className="text-[16px] font-black text-white tracking-tight">{title}</p>
            {subtitle && <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{subtitle}</p>}
          </div>
        </div>
        {chipLabel}
      </div>
      {children}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function VendasPorOrigemPage() {
  const { dateFrom, dateTo } = useDashboard();
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Active filters (click-to-filter between tables)
  const [selCampaign, setSelCampaign] = useState<string | null>(null);
  const [selAdset,    setSelAdset]    = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setSelCampaign(null);
    setSelAdset(null);
    // Fire global loading bar
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

  /* Filter adsets & ads by selected campaign / adset */
  const filteredAdsets = useMemo(() => {
    if (!data?.adsets) return [];
    if (!selCampaign) return data.adsets;
    // Find campaign entity to get its name
    const campRow = data.campaigns.find(c => c.key === selCampaign);
    if (!campRow) return data.adsets;
    // Filter adsets whose meta adset belongs to the selected campaign
    // Since we don't have campaign→adset mapping in utm, filter by name containment
    return data.adsets.filter(a =>
      a.name.toLowerCase().includes(campRow.name.toLowerCase().slice(0, 20)) ||
      (selCampaign && a.key.toLowerCase().includes(selCampaign.toLowerCase().slice(0, 20)))
    );
  }, [data, selCampaign]);

  const filteredAds = useMemo(() => {
    if (!data?.ads) return [];
    if (!selAdset && !selCampaign) return data.ads;
    if (selAdset) {
      const adsetRow = data.adsets.find(a => a.key === selAdset);
      if (!adsetRow) return data.ads;
      return data.ads.filter(a =>
        a.name.toLowerCase().includes(adsetRow.name.toLowerCase().slice(0, 20)) ||
        a.key.toLowerCase().includes(selAdset.toLowerCase().slice(0, 20))
      );
    }
    return data.ads;
  }, [data, selAdset, selCampaign]);

  const handleCampaignClick = (key: string) => {
    setSelCampaign(prev => prev === key ? null : key);
    setSelAdset(null);
  };
  const handleAdsetClick = (key: string) => {
    setSelAdset(prev => prev === key ? null : key);
  };

  /* Active filter chips */
  const ActiveChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full text-[10px] font-black"
      style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}40`, color: GOLD }}>
      {label.length > 40 ? label.slice(0, 40) + '…' : label}
      <button onClick={onClear} className="ml-1 hover:text-white transition-colors">✕</button>
    </span>
  );

  const COLS = 11; // thumb + 10 cols

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh', background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,177,79,0.04) 0%, transparent 70%), ${NAVY}` }}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-4 md:px-8 max-w-[1800px] mx-auto pt-10 pb-24">

          {/* ── Page header ── */}
          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl" style={{ color: GOLD }}>route</span>
                Vendas por Origem
              </h1>
              <p className="text-[12px] font-bold uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                Rastreamento UTM · Meta Ads × Hotmart
              </p>
            </div>

            {/* Parametrized sales hero */}
            {!loading && data && (
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end p-4 rounded-2xl"
                  style={{ background: 'rgba(232,177,79,0.06)', border: '1px solid rgba(232,177,79,0.2)' }}>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                    Vendas rastreadas
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-[28px] font-black" style={{ color: GOLD }}>
                      {data.parametrized}
                    </span>
                    <span className="text-[13px] font-black" style={{ color: SILVER }}>
                      / {data.totalSales}
                    </span>
                    <span className="text-[22px] font-black" style={{ color: data.parametrizedPct >= 70 ? GREEN : data.parametrizedPct >= 40 ? GOLD : RED }}>
                      {data.parametrizedPct}%
                    </span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                    com utm_campaign definido
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Active filters ── */}
          {(selCampaign || selAdset) && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Filtros ativos:</span>
              {selCampaign && (
                <ActiveChip
                  label={data?.campaigns.find(c => c.key === selCampaign)?.name || selCampaign}
                  onClear={() => { setSelCampaign(null); setSelAdset(null); }}
                />
              )}
              {selAdset && (
                <ActiveChip
                  label={data?.adsets.find(a => a.key === selAdset)?.name || selAdset}
                  onClear={() => setSelAdset(null)}
                />
              )}
            </div>
          )}

          {error && (
            <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-black" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: RED }}>
              Erro ao carregar dados: {error}
            </div>
          )}

          {/* ── Three tables ── */}
          <div className="flex flex-col gap-8">

            {/* 1. Campanhas */}
            <Card title="Campanhas" icon="campaign"
              accent={GOLD}
              subtitle="Clique em uma campanha para filtrar conjuntos e anúncios"
              chipLabel={!loading && data &&
                <span className="text-[11px] font-black px-3 py-1 rounded-full"
                  style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}>
                  {data.campaigns.length} campanha{data.campaigns.length !== 1 ? 's' : ''}
                </span>
              }>
              <DataTable rows={data?.campaigns || []} loading={loading} cols={COLS}
                onRowClick={handleCampaignClick} selectedKey={selCampaign ?? undefined}
                accent={GOLD} />
            </Card>

            {/* 2. Conjuntos de Anúncios */}
            <Card title="Conjuntos de Anúncios" icon="folder_special"
              accent="#60a5fa"
              subtitle={selCampaign ? `Filtrado por campanha selecionada · clique para filtrar anúncios` : 'Clique em um conjunto para filtrar os anúncios'}
              chipLabel={!loading && data &&
                <span className="text-[11px] font-black px-3 py-1 rounded-full"
                  style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                  {filteredAdsets.length} conjunto{filteredAdsets.length !== 1 ? 's' : ''}
                </span>
              }>
              <DataTable rows={filteredAdsets} loading={loading} cols={COLS}
                onRowClick={handleAdsetClick} selectedKey={selAdset ?? undefined}
                accent="#60a5fa" />
            </Card>

            {/* 3. Anúncios */}
            <Card title="Anúncios" icon="play_circle"
              accent="#a78bfa"
              subtitle="Dados de anúncio individual com thumbnail preview"
              chipLabel={!loading && data &&
                <span className="text-[11px] font-black px-3 py-1 rounded-full"
                  style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
                  {filteredAds.length} anúncio{filteredAds.length !== 1 ? 's' : ''}
                </span>
              }>
              <DataTable rows={filteredAds} loading={loading} cols={COLS + 1}
                accent="#a78bfa" showThumbnail />
            </Card>

          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
