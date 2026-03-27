'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { R, N, P, D, today } from '@/app/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { SkeletonRow } from '@/components/ui/skeletons';
import { useRouter } from 'next/navigation';

function RateCell({ val, thresholds, arrows }: { val: number; thresholds: [number, number]; arrows: [string, string, string] }) {
  const p = P(val);
  const color = val < thresholds[0] ? 'text-rose-600' : val < thresholds[1] ? 'text-amber-500' : 'text-emerald-500';
  const arrow = val < thresholds[0] ? arrows[0] : val < thresholds[1] ? arrows[1] : arrows[2];
  return (
    <span className={`${color} inline-flex items-center gap-1 justify-end w-full`}>
      {p} <span className="material-symbols-outlined text-[13px] font-black">{arrow}</span>
    </span>
  );
}

function SpendCell({ camp, ctx }: { camp: any, ctx: any }) {
  const [hover, setHover] = useState(false);
  const [data, setData] = useState<{bestDay: string, bestDayLeads?: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (hover && !data && !loading && ctx?.dateFrom && ctx?.dateTo) {
      setLoading(true);
      fetch(`/api/meta/campaign/${camp.id}/daily?dateFrom=${ctx.dateFrom}&dateTo=${ctx.dateTo}`)
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [hover, camp.id, data, loading, ctx]);

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
    <div style={{ position: 'fixed', top: coords.y - 12, left: coords.x - 280 }}
         className="z-[99999] pointer-events-none transform -translate-y-full w-[280px] bg-white text-slate-800 rounded-[20px] p-5 shadow-2xl border border-slate-200">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <span className="material-symbols-outlined text-blue-500 text-lg">insights</span>
        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Resumo no Período</span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">INVESTIMENTO DIÁRIO MÉDIO:</span><span className="text-xs font-black text-slate-800">{R(avgSpend)}</span></div>
        {isVendas && <div className="flex justify-between items-center"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MÉDIA VENDAS DIÁRIAS:</span><span className="text-xs font-black text-slate-800">{N(avgSales)}</span></div>}
        {isLeads && <div className="flex justify-between items-center"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MÉDIA LEADS DIÁRIOS:</span><span className="text-xs font-black text-slate-800">{N(avgLeads)}</span></div>}
        {(isVendas || isLeads) && (
          loading ? (
             <div className="flex justify-center mt-2 pt-2 border-t border-slate-100"><div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : data ? (
            <>
              {isVendas && <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MELHOR DIA P/ VENDAS:</span><span className="text-xs font-black text-emerald-500">{data.bestDay || 'Sem dados'}</span></div>}
              {isLeads && <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MELHOR DIA P/ LEADS:</span><span className="text-xs font-black text-emerald-500">{data.bestDayLeads || 'Sem dados'}</span></div>}
            </>
          ) : null
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative inline-flex justify-end w-full group" onMouseEnter={onEnter} onMouseLeave={() => setHover(false)}>
      <span className="cursor-help border-b border-dashed border-slate-400 pb-[1px] text-slate-900 font-black group-hover:text-violet-600 transition-colors">{R(camp.spend)}</span>
      {hover && typeof window !== 'undefined' ? createPortal(portalContent, document.body) : null}
    </div>
  );
}

type ColDef = { key: string; label: string; fmt: (c: any, ctx?: any) => React.ReactNode; right?: boolean; highlight?: boolean };
const COLS: Record<string, ColDef> = {
  go:         { 
    key: 'go',          
    label: '',                  
    fmt: (c, ctx) => (
      <button 
        onClick={(e) => { e.stopPropagation(); ctx.router.push(`/campanhas/${c.id}`); }} 
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white transition-all border border-slate-200 shadow-sm"
        title="Ver detalhes da campanha"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </button>
    ), 
    right: false 
  },
  status:     { key: 'status', label: 'Status', fmt: () => '', right: false },
  name:       { 
    key: 'name', 
    label: 'Campanha', 
    fmt: (c, ctx) => (
      <div className="flex items-center justify-between gap-4 relative min-w-[300px] max-w-[450px]">
        <span className="font-headline font-black text-slate-900 leading-tight uppercase tracking-tight py-1" title={c.name}>{c.name}</span>
        <button 
          onClick={(e) => { e.stopPropagation(); ctx.setFeedbackCamp(c); }} 
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 text-white hover:bg-black transition-all cursor-pointer shadow-lg" 
          title="Gerar Feedback da Campanha"
        >
          <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Feedback</span>
        </button>
      </div>
    ),
    right: false 
  },
  spend:      { key: 'spend', label: 'Gasto', fmt: (c, ctx) => <SpendCell camp={c} ctx={ctx} />, right: true },
  connect:    { key: 'connectRate', label: 'Connect Rate', fmt: c => <RateCell val={c.connectRate} thresholds={[50, 70]} arrows={['arrow_downward', 'arrow_forward', 'arrow_upward']} />, right: true },
  checkout:   { key: 'checkoutRate', label: 'Checkout Rate', fmt: c => <RateCell val={c.checkoutRate} thresholds={[5, 15]} arrows={['arrow_downward', 'arrow_forward', 'arrow_upward']} />, right: true },
  ctr:        { key: 'ctr', label: 'CTR', fmt: c => <span className="text-slate-800 font-black">{P(c.ctr)}</span>, right: true },
  leads:      { key: 'leads', label: 'Leads', fmt: c => <span className="text-slate-800 font-black">{N(c.leads)}</span>, right: true },
  vendas:     { key: 'purchases', label: 'Vendas (Meta)', fmt: c => N(c.purchases || 0), right: true, highlight: true },
  cpa:        { key: 'cpa', label: 'CPA (Meta)', fmt: c => R(campCPAMeta(c)), right: true },
  cpl:        { key: 'costPerLead', label: 'Custo / Lead', fmt: c => R(c.costPerLead), right: true },
  impressoes: { key: 'impressions', label: 'Impressões', fmt: c => N(c.impressions), right: true },
};

const campCPAMeta = (c: any) => c.spend / (c.purchases || 1);

const COLUMNS_BY_OBJ: Record<string, ColDef[]> = {
  GERAL:  [COLS.go, COLS.status, COLS.name, COLS.spend, COLS.connect, COLS.checkout, COLS.ctr, COLS.leads, COLS.vendas],
  VENDAS: [COLS.go, COLS.status, COLS.name, COLS.spend, COLS.connect, COLS.checkout, COLS.ctr, COLS.vendas, COLS.cpa],
  LEADS:  [COLS.go, COLS.status, COLS.name, COLS.spend, COLS.connect, COLS.ctr, COLS.leads, COLS.cpl],
  OUTROS: [COLS.go, COLS.status, COLS.name, COLS.spend, COLS.impressoes, COLS.ctr, COLS.leads, COLS.vendas],
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
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev?.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const sorted = [...filtered].sort((a, b) => {
    // Primary sort: ACTIVE status always first
    const aActive = a.status === 'ACTIVE' || a.status === 'ATIVA';
    const bActive = b.status === 'ACTIVE' || b.status === 'ATIVA';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    // Secondary sort: User selected column
    if (!sortConfig) return 0;
    let va = a[sortConfig.key] || 0;
    let vb = b[sortConfig.key] || 0;
    if (sortConfig.key === 'cpa') { va = campCPAMeta(a); vb = campCPAMeta(b); }
    return sortConfig.dir === 'desc' ? vb - va : va - vb;
  });

  const columns = COLUMNS_BY_OBJ[objTab] || COLUMNS_BY_OBJ.GERAL;

  return (
    <div className="bg-white rounded-[32px] shadow-sm overflow-hidden border border-slate-100 mb-12 animate-in fade-in duration-500">
      <div className="p-8 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-white">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100">
            <span className="material-symbols-outlined text-[32px]">analytics</span>
          </div>
          <div>
            <h3 className="font-headline font-black text-2xl text-slate-900 tracking-tight">Performance por Campanha</h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Monitoramento detalhado do período</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-300 text-lg">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
              placeholder="Localizar campanha..."
              className="bg-slate-50 border border-slate-100 pl-11 pr-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all w-[260px] shadow-sm"
            />
          </div>

          <div className="flex p-1 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
            {['GERAL', 'VENDAS', 'LEADS', 'OUTROS'].map(tab => (
              <button key={tab} onClick={() => { setObjTab(tab as any); setCurrentPage(0); }}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${objTab === tab ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map(col => (
                <th key={col.key} onClick={() => col.key !== 'go' && col.key !== 'status' && handleSort(col.key)} className={`py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap ${col.key !== 'go' && col.key !== 'status' ? 'cursor-pointer hover:text-violet-600' : ''} ${col.right ? 'text-right' : ''}`}>
                  <div className={`inline-flex items-center gap-1 ${col.right ? 'justify-end w-full' : ''}`}>
                    {col.label}
                    {sortConfig?.key === col.key && (
                      <span className="material-symbols-outlined text-[12px] text-violet-600">{sortConfig.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />) : sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((camp, i) => (
              <tr key={camp.id} onClick={() => router.push(`/campanhas/${camp.id}`)} className={`border-b border-slate-50 hover:bg-violet-50/40 transition-all cursor-pointer group ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                {columns.map(col => {
                  if (col.key === 'status') return <td key={col.key} className="py-4 px-4"><StatusBadge status={camp.status} /></td>;
                  return <td key={col.key} className={`py-4 px-4 text-xs font-bold ${col.right ? 'text-right' : ''} ${col.highlight ? 'text-blue-600 font-black' : 'text-slate-800'}`}>
                    {col.fmt(camp, { ...ctx, router })}
                  </td>;
                })}
              </tr>
            ))}
            {!loading && sorted.length === 0 && <tr><td colSpan={columns.length} className="py-12 text-center text-slate-400 font-bold uppercase text-[10px]">Nenhuma campanha encontrada</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/10">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
           Mostrando {Math.min(currentPage * PAGE_SIZE + 1, sorted.length)} - {Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} de {sorted.length} campanhas
        </p>
        <div className="flex items-center gap-3">
          <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 disabled:opacity-30 transition-all flex items-center justify-center shadow-sm"><span className="material-symbols-outlined">chevron_left</span></button>
          <div className="flex gap-2">
            {Array.from({ length: Math.ceil(Math.min(sorted.length, MAX_TOTAL) / PAGE_SIZE) }).slice(0, 5).map((_, idx) => (
               <button key={idx} onClick={() => setCurrentPage(idx)} className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${currentPage === idx ? 'bg-violet-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-100'}`}>{idx + 1}</button>
            ))}
          </div>
          <button disabled={currentPage >= Math.ceil(sorted.length / PAGE_SIZE) - 1} onClick={() => setCurrentPage(p => p + 1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 disabled:opacity-30 transition-all flex items-center justify-center shadow-sm"><span className="material-symbols-outlined">chevron_right</span></button>
        </div>
      </div>
    </div>
  );
}
