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

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

export default function ResumoPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data = useDashboardData();
  const [tooltipAd,  setTooltipAd]  = React.useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{ x: number, y: number } | null>(null);
  const tooltipTimer = React.useRef<any>(null);
  const [feedbackCamp, setFeedbackCamp] = React.useState<any>(null);

  const openTooltip  = (e: React.MouseEvent, ad: any) => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setTooltipPos({ x: e.clientX, y: e.clientY }); setTooltipAd(ad); };
  const moveTooltip  = (e: React.MouseEvent) => { if (tooltipAd) setTooltipPos({ x: e.clientX, y: e.clientY }); };
  const closeTooltip = () => { tooltipTimer.current = setTimeout(() => { setTooltipAd(null); setTooltipPos(null); }, 150); };
  const keepTooltip  = () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };

  const o        = data.overview as any;
  const dayCount = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1);
  const cpm      = o.impressions > 0 ? (o.spend / o.impressions * 1000) : 0;
  const spendVendas = data.spendByObjective?.VENDAS || 0;
  const spendLeads  = data.spendByObjective?.LEADS  || 0;
  const cpvMeta  = spendVendas / (o.purchases || 1);
  const cpl      = spendLeads  / (o.leads     || 1);

  const bigKpis = [
    { label: 'Total Investido',     sublabel: 'via Meta Ads',          value: R(o.spend),           icon: 'paid',         accent: GOLD },
    { label: 'Total de Vendas Meta',sublabel: 'registradas pelo pixel', value: N(o.purchases || 0),  icon: 'shopping_cart', accent: '#22c55e' },
    { label: 'Custo por Venda',     sublabel: 'CPA Meta (pixel)',       value: R(cpvMeta),           icon: 'price_check',  accent: '#ef4444' },
  ];

  const smallKpis = [
    { label: 'Leads Captados', value: N(o.leads),          icon: 'person_add',  accent: '#22c55e' },
    { label: 'Custo por Lead', value: R(cpl),              icon: 'money_off',   accent: GOLD },
    { label: 'Impressões',     value: N(o.impressions||0), icon: 'visibility',  accent: SILVER },
    { label: 'CPM',            value: R(cpm),              icon: 'bar_chart',   accent: SILVER },
  ];

  const glossy: React.CSSProperties = {
    background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 50%, rgba(0,10,30,0.65) 100%)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 24px 48px -12px rgba(0,0,0,0.6)',
    borderRadius: 24,
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-20" style={{ background: NAVY }}>
        <Navbar />
        <div className="h-[80px]" />

        {/* ── HERO background image ── */}
        <div className="relative w-full" style={{ background: '#000' }}>
          {/* Image full width, no crop */}
          <img
            src="/rad.jpg"
            alt=""
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              opacity: 0.5,
            }}
          />
          {/* gradient fade to navy at bottom */}
          <div className="absolute bottom-0 left-0 w-full pointer-events-none"
            style={{ height: '35%', background: `linear-gradient(to bottom, transparent, ${NAVY})` }} />

          {/* CONTENT over the image */}
          <div className="absolute inset-0 z-10 w-full px-6 pt-6 pb-4" style={{ maxWidth: '100vw' }}>
            {/* Period bar */}
            <div className="max-w-[1600px] mx-auto"><div className="p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs font-semibold mb-4 gap-3"
              style={{ ...glossy, borderRadius: 18 }}>
              <p className="font-bold" style={{ color: '#fff' }}>
                Período: <span style={{ color: GOLD }}>{D(dateFrom)} → {D(dateTo)}</span>
                {data.fastLoading && <span className="ml-3 animate-pulse" style={{ color: GOLD }}>Atualizando…</span>}
              </p>
              <div className="flex items-center gap-3">
                {data.lastUpdate && !data.fastLoading && (
                  <span style={{ color: SILVER }}>Última atualização: <span className="font-black" style={{ color: '#fff' }}>{data.lastUpdate}</span></span>
                )}
                <button onClick={data.refresh}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-bold text-xs"
                  style={{ border: `1px solid rgba(232,177,79,0.3)`, color: GOLD, background: 'rgba(232,177,79,0.08)' }}>
                  <span className={`material-symbols-outlined text-sm ${data.fastLoading ? 'animate-spin' : ''}`}>sync</span>
                  Atualizar
                </button>
              </div>
            </div>

            {/* BIG KPIs */}
            <section className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              {data.fastLoading
                ? Array.from({ length: 3 }).map((_, i) => <SkeletonCardBig key={i} />)
                : bigKpis.map((c, i) => (
                  <div key={i} style={{ ...glossy, minHeight: 140, padding: '20px 24px' }}
                    className="flex flex-col justify-between group hover:scale-[1.01] transition-transform">
                    {/* shine overlay */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 40%)',
                      borderRadius: 24,
                    }} />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-[20px]" style={{ color: c.accent }}>{c.icon}</span>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: c.accent }}>{c.label}</p>
                      </div>
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: SILVER }}>{c.sublabel}</p>
                      <p className="font-black font-headline leading-none tracking-tighter text-white" style={{ fontSize: 'clamp(2rem,4vw,3.5rem)' }}>{c.value}</p>
                    </div>
                  </div>
                ))
              }
            </section>

            {/* SMALL KPIs */}
            <section className="max-w-[1600px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.fastLoading
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonCardBig key={i} />)
                : smallKpis.map((c, i) => (
                  <div key={i} style={{ ...glossy, padding: '16px 20px' }} className="flex flex-col gap-1 group hover:scale-[1.01] transition-transform">
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)',
                      borderRadius: 20,
                    }} />
                    <div className="relative z-10 flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: c.accent }}>{c.icon}</span>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{c.label}</p>
                    </div>
                    <p className="font-headline font-black text-2xl lg:text-3xl text-white relative z-10">{c.value}</p>
                  </div>
                ))
              }
            </section>
            </div></div>
        </div>

        {/* ── REST OF CONTENT on solid navy ── */}
        <main className="px-6 max-w-[1600px] mx-auto mt-4">

          {/* Budget Split */}
          <div className="flex items-center gap-5 mb-3 mt-2">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-10 rounded-full" style={{ background: `linear-gradient(to bottom, ${GOLD}, rgba(232,177,79,0.3))` }} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: SILVER }}>Distribuição</p>
                <p className="text-lg font-black text-white leading-tight">Divisão do Orçamento</p>
              </div>
            </div>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, rgba(232,177,79,0.3), transparent)` }} />
          </div>

          {!data.fastLoading && <BudgetSplit spend={data.spendByObjective} dayCount={dayCount} />}

          {/* Chart */}
          <div className="rounded-[28px] p-8 mb-8" style={{ ...glossy, borderRadius: 28 }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 30%)',
              borderRadius: 28,
            }} />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center border"
                  style={{ background: 'rgba(232,177,79,0.1)', borderColor: 'rgba(232,177,79,0.2)', color: GOLD }}>
                  <span className="material-symbols-outlined text-[28px]">query_stats</span>
                </div>
                <div>
                  <h3 className="font-headline font-black text-xl text-white">Evolução de Performance</h3>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: SILVER }}>Análise interativa do período</p>
                </div>
              </div>
              <div className="flex gap-3">
                {[{ color: GOLD, label: 'Investimento' }, { color: '#22c55e', label: 'Vendas' }, { color: '#38bdf8', label: 'Leads' }].map(l => (
                  <div key={l.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                    style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative z-10 min-h-[300px]">
              {data.chartLoading
                ? <div className="h-[300px] flex items-center justify-center" style={{ color: SILVER }}>Carregando gráfico...</div>
                : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data.chartData}>
                      <defs>
                        <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GOLD} stopOpacity={0.25} /><stop offset="95%" stopColor={GOLD} stopOpacity={0} /></linearGradient>
                        <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.2} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: SILVER, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: SILVER, fontWeight: 700 }} />
                      <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(232,177,79,0.2)', background: 'rgba(0,26,53,0.95)', backdropFilter: 'blur(20px)', color: '#fff', fontSize: 12 }} />
                      <Area type="monotone" dataKey="Leads"        stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#gL)" />
                      <Area type="monotone" dataKey="Vendas"       stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#gV)" />
                      <Area type="monotone" dataKey="Investimento" stroke={GOLD}    strokeWidth={3} fillOpacity={1} fill="url(#gS)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          </div>

          {/* Campaign Table */}
          {!data.fastLoading && (
            <CampaignTable campaigns={data.tableData} loading={data.fastLoading} ctx={{ dateFrom, dateTo, setFeedbackCamp }} />
          )}

          {feedbackCamp && (
            <FeedbackModal camp={feedbackCamp} ctx={{ dateFrom, dateTo }} onClose={() => setFeedbackCamp(null)} />
          )}

          {/* Top Ads */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24 mt-8">
            <div>
              <h3 className="font-headline font-bold text-xl text-white mb-5 flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-lg"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>🛒</span>
                Top Anúncios de Vendas
              </h3>
              <div className="flex flex-col gap-4">
                {data.chartLoading
                  ? Array.from({ length: 2 }).map((_, i) => <SkeletonAdCard key={i} />)
                  : data.topSalesAds.map((ad: any, i: number) => <TopAdCard key={i} ad={ad} type="VENDAS" rank={i + 1} onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />)
                }
              </div>
            </div>
            <div>
              <h3 className="font-headline font-bold text-xl text-white mb-5 flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-lg"
                  style={{ background: 'rgba(232,177,79,0.15)', border: `1px solid rgba(232,177,79,0.3)` }}>🎯</span>
                Top Anúncios de Captação
              </h3>
              <div className="flex flex-col gap-4">
                {data.chartLoading
                  ? Array.from({ length: 2 }).map((_, i) => <SkeletonAdCard key={i} />)
                  : data.topLeadsAds.map((ad: any, i: number) => <TopAdCard key={i} ad={ad} type="LEADS" rank={i + 1} onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />)
                }
              </div>
            </div>
          </div>
        </main>

        {/* Ad Tooltip Portal */}
        {tooltipAd && tooltipPos && typeof window !== 'undefined' && createPortal(
          <div
            style={{ position: 'fixed', top: tooltipPos.y - 12, left: tooltipPos.x + 20, background: 'rgba(0,10,30,0.95)', backdropFilter: 'blur(24px)', border: '1px solid rgba(232,177,79,0.2)', boxShadow: '0 32px 64px rgba(0,0,0,0.8)' }}
            className="z-[99999] pointer-events-auto transform -translate-y-full w-[300px] rounded-[24px] shadow-2xl animate-in zoom-in-95 duration-200"
            onMouseEnter={keepTooltip}
            onMouseLeave={closeTooltip}
          >
            <div className="relative aspect-video rounded-t-[24px] overflow-hidden">
              {tooltipAd.thumbnailUrl
                ? <img src={tooltipAd.thumbnailUrl} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="material-symbols-outlined text-3xl" style={{ color: SILVER }}>image</span>
                  </div>
              }
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,10,30,0.9), transparent)' }} />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: GOLD }}>Criativo</p>
                <p className="font-bold text-sm truncate uppercase tracking-tight text-white">{tooltipAd.name}</p>
              </div>
            </div>
            <div className="p-5">
              {tooltipAd.body
                ? <div className="rounded-xl p-3 border mb-4 overflow-y-auto max-h-[100px]"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' }}>
                    <p className="text-[11px] leading-relaxed font-medium" style={{ color: SILVER }}>{tooltipAd.body}</p>
                  </div>
                : <div className="mb-4 text-center py-4 border-2 border-dashed rounded-xl"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Sem descrição no Meta</p>
                  </div>
              }
              <div className="flex flex-col gap-2">
                <a href={tooltipAd.landingPageUrl || tooltipAd.instagramPermalink || tooltipAd.adsManagerLink}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 font-black uppercase tracking-[0.15em] text-[10px] py-4 rounded-xl transition-all btn-gold">
                  <span className="material-symbols-outlined text-[16px]">language</span>
                  Página de Destino
                </a>
                <a href={tooltipAd.instagramPermalink || tooltipAd.adsManagerLink}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 font-black uppercase tracking-[0.15em] text-[10px] py-3.5 rounded-xl transition-all border"
                  style={{ background: 'rgba(255,255,255,0.05)', color: SILVER, borderColor: 'rgba(255,255,255,0.1)' }}>
                  <span className="material-symbols-outlined text-[14px]">ads_click</span>
                  Prévia no Instagram
                </a>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </LoginWrapper>
  );
}
