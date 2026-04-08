'use client';

import React, { useState, useCallback } from 'react';
import { R, D } from '@/app/lib/utils';
import { TopPageCard, CustomerCard } from '@/components/ui/auth-and-cards';
import { TopAdCard } from '@/components/dashboard/campaign-details';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

const cardBorder = 'rgba(255,255,255,0.09)';

type HistTab = 'MENU' | 'ADS_VENDAS' | 'ADS_LEADS' | 'PAGES_VENDAS' | 'PAGES_LEADS' | 'EXTRATO' | 'RECORRENCIA';

const MENU_ITEMS = [
  { type: 'ADS_VENDAS',   icon: '🛒', title: 'Top Anúncios de Vendas',    sub: '10 criativos com mais volume de compras',      accent: '#22c55e' },
  { type: 'PAGES_VENDAS', icon: '🌐', title: 'Top Páginas de Vendas',      sub: '10 páginas com melhor taxa de conversão',      accent: '#22c55e' },
  { type: 'ADS_LEADS',    icon: '🎯', title: 'Top Anúncios de Captação',   sub: '10 criativos com mais geração de leads',       accent: GOLD },
  { type: 'PAGES_LEADS',  icon: '📄', title: 'Top Páginas de Captação',    sub: '10 páginas com melhor conversão de leads',     accent: GOLD },
  { type: 'EXTRATO',      icon: '📑', title: 'Extrato Mensal',             sub: 'Investimento e faturamento detalhado por mês', accent: SILVER },
  { type: 'RECORRENCIA',  icon: '💎', title: 'Clientes com maior LTV',     sub: 'Top 100 clientes por receita acumulada',       accent: '#818cf8' },
] as const;

