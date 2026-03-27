'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { R, N, D, P, PALETTE } from '@/app/lib/utils';
import { createPortal } from 'react-dom';
import { StatCard } from '@/components/ui/cards';
import { StatusBadge } from '@/components/ui/status-badge';
import { SkeletonAdCard } from '@/components/ui/skeletons';
import { TopAdCard, AdsInsights, CampaignPagesSection, CampaignAdsTable } from '@/components/dashboard/campaign-details';
import { LifetimeCampaignChart } from '@/components/dashboard/LifetimeCampaignChart';
import Link from 'next/link';

export function CampaignDetailView({ id }: { id: string }) {
  const { dateFrom, dateTo, userRole } = useDashboard();
  const [campDetail, setCampDetail] = useState<any | null>(null);
  const [campDetailAds, setCampDetailAds] = useState<any[]>([]);
  const [campDetailAdSets, setCampDetailAdSets] = useState<any[]>([]);
  const [campHotmart, setCampHotmart] = useState({ revenue: 0, purchases: 0, matchedProducts: [] as string[], loading: false });
  const [loading, setLoading] = useState(true);
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedCamps, setRelatedCamps] = useState<{ id: string; name: string; status: string }[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const relatedRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  const [tooltipAd, setTooltipAd] = useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
  const tooltipTimer = useRef<any>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Basic Info + Initial Metrics
      const res = await fetch(`/api/meta/campaign/${id}?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const data = await res.json();
      setCampDetail(data);

      // 2. Fetch Ad Sets
      setAdSetsLoading(true);
      const asRes = await fetch(`/api/meta/campaign/${id}/adsets?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const asData = await asRes.json();
      setCampDetailAdSets(asData.adsets || []);
      setAdSetsLoading(false);

      // 3. Fetch Top Ads
      const adSetFilter = selectedAdSetId ? `&adset_id=${selectedAdSetId}` : '';
      const adsRes = await fetch(`/api/meta/campaign/${id}/topAds?dateFrom=${dateFrom}&dateTo=${dateTo}&objective=${data.objective}${adSetFilter}`);
      const adsData = await adsRes.json();
      setCampDetailAds(adsData.topAds || []);

      // 4. Fetch Hotmart if VENDAS and user has TOTAL access
      if (data.objective === 'VENDAS' && userRole === 'TOTAL') {
        setCampHotmart(p => ({ ...p, loading: true }));
        const hRes = await fetch(`/api/meta/campaign/${id}/hotmart?dateFrom=${dateFrom}&dateTo=${dateTo}&campaignName=${encodeURIComponent(data.name)}`);
        const hData = await hRes.json();
        setCampHotmart({ 
          revenue: hData.revenue || 0, 
          purchases: hData.purchases || 0, 
          matchedProducts: hData.matchedProducts || [],
          loading: false 
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, dateFrom, dateTo, selectedAdSetId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Load related campaigns with weighted bracket-position scoring
  useEffect(() => {
    if (!campDetail?.name) return;
    setRelatedLoading(true);
    fetch('/api/meta/campaigns-list')
      .then(r => r.json())
      .then((list: any[]) => {
        if (!Array.isArray(list)) { setRelatedLoading(false); return; }
        const currentName = campDetail.name as string;

        // Extract [TOKEN] by position: pos0=AC(ignore), pos1=year, pos2=city(5x), pos3=obj, pos4=strategy
        const bracketTokens: { token: string; pos: number }[] = [];
        let bIdx = 0;
        const bracketRe = /\[([^\]]+)\]/g;
        let bm;
        while ((bm = bracketRe.exec(currentName)) !== null) {
          bracketTokens.push({ token: bm[1].toLowerCase(), pos: bIdx++ });
        }

        // Free-text words outside brackets (>= 3 chars)
        const freeTokens = currentName
          .replace(/\[[^\]]*\]/g, ' ')
          .toLowerCase()
          .split(/[\s\-_(),./]+/)
          .map(t => t.trim())
          .filter(t => t.length >= 3);

        const scoreCandidate = (name: string): number => {
          const cn = name.toLowerCase();
          let score = 0;
          for (const { token, pos } of bracketTokens) {
            if (pos === 0) continue;
            const weight = pos === 2 ? 5 : 1;
            if (cn.includes(token)) score += weight;
          }
          for (const t of freeTokens) {
            if (cn.includes(t)) score += 0.3;
          }
          return score;
        };

        const scored = list
          .filter(c => c?.id && c.id !== id && c?.name)
          .map(c => ({ id: c.id, name: c.name, status: c.status || '', score: scoreCandidate(c.name) }))
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        setRelatedCamps(scored);
        setRelatedLoading(false);
      })
      .catch(() => setRelatedLoading(false));
  }, [campDetail?.name, id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (relatedRef.current && !relatedRef.current.contains(e.target as Node)) {
        setRelatedOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  if (loading && !campDetail) return <div className="p-12 text-center font-bold text-slate-400">Carregando detalhes...</div>;
  if (!campDetail) return <div className="p-12 text-center font-bold text-red-500">Campanha não encontrada.</div>;

  const m = selectedAdSetId ? (campDetailAdSets.find(as => as.id === selectedAdSetId) || campDetail) : campDetail;
  const isVendas = campDetail.objective === 'VENDAS';
  const isLeads = campDetail.objective === 'LEADS';
  const roi = m.spend > 0 ? (isVendas ? (campHotmart.revenue / m.spend) : 0) : 0;

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-8 gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/campanhas" className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 border border-slate-200 hover:border-violet-400">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Voltar para lista
          </Link>

          {/* Related Campaigns Dropdown â€” always shown after detail loads */}
          <div className="relative" ref={relatedRef}>
            <button
              onClick={() => setRelatedOpen(o => !o)}
              disabled={relatedLoading}
              className="px-4 py-2.5 bg-white hover:bg-violet-50 text-slate-700 hover:text-violet-700 font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 border border-slate-200 hover:border-violet-400 disabled:opacity-60"
            >
              {relatedLoading
                ? <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                : <span className="material-symbols-outlined text-[18px] text-violet-500">swap_horiz</span>
              }
              Campanhas Relacionadas
              {!relatedLoading && <span className={`material-symbols-outlined text-[16px] transition-transform ${relatedOpen ? 'rotate-180' : ''}`}>expand_more</span>}
            </button>

            {relatedOpen && (
              <div className="absolute top-full left-0 mt-2 w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-violet-50 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Campanhas com nome similar</p>
                  {relatedCamps.length > 0 && <span className="text-[10px] font-bold text-violet-400">{relatedCamps.length} encontradas</span>}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {relatedCamps.length === 0 ? (
                    <div className="px-4 py-6 text-center text-slate-400 text-sm font-bold">Nenhuma campanha similar encontrada</div>
                  ) : relatedCamps.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setRelatedOpen(false); router.push(`/campanhas/${c.id}`); }}
                      className="w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0 group"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                      <span className="text-sm font-bold text-slate-800 leading-snug flex-1">{c.name}</span>
                      <span className="material-symbols-outlined text-[14px] text-slate-300 group-hover:text-violet-400 transition-colors">arrow_forward</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <button onClick={() => window.print()} className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95">
          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
          Salvar Relatório PDF
        </button>
      </div>
      
      <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <span className="material-symbols-outlined text-[100px] text-slate-200">monitoring</span>
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <StatusBadge status={campDetail.status} />
              <span className={`text-xs font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg ${PALETTE[campDetail.objective as keyof typeof PALETTE]?.bg || 'bg-slate-500'} shadow-sm text-white`}>{campDetail.objective}</span>
            </div>
            <h2 className="font-headline font-black text-4xl text-slate-900 break-words">{campDetail.name}</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-500 font-bold flex flex-col gap-1">
              <p className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500 text-[22px]">calendar_month</span> Período Analisado: <span className="text-blue-600">{D(dateFrom)} até {D(dateTo)}</span>
              </p>
              {campDetail.createdTime && (
                <p className="flex items-center gap-2 text-slate-400">
                  <span className="material-symbols-outlined text-slate-300 text-[20px]">history</span> 
                  Criada em <span className="text-slate-600">{D(campDetail.createdTime)}</span>
                  <span className="mx-1 text-slate-200">•</span>
                  Há <span className="text-blue-500 font-black">{Math.max(1, Math.round((new Date().getTime() - new Date(campDetail.createdTime).getTime()) / 86400000) + 1)} dias</span>
                </p>
              )}
            </div>
          </div>
          
          {/* Strategic Insight */}
          <div className="flex gap-4">
            {(() => {
              let insight = { title: 'Desempenho Estável', text: 'Campanha rodando dentro da normalidade.', icon: 'check_circle', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };
              if (isVendas && m.spend > 0) {
                if (roi > 3) insight = { title: 'Excelente!', text: `Retorno de ${roi.toFixed(1)}x. Mantenha os criativos!`, icon: 'rocket_launch', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
                else if (roi > 0 && roi < 1.5) insight = { title: 'Atenção (ROAS Baixo)', text: 'Custo elevado. Avalie melhorias nas páginas.', icon: 'warning', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
              }
              return (
                <div className={`p-4 rounded-2xl border flex items-start gap-3 max-w-[320px] shadow-sm ${insight.bg}`}>
                  <span className={`material-symbols-outlined ${insight.color}`}>{insight.icon}</span>
                  <div>
                    <p className={`font-bold text-sm mb-0.5 ${insight.color}`}>{insight.title}</p>
                    <p className={`text-[11px] ${insight.color} opacity-80 font-semibold leading-snug`}>{insight.text}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mb-12">
        {selectedAdSetId && (
          <div className="flex items-center justify-between bg-violet-50 border border-violet-100 p-4 rounded-2xl mb-6">
            <p className="text-sm font-bold text-violet-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-violet-500">filter_alt</span>
              Filtrando por Conjunto: <span className="underline">{campDetailAdSets.find(as => as.id === selectedAdSetId)?.name}</span>
            </p>
            <button onClick={() => setSelectedAdSetId(null)} className="text-xs font-black uppercase text-violet-600 bg-white px-3 py-1.5 rounded-lg border border-violet-200 shadow-sm">Limpar Filtro</button>
          </div>
        )}

        {/* BIG BOXES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Investimento Meta */}
          <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm flex flex-col justify-between min-h-[160px]">
            <p className="text-xs uppercase font-bold text-slate-400 tracking-widest mb-1">Investimento Meta</p>
            <p className="font-headline font-black text-4xl lg:text-5xl text-slate-900">{R(m.spend)}</p>
          </div>
          {isVendas ? (
            /* Número de Vendas (pixel) */
            <div className="bg-violet-50 border border-violet-100 rounded-[32px] p-8 text-violet-900 shadow-sm flex flex-col justify-between min-h-[160px]">
              <p className="text-[10px] font-black text-violet-600 tracking-widest mb-1 uppercase">Número de Vendas</p>
              <p className="font-headline font-black text-4xl lg:text-5xl">{N(m.purchases || 0)}</p>
              <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mt-2">registradas pelo pixel Meta</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-[32px] p-8 text-amber-900 shadow-sm flex flex-col justify-between min-h-[160px]">
              <p className="text-xs uppercase font-bold text-amber-600 tracking-widest mb-1">Leads Captação</p>
              <p className="font-headline font-black text-4xl lg:text-5xl">{N(m.leads)}</p>
            </div>
          )}
        </div>

        {/* SMALL BOXES */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard icon="ads_click" label="CTR Geral" value={P(m.ctr)} color="blue" />
          <StatCard icon="query_stats" label="Connect Rate" value={P(m.connectRate)} color={m.connectRate > 70 ? 'emerald' : m.connectRate < 50 ? 'rose' : 'slate'} />
          {isVendas ? (
            <>
              <StatCard icon="shopping_basket" label="Checkout Rate" value={P(m.checkoutRate || (m.landingPageViews > 0 ? (m.checkouts / m.landingPageViews * 100) : 0))} color="orange" />
              <StatCard icon="receipt_long" label="Purchase Rate" value={P(m.checkouts > 0 ? (m.purchases / m.checkouts * 100) : 0)} color="violet" />
            </>
          ) : (
            <>
              <StatCard icon="account_circle" label="Custo Lead" value={R(m.costPerLead)} color="amber" />
              <StatCard icon="trending_up" label="Taxa Conv" value={P(m.leadsRate || 0)} color="orange" />
            </>
          )}
        </div>

        {/* HOTMART CARD – only for VENDAS + TOTAL role */}
        {isVendas && userRole === 'TOTAL' && (
          <div className="border-2 border-orange-400 rounded-[32px] p-8 shadow-sm mb-4" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' }}>
            {/* Header: Hotmart Logo + loading indicator */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {/* Hotmart flame SVG */}
                <svg width="36" height="36" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 0C50 0 85 28 85 62C85 81.8 69.3 98 50 98C30.7 98 15 81.8 15 62C15 28 50 0 50 0Z" fill="#E8380D"/>
                  <circle cx="50" cy="72" r="18" fill="white"/>
                </svg>
                <span className="font-black text-2xl tracking-tight text-slate-900">hotmart</span>
                {campHotmart.loading && <span className="w-2 h-2 bg-orange-400 rounded-full animate-ping ml-1"/>}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200">Período Analisado</span>
            </div>

            {/* Data */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500 tracking-widest mb-2">Vendas no Período</p>
                <p className="font-headline font-black text-4xl lg:text-5xl text-slate-900">{N(campHotmart.purchases || 0)}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">transações confirmadas</p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500 tracking-widest mb-2">Faturamento no Período</p>
                <p className="font-headline font-black text-4xl lg:text-5xl text-slate-900">{R(campHotmart.revenue || 0)}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">receita total Hotmart</p>
              </div>
            </div>
          </div>
        )}

        <LifetimeCampaignChart campaignId={id} type={isVendas ? 'VENDAS' : 'LEADS'} />
        
        <h3 className="font-headline font-bold text-2xl text-slate-800 mb-6 flex items-center gap-2">
           <span className="material-symbols-outlined text-violet-500 text-[28px]">account_tree</span>
           Conjuntos de Anúncios
        </h3>
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden mb-12 shadow-sm">
           <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                 <tr>
                    <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400">Conjunto</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-slate-400">Gasto</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-slate-400 text-right">Resultados</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-slate-400 text-right">CTR</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-slate-400 text-right">Connect</th>
                 </tr>
              </thead>
              <tbody>
                 {adSetsLoading ? <tr><td colSpan={5} className="p-8 text-center animate-pulse">Carregando conjuntos...</td></tr> : campDetailAdSets.map(as => (
                    <tr key={as.id} onClick={() => setSelectedAdSetId(as.id)} className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${selectedAdSetId === as.id ? 'bg-violet-50' : ''}`}>
                       <td className="py-4 px-6 font-bold text-xs truncate">{as.name}</td>
                       <td className="py-4 px-4 font-black text-sm">{R(as.spend)}</td>
                       <td className="py-4 px-4 font-black text-sm text-right text-violet-600">{isVendas ? N(as.purchases) : N(as.leads)}</td>
                       <td className="py-4 px-4 font-black text-sm text-right text-slate-500">{P(as.ctr)}</td>
                       <td className="py-4 px-4 font-black text-sm text-right text-slate-400">{P(as.connectRate)}</td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>

        <h3 className="font-headline font-bold text-2xl text-slate-800 mb-6 flex items-center gap-2">
           <span className="material-symbols-outlined text-amber-500 text-[28px]">stars</span>
           Destaques dos Criativos
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16">
          {campDetailAds.slice(0, 4).map((ad, i) => (
            <TopAdCard key={ad.id} ad={ad} type={isVendas ? 'VENDAS' : 'LEADS'} rank={i + 1} hideCampaign onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />
          ))}
        </div>

        <AdsInsights ads={campDetailAds} type={isVendas ? 'VENDAS' : 'LEADS'} />
        <CampaignPagesSection ads={campDetailAds} type={isVendas ? 'VENDAS' : 'LEADS'} />
        <CampaignAdsTable ads={campDetailAds} type={isVendas ? 'VENDAS' : 'LEADS'} onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />
      </div>

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
  );
}
