'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { R, N, P, D, today } from '@/app/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { SkeletonRow } from '@/components/ui/skeletons';
import { useRouter } from 'next/navigation';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

function RateCell({ val, thresholds, arrows }: { val: number; thresholds: [number, number]; arrows: [string, string, string] }) {
  const p = P(val);
  const color = val < thresholds[0] ? '#ef4444' : val < thresholds[1] ? GOLD : '#22c55e';
  const arrow = val < thresholds[0] ? arrows[0] : val < thresholds[1] ? arrows[1] : arrows[2];
  return (
    <span className="inline-flex items-center gap-1 justify-end w-full font-black" style={{ color }}>
      {p} <span className="material-symbols-outlined text-[13px] font-black">{arrow}</span>
    </span>
  );
}

function SpendCell({ camp, ctx }: { camp: any, ctx: any }) {
  const [hover, setHover] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  const ctxStart = new Date(ctx?.dateFrom || today).getTime();
  const ctxEnd = new Date(ctx?.dateTo || today).getTime();
  const campStart = new Date(camp.createdTime || ctx?.dateFrom || today).getTime();
  const effectiveStart = Math.max(ctxStart, campStart);
  let daysActive = Math.round((ctxEnd - effectiveStart) / 86400_000) + 1;
  if (daysActive < 1) daysActive = 1;

  const avgSpend = camp.spend / daysActive;
  const avgSales = (camp.purchases || 0) / daysActive;
  const avgLeads = (camp.leads || 0) / daysActive;

  const onEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ x: rect.right, y: rect.top });
    setHover(true);
  };

  const isVendas = camp.objective === 'VENDAS';
  const isLeads = camp.objective === 'LEADS';

  const portalContent = hover ? (
    <div style={{ position: 'fixed', top: coords.y - 12, left: coords.x - 280, background: 'rgba(0,10,28,0.97)', border: '1px solid rgba(232,177,79,0.2)', boxShadow: '0 32px 64px rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)' }}
         className="z-[99999] pointer-events-none transform -translate-y-full w-[280px] rounded-[20px] p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined text-lg" style={{ color: GOLD }}>insights</span>
        <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: SILVER }}>Resumo no Período</span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SILVER }}>INVESTIMENTO DIÁRIO MÉDIO:</span><span className="text-xs font-black text-white">{R(avgSpend)}</span></div>
        {isVendas && <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SILVER }}>MÉDIA VENDAS DIÁRIAS:</span><span className="text-xs font-black text-white">{N(avgSales)}</span></div>}
        {isLeads && <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SILVER }}>MÉDIA LEADS DIÁRIOS:</span><span className="text-xs font-black text-white">{N(avgLeads)}</span></div>}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative inline-flex justify-end w-full group" onMouseEnter={onEnter} onMouseLeave={() => setHover(false)}>
      <span className="cursor-help border-b border-dashed font-black text-white transition-colors" style={{ borderColor: 'rgba(232,177,79,0.4)' }}
        onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
        onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
      >{R(camp.spend)}</span>
      {hover && typeof window !== 'undefined' ? createPortal(portalContent, document.body) : null}
    </div>
  );
}

type ColDef = { key: string; label: string; fmt: (c: any, ctx?: any) => React.ReactNode; right?: boolean; highlight?: boolean };

// ── NameCell: proper React component (useState cannot be inside a plain function) ──
// Previously, `useState` was called inside the `name` column's `fmt` callback.
// That violated React's Rules of Hooks: when search changed the rendered row count,
// React lost track of hook order and crashed the entire page.
function NameCell({ c, ctx }: { c: any; ctx: any }) {
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className="relative min-w-[300px] max-w-[450px] py-1 cursor-pointer"
      onMouseEnter={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={()  => setMousePos(null)}
    >
      {mousePos && typeof window !== 'undefined' && createPortal(
        <button
          onClick={(e) => { e.stopPropagation(); ctx.setFeedbackCamp(c); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer"
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y - 36,
            zIndex: 2147483647,
            background: 'rgba(0,12,32,0.95)',
            border: '1px solid rgba(232,177,79,0.5)',
            color: GOLD,
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
            pointerEvents: 'auto',
          }}
          title="Gerar Feedback da Campanha"
        >
          <span className="material-symbols-outlined text-[13px]">chat_bubble</span>
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Feedback</span>
        </button>,
        document.body
      )}
      <span className="font-headline font-black text-white leading-tight uppercase tracking-tight block" title={c.name ?? ''}>
        {c.name ?? '—'}
      </span>
    </div>
  );
}

