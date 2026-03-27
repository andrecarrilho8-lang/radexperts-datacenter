'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, N, D } from '@/app/lib/utils';
import { createPortal } from 'react-dom';
import { SkeletonCardBig, SkeletonAdCard } from '@/components/ui/skeletons';
import { BudgetSplit } from '@/components/dashboard/campaign-details';
import { TopAdCard } from '@/components/dashboard/campaign-details';
import { CampaignTable } from '@/components/dashboard/campaign-table';
import { FeedbackModal } from '@/components/dashboard/feedback-modal';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

export default function ResumoPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data = useDashboardData();
  const [tooltipAd, setTooltipAd] = React.useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{ x: number, y: number } | null>(null);
  const tooltipTimer = React.useRef<any>(null);
  const [feedbackCamp, setFeedbackCamp] = React.useState<any>(null);

  const openTooltip = (e: React.MouseEvent, ad: any) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipPos({ x: e.clientX, y: e.clientY });
    setTooltipAd(ad);
  };
  const moveTooltip = (e: React.MouseEvent) => {
    if (tooltipAd) setTooltipPos({ x: e.clientX, y: e.clientY });
  };
  const closeTooltip = () => {
    tooltipTimer.current = setTimeout(() => {
      setTooltipAd(null);
      setTooltipPos(null);
    }, 150);
  };
  const keepTooltip = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  };

  const o = data.overview as any;
  const dayCount = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1);

  const cpm = o.impressions > 0 ? (o.spend / o.impressions * 1000) : 0;
  // Use objective-specific spend for accurate per-objective metrics
  const spendVendas = data.spendByObjective?.VENDAS || 0;
  const spendLeads  = data.spendByObjective?.LEADS  || 0;
  const cpvMeta = spendVendas / (o.purchases || 1);   // CPA correto: só spend de VENDAS
  const cpl     = spendLeads  / (o.leads     || 1);   // CPL correto: só spend de LEADS

  const bigKpis = [
    {
      label: 'Total Investido',
      sublabel: 'via Meta Ads',
      value: R(o.spend),
      color: 'blue',
      metaLogo: true,
    },
    {
      label: 'Total de Vendas Meta',
      sublabel: 'registradas pelo pixel',
      value: N(o.purchases || 0),
      color: 'violet',
      icon: 'shopping_cart',
    },
    {
      label: 'Custo por Venda',
      sublabel: 'CPA Meta (pixel)',
      value: R(cpvMeta),
      color: 'rose',
      icon: 'price_check',
    },
  ];

  const smallKpis = [
    { label: 'Leads Captados', value: N(o.leads), icon: 'person_add', color: 'sky' },
    { label: 'Custo por Lead', value: R(cpl), icon: 'money_off', color: 'amber' },
    { label: 'Impressões', value: N(o.impressions || 0), icon: 'visibility', color: 'slate' },
    { label: 'CPM', value: R(cpm), icon: 'bar_chart', color: 'indigo' },
  ];

  return (
    <LoginWrapper>
      <div className="min-h-screen bg-[#f3f3f3] pb-20">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1600px] mx-auto pt-10">
        <div className="bg-white/40 backdrop-blur-3xl border border-white p-5 rounded-[24px] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between text-xs font-semibold mb-6 gap-3">
          <p className="text-slate-800 font-bold">
            Período: <span className="text-violet-600">{D(dateFrom)} → {D(dateTo)}</span>
            {data.fastLoading && <span className="ml-3 text-violet-600 animate-pulse">Atualizando…</span>}
          </p>
          <div className="flex items-center gap-3">
            {data.lastUpdate && !data.fastLoading && <span className="text-slate-500">Última atualização: <span className="text-slate-900 font-black">{data.lastUpdate}</span></span>}
            <button onClick={data.refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-700 hover:text-violet-600 transition-all">
              <span className={`material-symbols-outlined text-sm ${data.fastLoading ? 'animate-spin' : ''}`}>sync</span> Atualizar
            </button>
          </div>
        </div>

        {/* BIG KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {data.fastLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCardBig key={i} />)
            : bigKpis.map((c, i) => (
              <div key={i} className={`border rounded-[32px] p-8 flex flex-col justify-between min-h-[200px] relative overflow-hidden group hover:shadow-xl transition-all shadow-sm ${
                c.color === 'blue'   ? 'bg-gradient-to-br from-[#0866ff]/10 via-blue-50 to-blue-50 border-blue-200' :
                c.color === 'violet' ? 'bg-violet-50 border-violet-200' :
                                       'bg-rose-50 border-rose-200'
              }`}>
                {c.metaLogo && (
                  <div className="absolute top-5 right-6 flex items-center gap-1.5 opacity-20 pointer-events-none">
                    {/* Meta "M" wordmark subtle */}
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 32.5C6 35.5 7.4 38 9.8 38C11.6 38 13 36.8 14.8 34C16.2 31.8 17.8 28.8 19 27L15.4 21.4C13.4 18.4 11.8 17 10 17C7.7 17 6 19.8 6 23.5V32.5Z" fill="#0866ff"/>
                      <path d="M28.4 20.6C26.8 18.2 25 17 23.2 17C21 17 19 18.8 17 22.2L24 33.4L30.4 24C29.8 22.8 29.1 21.6 28.4 20.6Z" fill="#0866ff"/>
                      <path d="M36.8 17C35 17 33.4 18.4 31.4 21.4L38.2 32C39.8 34.4 41 35.4 42.4 35.4C44.6 35.4 46 33 46 30V23.5C46 19.8 44.3 17 42 17H36.8Z" fill="#0866ff"/>
                    </svg>
                  </div>
                )}
                {!c.metaLogo && (
                  <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                    <span className="material-symbols-outlined text-[100px] leading-none">{c.icon}</span>
                  </div>
                )}
                <div className="relative z-10">
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${
                    c.color === 'blue' ? 'text-blue-600' : c.color === 'violet' ? 'text-violet-600' : 'text-rose-600'
                  }`}>{c.label}</p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mb-4 opacity-50 ${
                    c.color === 'blue' ? 'text-blue-800' : 'text-slate-600'
                  }`}>{c.sublabel}</p>
                  <p className="font-black font-headline text-4xl lg:text-5xl leading-none tracking-tighter text-slate-900">{c.value}</p>
                </div>
                {c.metaLogo && (
                  <div className="mt-4 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 32.5C6 35.5 7.4 38 9.8 38C11.6 38 13 36.8 14.8 34C16.2 31.8 17.8 28.8 19 27L15.4 21.4C13.4 18.4 11.8 17 10 17C7.7 17 6 19.8 6 23.5V32.5Z" fill="#0866ff"/>
                      <path d="M28.4 20.6C26.8 18.2 25 17 23.2 17C21 17 19 18.8 17 22.2L24 33.4L30.4 24C29.8 22.8 29.1 21.6 28.4 20.6Z" fill="#0866ff"/>
                      <path d="M36.8 17C35 17 33.4 18.4 31.4 21.4L38.2 32C39.8 34.4 41 35.4 42.4 35.4C44.6 35.4 46 33 46 30V23.5C46 19.8 44.3 17 42 17H36.8Z" fill="#0866ff"/>
                    </svg>
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-500">Meta Ads</span>
                  </div>
                )}
              </div>
            ))
          }
        </section>

        {/* SMALL KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {data.fastLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCardBig key={i} />)
            : smallKpis.map((c, i) => (
              <div key={i} className={`bg-white border rounded-[24px] p-6 flex flex-col gap-2 shadow-sm hover:shadow-md transition-all ${
                c.color === 'sky'    ? 'border-sky-100'    :
                c.color === 'amber' ? 'border-amber-100'  :
                c.color === 'indigo' ? 'border-indigo-100' :
                                       'border-slate-100'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`material-symbols-outlined text-[18px] ${
                    c.color === 'sky' ? 'text-sky-500' : c.color === 'amber' ? 'text-amber-500' : c.color === 'indigo' ? 'text-indigo-500' : 'text-slate-400'
                  }`}>{c.icon}</span>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{c.label}</p>
                </div>
                <p className="font-headline font-black text-2xl lg:text-3xl text-slate-900">{c.value}</p>
              </div>
            ))
          }
        </section>

        {/* BUDGET SPLIT DIVIDER */}
        <div className="flex items-center gap-5 mb-6 mt-2">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-violet-500 to-indigo-600 shadow-sm" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Distribuição</p>
              <p className="text-lg font-black text-slate-800 leading-tight">Divisão do Orçamento</p>
            </div>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-violet-200 to-transparent" />
        </div>

        {!data.fastLoading && <BudgetSplit spend={data.spendByObjective} dayCount={dayCount} />}

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100">
                <span className="material-symbols-outlined text-[28px]">query_stats</span>
              </div>
              <div><h3 className="font-headline font-black text-xl text-slate-800">Evolução de Performance</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Análise interativa do período</p></div>
            </div>
            <div className="flex gap-4">
              {[{ color: '#3b82f6', label: 'Investimento' }, { color: '#8b5cf6', label: 'Vendas' }, { color: '#10b981', label: 'Leads' }].map(l => (
                <div key={l.label} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-[300px]">
            {data.chartLoading ? <div className="h-[300px] flex items-center justify-center">Carregando gráfico...</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.chartData}>
                  <defs>
                    <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                  <Area type="monotone" dataKey="Leads" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#gL)" />
                  <Area type="monotone" dataKey="Vendas" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#gV)" />
                  <Area type="monotone" dataKey="Investimento" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#gS)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {!data.fastLoading && (
          <CampaignTable campaigns={data.tableData} loading={data.fastLoading} ctx={{ dateFrom, dateTo, setFeedbackCamp }} />
        )}

        {feedbackCamp && (
          <FeedbackModal camp={feedbackCamp} ctx={{ dateFrom, dateTo }} onClose={() => setFeedbackCamp(null)} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24">
          <div>
            <h3 className="font-headline font-bold text-xl text-slate-800 mb-5 flex items-center gap-3"><span className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center text-xl shadow-lg shadow-violet-200">🛒</span> Top Anúncios de Vendas</h3>
            <div className="flex flex-col gap-4">
              {data.chartLoading ? Array.from({ length: 2 }).map((_, i) => <SkeletonAdCard key={i} />) : data.topSalesAds.map((ad: any, i: number) => <TopAdCard key={i} ad={ad} type="VENDAS" rank={i + 1} onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />)}
            </div>
          </div>
          <div>
            <h3 className="font-headline font-bold text-xl text-slate-800 mb-5 flex items-center gap-3"><span className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20">🎯</span> Top Anúncios de Captação</h3>
            <div className="flex flex-col gap-4">
              {data.chartLoading ? Array.from({ length: 2 }).map((_, i) => <SkeletonAdCard key={i} />) : data.topLeadsAds.map((ad: any, i: number) => <TopAdCard key={i} ad={ad} type="LEADS" rank={i + 1} onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />)}
            </div>
          </div>
        </div>
      </main>

      {tooltipAd && tooltipPos && typeof window !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: tooltipPos.y - 12, left: tooltipPos.x + 20 }}
          className="z-[99999] pointer-events-auto transform -translate-y-full w-[300px] bg-white text-slate-800 rounded-[24px] shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200"
          onMouseEnter={keepTooltip}
          onMouseLeave={closeTooltip}
        >
          <div className="relative aspect-video rounded-t-[24px] overflow-hidden">
            {tooltipAd.thumbnailUrl ? (
              <img src={tooltipAd.thumbnailUrl} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-300 text-3xl">image</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
               <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-0.5">Criativo</p>
               <p className="text-slate-900 font-bold text-sm truncate uppercase tracking-tight">{tooltipAd.name}</p>
            </div>
          </div>

          <div className="p-5">
            {tooltipAd.body ? (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4 overflow-y-auto max-h-[100px] custom-scrollbar">
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  {tooltipAd.body}
                </p>
              </div>
            ) : (
              <div className="mb-4 text-center py-4 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50">
                 <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Sem descrição no Meta</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <a 
                href={tooltipAd.landingPageUrl || tooltipAd.displayUrl || tooltipAd.instagramPermalink || tooltipAd.adsManagerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black uppercase tracking-[0.15em] text-[10px] py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg"
              >
                <span className="material-symbols-outlined text-[16px]">language</span>
                Página de Destino
              </a>
              <a 
                href={tooltipAd.instagramPermalink || tooltipAd.adsManagerLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-slate-50 text-slate-600 font-black uppercase tracking-[0.15em] text-[10px] py-3.5 rounded-xl hover:bg-slate-100 transition-all border border-slate-200"
              >
                <span className="material-symbols-outlined text-[14px]">ads_click</span>
                Prévia no Instagram
              </a>
            </div>
          </div>
        </div>
        , document.body)}
      </div>
    </LoginWrapper>
  );
}
