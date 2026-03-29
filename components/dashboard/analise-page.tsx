'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDashboard } from '@/app/lib/context';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';

/* ─── helpers ──────────────────────────────────────────────────── */
const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const N = (v: number) => v.toLocaleString('pt-BR');

function StepIndicator({ current }: { current: number }) {
  const steps = ['Produto', 'Campanhas', 'Relatório'];
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((label, i) => {
        const num   = i + 1;
        const done  = current > num;
        const active= current === num;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-all"
                style={{
                  background: done ? GOLD : active ? 'rgba(232,177,79,0.15)' : 'rgba(255,255,255,0.06)',
                  border: `2px solid ${done || active ? GOLD : 'rgba(255,255,255,0.1)'}`,
                  color: done ? '#001a35' : active ? GOLD : SILVER,
                }}>
                {done ? <span className="material-symbols-outlined text-[18px]">check</span> : num}
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: active ? GOLD : SILVER }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-3 rounded-full transition-all"
                style={{ background: done ? GOLD : 'rgba(255,255,255,0.08)', maxWidth: 80 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── STEP 1: Produto ───────────────────────────────────────────── */
function Step1({ onSelect }: { onSelect: (product: string) => void }) {
  const [products, setProducts] = useState<string[]>([]);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch('/api/hotmart/products')
      .then(r => r.json())
      .then(d => { setProducts(d.products || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => p.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-2xl font-black text-white mb-1">Selecione um Produto</h2>
      <p className="text-sm font-bold mb-6" style={{ color: SILVER }}>Os dados de vendas serão carregados para o produto selecionado.</p>

      {/* Search */}
      <div className="relative mb-4">
        <span className="material-symbols-outlined text-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm font-bold outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
        />
      </div>

      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
        {loading && <div className="text-center py-10 text-sm font-bold animate-pulse" style={{ color: SILVER }}>Carregando produtos...</div>}
        {!loading && filtered.length === 0 && <div className="text-center py-10 text-sm font-bold" style={{ color: SILVER }}>Nenhum produto encontrado.</div>}
        {filtered.map(p => (
          <button key={p} onClick={() => onSelect(p)}
            className="w-full text-left px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all group"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,177,79,0.08)'; e.currentTarget.style.borderColor = 'rgba(232,177,79,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: GOLD }}>inventory_2</span>
            <span className="flex-1 leading-snug">{p}</span>
            <span className="material-symbols-outlined text-[18px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }}>arrow_forward</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── STEP 2: Campanhas ─────────────────────────────────────────── */
function Step2({
  product,
  onConfirm,
  onBack,
}: {
  product: string;
  onConfirm: (campaigns: { id: string; name: string; spend: number; objective: string }[]) => void;
  onBack: () => void;
}) {
  const { dateFrom, dateTo } = useDashboard();
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; spend: number; objective: string }[]>([]);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetch(`/api/meta/campaigns?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(r => r.json())
      .then(d => { setCampaigns(d.campaigns || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(c => c.id)));
  const clearAll  = () => setSelected(new Set());

  const filtered = campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleConfirm = () => {
    const chosen = campaigns.filter(c => selected.has(c.id));
    onConfirm(chosen);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={onBack} className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER }}>
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Voltar
        </button>
      </div>
      <h2 className="text-2xl font-black text-white mb-1">Selecione as Campanhas</h2>
      <p className="text-sm font-bold mb-1" style={{ color: SILVER }}>
        Produto: <span style={{ color: GOLD }}>{product}</span>
      </p>
      <p className="text-xs font-bold mb-5" style={{ color: SILVER }}>Selecione quantas campanhas quiser. O investimento total será somado.</p>

      {/* Search + actions */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined text-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
          <input type="text" placeholder="Buscar campanha..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm font-bold outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
        </div>
        <button onClick={selectAll} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>Todas</button>
        <button onClick={clearAll}  className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>Limpar</button>
      </div>

      <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1 mb-5">
        {loading && <div className="text-center py-10 text-sm font-bold animate-pulse" style={{ color: SILVER }}>Carregando campanhas...</div>}
        {!loading && filtered.length === 0 && <div className="text-center py-10 text-sm font-bold" style={{ color: SILVER }}>Nenhuma campanha encontrada.</div>}
        {filtered.map(c => {
          const isSelected = selected.has(c.id);
          const isVendas   = c.objective === 'VENDAS' || c.objective === 'OUTCOME_SALES';
          return (
            <button key={c.id} onClick={() => toggle(c.id)}
              className="w-full text-left px-5 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all"
              style={{
                background: isSelected ? 'rgba(232,177,79,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSelected ? 'rgba(232,177,79,0.3)' : 'rgba(255,255,255,0.07)'}`,
                color: isSelected ? 'white' : SILVER,
              }}>
              <span className="material-symbols-outlined text-[20px]" style={{ color: isSelected ? GOLD : 'rgba(255,255,255,0.2)' }}>
                {isSelected ? 'check_box' : 'check_box_outline_blank'}
              </span>
              <span className="flex-1 leading-snug text-sm">{c.name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: isVendas ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.12)', color: isVendas ? '#22c55e' : '#fbbf24' }}>
                  {isVendas ? 'Vendas' : 'Leads'}
                </span>
                {c.spend > 0 && <span className="text-[11px] font-black" style={{ color: SILVER }}>{R(c.spend)}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: SILVER }}>
          {selected.size} campanha{selected.size !== 1 ? 's' : ''} selecionada{selected.size !== 1 ? 's' : ''}
        </span>
        <button onClick={handleConfirm}
          disabled={selected.size === 0}
          className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
          style={{
            background: selected.size > 0 ? GOLD : 'rgba(255,255,255,0.06)',
            color: selected.size > 0 ? '#001a35' : SILVER,
            cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
            opacity: selected.size > 0 ? 1 : 0.5,
          }}>
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          Confirmar
        </button>
      </div>
    </div>
  );
}

/* ─── STEP 3: Relatório ─────────────────────────────────────────── */
function Step3({
  product,
  campaigns,
  onBack,
}: {
  product: string;
  campaigns: { id: string; name: string; spend: number; objective: string }[];
  onBack: () => void;
}) {
  const { dateFrom, dateTo } = useDashboard();
  const [hotmart,   setHotmart]   = useState<{ revenue: number; purchases: number; matchedProducts: string[]; currencyBreakdown: Record<string, { count: number; originalTotal: number; convertedTotal: number }> } | null>(null);
  const [topAds,    setTopAds]    = useState<{ id: string; name: string; spend: number; purchases: number; leads: number; ctr: number; objective: string; thumbnail?: string }[]>([]);
  const [loading,   setLoading]   = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  const totalSpend    = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const revenue       = hotmart?.revenue || 0;
  const purchases     = hotmart?.purchases || 0;
  const roi           = totalSpend > 0 ? (revenue / totalSpend) : 0;
  const roas          = totalSpend > 0 ? (revenue / totalSpend) : 0;
  const cac           = purchases > 0 ? (totalSpend / purchases) : 0;
  const ticketMedio   = purchases > 0 ? (revenue / purchases) : 0;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch Hotmart for the product
        const campName = product;
        const hRes = await fetch(`/api/meta/campaign/${campaigns[0]?.id}/hotmart?dateFrom=${dateFrom}&dateTo=${dateTo}&campaignName=${encodeURIComponent(campName)}&manualProducts=${encodeURIComponent(product)}`);
        const hData = await hRes.json();
        setHotmart(hData);

        // Fetch top ads from all campaigns
        const adsResults = await Promise.all(
          campaigns.map(c =>
            fetch(`/api/meta/campaign/${c.id}/topAds?dateFrom=${dateFrom}&dateTo=${dateTo}&objective=${c.objective}`)
              .then(r => r.json())
              .then(d => (d.topAds || []).map((a: Record<string, unknown>) => ({ ...a, objective: c.objective })))
              .catch(() => [])
          )
        );
        const allAds = adsResults.flat();
        // Sort by spend desc
        allAds.sort((a, b) => (b.spend || 0) - (a.spend || 0));
        setTopAds(allAds.slice(0, 12));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [product, campaigns, dateFrom, dateTo]);

  const handlePDF = () => {
    window.print();
  };

  const vendaAds    = topAds.filter(a => a.objective === 'VENDAS' || a.objective === 'OUTCOME_SALES');
  const captacaoAds = topAds.filter(a => a.objective === 'LEADS'  || a.objective === 'OUTCOME_LEADS');
  const outrosAds   = topAds.filter(a => !vendaAds.includes(a) && !captacaoAds.includes(a));

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center justify-between mb-6 no-print">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER }}>
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Nova Análise
        </button>
        <button onClick={handlePDF}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
          style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
          Salvar PDF
        </button>
      </div>

      <div ref={reportRef}>
        {/* Header do relatório */}
        <div className="mb-8 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>Relatório de Análise de Tráfego</p>
          <h1 className="text-3xl font-black text-white">{product}</h1>
          <p className="text-sm font-bold mt-1" style={{ color: SILVER }}>
            Período: {dateFrom} → {dateTo} · {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''} analisada{campaigns.length !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <span className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
            <span className="font-bold text-sm" style={{ color: SILVER }}>Carregando dados...</span>
          </div>
        ) : (
          <>
            {/* KPIs principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Faturamento Total', value: R(revenue),         icon: 'payments',      accent: '#22c55e' },
                { label: 'Investimento Total', value: R(totalSpend),     icon: 'trending_down',  accent: '#ef4444' },
                { label: 'ROI',                value: `${(roi * 100).toFixed(1)}%`, icon: 'percent', accent: GOLD },
                { label: 'ROAS',               value: `${roas.toFixed(2)}x`,        icon: 'show_chart', accent: '#38bdf8' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-[20px] p-5 relative overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10" style={{ background: kpi.accent, transform: 'translate(30%, -30%)' }} />
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>{kpi.label}</p>
                  <p className="font-black text-2xl text-white">{kpi.value}</p>
                  <span className="material-symbols-outlined text-[28px] absolute bottom-4 right-4 opacity-20" style={{ color: kpi.accent }}>{kpi.icon}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Vendas',       value: N(purchases),  icon: 'shopping_cart', accent: '#22c55e' },
                { label: 'CAC',          value: R(cac),        icon: 'person_add',    accent: '#f97316' },
                { label: 'Ticket Médio', value: R(ticketMedio),icon: 'receipt',       accent: GOLD },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-[20px] p-5 flex items-center gap-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `rgba(${kpi.accent === GOLD ? '232,177,79' : kpi.accent === '#22c55e' ? '34,197,94' : kpi.accent === '#f97316' ? '249,115,22' : '56,189,248'},0.12)` }}>
                    <span className="material-symbols-outlined text-[22px]" style={{ color: kpi.accent }}>{kpi.icon}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: SILVER }}>{kpi.label}</p>
                    <p className="font-black text-xl text-white">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Campanhas selecionadas */}
            <div className="rounded-[20px] p-5 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: SILVER }}>
                <span className="material-symbols-outlined text-[14px]" style={{ color: GOLD }}>campaign</span>
                Campanhas Analisadas
              </p>
              <div className="flex flex-col gap-2">
                {campaigns.map(c => {
                  const isVendas = c.objective === 'VENDAS' || c.objective === 'OUTCOME_SALES';
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex-shrink-0"
                        style={{ background: isVendas ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.1)', color: isVendas ? '#22c55e' : '#fbbf24' }}>
                        {isVendas ? 'Vendas' : 'Leads'}
                      </span>
                      <span className="flex-1 text-sm font-bold text-white leading-snug">{c.name}</span>
                      <span className="text-sm font-black flex-shrink-0" style={{ color: SILVER }}>{R(c.spend || 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Breakdown por moeda */}
            {hotmart?.currencyBreakdown && Object.keys(hotmart.currencyBreakdown).length > 0 && (
              <div className="rounded-[20px] p-5 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: SILVER }}>
                  <span className="material-symbols-outlined text-[14px]" style={{ color: GOLD }}>currency_exchange</span>
                  Vendas por Moeda
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Moeda', 'Vendas', 'Original', '≈ BRL'].map(h => (
                        <th key={h} className={`pb-2 font-black text-[10px] uppercase tracking-wider ${h !== 'Moeda' ? 'text-right' : 'text-left'}`} style={{ color: SILVER }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(hotmart.currencyBreakdown).map(([cur, d]) => (
                      <tr key={cur} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="py-2.5 font-black text-white">{cur}</td>
                        <td className="py-2.5 text-right font-bold" style={{ color: SILVER }}>{d.count}</td>
                        <td className="py-2.5 text-right font-bold" style={{ color: SILVER }}>
                          {cur === 'BRL' ? R(d.originalTotal) : `${cur} ${d.originalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </td>
                        <td className="py-2.5 text-right font-black" style={{ color: GOLD }}>{R(d.convertedTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Principais Anúncios */}
            {[
              { label: 'Anúncios de Vendas',    ads: vendaAds,    accent: '#22c55e', icon: 'shopping_cart' },
              { label: 'Anúncios de Captação',  ads: captacaoAds, accent: GOLD,      icon: 'person_add' },
              { label: 'Outros Anúncios',        ads: outrosAds,   accent: SILVER,    icon: 'ads_click' },
            ].filter(g => g.ads.length > 0).map(group => (
              <div key={group.label} className="rounded-[20px] p-5 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: group.accent }}>
                  <span className="material-symbols-outlined text-[14px]">{group.icon}</span>
                  {group.label} ({group.ads.length})
                </p>
                <div className="flex flex-col gap-2">
                  {group.ads.slice(0, 5).map((ad, idx) => (
                    <div key={ad.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="text-[11px] font-black w-6 text-center" style={{ color: SILVER }}>{idx + 1}</span>
                      {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                      <span className="flex-1 text-sm font-bold text-white leading-snug truncate">{ad.name}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Gasto</p>
                          <p className="text-sm font-black" style={{ color: '#ef4444' }}>{R(ad.spend || 0)}</p>
                        </div>
                        {(ad.purchases > 0 || ad.leads > 0) && (
                          <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{ad.purchases > 0 ? 'Vendas' : 'Leads'}</p>
                            <p className="text-sm font-black" style={{ color: group.accent }}>{N(ad.purchases > 0 ? ad.purchases : ad.leads)}</p>
                          </div>
                        )}
                        {ad.ctr > 0 && (
                          <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>CTR</p>
                            <p className="text-sm font-black text-white">{ad.ctr.toFixed(2)}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {topAds.length === 0 && (
              <div className="rounded-[20px] p-8 text-center mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="material-symbols-outlined text-3xl block mb-2" style={{ color: SILVER }}>ads_click</span>
                <p className="text-sm font-bold" style={{ color: SILVER }}>Nenhum anúncio encontrado para o período selecionado.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── PAGE ──────────────────────────────────────────────────────── */
export function AnalisePage() {
  const [step,      setStep]      = useState(1);
  const [product,   setProduct]   = useState('');
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; spend: number; objective: string }[]>([]);

  const handleSelectProduct = (p: string) => { setProduct(p); setStep(2); };
  const handleConfirmCamps  = (c: typeof campaigns) => { setCampaigns(c); setStep(3); };
  const handleReset         = () => { setStep(1); setProduct(''); setCampaigns([]); };

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-10">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          * { color: black !important; border-color: #ccc !important; }
          nav, footer { display: none !important; }
        }
      `}</style>

      {/* Title */}
      <div className="mb-8 no-print">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: GOLD }}>Tráfego · Análise</p>
        <h1 className="text-4xl font-black text-white">Análise de Performance</h1>
        <p className="text-sm font-bold mt-1" style={{ color: SILVER }}>Combine dados da Hotmart com investimentos Meta Ads em 3 passos.</p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Card container */}
      <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}>
        {step === 1 && <Step1 onSelect={handleSelectProduct} />}
        {step === 2 && <Step2 product={product} onConfirm={handleConfirmCamps} onBack={() => setStep(1)} />}
        {step === 3 && <Step3 product={product} campaigns={campaigns} onBack={handleReset} />}
      </div>
    </div>
  );
}