export default function HistoricoPage() {
  const [tab, setTab]       = useState<HistTab>('MENU');
  const [data, setData]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear]     = useState('2026');
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchHistorico = useCallback((type: HistTab, force = false, targetYear?: string) => {
    if (type === 'MENU') { setData([]); setTab('MENU'); setApiError(null); return; }
    const currentYear = targetYear || year;
    setTab(type);
    setLoading(true);
    setData([]);
    setApiError(null);
    const fp = force ? '1' : '0';
    let url = `/api/meta/historico?type=${type}&force=${fp}`;
    if (type === 'EXTRATO')     url = `/api/meta/historico/mensal?year=${currentYear}&force=${fp}`;
    if (type === 'RECORRENCIA') url = `/api/historico/ltv?force=${fp}`;
    fetch(url)
      .then(r => r.json())
      .then(j => {
        setData(j.results || []);
        // Surface API-level errors as warnings
        const errs = [j.metaError, j.hotmartError, j.error].filter(Boolean);
        if (errs.length > 0) setApiError(errs.join(' | '));
        setLoading(false);
      })
      .catch(e => { setApiError(e.message); setLoading(false); });
  }, [year]);

  const tabMeta = MENU_ITEMS.find(m => m.type === tab);

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-20">
        <Navbar />
        <div className="h-[106px]" />
        <main className="px-3 sm:px-6 max-w-[1600px] mx-auto pt-4 sm:pt-10">

          {/* Page title */}
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
              <span className="material-symbols-outlined text-[26px]">history</span>
            </div>
            <div>
              <h2 className="font-headline font-black text-3xl text-white leading-none">Histórico</h2>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>Inteligência de longo prazo</p>
            </div>
          </div>

          {tab === 'MENU' ? (
            /* ── Menu inicial ── */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-20">
              {MENU_ITEMS.map(m => (
                <button key={m.type} onClick={() => fetchHistorico(m.type as HistTab)}
                  className="flex items-center gap-5 p-6 rounded-[24px] text-left transition-all group"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cardBorder}` }}
                  onMouseEnter={e => { e.currentTarget.style.border = `1px solid rgba(232,177,79,0.3)`; e.currentTarget.style.background = 'rgba(232,177,79,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.border = `1px solid ${cardBorder}`;           e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}` }}>
                    {m.icon}
                  </div>
                  <div>
                    <h3 className="font-headline font-black text-xl text-white mb-1">{m.title}</h3>
                    <p className="text-sm font-bold" style={{ color: SILVER }}>{m.sub}</p>
                  </div>
                  <span className="material-symbols-outlined ml-auto flex-shrink-0 opacity-30 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }}>arrow_forward</span>
                </button>
              ))}
            </div>
          ) : (
            /* ── Vista de dados ── */
            <div className="animate-in fade-in duration-300 pb-20">

              {/* Toolbar */}
              <div className="flex items-center justify-between mb-8 gap-4">
                <button onClick={() => setTab('MENU')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: SILVER }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = SILVER)}>
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Menu de Inteligência
                </button>

                {tab === 'EXTRATO' && (
                  <div className="flex p-1 rounded-xl border gap-1" style={{ background: 'rgba(255,255,255,0.04)', borderColor: cardBorder }}>
                    {['2025', '2026'].map(y => (
                      <button key={y} onClick={() => { setYear(y); fetchHistorico('EXTRATO', false, y); }}
                        className="px-6 py-2 rounded-lg text-xs font-black transition-all"
                        style={year === y
                          ? { background: GOLD, color: NAVY }
                          : { color: SILVER }}>
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Section card */}
              <div className="rounded-[28px] p-8 min-h-[400px]"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cardBorder}` }}>

                {/* Section header */}
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}` }}>
                    {tabMeta?.icon || '📊'}
                  </div>
                  <h3 className="font-headline font-black text-3xl text-white">
                    {tab === 'ADS_VENDAS'   && 'Top 10 Anúncios de Vendas'}
                    {tab === 'PAGES_VENDAS' && 'Top 10 Páginas de Vendas'}
                    {tab === 'ADS_LEADS'    && 'Top 10 Anúncios de Captação'}
                    {tab === 'PAGES_LEADS'  && 'Top 10 Páginas de Captação'}
                    {tab === 'EXTRATO'      && `Extrato Mensal ${year}`}
                    {tab === 'RECORRENCIA'  && 'Clientes com maior LTV'}
                  </h3>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-[3px] border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
                    <p className="font-bold uppercase tracking-widest text-[10px]" style={{ color: SILVER }}>Analisando Data Lake...</p>
                    {tab === 'EXTRATO' && (
                      <p className="text-[10px]" style={{ color: SILVER }}>Buscando Meta + Hotmart — pode levar ~30s</p>
                    )}
                  </div>
                ) : apiError && data.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-[12px] font-bold mb-4" style={{ color: '#f87171' }}>⚠ Erro ao buscar dados:</p>
                    <p className="text-[11px] font-mono mb-6 max-w-lg mx-auto" style={{ color: SILVER }}>{apiError}</p>
                    <button onClick={() => fetchHistorico(tab, true, year)}
                      className="px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest"
                      style={{ background: GOLD, color: NAVY }}>
                      Tentar novamente
                    </button>
                  </div>
                ) : data.length === 0 ? (
                  <div className="text-center py-16 flex flex-col items-center gap-4" style={{ color: SILVER }}>
                    <p className="font-bold">Nenhum dado encontrado.</p>
                    <button onClick={() => fetchHistorico(tab, true, year)}
                      className="px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>
                      ↺ Forçar Atualização
                    </button>
                    {apiError && <p className="text-[10px] font-mono" style={{ color: '#f87171' }}>{apiError}</p>}
                  </div>
                ) : (
                  <div className={`grid grid-cols-1 ${tab === 'EXTRATO' || tab === 'RECORRENCIA' ? '' : 'lg:grid-cols-2'} gap-3`}>
                    {data.map((item, i) => (
                      <RenderListItem key={i} item={item} rank={i + 1} type={tab} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </LoginWrapper>
  );
}

function RenderListItem({ item, rank, type }: any) {
  if (type === 'ADS_VENDAS' || type === 'ADS_LEADS')
    return <TopAdCard ad={item} type={type === 'ADS_VENDAS' ? 'VENDAS' : 'LEADS'} rank={rank} />;
  if (type === 'PAGES_VENDAS' || type === 'PAGES_LEADS')
    return <TopPageCard page={item} type={type === 'PAGES_VENDAS' ? 'VENDAS' : 'LEADS'} rank={rank} />;
  if (type === 'RECORRENCIA')
    return <CustomerCard customer={item} rank={rank} />;

  if (type === 'EXTRATO') {
    const months    = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const isTotals  = item.month === 0;
    const spend     = item.spend         || 0;
    const brl       = item.revenueBRL    || 0;
    const latam     = item.revenueLATAM  || 0;
    const total     = (brl + latam) || item.revenueTotal || item.hotmartRevenue || 0;
    const roas      = spend > 0 ? total / spend : null;
    const roasColor = roas === null ? SILVER : roas >= 3 ? '#4ade80' : roas >= 1.5 ? GOLD : '#f87171';
    const fmtRoas   = (v: number | null) => v === null ? '—' : `${v.toFixed(2)}×`;
    const DIV = () => <div className="hidden sm:block w-px self-stretch" style={{ background: 'rgba(255,255,255,0.08)', minHeight: 32 }} />;

    if (isTotals) {
      return (
        <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 mt-4 flex-wrap"
          style={{ background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.25)' }}>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Total do Ano</p>
            <p className="font-black text-white text-lg leading-tight">CONSOLIDADO</p>
          </div>
          <DIV />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Investimento (Meta)</p>
            <p className="font-black text-white text-lg">{spend > 0 ? R(spend) : '—'}</p>
          </div>
          <DIV />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Hotmart BRL (Líq.)</p>
            <p className="font-black text-lg" style={{ color: '#4ade80' }}>{brl > 0 ? R(brl) : '—'}</p>
          </div>
          <DIV />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Hotmart LATAM → BRL</p>
            <p className="font-black text-lg" style={{ color: '#38bdf8' }}>{latam > 0 ? R(latam) : '—'}</p>
          </div>
          <DIV />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Total Faturado</p>
            <p className="font-black text-2xl" style={{ color: '#22c55e' }}>{R(total)}</p>
          </div>
          <DIV />
          <div className="sm:text-right">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>ROAS Anual</p>
            <p className="font-black text-2xl" style={{ color: roasColor }}>{fmtRoas(roas)}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap transition-all"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
        <div style={{ minWidth: 100 }}>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Mês</p>
          <p className="font-black text-white">{months[item.month]}</p>
        </div>
        <DIV />
        <div style={{ minWidth: 110 }}>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Investimento</p>
          <p className="font-black text-sm" style={{ color: spend > 0 ? '#f87171' : SILVER }}>{spend > 0 ? R(spend) : '—'}</p>
        </div>
        <DIV />
        <div style={{ minWidth: 120 }}>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Hotmart BRL</p>
          <p className="font-black text-sm" style={{ color: brl > 0 ? '#4ade80' : SILVER }}>{brl > 0 ? R(brl) : '—'}</p>
          {item.txCountBRL > 0 && <p className="text-[9px] font-bold mt-0.5" style={{ color: SILVER }}>{item.txCountBRL}v</p>}
        </div>
        <DIV />
        <div style={{ minWidth: 120 }}>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Hotmart LATAM</p>
          <p className="font-black text-sm" style={{ color: latam > 0 ? '#38bdf8' : SILVER }}>{latam > 0 ? R(latam) : '—'}</p>
          {item.txCountLATAM > 0 && <p className="text-[9px] font-bold mt-0.5" style={{ color: SILVER }}>{item.txCountLATAM}v</p>}
        </div>
        <DIV />
        <div style={{ minWidth: 120 }}>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Total Faturado</p>
          <p className="font-black text-sm" style={{ color: total > 0 ? '#22c55e' : SILVER }}>{total > 0 ? R(total) : '—'}</p>
        </div>
        <DIV />
        <div className="sm:flex-1 sm:text-right">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>ROAS</p>
          <p className="font-black text-lg" style={{ color: roasColor }}>{fmtRoas(roas)}</p>
        </div>
      </div>
    );
  }
  return null;
}