const COLS: Record<string, ColDef> = {
  go: {
    key: 'go', label: '',
    fmt: (c, ctx) => (
      <button
        onClick={(e) => { e.stopPropagation(); ctx.router.push(`/campanhas/${c.id}`); }}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all border"
        style={{ background: 'rgba(232,177,79,0.1)', borderColor: 'rgba(232,177,79,0.2)', color: GOLD }}
        title="Ver detalhes da campanha"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </button>
    ),
    right: false,
  },
  status:     { key: 'status',      label: 'Status',        fmt: () => '',                                                                                                         right: false },
  name:       { key: 'name',        label: 'Campanha',      fmt: (c, ctx) => <NameCell c={c} ctx={ctx} />,                                                                        right: false },
  spend:      { key: 'spend',       label: 'Gasto',         fmt: (c, ctx) => <SpendCell camp={c} ctx={ctx} />,                                                                    right: true  },
  connect:    { key: 'connectRate', label: 'Connect Rate',  fmt: c => <RateCell val={c.connectRate}  thresholds={[50, 70]} arrows={['arrow_downward','arrow_forward','arrow_upward']} />, right: true },
  checkout:   { key: 'checkoutRate',label: 'Checkout Rate', fmt: c => <RateCell val={c.checkoutRate} thresholds={[5, 15]}  arrows={['arrow_downward','arrow_forward','arrow_upward']} />, right: true },
  ctr:        { key: 'ctr',         label: 'CTR',           fmt: c => <span className="font-black text-white">{P(c.ctr)}</span>,                                                   right: true  },
  leads:      { key: 'leads',       label: 'Leads',         fmt: c => <span className="font-black text-white">{N(c.leads)}</span>,                                                 right: true  },
  vendas:     { key: 'purchases',   label: 'Vendas (Meta)', fmt: c => <span className="font-black" style={{ color: GOLD }}>{N(c.purchases || 0)}</span>,                           right: true, highlight: true },
  cpa:        { key: 'cpa',         label: 'CPA (Meta)',    fmt: c => <span className="font-black text-white">{R(campCPAMeta(c))}</span>,                                          right: true  },
  cpl:        { key: 'costPerLead', label: 'Custo / Lead',  fmt: c => <span className="font-black text-white">{R(c.costPerLead)}</span>,                                           right: true  },
  impressoes: { key: 'impressions', label: 'Impressões',    fmt: c => <span className="font-black text-white">{N(c.impressions)}</span>,                                           right: true  },
};


const campCPAMeta = (c: any) => c.spend / (c.purchases || 1);

const COLUMNS_BY_OBJ: Record<string, ColDef[]> = {
  GERAL:  [COLS.status, COLS.name, COLS.spend, COLS.connect, COLS.checkout, COLS.ctr, COLS.leads, COLS.vendas],
  VENDAS: [COLS.status, COLS.name, COLS.spend, COLS.connect, COLS.checkout, COLS.ctr, COLS.vendas, COLS.cpa],
  LEADS:  [COLS.status, COLS.name, COLS.spend, COLS.connect, COLS.ctr, COLS.leads, COLS.cpl],
  OUTROS: [COLS.status, COLS.name, COLS.spend, COLS.impressoes, COLS.ctr, COLS.leads, COLS.vendas],
};

