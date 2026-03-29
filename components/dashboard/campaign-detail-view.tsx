'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { R, N, D, P } from '@/app/lib/utils';
import { createPortal } from 'react-dom';
import { StatCard } from '@/components/ui/cards';
import { StatusBadge } from '@/components/ui/status-badge';
import { SkeletonAdCard } from '@/components/ui/skeletons';
import { TopAdCard, AdsInsights, CampaignPagesSection, CampaignAdsTable } from '@/components/dashboard/campaign-details';
import { LifetimeCampaignChart } from '@/components/dashboard/LifetimeCampaignChart';
import Link from 'next/link';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 24px 48px -12px rgba(0,0,0,0.5)',
  borderRadius: 28,
  position: 'relative',
  overflow: 'hidden',
};

const shine: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 40%)',
  position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 28,
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  BRL: 'BR', MXN: 'MX', COP: 'CO', ARS: 'AR', CLP: 'CL', PEN: 'PE',
  EUR: 'EU', USD: 'US', CRC: 'CR', BOB: 'BO', PYG: 'PY', UYU: 'UY',
  GTQ: 'GT', HNL: 'HN', NIO: 'NI', DOP: 'DO', CUP: 'CU', VES: 'VE',
};

function getFlagImg(isoCode: string, size = 20) {
  if (!isoCode) return null;
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/flags/4x3/${isoCode.toLowerCase()}.svg`}
      width={size} height={Math.round(size * 0.75)} alt={isoCode}
      style={{ borderRadius: 3, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    />
  );
}

function getCountryName(iso: string) {
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(iso) || iso; } catch { return iso; }
}

export function CampaignDetailView({ id }: { id: string }) {
  const { dateFrom, dateTo, userRole } = useDashboard();
  const [campDetail, setCampDetail]     = useState<any | null>(null);
  const [campDetailAds, setCampDetailAds] = useState<any[]>([]);
  const [campDetailAdSets, setCampDetailAdSets] = useState<any[]>([]);
  const [campHotmart, setCampHotmart]   = useState({ revenue: 0, grossBRL: 0, hotmartFeesBRL: 0, purchases: 0, matchedProducts: [] as string[], currencyBreakdown: {} as Record<string, { count: number; originalTotal: number; convertedTotal: number }>, loading: false });
  const [manualProducts, setManualProducts] = useState<string[]>([]); // produtos selecionados manualmente
  const [availableProducts, setAvailableProducts] = useState<string[]>([]); // lista de todos produtos Hotmart
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading]           = useState(true);
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);
  const [relatedOpen, setRelatedOpen]   = useState(false);
  const [relatedCamps, setRelatedCamps] = useState<{ id: string; name: string; status: string }[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const relatedRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [tooltipAd, setTooltipAd]   = useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const tooltipTimer = useRef<any>(null);
  const [lifetimeData, setLifetimeData] = useState<any>(null);
  const [lifetimeLoading, setLifetimeLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/meta/campaign/${id}?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const data = await res.json();
      setCampDetail(data);

      setAdSetsLoading(true);
      const asRes  = await fetch(`/api/meta/campaign/${id}/adsets?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const asData = await asRes.json();
      setCampDetailAdSets(asData.adsets || []);
      setAdSetsLoading(false);

      const adSetFilter = selectedAdSetId ? `&adset_id=${selectedAdSetId}` : '';
      const adsRes  = await fetch(`/api/meta/campaign/${id}/topAds?dateFrom=${dateFrom}&dateTo=${dateTo}&objective=${data.objective}${adSetFilter}`);
      const adsData = await adsRes.json();
      setCampDetailAds(adsData.topAds || []);

      if (data.objective === 'VENDAS' && userRole === 'TOTAL') {
        fetchHotmart(data.name);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, dateFrom, dateTo, selectedAdSetId]);

  // Fetch dedicado para Hotmart — re-dispara quando manualProducts muda
  const fetchHotmart = useCallback(async (campName: string) => {
    if (!campName || userRole !== 'TOTAL') return;
    setCampHotmart(p => ({ ...p, loading: true }));
    const manualParam = manualProducts.length > 0
      ? `&manualProducts=${encodeURIComponent(manualProducts.join('|'))}`
      : '';
    try {
      const hRes  = await fetch(`/api/meta/campaign/${id}/hotmart?dateFrom=${dateFrom}&dateTo=${dateTo}&campaignName=${encodeURIComponent(campName)}${manualParam}`);
      const hData = await hRes.json();
      setCampHotmart({ revenue: hData.revenue || 0, grossBRL: hData.grossBRL || 0, hotmartFeesBRL: hData.hotmartFeesBRL || 0, purchases: hData.purchases || 0, matchedProducts: hData.matchedProducts || [], currencyBreakdown: hData.currencyBreakdown || {}, loading: false });
    } catch {
      setCampHotmart(p => ({ ...p, loading: false }));
    }
  }, [id, dateFrom, dateTo, manualProducts, userRole]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Busca lista de produtos disponíveis na Hotmart
  useEffect(() => {
    if (userRole !== 'TOTAL') return;
    fetch('/api/hotmart/products')
      .then(r => r.json())
      .then(d => setAvailableProducts(d.products || []))
      .catch(() => {});
  }, [userRole]);

  // Re-busca Hotmart quando manualProducts muda (sem recarregar a campanha inteira)
  useEffect(() => {
    if (!campDetail?.name || campDetail?.objective !== 'VENDAS' || userRole !== 'TOTAL') return;
    fetchHotmart(campDetail.name);
  }, [manualProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node))
        setProductDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Para campanhas pausadas: busca dados lifetime (createdTime → hoje)
  useEffect(() => {
    if (!campDetail?.createdTime) return;
    const isPaused = !['ACTIVE', 'ATIVA'].includes((campDetail.status || '').toUpperCase());
    if (!isPaused) return;
    setLifetimeLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const start = campDetail.createdTime.split('T')[0];
    fetch(`/api/meta/campaign/${id}/daily?dateFrom=${start}&dateTo=${today}`)
      .then(r => r.json())
      .then(d => { setLifetimeData(d); setLifetimeLoading(false); })
      .catch(() => setLifetimeLoading(false));
  }, [campDetail?.createdTime, campDetail?.status, id]);

  useEffect(() => {
    if (!campDetail?.name) return;
    setRelatedLoading(true);
    fetch('/api/meta/campaigns-list')
      .then(r => r.json())
      .then((list: any[]) => {
        if (!Array.isArray(list)) { setRelatedLoading(false); return; }
        const currentName = campDetail.name as string;
        const bracketTokens: { token: string; pos: number }[] = [];
        let bIdx = 0;
        const bracketRe = /\[([^\]]+)\]/g;
        let bm;
        while ((bm = bracketRe.exec(currentName)) !== null) { bracketTokens.push({ token: bm[1].toLowerCase(), pos: bIdx++ }); }
        const freeTokens = currentName.replace(/\[[^\]]*\]/g, ' ').toLowerCase().split(/[\s\-_(),./]+/).map(t => t.trim()).filter(t => t.length >= 3);
        const scoreCandidate = (name: string): number => {
          const cn = name.toLowerCase(); let score = 0;
          for (const { token, pos } of bracketTokens) { if (pos === 0) continue; if (cn.includes(token)) score += pos === 2 ? 5 : 1; }
          for (const t of freeTokens) { if (cn.includes(t)) score += 0.3; }
          return score;
        };
        const scored = list.filter(c => c?.id && c.id !== id && c?.name)
          .map(c => ({ id: c.id, name: c.name, status: c.status || '', score: scoreCandidate(c.name) }))
          .filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
        setRelatedCamps(scored);
        setRelatedLoading(false);
      }).catch(() => setRelatedLoading(false));
  }, [campDetail?.name, id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (relatedRef.current && !relatedRef.current.contains(e.target as Node)) setRelatedOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openTooltip  = (e: React.MouseEvent, ad: any) => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setTooltipPos({ x: e.clientX, y: e.clientY }); setTooltipAd(ad); };
  const moveTooltip  = (e: React.MouseEvent) => { if (tooltipAd) setTooltipPos({ x: e.clientX, y: e.clientY }); };
  const closeTooltip = () => { tooltipTimer.current = setTimeout(() => { setTooltipAd(null); setTooltipPos(null); }, 150); };
  const keepTooltip  = () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };

  if (loading && !campDetail) return (
    <div className="p-12 text-center font-bold" style={{ color: SILVER }}>
      <span className="material-symbols-outlined animate-spin text-4xl block mb-4" style={{ color: GOLD }}>sync</span>
      Carregando detalhes...
    </div>
  );
  if (!campDetail) return <div className="p-12 text-center font-bold text-rose-400">Campanha não encontrada.</div>;

  const m = selectedAdSetId ? (campDetailAdSets.find(as => as.id === selectedAdSetId) || campDetail) : campDetail;
  const isVendas = campDetail.objective === 'VENDAS';
  const roi = m.spend > 0 ? (isVendas ? (campHotmart.revenue / m.spend) : 0) : 0;

  const objAccent = isVendas ? '#22c55e' : GOLD;

  return (
    <div className="animate-in fade-in duration-300" style={{ minHeight: '100vh' }}>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-8 gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/campanhas"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Voltar para lista
          </Link>

          {/* Related */}
          <div className="relative" ref={relatedRef} style={{ zIndex: 9999 }}>
            <button onClick={() => setRelatedOpen(o => !o)} disabled={relatedLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
              {relatedLoading
                ? <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: GOLD }} />
                : <span className="material-symbols-outlined text-[18px]" style={{ color: GOLD }}>swap_horiz</span>}
              Campanhas Relacionadas
              {!relatedLoading && <span className={`material-symbols-outlined text-[16px] transition-transform ${relatedOpen ? 'rotate-180' : ''}`}>expand_more</span>}
            </button>
            {relatedOpen && (
              <div className="absolute top-full left-0 mt-2 w-[440px] rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'linear-gradient(160deg, rgba(0,26,53,0.98) 0%, rgba(0,10,30,0.98) 100%)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', zIndex: 9999, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(232,177,79,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: GOLD }}>Campanhas com nome similar</p>
                  {relatedCamps.length > 0 && <span className="text-[10px] font-bold" style={{ color: SILVER }}>{relatedCamps.length} encontradas</span>}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {relatedCamps.length === 0
                    ? <div className="px-4 py-6 text-center text-sm font-bold" style={{ color: SILVER }}>Nenhuma campanha similar encontrada</div>
                    : relatedCamps.map(c => (
                      <button key={c.id} onClick={() => { setRelatedOpen(false); router.push(`/campanhas/${c.id}`); }}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 group transition-all"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        <span className="text-sm font-bold flex-1 text-white leading-snug">{c.name}</span>
                        <span className="material-symbols-outlined text-[14px]" style={{ color: SILVER }}>arrow_forward</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <button onClick={() => window.print()}
          className="px-5 py-2.5 font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
          style={{ background: GOLD, color: NAVY, boxShadow: '0 4px 16px rgba(232,177,79,0.4)' }}>
          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
          Salvar Relatório PDF
        </button>
      </div>

      {/* Campaign header card */}
      <div style={{ ...glossy, padding: '32px', marginBottom: 24 }}>
        <div style={shine} />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <StatusBadge status={campDetail.status} />
              <span className="text-xs font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg"
                style={{ background: `${objAccent}18`, color: objAccent, border: `1px solid ${objAccent}30` }}>
                {campDetail.objective}
              </span>
            </div>
            <h2 className="font-headline font-black text-3xl lg:text-4xl text-white break-words">{campDetail.name}</h2>
            <div className="mt-4 space-y-2 flex flex-col gap-1">
              <p className="flex items-center gap-2 text-sm font-bold" style={{ color: SILVER }}>
                <span className="material-symbols-outlined text-[22px]" style={{ color: GOLD }}>calendar_month</span>
                Período: <span style={{ color: GOLD }}>{D(dateFrom)} até {D(dateTo)}</span>
              </p>
              {campDetail.createdTime && (
                <p className="flex items-center gap-2 text-sm font-bold" style={{ color: SILVER }}>
                  <span className="material-symbols-outlined text-[20px]" style={{ color: SILVER }}>history</span>
                  Criada em <span style={{ color: '#fff' }}>{D(campDetail.createdTime)}</span>
                  <span className="mx-1" style={{ color: SILVER }}>•</span>
                  Há <span className="font-black" style={{ color: GOLD }}>{Math.max(1, Math.round((new Date().getTime() - new Date(campDetail.createdTime).getTime()) / 86400000) + 1)} dias</span>
                </p>
              )}
            </div>
          </div>
          {/* Insight badge */}
          {(() => {
            let insight = { title: 'Desempenho Estável', text: 'Campanha rodando dentro da normalidade.', icon: 'check_circle', color: '#38bdf8' };
            if (isVendas && m.spend > 0) {
              if (roi > 3) insight = { title: 'Excelente!', text: `Retorno de ${roi.toFixed(1)}x. Mantenha os criativos!`, icon: 'rocket_launch', color: '#22c55e' };
              else if (roi > 0 && roi < 1.5) insight = { title: 'Atenção (ROAS Baixo)', text: 'Custo elevado. Avalie melhorias.', icon: 'warning', color: '#ef4444' };
            }
            return (
              <div className="flex items-start gap-3 max-w-[320px] p-4 rounded-2xl"
                style={{ background: `${insight.color}10`, border: `1px solid ${insight.color}30` }}>
                <span className="material-symbols-outlined" style={{ color: insight.color }}>{insight.icon}</span>
                <div>
                  <p className="font-bold text-sm mb-0.5" style={{ color: insight.color }}>{insight.title}</p>
                  <p className="text-[11px] font-semibold leading-snug" style={{ color: insight.color, opacity: 0.8 }}>{insight.text}</p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* AdSet filter bar */}
      {selectedAdSetId && (
        <div className="flex items-center justify-between p-4 rounded-2xl mb-6"
          style={{ background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.2)' }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: GOLD }}>
            <span className="material-symbols-outlined" style={{ color: GOLD }}>filter_alt</span>
            Filtrando por Conjunto: <span className="underline">{campDetailAdSets.find(as => as.id === selectedAdSetId)?.name}</span>
          </p>
          <button onClick={() => setSelectedAdSetId(null)}
            className="text-xs font-black uppercase px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
            Limpar Filtro
          </button>
        </div>
      )}

      {/* Big KPI boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div style={{ ...glossy, padding: '32px', minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={shine} />
          <p className="text-xs uppercase font-bold tracking-widest relative z-10" style={{ color: SILVER }}>Investimento Meta</p>
          <p className="font-headline font-black text-4xl lg:text-5xl text-white relative z-10">{R(m.spend)}</p>
        </div>
        {isVendas ? (
          <div style={{ ...glossy, padding: '32px', minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, rgba(34,197,94,0.12) 0%, rgba(0,10,30,0.55) 100%)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={shine} />
            <p className="text-[10px] font-black tracking-widest mb-1 uppercase relative z-10" style={{ color: '#22c55ecc' }}>Número de Vendas</p>
            <p className="font-headline font-black text-4xl lg:text-5xl text-emerald-400 relative z-10">{N(m.purchases || 0)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-2 relative z-10" style={{ color: '#22c55e88' }}>registradas pelo pixel Meta</p>
          </div>
        ) : (
          <div style={{ ...glossy, padding: '32px', minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: `linear-gradient(160deg, rgba(232,177,79,0.12) 0%, rgba(0,10,30,0.55) 100%)`, border: `1px solid rgba(232,177,79,0.2)` }}>
            <div style={shine} />
            <p className="text-xs uppercase font-bold tracking-widest relative z-10" style={{ color: GOLD + 'cc' }}>Leads Captação</p>
            <p className="font-headline font-black text-4xl lg:text-5xl relative z-10" style={{ color: GOLD }}>{N(m.leads)}</p>
          </div>
        )}
      </div>

      {/* Small KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon="ads_click" label="CTR Geral" value={P(m.ctr)} color="blue" />
        <StatCard icon="query_stats" label="Connect Rate" value={P(m.connectRate)} color={m.connectRate > 70 ? 'emerald' : m.connectRate < 50 ? 'rose' : 'slate'} />
        {isVendas ? (<>
          <StatCard icon="shopping_basket" label="Checkout Rate" value={P(m.checkoutRate || (m.landingPageViews > 0 ? (m.checkouts / m.landingPageViews * 100) : 0))} color="orange" />
          <StatCard icon="receipt_long" label="Purchase Rate" value={P(m.checkouts > 0 ? (m.purchases / m.checkouts * 100) : 0)} color="amber" />
        </>) : (<>
          <StatCard icon="account_circle" label="Custo Lead" value={R(m.costPerLead)} color="amber" />
          <StatCard icon="trending_up" label="Taxa Conv" value={P(m.leadsRate || 0)} color="orange" />
        </>)}
      </div>

      {/* Hotmart */}
      {isVendas && userRole === 'TOTAL' && (
        <div style={{ ...glossy, padding: '32px', marginBottom: 16, background: 'linear-gradient(160deg, rgba(232,120,13,0.1) 0%, rgba(0,10,30,0.55) 100%)', border: '1px solid rgba(232,120,13,0.25)', borderRadius: 28 }}>
          <div style={shine} />
          <div className="relative z-10">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <svg width="36" height="36" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 0C50 0 85 28 85 62C85 81.8 69.3 98 50 98C30.7 98 15 81.8 15 62C15 28 50 0 50 0Z" fill="#E8380D"/>
                  <circle cx="50" cy="72" r="18" fill="white"/>
                </svg>
                <span className="font-black text-2xl tracking-tight text-white">hotmart</span>
                {campHotmart.loading && <span className="w-2 h-2 rounded-full animate-ping ml-1" style={{ background: '#E8380D' }} />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                  style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.15)' }}>
                  <span className="material-symbols-outlined text-[12px]">info</span>
                  Correspondência por aproximação
                </span>
                {/* Botão Correspondência Manual — agora no header */}
                <div className="relative" ref={productDropdownRef}>
                  <button onClick={() => setProductDropdownOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                    style={{ background: manualProducts.length > 0 ? 'rgba(232,177,79,0.12)' : 'rgba(255,255,255,0.06)', border: manualProducts.length > 0 ? '1px solid rgba(232,177,79,0.3)' : '1px solid rgba(255,255,255,0.12)', color: manualProducts.length > 0 ? GOLD : '#94a3b8' }}>
                    <span className="material-symbols-outlined text-[13px]">tune</span>
                    Correspondência Manual
                    {manualProducts.length > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />}
                    <span className={`material-symbols-outlined text-[12px] transition-transform ${productDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                  </button>
                  {productDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-[380px] rounded-2xl shadow-2xl z-[9999] overflow-hidden"
                      style={{ background: 'linear-gradient(160deg, rgba(0,26,53,0.99) 0%, rgba(0,10,30,0.99) 100%)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
                      <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: GOLD }}>Correspondência Manual</p>
                        <div className="relative">
                          <span className="material-symbols-outlined text-[14px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94a3b8' }}>search</span>
                          <input
                            type="text"
                            placeholder="Buscar produto..."
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px] font-bold outline-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {availableProducts.length === 0 ? (
                          <div className="px-4 py-4 text-center text-sm font-bold" style={{ color: '#94a3b8' }}>Carregando produtos...</div>
                        ) : availableProducts
                            .filter(p => p.toLowerCase().includes(productSearch.toLowerCase()))
                            .map(p => {
                              const isSelected = manualProducts.includes(p);
                              return (
                                <button key={p} onClick={() => setManualProducts(prev => isSelected ? prev.filter(x => x !== p) : [...prev, p])}
                                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm font-bold transition-all"
                                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isSelected ? 'rgba(232,177,79,0.08)' : 'transparent', color: isSelected ? GOLD : 'white' }}
                                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(232,177,79,0.08)' : 'transparent'; }}>
                                  <span className="material-symbols-outlined text-[16px] flex-shrink-0" style={{ color: isSelected ? GOLD : '#94a3b8' }}>
                                    {isSelected ? 'check_box' : 'check_box_outline_blank'}
                                  </span>
                                  <span className="leading-snug text-left">{p}</span>
                                </button>
                              );
                            })}
                        {availableProducts.filter(p => p.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && availableProducts.length > 0 && (
                          <div className="px-4 py-4 text-center text-sm font-bold" style={{ color: '#94a3b8' }}>Nenhum produto encontrado</div>
                        )}
                      </div>
                      {manualProducts.length > 0 && (
                        <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                          <span className="text-[10px] font-bold" style={{ color: '#94a3b8' }}>{manualProducts.length} selecionado(s)</span>
                          <button onClick={() => setManualProducts([])}
                            className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1"
                            style={{ color: '#ef4444' }}>
                            <span className="material-symbols-outlined text-[13px]">close</span>
                            Limpar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg"
                  style={{ color: '#E8380D', background: 'rgba(232,56,13,0.1)', border: '1px solid rgba(232,56,13,0.2)' }}>Período Analisado</span>
              </div>
            </div>

            {campHotmart.loading ? (
              <div className="flex items-center justify-center py-10 gap-3">
                <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#E8380D transparent transparent transparent' }} />
                <span className="text-sm font-bold" style={{ color: SILVER }}>Correlacionando vendas Hotmart...</span>
              </div>
            ) : (
              <>
                {/* KPIs principais */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-[16px] p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] uppercase font-bold tracking-widest mb-2" style={{ color: SILVER }}>Vendas no Período</p>
                    <p className="font-headline font-black text-3xl text-white">{campHotmart.purchases || 0}</p>
                    <p className="text-[10px] font-bold mt-1" style={{ color: SILVER }}>transações confirmadas</p>
                  </div>
                  <div className="rounded-[16px] p-5 relative" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] uppercase font-bold tracking-widest mb-2 flex items-center gap-1.5" style={{ color: SILVER }}>
                      Recebido Líquido (BRL)
                      <span
                        className="material-symbols-outlined text-[13px] cursor-help"
                        style={{ color: GOLD }}
                        title={[
                          `🟡 Bruto: ${R(campHotmart.grossBRL)}`,
                          `🔴 Taxa Hotmart: ${R(campHotmart.hotmartFeesBRL)}`,
                        ].join('\n')}
                      >info</span>
                    </p>
                    <p className="font-headline font-black text-3xl" style={{ color: GOLD }}>{R(campHotmart.revenue || 0)}</p>
                    <p className="text-[10px] font-bold mt-1 flex items-center gap-1" style={{ color: '#22c55e' }}>
                      <span className="material-symbols-outlined text-[11px]">currency_exchange</span>
                      valor líquido · cotação histórica
                    </p>
                  </div>
                  <div className="rounded-[16px] p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] uppercase font-bold tracking-widest mb-2" style={{ color: SILVER }}>ROAS</p>
                    {m.spend > 0 && campHotmart.revenue > 0 ? (
                      <>
                        <p className="font-headline font-black text-3xl" style={{ color: (campHotmart.revenue / m.spend) >= 2 ? '#22c55e' : (campHotmart.revenue / m.spend) < 1 ? '#ef4444' : GOLD }}>
                          {(campHotmart.revenue / m.spend).toFixed(2)}×
                        </p>
                        <p className="text-[10px] font-bold mt-1" style={{ color: SILVER }}>para cada R$1 investido</p>
                      </>
                    ) : (
                      <p className="font-headline font-black text-3xl" style={{ color: SILVER }}>—</p>
                    )}
                  </div>
                  <div className="rounded-[16px] p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: SILVER }}>Ticket Médio</p>
                        <p className="font-headline font-black text-xl text-white">
                          {campHotmart.purchases > 0 ? R(campHotmart.revenue / campHotmart.purchases) : '—'}
                        </p>
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                        <p className="text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: SILVER }}>CPA Real</p>
                        <p className="font-headline font-black text-xl" style={{ color: '#38bdf8' }}>
                          {m.spend > 0 && campHotmart.purchases > 0 ? R(m.spend / campHotmart.purchases) : '—'}
                        </p>
                        <p className="text-[9px] font-bold" style={{ color: SILVER }}>custo por venda</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Produtos matchados */}
                <div className="rounded-[16px] p-4" style={{ background: 'rgba(232,120,13,0.06)', border: '1px solid rgba(232,120,13,0.15)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: '#E8380D' }}>
                    <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                    Produtos Correlacionados ({campHotmart.matchedProducts.length})
                    {manualProducts.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black flex items-center gap-1" style={{ background: 'rgba(232,177,79,0.15)', color: GOLD }}>
                        <span className="material-symbols-outlined text-[11px]">tune</span>
                        manual
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {campHotmart.matchedProducts.map((p: string) => (
                      <span key={p} className="px-3 py-1.5 rounded-lg text-[11px] font-black" style={{ background: 'rgba(232,120,13,0.12)', border: '1px solid rgba(232,120,13,0.2)', color: '#fb923c' }}>
                        {p}
                      </span>
                    ))}
                    {campHotmart.matchedProducts.length === 0 && !campHotmart.loading && (
                      <span className="text-[11px] font-bold" style={{ color: SILVER }}>Nenhum produto correlacionado automaticamente. Use CorresponÚncia Manual acima.</span>
                    )}
                  </div>
                </div>


                {/* Breakdown por moeda */}
                {Object.keys(campHotmart.currencyBreakdown).length > 0 && (
                  <div className="rounded-[16px] p-4 mt-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: SILVER }}>
                      <span className="material-symbols-outlined text-[14px]" style={{ color: GOLD }}>currency_exchange</span>
                      Detalhamento por Moeda — convertido pela cotação do dia da venda
                    </p>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <th className="text-left pb-2 font-black uppercase tracking-widest" style={{ color: SILVER }}>País / Moeda</th>
                          <th className="text-right pb-2 font-black uppercase tracking-widest" style={{ color: SILVER }}>Vendas</th>
                          <th className="text-right pb-2 font-black uppercase tracking-widest" style={{ color: SILVER }}>Valor Original</th>
                          <th className="text-right pb-2 font-black uppercase tracking-widest" style={{ color: SILVER }}>≈ em BRL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(campHotmart.currencyBreakdown).map(([cur, d]) => {
                          const iso = CURRENCY_TO_COUNTRY[cur.toUpperCase()] || '';
                          return (
                            <tr key={cur} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  {getFlagImg(iso, 18)}
                                  <div>
                                    <span className="font-black text-white">{cur}</span>
                                    {iso && <span className="text-[10px] font-bold block" style={{ color: SILVER }}>{getCountryName(iso)}</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 text-right font-bold" style={{ color: SILVER }}>{d.count}</td>
                              <td className="py-2.5 text-right font-bold" style={{ color: SILVER }}>
                                {cur === 'BRL'
                                  ? R(d.originalTotal)
                                  : `${cur} ${d.originalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                }
                              </td>
                              <td className="py-2.5 text-right font-black" style={{ color: GOLD }}>{R(d.convertedTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {campHotmart.purchases === 0 && !campHotmart.loading && (
                  <div className="rounded-[16px] p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="material-symbols-outlined text-3xl block mb-2" style={{ color: SILVER }}>search_off</span>
                    <p className="text-sm font-bold" style={{ color: SILVER }}>Nenhuma venda Hotmart correlacionada com esta campanha no período.</p>
                    <p className="text-[10px] font-bold mt-1" style={{ color: SILVER, opacity: 0.6 }}>A correlação é feita por tokens do nome da campanha vs. nome do produto.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <LifetimeCampaignChart campaignId={id} type={isVendas ? 'VENDAS' : 'LEADS'} />

      {/* AdSets table */}
      <h3 className="font-headline font-bold text-2xl text-white mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-[28px]" style={{ color: GOLD }}>account_tree</span>
        Conjuntos de Anúncios
      </h3>
      <div className="rounded-3xl overflow-hidden mb-12" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <tr>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Conjunto</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Gasto</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>CTR</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Connect</th>
                {isVendas ? (<>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Checkout</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Vendas</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>CPA</th>
                </>) : (<>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Leads</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>CPL</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Taxa Conv.</th>
                </>)}
              </tr>
            </thead>
            <tbody>
              {adSetsLoading
                ? <tr><td colSpan={isVendas ? 7 : 7} className="p-8 text-center font-bold animate-pulse" style={{ color: SILVER }}>Carregando conjuntos...</td></tr>
                : campDetailAdSets.map(as => {
                    const asCheckR = as.checkoutRate || (as.landingPageViews > 0 ? (as.checkouts / as.landingPageViews * 100) : 0);
                    const asLeadCV = as.landingPageViews > 0 ? (as.leads / as.landingPageViews * 100) : 0;
                    const asCPA    = as.spend > 0 && (as.purchases || 0) > 0 ? as.spend / as.purchases : 0;
                    const asCPL    = as.spend > 0 && (as.leads || 0) > 0    ? as.spend / as.leads    : 0;
                    return (
                      <tr key={as.id} onClick={() => setSelectedAdSetId(as.id)}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: selectedAdSetId === as.id ? 'rgba(232,177,79,0.06)' : 'transparent' }}
                        onMouseEnter={e => { if(selectedAdSetId !== as.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = selectedAdSetId === as.id ? 'rgba(232,177,79,0.06)' : 'transparent'; }}>
                        <td className="py-4 px-6 font-bold text-xs text-white max-w-[220px] truncate">{as.name}</td>
                        <td className="py-4 px-4 font-black text-sm text-right text-white">{R(as.spend)}</td>
                        <td className="py-4 px-4 font-black text-sm text-right" style={{ color: SILVER }}>{P(as.ctr)}</td>
                        <td className="py-4 px-4 font-black text-sm text-right" style={{ color: as.connectRate > 70 ? '#22c55e' : as.connectRate < 50 ? '#ef4444' : SILVER }}>{P(as.connectRate)}</td>
                        {isVendas ? (<>
                          <td className="py-4 px-4 font-black text-sm text-right" style={{ color: SILVER }}>{P(asCheckR)}</td>
                          <td className="py-4 px-4 font-black text-sm text-right" style={{ color: GOLD }}>{N(as.purchases || 0)}</td>
                          <td className="py-4 px-4 font-black text-sm text-right" style={{ color: SILVER }}>{asCPA > 0 ? R(asCPA) : '—'}</td>
                        </>) : (<>
                          <td className="py-4 px-4 font-black text-sm text-right" style={{ color: GOLD }}>{N(as.leads || 0)}</td>
                          <td className="py-4 px-4 font-black text-sm text-right" style={{ color: SILVER }}>{asCPL > 0 ? R(asCPL) : '—'}</td>
                          <td className="py-4 px-4 font-black text-sm text-right" style={{ color: SILVER }}>{P(asLeadCV)}</td>
                        </>)}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="font-headline font-bold text-2xl text-white mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined text-[28px]" style={{ color: GOLD }}>stars</span>
        Destaques dos Criativos
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16">
        {campDetailAds.length === 0 && !loading
          ? Array.from({ length: 2 }).map((_, i) => <SkeletonAdCard key={i} />)
          : campDetailAds.slice(0, 4).map((ad, i) => (
            <TopAdCard key={ad.id} ad={ad} type={isVendas ? 'VENDAS' : 'LEADS'} rank={i + 1} hideCampaign onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />
          ))}
      </div>


      {/* Projeções do Analista / Overview Campanha */}
      {(() => {
        const isPaused = !['ACTIVE', 'ATIVA'].includes((campDetail.status || '').toUpperCase());
        const dayCount = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1);
        const daysActive = campDetail.createdTime
          ? Math.max(1, Math.round((new Date().getTime() - new Date(campDetail.createdTime).getTime()) / 86400_000))
          : dayCount;
        const resultLabel  = isVendas ? 'Vendas' : 'Leads';
        const resultColor  = isVendas ? '#22c55e' : GOLD;

        const cardBorder = 'rgba(255,255,255,0.08)';
        const cardBg     = 'rgba(255,255,255,0.04)';

        const header = (title: string, sub: string, icon: string) => (
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
              <span className="material-symbols-outlined text-[26px]">{icon}</span>
            </div>
            <div>
              <h3 className="font-headline font-black text-2xl text-white leading-tight">{title}</h3>
              <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{sub}</p>
            </div>
            {isPaused && (
              <span className="ml-auto px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>Pausada</span>
            )}
          </div>
        );

        if (isPaused) {
          // --- OVERVIEW CAMPANHA (pausada) ---
          const ltSpend   = lifetimeData?.totalSpend   ?? 0;
          const ltResults = lifetimeData?.totalResults ?? 0;
          // daysWithData = dias que realmente tiveram gasto (ignora dias sem veiculação)
          const ltDays    = lifetimeData?.daysWithData  || 0;
          // Gasto médio: usa dias com dados reais; fallback nos dias da campanha
          const avgDaily  = ltDays > 0 ? ltSpend / ltDays : (daysActive > 0 ? (ltSpend || m.spend) / daysActive : 0);
          const bestDay       = lifetimeData?.bestDay      ?? null;
          const bestDayLeads  = lifetimeData?.bestDayLeads ?? null;
          const bestDayResult = isVendas ? bestDay : (bestDayLeads ?? bestDay);

          return (
            <div className="rounded-[28px] p-8 mb-12" style={{ background: 'linear-gradient(160deg, rgba(0,22,55,0.95) 0%, rgba(0,15,40,0.9) 100%)', border: '1px solid rgba(239,68,68,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              {header('Overview Campanha', 'Não influenciado pelo período — dados totais de vida', 'history')}

              {lifetimeLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin" style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  {/* Gasto médio diário */}
                  <div className="rounded-[20px] p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: GOLD }}>today</span>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Gasto médio por dia</p>
                    </div>
                    <p className="font-headline font-black text-3xl text-white mb-1">{R(avgDaily)}</p>
                    <p className="text-[10px] font-bold" style={{ color: SILVER }}>
                      Baseado no período que a campanha esteve no ar
                    </p>
                  </div>

                  {/* Dias que rodou */}
                  <div className="rounded-[20px] p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: '#38bdf8' }}>event_note</span>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Vida da campanha</p>
                    </div>
                    <p className="font-headline font-black text-4xl text-white mb-1">{daysActive}</p>
                    <p className="text-[10px] font-bold mb-3" style={{ color: SILVER }}>dias desde a criação</p>
                    {campDetail.createdTime && (
                      <div className="pt-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
                        <p className="text-[9px] font-bold" style={{ color: SILVER }}>Criada em</p>
                        <p className="font-black text-white">{D(campDetail.createdTime)}</p>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          );
        }

        // --- PROJEÇÕES (campanha ativa) ---
        const dailySpend   = m.spend / dayCount;
        const imprDay      = (m.impressions || 0) / dayCount;
        const ctrRate      = (m.ctr || 0) / 100;
        const connectRate  = (m.connectRate || 0) / 100;
        const lpvDay       = imprDay * ctrRate * connectRate;
        const checkR       = (m.checkoutRate || 0) / 100;
        const purchR       = m.landingPageViews > 0 ? ((m.purchases || 0) / ((m.landingPageViews || 1) * checkR || 1)) : 0;
        const leadCV       = m.landingPageViews > 0 ? ((m.leads || 0) / (m.landingPageViews || 1)) : 0;
        const dailyResults = isVendas ? lpvDay * checkR * Math.min(purchR, 1) : lpvDay * leadCV;
        const projections  = [{ days: 7, label: '7 dias' }, { days: 14, label: '14 dias' }, { days: 30, label: '30 dias' }];

        return (
          <div className="rounded-[28px] p-8 mb-12" style={{ background: 'linear-gradient(160deg, rgba(0,22,55,0.95) 0%, rgba(0,15,40,0.9) 100%)', border: `1px solid rgba(232,177,79,0.2)`, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            {header('Projeções do Analista', 'Baseado no ritmo do período analisado', 'monitoring')}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              <div className="rounded-[20px] p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: GOLD }}>today</span>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Gasto médio por dia</p>
                </div>
                <p className="font-headline font-black text-3xl text-white mb-1">{R(dailySpend)}</p>
                <p className="text-[10px] font-bold mb-4" style={{ color: SILVER }}>Baseado em {dayCount} dias de período</p>
                {campDetail.createdTime && (
                  <div className="pt-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: SILVER }}>Campanha ativa há</p>
                    <p className="font-black text-white text-lg">{daysActive} dias</p>
                    <p className="text-[9px] font-bold" style={{ color: SILVER }}>desde {D(campDetail.createdTime)}</p>
                  </div>
                )}
              </div>

              <div className="rounded-[20px] p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: '#38bdf8' }}>trending_up</span>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Investimento projetado</p>
                </div>
                <div className="flex flex-col gap-4">
                  {projections.map(p => (
                    <div key={p.days}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{p.label}</span>
                        <span className="font-black text-white">{R(dailySpend * p.days)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min((p.days / 30) * 100, 100)}%`, background: 'linear-gradient(to right, rgba(232,177,79,0.8), rgba(232,177,79,0.4))' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: resultColor }}>{isVendas ? 'shopping_cart' : 'person_add'}</span>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{resultLabel} projetadas</p>
                </div>
                <div className="text-[9px] font-bold mb-4 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: SILVER }}>
                  {isVendas
                    ? `CTR ${P(m.ctr)} × Connect ${P(m.connectRate)} × Checkout ${P(m.checkoutRate || 0)}`
                    : `CTR ${P(m.ctr)} × Connect ${P(m.connectRate)} × Lead CV ${P(leadCV * 100)}`}
                </div>
                <div className="flex flex-col gap-4">
                  {projections.map(p => {
                    const proj = Math.round(dailyResults * p.days);
                    return (
                      <div key={p.days}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{p.label}</span>
                          <span className="font-black" style={{ color: resultColor }}>~{N(proj)} {resultLabel}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min((p.days / 30) * 100, 100)}%`, background: `linear-gradient(to right, ${resultColor}99, ${resultColor}44)` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      <CampaignPagesSection ads={campDetailAds} type={isVendas ? 'VENDAS' : 'LEADS'} />
      <CampaignAdsTable ads={campDetailAds} type={isVendas ? 'VENDAS' : 'LEADS'} onHover={openTooltip} onMove={moveTooltip} onLeave={closeTooltip} />

      {/* Tooltip */}
      {tooltipAd && tooltipPos && typeof window !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: tooltipPos.y - 12,
            left: tooltipPos.x + 20,
            width: 300,
            zIndex: 99999,
            borderRadius: 24,
            // glossy inline (without position:relative)
            background: 'linear-gradient(160deg, rgba(0,26,53,0.97) 0%, rgba(0,10,30,0.97) 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 24px 64px rgba(0,0,0,0.8)',
            overflow: 'hidden',
          }}
          className="pointer-events-auto transform -translate-y-full animate-in zoom-in-95 duration-200"
          onMouseEnter={keepTooltip} onMouseLeave={closeTooltip}>
          <div style={shine} />
          <div className="relative aspect-video rounded-t-[24px] overflow-hidden">
            {tooltipAd.thumbnailUrl
              ? <img src={tooltipAd.thumbnailUrl} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}><span className="material-symbols-outlined text-3xl" style={{ color: SILVER }}>image</span></div>}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,10,30,0.8), transparent)' }} />
            <div className="absolute bottom-3 left-4 right-4">
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: GOLD }}>Criativo</p>
              <p className="text-white font-bold text-sm truncate uppercase tracking-tight">{tooltipAd.name}</p>
            </div>
          </div>
          <div className="p-5 relative z-10">
            {tooltipAd.body
              ? <div className="rounded-xl p-3 mb-4 overflow-y-auto max-h-[100px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[11px] leading-relaxed font-medium" style={{ color: SILVER }}>{tooltipAd.body}</p>
                </div>
              : <div className="mb-4 text-center py-4 rounded-xl" style={{ border: '2px dashed rgba(255,255,255,0.1)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>Sem descrição no Meta</p>
                </div>}
            <div className="flex flex-col gap-2">
              <a href={tooltipAd.landingPageUrl || tooltipAd.instagramPermalink || tooltipAd.adsManagerLink} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 font-black uppercase tracking-[0.15em] text-[10px] py-4 rounded-xl transition-all"
                style={{ background: GOLD, color: NAVY, boxShadow: '0 4px 12px rgba(232,177,79,0.4)' }}>
                <span className="material-symbols-outlined text-[16px]">language</span>
                Página de Destino
              </a>
              <a href={tooltipAd.instagramPermalink || tooltipAd.adsManagerLink} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 font-black uppercase tracking-[0.15em] text-[10px] py-3.5 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
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
