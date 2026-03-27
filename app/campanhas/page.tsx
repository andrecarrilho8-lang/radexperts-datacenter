'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, N, P, D, PALETTE } from '@/app/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { FeedbackModal } from '@/components/dashboard/feedback-modal';
import { useRouter } from 'next/navigation';

export default function CampanhasPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data = useDashboardData();
  const router = useRouter();

  const [campTab, setCampTab] = useState<'GERAL' | 'VENDAS' | 'LEADS' | 'OUTROS'>('GERAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [feedbackCamp, setFeedbackCamp] = useState<any | null>(null);
  const [niceAlert, setNiceAlert] = useState<{ title: string; message: string } | null>(null);

  const OBJ_TABS_DEF = [
    { tab: 'GERAL' as const },
    { tab: 'VENDAS' as const },
    { tab: 'LEADS' as const },
    { tab: 'OUTROS' as const }
  ];

  const filtered = data.tableData
    .filter(c => campTab === 'GERAL' || (campTab === 'OUTROS' ? (c.objective !== 'VENDAS' && c.objective !== 'LEADS') : c.objective === campTab))
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const PAGE_SIZE = 30;
  const paginated = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const viewCampaignDetail = (camp: any) => {
    router.push(`/campanhas/${camp.id}`);
  };

  return (
    <LoginWrapper>
      <Navbar />
      <div className="h-[80px]" />
      <main className="px-6 max-w-[1600px] mx-auto pt-20">
        
        {/* Consolidated Summary */}
        {selectedIds.size > 0 && (
          <div className="mb-8 p-8 bg-gradient-to-br from-violet-600 to-indigo-700 rounded-[32px] text-white shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                     <span className="material-symbols-outlined text-white text-3xl">analytics</span>
                   </div>
                   <div>
                     <h3 className="text-2xl font-black tracking-tight mb-1">Resumo Consolidado</h3>
                     <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">{selectedIds.size} {selectedIds.size === 1 ? 'Campanha Selecionada' : 'Campanhas Selecionadas'}</p>
                   </div>
                </div>
                <button onClick={() => setSelectedIds(new Set())} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10">Limpar Seleção</button>
              </div>
              
              {(() => {
                const selected = data.tableData.filter(c => selectedIds.has(c.id));
                const totalSpend = selected.reduce((s, c) => s + (c.spend || 0), 0);
                const totalRevenue = selected.reduce((s, c) => s + (c.revenue || 0), 0);
                const totalSales = selected.reduce((s, c) => s + (c.purchases || 0), 0);
                const totalLeads = selected.reduce((s, c) => s + (c.leads || 0), 0);
                const obj = selected[0]?.objective;

                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-md">
                      <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest mb-1">Total Investido</p>
                      <p className="text-2xl font-black">{R(totalSpend)}</p>
                    </div>
                    {obj === 'VENDAS' ? (
                      (() => {
                        // Collect unique matched products across all selected campaigns
                        const allMatchedProducts = new Set<string>();
                        selected.forEach(c => (c.matchedProducts || []).forEach((p: string) => allMatchedProducts.add(p)));
                        // Sum Hotmart sales for those products (deduped by transaction)
                        const seenTxns = new Set<string>();
                        let hmRevenue = 0;
                        let hmQty = 0;
                        (data.hotmartSales || []).forEach((s: any) => {
                          const pName = s.product?.name || '';
                          const txn = s.purchase?.transaction || '';
                          if (allMatchedProducts.has(pName) && !seenTxns.has(txn)) {
                            seenTxns.add(txn);
                            hmRevenue += s.purchase?.price?.value || 0;
                            hmQty += 1;
                          }
                        });
                        return (
                          <>
                            <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-md">
                              <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest mb-1">Faturamento Hotmart</p>
                              <p className="text-2xl font-black">{R(hmRevenue)}</p>
                            </div>
                            <div className="bg-orange-400/10 rounded-2xl p-5 border border-orange-400/20 backdrop-blur-md">
                              <p className="text-[10px] uppercase font-bold text-orange-300/70 tracking-widest mb-1">Vendas Totais Hotmart</p>
                              <p className="text-2xl font-black text-orange-300">{N(hmQty)}</p>
                            </div>
                            <div className="bg-emerald-400/10 rounded-2xl p-5 border border-emerald-400/20 backdrop-blur-md">
                              <p className="text-[10px] uppercase font-bold text-emerald-300/70 tracking-widest mb-1">Vendas Totais Meta</p>
                              <p className="text-2xl font-black text-emerald-300">{N(totalSales)}</p>
                            </div>
                          </>
                        );
                      })()
                    ) : obj === 'LEADS' ? (
                      <>
                        <div className="bg-amber-400/10 rounded-2xl p-5 border border-amber-400/20 backdrop-blur-md">
                          <p className="text-[10px] uppercase font-bold text-amber-300/70 tracking-widest mb-1">Leads Totais</p>
                          <p className="text-2xl font-black text-amber-300">{N(totalLeads)}</p>
                        </div>
                        <div className="bg-sky-400/10 rounded-2xl p-5 border border-sky-400/20 backdrop-blur-md">
                          <p className="text-[10px] uppercase font-bold text-sky-300/70 tracking-widest mb-1">CPL Médio</p>
                          <p className="text-2xl font-black text-sky-300">{totalLeads > 0 ? R(totalSpend / totalLeads) : 'R$ 0,00'}</p>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-md">
                          <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest mb-1">CTR Médio</p>
                          <p className="text-2xl font-black">{P(selected.reduce((s,c)=>s+(c.ctr||0),0)/selected.length)}</p>
                        </div>
                      </>
                    ) : (
                      <div className="bg-slate-400/10 rounded-2xl p-5 border border-slate-400/20 backdrop-blur-md col-span-3">
                         <p className="text-[10px] uppercase font-bold text-slate-300/70 tracking-widest mb-1">Ações Totais</p>
                         <p className="text-2xl font-black text-slate-300">{N(totalSales + totalLeads)}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-600/10 text-violet-600 rounded-2xl flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[28px]">campaign</span>
              </div>
              <div>
                <h2 className="font-headline font-black text-3xl text-slate-800 leading-tight">Minhas Campanhas</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Análise detalhada de performance</p>
              </div>
           </div>

           <div className="flex flex-wrap items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                {OBJ_TABS_DEF.map(item => (
                  <button key={item.tab} onClick={() => { setCampTab(item.tab); setCurrentPage(0); }}
                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${campTab === item.tab ? 'bg-white text-violet-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                    {item.tab}
                  </button>
                ))}
              </div>
              <div className="relative group">
                 <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-focus-within:text-violet-500">search</span>
                 <input type="text" placeholder="Buscar campanha..." 
                   value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                   className="bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-2.5 text-xs font-black uppercase tracking-widest focus:ring-4 ring-violet-500/10 outline-none w-[280px] transition-all shadow-sm" />
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {data.fastLoading ? Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-slate-50 border border-slate-100 p-6 rounded-[32px] h-[180px] animate-pulse" />
          )) : paginated.map((camp: any) => {
            const pal = PALETTE[camp.objective as keyof typeof PALETTE] || PALETTE.OUTROS;
            const isSelected = selectedIds.has(camp.id);
            
            const toggleItem = (e: React.MouseEvent) => {
               e.stopPropagation();
               setSelectedIds(prev => {
                 const next = new Set(prev);
                 if (next.has(camp.id)) {
                   next.delete(camp.id);
                 } else {
                   const firstId = Array.from(next)[0];
                   const firstCamp = data.tableData.find((c: any) => c.id === firstId);
                   if (firstCamp && firstCamp.objective !== camp.objective) {
                     alert(`Só é possível consolidar campanhas do mesmo tipo.\n\nSua seleção atual é do tipo ${firstCamp.objective}.`);
                     return prev;
                   }
                   next.add(camp.id);
                 }
                 return next;
               });
            };

            return (
              <div key={camp.id} onClick={() => viewCampaignDetail(camp)}
                   className={`group cursor-pointer bg-white border ${isSelected ? 'border-violet-600 ring-2 ring-violet-600/10' : 'border-slate-100 hover:border-violet-300'} p-6 rounded-[32px] shadow-sm hover:shadow-xl transition-all flex flex-col justify-between min-h-[180px] relative overflow-hidden`}>
                <div className={`absolute top-0 left-0 w-1.5 h-full opacity-20 group-hover:opacity-100 transition-all ${pal.bg} ${isSelected ? 'opacity-100' : ''}`} />
                <div className="relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div onClick={toggleItem} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600 border-violet-600 shadow-lg shadow-violet-200' : 'border-slate-200 bg-slate-50'}`}>
                        {isSelected && <span className="material-symbols-outlined text-white text-[16px] font-black">check</span>}
                      </div>
                      <StatusBadge status={camp.status} />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg ${pal.bg} text-white shadow-sm`}>{camp.objective}</span>
                  </div>
                   <h3 className="font-headline font-black text-slate-900 text-lg line-clamp-2 pr-4 mb-2 group-hover:text-violet-600 transition-colors leading-tight uppercase tracking-tight">{camp.name}</h3>
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                        {camp.createdTime ? `Criada em ${D(camp.createdTime)}` : 'Indisponível'}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFeedbackCamp(camp); }} 
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-black transition-all shadow-sm"
                        title="Gerar Feedback"
                      >
                        <span className="material-symbols-outlined text-[13px]">chat_bubble</span>
                        <span className="text-[9px] font-black uppercase tracking-widest leading-none">Feedback</span>
                      </button>
                   </div>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-50 grid grid-cols-2 md:grid-cols-4 gap-4">
                   <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Gasto</p>
                      <p className="font-black text-lg text-slate-900 leading-none">{R(camp.spend)}</p>
                   </div>
                   
                   {camp.objective === 'VENDAS' ? (
                      <>
                        <div className="text-right md:text-left">
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Faturamento (H)</p>
                           <p className={`font-black text-lg ${pal.text} leading-none`}>{R(camp.hotmartRevenue || 0)}</p>
                        </div>
                        <div>
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Vendas Meta</p>
                           <p className="font-black text-lg text-slate-900 leading-none">{N(camp.purchases || 0)}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">CPA Meta</p>
                           <p className="font-black text-lg text-rose-500 leading-none">{camp.purchases > 0 ? R(camp.spend / camp.purchases) : '—'}</p>
                        </div>
                      </>
                   ) : camp.objective === 'LEADS' ? (
                      <>
                        <div className="text-right md:text-left">
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Leads</p>
                           <p className={`font-black text-lg ${pal.text} leading-none`}>{N(camp.leads)}</p>
                        </div>
                        <div>
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">CPL</p>
                           <p className="font-black text-lg text-slate-900 leading-none">{R(camp.costPerLead)}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">CTR</p>
                           <p className="font-black text-lg text-slate-600 leading-none">{P(camp.ctr)}</p>
                        </div>
                      </>
                   ) : (
                      <>
                        <div className="text-right md:text-left">
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Connect</p>
                           <p className={`font-black text-lg ${pal.text} leading-none`}>{P(camp.connectRate)}</p>
                        </div>
                        <div>
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Visitas</p>
                           <p className="font-black text-lg text-slate-900 leading-none">{N(camp.landingPageViews)}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">CTR</p>
                           <p className="font-black text-lg text-slate-600 leading-none">{P(camp.ctr)}</p>
                        </div>
                      </>
                   )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Grid */}
        <div className="flex items-center justify-between pb-24">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Mostrando {Math.min(currentPage * PAGE_SIZE + 1, filtered.length)} - {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length} campanhas
           </p>
           <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => p - 1)}
                className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-violet-600 disabled:opacity-30 transition-all flex items-center justify-center shadow-sm"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <div className="flex gap-2">
                 {Array.from({length: Math.ceil(filtered.length / PAGE_SIZE)}).slice(0, 10).map((_, idx) => (
                   <button key={idx} onClick={() => setCurrentPage(idx)}
                     className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black transition-all ${currentPage === idx ? 'bg-violet-600 text-white shadow-xl shadow-violet-200' : 'bg-white text-slate-400 border border-slate-100 hover:border-violet-200 hover:bg-slate-50'}`}>
                     {idx + 1}
                   </button>
                 ))}
                 {Math.ceil(filtered.length / PAGE_SIZE) > 10 && <span className="flex items-end pb-2 px-2 text-slate-400">...</span>}
              </div>
              <button 
                disabled={currentPage >= Math.ceil(filtered.length / PAGE_SIZE) - 1}
                onClick={() => setCurrentPage(p => p + 1)}
                className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-violet-600 disabled:opacity-30 transition-all flex items-center justify-center shadow-sm"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
           </div>
        </div>
      </main>

      {feedbackCamp && (
        <FeedbackModal camp={feedbackCamp} ctx={{ dateFrom, dateTo }} onClose={() => setFeedbackCamp(null)} />
      )}

      {niceAlert && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-[4px] animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] p-10 max-w-[420px] w-full shadow-[0_40px_100px_rgba(0,0,0,0.4)] border border-white animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[28px] flex items-center justify-center mb-8 mx-auto shadow-inner">
              <span className="material-symbols-outlined text-4xl font-black">warning</span>
            </div>
            <h3 className="text-2xl font-headline font-black text-slate-900 text-center mb-4 tracking-tight">{niceAlert.title}</h3>
            <p className="text-slate-500 text-center text-[13px] font-medium leading-relaxed mb-10 px-4">{niceAlert.message}</p>
            <button 
              onClick={() => setNiceAlert(null)}
              className="w-full bg-[#0f172a] text-white font-black uppercase tracking-[0.2em] text-[10px] py-5 rounded-[20px] hover:bg-black transition-all shadow-xl active:scale-[0.98] border border-white/10"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </LoginWrapper>
  );
}