export function CampaignTable({ campaigns, loading, ctx }: { campaigns: any[], loading: boolean, ctx: any }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [objTab, setObjTab] = useState<'GERAL' | 'VENDAS' | 'LEADS' | 'OUTROS'>('GERAL');
  const [currentPage, setCurrentPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string, dir: 'asc' | 'desc' } | null>({ key: 'spend', dir: 'desc' });
  const PAGE_SIZE = 10;
  const MAX_TOTAL = 150;

  const filtered = campaigns
    .filter(c => objTab === 'GERAL' || c.objective === objTab)
    .filter(c => !searchQuery || (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev?.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const sorted = [...filtered].sort((a, b) => {
    const aActive = a.status === 'ACTIVE' || a.status === 'ATIVA';
    const bActive = b.status === 'ACTIVE' || b.status === 'ATIVA';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    if (!sortConfig) return 0;
    let va = a[sortConfig.key] || 0;
    let vb = b[sortConfig.key] || 0;
    if (sortConfig.key === 'cpa') { va = campCPAMeta(a); vb = campCPAMeta(b); }
    return sortConfig.dir === 'desc' ? vb - va : va - vb;
  });

  const columns = COLUMNS_BY_OBJ[objTab] || COLUMNS_BY_OBJ.GERAL;

  const cardBorder = 'rgba(255,255,255,0.08)';
  const rowEven    = 'rgba(255,255,255,0.02)';
  const rowHover   = 'rgba(232,177,79,0.05)';

  return (
    <div className="rounded-[28px] overflow-hidden mb-12 animate-in fade-in duration-500"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cardBorder}`, backdropFilter: 'blur(20px)' }}>

      {/* Header */}
      <div className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
        style={{ borderBottom: `1px solid ${cardBorder}`, background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center border"
            style={{ background: 'rgba(232,177,79,0.1)', borderColor: 'rgba(232,177,79,0.2)', color: GOLD }}>
            <span className="material-symbols-outlined text-[28px]">analytics</span>
          </div>
          <div>
            <h3 className="font-headline font-black text-2xl text-white tracking-tight">Performance por Campanha</h3>
            <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: SILVER }}>Monitoramento detalhado do período</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-lg" style={{ color: SILVER }}>search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
              placeholder="Localizar campanha..."
              className="pl-11 pr-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none transition-all w-[240px]"
              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: '#fff' }}
            />
          </div>

          {/* Tabs */}
          <div className="flex p-1 rounded-2xl border gap-1" style={{ background: 'rgba(255,255,255,0.04)', borderColor: cardBorder }}>
            <span className="text-[9px] font-black uppercase tracking-widest self-center px-2" style={{ color: SILVER }}>Filtrar por:</span>
            {['GERAL', 'VENDAS', 'LEADS', 'OUTROS'].map(tab => (
              <button key={tab} onClick={() => { setObjTab(tab as any); setCurrentPage(0); }}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={objTab === tab
                  ? { background: GOLD, color: NAVY }
                  : { color: SILVER }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
              {columns.map(col => (
                <th key={col.key}
                  onClick={() => col.key !== 'go' && col.key !== 'status' && handleSort(col.key)}
                  className={`py-4 px-4 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${col.key !== 'go' && col.key !== 'status' ? 'cursor-pointer' : ''} ${col.right ? 'text-right' : ''}`}
                  style={{ color: SILVER }}
                  onMouseEnter={e => { if (col.key !== 'go' && col.key !== 'status') e.currentTarget.style.color = GOLD; }}
                  onMouseLeave={e => { if (col.key !== 'go' && col.key !== 'status') e.currentTarget.style.color = SILVER; }}
                >
                  <div className={`inline-flex items-center gap-1 ${col.right ? 'justify-end w-full' : ''}`}>
                    {col.label}
                    {sortConfig?.key === col.key && (
                      <span className="material-symbols-outlined text-[12px]" style={{ color: GOLD }}>{sortConfig.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
              : sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((camp, i) => (
                <tr key={camp.id}
                  onClick={() => router.push(`/campanhas/${camp.id}`)}
                  className="transition-all cursor-pointer group"
                  style={{ background: i % 2 === 0 ? rowEven : 'transparent', borderBottom: `1px solid ${cardBorder}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = rowHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? rowEven : 'transparent')}
                >
                  {columns.map(col => {
                    if (col.key === 'status') return <td key={col.key} className="py-4 px-4"><StatusBadge status={camp.status} /></td>;
                    return <td key={col.key} className={`py-4 px-4 text-xs font-bold ${col.right ? 'text-right' : ''}`} style={{ color: SILVER }}>
                      {col.fmt(camp, { ...ctx, router })}
                    </td>;
                  })}
                </tr>
              ))
            }
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="py-12 text-center font-bold uppercase text-[10px]" style={{ color: SILVER }}>Nenhuma campanha encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-6 flex items-center justify-between" style={{ borderTop: `1px solid ${cardBorder}`, background: 'rgba(255,255,255,0.01)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>
          Mostrando {Math.min(currentPage * PAGE_SIZE + 1, sorted.length)} – {Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} de {sorted.length} campanhas
        </p>
        <div className="flex items-center gap-3">
          <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}
            className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: cardBorder, color: SILVER }}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <div className="flex gap-2">
            {Array.from({ length: Math.ceil(Math.min(sorted.length, MAX_TOTAL) / PAGE_SIZE) }).slice(0, 5).map((_, idx) => (
              <button key={idx} onClick={() => setCurrentPage(idx)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black transition-all border"
                style={currentPage === idx
                  ? { background: GOLD, color: NAVY, borderColor: GOLD }
                  : { background: 'rgba(255,255,255,0.05)', color: SILVER, borderColor: cardBorder }}
              >{idx + 1}</button>
            ))}
          </div>
          <button disabled={currentPage >= Math.ceil(sorted.length / PAGE_SIZE) - 1} onClick={() => setCurrentPage(p => p + 1)}
            className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: cardBorder, color: SILVER }}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}
