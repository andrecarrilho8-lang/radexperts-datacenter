'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, N, P, D, PALETTE } from '@/app/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { FeedbackModal } from '@/components/dashboard/feedback-modal';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useRouter } from 'next/navigation';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 20px 40px -8px rgba(0,0,0,0.5)',
  borderRadius: 28,
  position: 'relative',
  overflow: 'hidden',
};

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
    { tab: 'OUTROS' as const },
  ];

  const filtered = data.tableData
    .filter(c => campTab === 'GERAL' || (campTab === 'OUTROS' ? (c.objective !== 'VENDAS' && c.objective !== 'LEADS') : c.objective === campTab))
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const PAGE_SIZE = 30;
  const paginated = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const viewCampaignDetail = (camp: any) => router.push(`/campanhas/${camp.id}`);

  const objAccent: Record<string, string> = {
    VENDAS: '#22c55e',
    LEADS:  GOLD,
    OUTROS: SILVER,
    GERAL:  SILVER,
  };

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[106px]" />
        <main className="px-3 sm:px-6 max-w-[1600px] mx-auto pt-4 sm:pt-10 pb-24">

          {/* Consolidated Summary */}
          {selectedIds.size > 0 && (() => {
            const selected = data.tableData.filter(c => selectedIds.has(c.id));
            const totalSpend   = selected.reduce((s, c) => s + (c.spend || 0), 0);
            const totalRevenue = selected.reduce((s, c) => s + (c.revenue || 0), 0);
            const totalSales   = selected.reduce((s, c) => s + (c.purchases || 0), 0);
            const totalLeads   = selected.reduce((s, c) => s + (c.leads || 0), 0);
            const obj = selected[0]?.objective;
            return (
              <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-300"
                style={{ ...glossy, borderRadius: 32, padding: '32px' }}>
                <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)', position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 32 }} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: `rgba(232,177,79,0.12)`, border: `1px solid rgba(232,177,79,0.25)` }}>
                        <span className="material-symbols-outlined text-3xl" style={{ color: GOLD }}>analytics</span>
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight text-white mb-1">Resumo Consolidado</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: SILVER }}>{selectedIds.size} {selectedIds.size === 1 ? 'Campanha Selecionada' : 'Campanhas Selecionadas'}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedIds(new Set())}
                      className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                      Limpar Seleção
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '20px 24px' }}>
                      <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: SILVER }}>Total Investido</p>
                      <p className="text-2xl font-black text-white">{R(totalSpend)}</p>
                    </div>
                    {obj === 'VENDAS' ? (() => {
                      const allMatchedProducts = new Set<string>();
                      selected.forEach(c => (c.matchedProducts || []).forEach((p: string) => allMatchedProducts.add(p)));
                      const seenTxns = new Set<string>(); let hmRevenue = 0; let hmGross = 0; let hmHotmartFees = 0; let hmQty = 0;
                      (data.hotmartSales || []).forEach((s: any) => {
                        const pName = s.product?.name || ''; const txn = s.purchase?.transaction || '';
                        const isOk = ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'].includes(s.purchase?.status || '');
                        if (isOk && allMatchedProducts.has(pName) && !seenTxns.has(txn)) {
                          seenTxns.add(txn);
                          const net = s.purchase?.producer_net_brl ?? s.purchase?.producer_net;
                          const gross = s.purchase?.price?.actual_value ?? s.purchase?.price?.value ?? 0;
                          const convertedGross = s.purchase?.price?.converted_value ?? gross;
                          hmRevenue += net != null ? net : convertedGross;
                          hmGross   += convertedGross;
                          hmQty += 1;
                          // Use hotmart_fee_total (already in BRL) for exact fee extraction
                          const feePct = s.purchase?.hotmart_fee?.percentage ?? 0;
                          hmHotmartFees += convertedGross * (feePct / 100);
                        }
                      });
                      // co-producers = gross - hotmartFees - producerNet (any remainder)
                      const hmCoProducers = Math.max(0, hmGross - hmHotmartFees - hmRevenue);
                      const hmFees = Math.max(0, hmHotmartFees);
                      return (<>
                        <div style={{ background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.2)', borderRadius: 20, padding: '20px 24px' }}>
                          <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: GOLD + 'aa' }}>Recebido Líquido</p>
                          <p className="text-2xl font-black" style={{ color: GOLD }}>{R(hmRevenue)}</p>
                          <div className="mt-2">
                            <InfoTooltip
                              lines={[
                                { emoji: '🟡', label: 'Bruto', value: R(hmGross) },
                                ...(hmFees > 0 ? [{ emoji: '🔴', label: 'Taxas Hotmart', value: `− ${R(hmFees)}`, color: '#f87171' }] : []),
                                ...(hmCoProducers > 0.01 ? [{ emoji: '🟠', label: 'Co-produtores', value: `− ${R(hmCoProducers)}`, color: '#fb923c' }] : []),
                              ]}
                              total={{ label: 'Líquido', value: R(hmRevenue) }}
                            />
                          </div>
                        </div>
                        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '20px 24px' }}>
                          <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: '#22c55eaa' }}>Vendas Meta</p>
                          <p className="text-2xl font-black text-emerald-400">{N(totalSales)}</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '20px 24px' }}>
                          <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: SILVER }}>CPA Médio</p>
                          <p className="text-2xl font-black text-rose-400">{totalSales > 0 ? R(totalSpend / totalSales) : '—'}</p>
                        </div>
                      </>);
                    })() : obj === 'LEADS' ? (<>
                      <div style={{ background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.2)', borderRadius: 20, padding: '20px 24px' }}>
                        <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: GOLD + 'aa' }}>Leads Totais</p>
                        <p className="text-2xl font-black" style={{ color: GOLD }}>{N(totalLeads)}</p>
                      </div>
                      <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 20, padding: '20px 24px' }}>
                        <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: '#38bdf8aa' }}>CPL Médio</p>
                        <p className="text-2xl font-black text-sky-400">{totalLeads > 0 ? R(totalSpend / totalLeads) : '—'}</p>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '20px 24px' }}>
                        <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: SILVER }}>CTR Médio</p>
                        <p className="text-2xl font-black text-white">{P(selected.reduce((s,c)=>s+(c.ctr||0),0)/selected.length)}</p>
                      </div>
                    </>) : (
                      <div className="col-span-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '20px 24px' }}>
                        <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: SILVER }}>Ações Totais</p>
                        <p className="text-2xl font-black text-white">{N(totalSales + totalLeads)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
                <span className="material-symbols-outlined text-[30px]" style={{ color: GOLD }}>campaign</span>
              </div>
              <div>
                <h2 className="font-headline font-black text-4xl leading-tight">
                  <span className="text-white">Minhas </span>
                  <span style={{ color: GOLD }}>Campanhas</span>
                </h2>
                <p className="text-sm font-bold uppercase tracking-widest mt-1" style={{ color: SILVER }}>Análise detalhada de performance</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Filter label + tabs */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: SILVER }}>Filtrar por:</span>
                <div className="flex p-1 rounded-xl gap-1"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {OBJ_TABS_DEF.map(item => (
                    <button key={item.tab} onClick={() => { setCampTab(item.tab); setCurrentPage(0); }}
                      className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                      style={campTab === item.tab
                        ? { background: GOLD, color: NAVY, boxShadow: '0 2px 8px rgba(232,177,79,0.4)' }
                        : { color: SILVER }}>
                      {item.tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg" style={{ color: SILVER }}>search</span>
                <input type="text" placeholder="Buscar campanha..."
                  value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 16,
                    paddingLeft: 44, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
                    color: '#fff', outline: 'none', width: 280,
                    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                  className="transition-all focus:border-[#E8B14F]"
                />
              </div>
            </div>
          </div>

          {/* Campaign Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
            {data.fastLoading ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ ...glossy, height: 180 }} className="animate-pulse" />
            )) : paginated.map((camp: any) => {
              const accentColor = objAccent[camp.objective] || SILVER;
              const isSelected = selectedIds.has(camp.id);

              const toggleItem = (e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(camp.id)) { next.delete(camp.id); }
                  else {
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
                  style={{
                    ...glossy,
                    border: isSelected ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.10)',
                    boxShadow: isSelected ? `0 0 0 2px rgba(232,177,79,0.2), 0 20px 40px -8px rgba(0,0,0,0.5)` : glossy.boxShadow,
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    padding: '24px',
                    minHeight: 180,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  className="group"
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.01)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)', position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 28 }} />
                  {/* Accent bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: accentColor, borderRadius: '28px 0 0 28px', opacity: isSelected ? 1 : 0.3, transition: 'opacity 0.2s' }} />

                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <div onClick={toggleItem}
                          style={{
                            width: 24, height: 24, borderRadius: 8,
                            border: isSelected ? `2px solid ${GOLD}` : '2px solid rgba(255,255,255,0.2)',
                            background: isSelected ? GOLD : 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}>
                          {isSelected && <span className="material-symbols-outlined text-[14px] font-black" style={{ color: NAVY }}>check</span>}
                        </div>
                        <StatusBadge status={camp.status} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg"
                        style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}30` }}>
                        {camp.objective}
                      </span>
                    </div>

                    <h3 className="font-headline font-black text-lg line-clamp-2 pr-4 mb-2 leading-tight uppercase tracking-tight text-white">
                      {camp.name}
                    </h3>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                        <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                        {camp.createdTime ? `Criada em ${D(camp.createdTime)}` : 'Indisponível'}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setFeedbackCamp(camp); }}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all"
                        style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}
                        title="Gerar Feedback">
                        <span className="material-symbols-outlined text-[13px]">chat_bubble</span>
                        <span className="text-[9px] font-black uppercase tracking-widest leading-none">Feedback</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div className="relative z-10 mt-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>Gasto</p>
                      <p className="font-black text-lg text-white leading-none">{R(camp.spend)}</p>
                    </div>
                    {camp.objective === 'VENDAS' ? (<>
                      <div className="text-right md:text-left">
                      <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>Líq. (H)</p>
                      <p className="font-black text-lg leading-none" style={{ color: GOLD }}>{R(camp.hotmartRevenue || 0)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>Vendas Meta</p>
                        <p className="font-black text-lg text-emerald-400 leading-none">{N(camp.purchases || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>CPA Meta</p>
                        <p className="font-black text-lg text-rose-400 leading-none">{camp.purchases > 0 ? R(camp.spend / camp.purchases) : '—'}</p>
                      </div>
                    </>) : camp.objective === 'LEADS' ? (<>
                      <div className="text-right md:text-left">
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>Leads</p>
                        <p className="font-black text-lg leading-none" style={{ color: GOLD }}>{N(camp.leads)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>CPL</p>
                        <p className="font-black text-lg text-white leading-none">{R(camp.costPerLead)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>CTR</p>
                        <p className="font-black text-lg text-white leading-none">{P(camp.ctr)}</p>
                      </div>
                    </>) : (<>
                      <div className="text-right md:text-left">
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>Connect</p>
                        <p className="font-black text-lg text-white leading-none">{P(camp.connectRate)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>Visitas</p>
                        <p className="font-black text-lg text-white leading-none">{N(camp.landingPageViews)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: SILVER }}>CTR</p>
                        <p className="font-black text-lg text-white leading-none">{P(camp.ctr)}</p>
                      </div>
                    </>)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>
              Mostrando {Math.min(currentPage * PAGE_SIZE + 1, filtered.length)} - {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length} campanhas
            </p>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}
                className="w-12 h-12 rounded-2xl flex items-center justify-center disabled:opacity-30 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <div className="flex gap-2">
                {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }).slice(0, 10).map((_, idx) => (
                  <button key={idx} onClick={() => setCurrentPage(idx)}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black transition-all"
                    style={currentPage === idx
                      ? { background: GOLD, color: NAVY, boxShadow: '0 4px 16px rgba(232,177,79,0.4)' }
                      : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: SILVER }}>
                    {idx + 1}
                  </button>
                ))}
                {Math.ceil(filtered.length / PAGE_SIZE) > 10 && <span className="flex items-end pb-2 px-2" style={{ color: SILVER }}>...</span>}
              </div>
              <button disabled={currentPage >= Math.ceil(filtered.length / PAGE_SIZE) - 1} onClick={() => setCurrentPage(p => p + 1)}
                className="w-12 h-12 rounded-2xl flex items-center justify-center disabled:opacity-30 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>

        </main>
      </div>

      {feedbackCamp && (
        <FeedbackModal camp={feedbackCamp} ctx={{ dateFrom, dateTo }} onClose={() => setFeedbackCamp(null)} />
      )}

      {niceAlert && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ ...glossy, borderRadius: 40, padding: 40, maxWidth: 420, width: '100%' }}>
            <div className="w-20 h-20 rounded-[28px] flex items-center justify-center mb-8 mx-auto"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="material-symbols-outlined text-4xl">warning</span>
            </div>
            <h3 className="text-2xl font-headline font-black text-white text-center mb-4 tracking-tight">{niceAlert.title}</h3>
            <p className="text-center text-[13px] font-medium leading-relaxed mb-10 px-4" style={{ color: SILVER }}>{niceAlert.message}</p>
            <button onClick={() => setNiceAlert(null)} className="w-full font-black uppercase tracking-[0.2em] text-[10px] py-5 rounded-[20px] transition-all"
              style={{ background: GOLD, color: NAVY }}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </LoginWrapper>
  );
}
