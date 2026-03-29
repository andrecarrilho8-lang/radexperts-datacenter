'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/app/lib/context';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const N = (v: number) => v.toLocaleString('pt-BR');

type Campaign = {
  id: string; name: string; spend: number; objective: string;
  status?: string; createdTime?: string; leads?: number; purchases?: number;
};
type HotmartData = {
  revenue: number; purchases: number; matchedProducts: string[];
  currencyBreakdown: Record<string, { count: number; originalTotal: number; convertedTotal: number }>;
};
type AdItem = {
  id: string; name: string; spend: number; purchases: number; leads: number;
  ctr: number; objective: string; thumbnail?: string; impressions?: number;
  costPerLead?: number; costPerPurchase?: number;
  connectRate?: number; checkoutRate?: number; purchaseRate?: number; conversionRate?: number;
  clicks?: number; landingPageViews?: number; checkoutInitiated?: number;
};
type SavedAnalysis = {
  id: string; savedAt: string; product: string; productId?: string;
  dateFrom: string; dateTo: string;
  campaigns: Campaign[]; revenue: number; purchases: number; totalSpend: number;
  totalLeads: number; leadSpend: number; topAds?: AdItem[];
};
type ProductItem = { id: string | number; name: string };

function daysActive(createdTime?: string): number {
  if (!createdTime) return 0;
  const from = new Date(createdTime);
  const now  = new Date();
  return Math.max(0, Math.round((now.getTime() - from.getTime()) / 86400000));
}

/* ─── Step Indicator ──────────────────────────────────────────────── */
function StepIndicator({ current }: { current: number }) {
  const steps = ['Produto', 'Campanhas', 'Relatório'];
  return (
    <div className="flex items-center mb-10">
      {steps.map((label, i) => {
        const n = i + 1; const done = current > n; const active = current === n;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-all"
                style={{ background: done ? GOLD : active ? 'rgba(232,177,79,0.15)' : 'rgba(255,255,255,0.06)', border: `2px solid ${done || active ? GOLD : 'rgba(255,255,255,0.1)'}`, color: done ? NAVY : active ? GOLD : SILVER }}>
                {done ? <span className="material-symbols-outlined text-[18px]">check</span> : n}
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: active ? GOLD : SILVER }}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className="flex-1 h-[2px] mx-3 rounded-full" style={{ background: done ? GOLD : 'rgba(255,255,255,0.08)', maxWidth: 80 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── STEP 1 ──────────────────────────────────────────────────────── */
function Step1({ onSelect }: { onSelect: (p: ProductItem) => void }) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/hotmart/products').then(r => r.json())
      .then(d => {
        // productMap traz [{id, name}]; fallback para lista simples
        const map: ProductItem[] = d.productMap || (d.products || []).map((name: string) => ({ id: '', name }));
        setProducts(map);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-2xl font-black text-white mb-1">Selecione um Produto</h2>
      <p className="text-sm font-bold mb-6" style={{ color: SILVER }}>Os dados de vendas da Hotmart serão carregados para o produto selecionado.</p>
      <div className="relative mb-4">
        <span className="material-symbols-outlined text-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
        <input type="text" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm font-bold outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
      </div>
      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
        {loading && <div className="py-10 text-center text-sm font-bold animate-pulse" style={{ color: SILVER }}>Carregando produtos...</div>}
        {!loading && filtered.length === 0 && <div className="py-10 text-center text-sm font-bold" style={{ color: SILVER }}>Nenhum produto encontrado.</div>}
        {filtered.map(p => (
          <button key={p.name} onClick={() => onSelect(p)}
            className="w-full text-left px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all group"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,177,79,0.08)'; e.currentTarget.style.borderColor = 'rgba(232,177,79,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: GOLD }}>inventory_2</span>
            <span className="flex-1 leading-snug">{p.name}</span>
            <span className="material-symbols-outlined text-[18px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }}>arrow_forward</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── STEP 2 ──────────────────────────────────────────────────────── */
function Step2({ product, onConfirm, onBack }: { product: string; onConfirm: (c: Campaign[]) => void; onBack: () => void }) {
  const { dateFrom, dateTo } = useDashboard();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch(`/api/meta?dateFrom=${dateFrom}&dateTo=${dateTo}`).then(r => r.json())
      .then(d => { setCampaigns(d.tableData || []); setLoading(false); }).catch(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const toggle   = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filtered = campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: SILVER }}>
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>Voltar
      </button>
      <h2 className="text-2xl font-black text-white mb-1">Selecione as Campanhas</h2>
      <p className="text-sm font-bold mb-1" style={{ color: SILVER }}>Produto: <span style={{ color: GOLD }}>{product}</span></p>
      <p className="text-xs font-bold mb-5" style={{ color: SILVER }}>Selecione quantas quiser — o investimento total será somado.</p>

      {/* Search + actions */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <span className="material-symbols-outlined text-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
          <input type="text" placeholder="Buscar campanha..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm font-bold outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
        </div>
        <button onClick={() => setSelected(new Set(filtered.map(c => c.id)))}
          className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>Todas</button>
        <button onClick={() => setSelected(new Set())}
          className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>Limpar</button>
      </div>

      {/* Table */}
      <div className="rounded-[20px] overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="grid px-4 py-3" style={{ gridTemplateColumns: '40px 1fr 90px 90px 80px 130px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Nome da Campanha</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: SILVER }}>Tipo</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: SILVER }}>Status</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Dias no Ar</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Investimento</span>
        </div>

        {loading && (
          <div className="py-12 text-center text-sm font-bold animate-pulse" style={{ color: SILVER, background: 'rgba(255,255,255,0.02)' }}>Carregando campanhas...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm font-bold" style={{ color: SILVER, background: 'rgba(255,255,255,0.02)' }}>Nenhuma campanha encontrada.</div>
        )}

        {filtered.map((c, i) => {
          const isSel   = selected.has(c.id);
          const isVenda = c.objective === 'VENDAS';
          const active  = c.status === 'ACTIVE';
          const days    = daysActive(c.createdTime);
          const isLast  = i === filtered.length - 1;
          return (
            <button key={c.id} onClick={() => toggle(c.id)}
              className="w-full grid px-4 py-3.5 items-center text-left transition-all"
              style={{
                gridTemplateColumns: '40px 1fr 90px 90px 80px 130px',
                background: isSel ? 'rgba(232,177,79,0.07)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
              }}>
              <span className="flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]" style={{ color: isSel ? GOLD : 'rgba(255,255,255,0.2)' }}>
                  {isSel ? 'check_box' : 'check_box_outline_blank'}
                </span>
              </span>
              <span className="text-[13px] font-bold leading-snug pr-4 text-left" style={{ color: isSel ? 'white' : SILVER }}>
                {c.name}
              </span>
              <span className="flex justify-center">
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg"
                  style={{ background: isVenda ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.1)', color: isVenda ? '#22c55e' : '#fbbf24' }}>
                  {isVenda ? 'Vendas' : 'Leads'}
                </span>
              </span>
              <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold" style={{ color: active ? '#22c55e' : '#ef4444' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? '#22c55e' : '#ef4444' }} />
                {active ? 'Ativa' : 'Pausada'}
              </span>
              <span className="text-right text-[13px] font-bold" style={{ color: SILVER }}>{days > 0 ? `${days}d` : '—'}</span>
              <span className="text-right text-[13px] font-black" style={{ color: isSel ? GOLD : 'white' }}>{c.spend > 0 ? R(c.spend) : '—'}</span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold" style={{ color: SILVER }}>{selected.size} campanha{selected.size !== 1 ? 's' : ''} selecionada{selected.size !== 1 ? 's' : ''}</span>
          {selected.size > 0 && (
            <span className="text-sm font-black" style={{ color: GOLD }}>
              Total: {R(campaigns.filter(c => selected.has(c.id)).reduce((s, c) => s + (c.spend || 0), 0))}
            </span>
          )}
        </div>
        <button onClick={() => onConfirm(campaigns.filter(c => selected.has(c.id)))} disabled={selected.size === 0}
          className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
          style={{ background: selected.size > 0 ? GOLD : 'rgba(255,255,255,0.06)', color: selected.size > 0 ? NAVY : SILVER, opacity: selected.size > 0 ? 1 : 0.5, cursor: selected.size > 0 ? 'pointer' : 'not-allowed' }}>
          <span className="material-symbols-outlined text-[18px]">check_circle</span>Confirmar
        </button>
      </div>
    </div>
  );
}

/* ─── Ad Row ──────────────────────────────────────────────────────── */
function AdRow({ ad, idx, accent, showLeads }: { ad: AdItem; idx: number; accent: string; showLeads?: boolean }) {
  const hasRates = !showLeads && (ad.connectRate || ad.checkoutRate || ad.purchaseRate);
  const hasCaptRates = showLeads && (ad.connectRate || ad.conversionRate);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
      {/* Main row */}
      <div className="grid items-center" style={{ gridTemplateColumns: '28px 44px 1fr 130px 100px 80px', padding: '10px 20px' }}>
        <span className="text-[11px] font-black" style={{ color: SILVER }}>{idx + 1}</span>
        {ad.thumbnail
          ? <img src={ad.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover" />
          : <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <span className="material-symbols-outlined text-[14px]" style={{ color: SILVER }}>image</span>
            </div>}
        <span className="text-[13px] font-bold text-white leading-snug truncate px-3">{ad.name}</span>
        <span className="text-right text-[13px] font-black" style={{ color: '#ef4444' }}>{R(ad.spend || 0)}</span>
        <span className="text-right text-[13px] font-black" style={{ color: accent }}>
          {showLeads ? (ad.leads > 0 ? N(ad.leads) : '—') : (ad.purchases > 0 ? N(ad.purchases) : '—')}
        </span>
        <span className="text-right text-[13px] font-black" style={{ color: 'white' }}>{ad.ctr > 0 ? `${ad.ctr.toFixed(2)}%` : '—'}</span>
      </div>
      {/* Rate metrics sub-row */}
      {(hasRates || hasCaptRates) && (
        <div className="flex items-center gap-6 px-5 pb-2.5" style={{ paddingLeft: 92 }}>
          {!showLeads && ad.connectRate != null && ad.connectRate > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: SILVER }}>Connect Rate</span>
              <span className="text-[11px] font-black" style={{ color: GOLD }}>{ad.connectRate.toFixed(1)}%</span>
            </div>
          )}
          {!showLeads && ad.checkoutRate != null && ad.checkoutRate > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: SILVER }}>Checkout Rate</span>
              <span className="text-[11px] font-black" style={{ color: '#38bdf8' }}>{ad.checkoutRate.toFixed(1)}%</span>
            </div>
          )}
          {!showLeads && ad.purchaseRate != null && ad.purchaseRate > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: SILVER }}>Purchase Rate</span>
              <span className="text-[11px] font-black" style={{ color: '#22c55e' }}>{ad.purchaseRate.toFixed(1)}%</span>
            </div>
          )}
          {showLeads && ad.connectRate != null && ad.connectRate > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: SILVER }}>Connect Rate</span>
              <span className="text-[11px] font-black" style={{ color: GOLD }}>{ad.connectRate.toFixed(1)}%</span>
            </div>
          )}
          {showLeads && ad.conversionRate != null && ad.conversionRate > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: SILVER }}>Taxa de Conversão</span>
              <span className="text-[11px] font-black" style={{ color: '#22c55e' }}>{ad.conversionRate.toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdTable({ group }: { group: { label: string; ads: AdItem[]; accent: string; icon: string; border: string; bg: string; showLeads?: boolean } }) {
  const showLeads = group.showLeads || false;
  return (
    <div className="rounded-[20px] overflow-hidden mb-4" style={{ border: `1px solid ${group.border}` }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ background: group.bg, borderBottom: `1px solid ${group.border}` }}>
        <span className="material-symbols-outlined text-[14px]" style={{ color: group.accent }}>{group.icon}</span>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: group.accent }}>{group.label} ({group.ads.length})</p>
      </div>
      <div className="grid px-5 py-2.5" style={{ gridTemplateColumns: '28px 44px 1fr 130px 100px 80px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Nº',              align: 'text-left'  },
          { label: '',                align: 'text-left'  },
          { label: 'Nome do Anúncio', align: 'text-left pl-3' },
          { label: 'Investimento',    align: 'text-right' },
          { label: showLeads ? 'Leads' : 'Vendas', align: 'text-right' },
          { label: 'CTR',             align: 'text-right' },
        ].map((h, i) => (
          <span key={i} className={`text-[10px] font-black uppercase tracking-widest ${h.align}`} style={{ color: SILVER }}>{h.label}</span>
        ))}
      </div>
      {group.ads.slice(0, 10).map((ad, idx) => <AdRow key={ad.id} ad={ad} idx={idx} accent={group.accent} showLeads={showLeads} />)}
    </div>
  );
}

/* ─── STEP 3 ──────────────────────────────────────────────────────── */
function Step3({ product, productId, campaigns, onBack, onSave }: {
  product: string; productId?: string; campaigns: Campaign[];
  onBack: () => void; onSave: (a: SavedAnalysis) => void;
}) {
  const { dateFrom: ctxFrom, dateTo: ctxTo } = useDashboard();
  // Permite alterar o período localmente sem afetar o restante do dashboard
  const [localFrom, setLocalFrom] = useState(ctxFrom);
  const [localTo,   setLocalTo]   = useState(ctxTo);
  const [showPeriod, setShowPeriod] = useState(false);
  const dateFrom = localFrom;
  const dateTo   = localTo;

  const [hotmart,  setHotmart]  = useState<HotmartData | null>(null);
  const [topAds,   setTopAds]   = useState<AdItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saved,    setSaved]    = useState(false);

  const vendaCamps   = campaigns.filter(c => c.objective === 'VENDAS');
  const leadCamps    = campaigns.filter(c => c.objective === 'LEADS');
  const totalSpend   = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const leadSpend    = leadCamps.reduce((s, c) => s + (c.spend || 0), 0);
  const revenue      = hotmart?.revenue || 0;
  const purchases    = hotmart?.purchases || 0;
  const totalLeads   = campaigns.reduce((s, c) => s + (c.leads || 0), 0);
  const roas         = totalSpend > 0 ? revenue / totalSpend : 0;
  const cac          = purchases > 0 ? totalSpend / purchases : 0;
  const ticketMedio  = purchases > 0 ? revenue / purchases : 0;
  const cpl          = totalLeads > 0 ? leadSpend / totalLeads : 0;

  const fmtDate = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${parseInt(day)} / ${months[parseInt(m)-1]} ${y}`;
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo, product, ...(productId ? { productId } : {}) });
        const hRes = await fetch(`/api/hotmart/sales-by-product?${params}`);
        setHotmart(await hRes.json());

        const adsAll = (await Promise.all(campaigns.map(c =>
          fetch(`/api/meta/campaign/${c.id}/topAds?dateFrom=${dateFrom}&dateTo=${dateTo}&objective=${c.objective}`)
            .then(r => r.json()).then(d => (d.topAds || []).map((a: AdItem) => ({ ...a, objective: c.objective }))).catch(() => [])
        ))).flat();
        adsAll.sort((a, b) => (b.spend || 0) - (a.spend || 0));
        setTopAds(adsAll.slice(0, 20));
      } finally { setLoading(false); }
    }
    load();
  }, [product, productId, campaigns, dateFrom, dateTo]);

  const vendaAds    = topAds.filter(a => a.objective === 'VENDAS');
  const captacaoAds = topAds.filter(a => a.objective === 'LEADS');
  const outrosAds   = topAds.filter(a => a.objective !== 'VENDAS' && a.objective !== 'LEADS');

  const handleSave = () => {
    const entry: SavedAnalysis = {
      id: Date.now().toString(), savedAt: new Date().toISOString(),
      product, productId, dateFrom, dateTo, campaigns, revenue, purchases,
      totalSpend, totalLeads, leadSpend, topAds,
    };
    onSave(entry);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const glossy: React.CSSProperties = {
    position: 'relative', overflow: 'hidden',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  };

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display:none!important; }
          nav, footer { display:none!important; }
          body { background: white!important; color: black!important; }
          * { -webkit-print-color-adjust: exact!important; print-color-adjust: exact!important; }
          .print-page { page-break-inside: avoid; }
        }
      `}</style>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6 no-print gap-3 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}>
          <span className="material-symbols-outlined text-[16px]">refresh</span>Nova Análise
        </button>

        {/* Seletor de período */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPeriod(p => !p)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
            style={{ background: showPeriod ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showPeriod ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.1)'}`, color: showPeriod ? '#38bdf8' : SILVER }}>
            <span className="material-symbols-outlined text-[16px]">date_range</span>
            {fmtDate(dateFrom)} → {fmtDate(dateTo)}
          </button>
          {showPeriod && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl" style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)' }}>
              <input type="date" value={localFrom} onChange={e => setLocalFrom(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }} />
              <span style={{ color: SILVER }} className="text-[11px]">até</span>
              <input type="date" value={localTo} onChange={e => setLocalTo(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
            style={{ background: saved ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)'}`, color: saved ? '#22c55e' : SILVER }}>
            <span className="material-symbols-outlined text-[18px]">{saved ? 'check_circle' : 'bookmark_add'}</span>
            {saved ? 'Salvo!' : 'Salvar Análise'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
            style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>Salvar PDF
          </button>
        </div>
      </div>

      {/* Report header */}
      <div className="mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>Relatório de Análise de Tráfego</p>
        <h1 className="text-3xl font-black text-white">{product}</h1>
        <p className="text-sm font-bold mt-1" style={{ color: SILVER }}>
          {dateFrom} → {dateTo} · {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''} analisada{campaigns.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <span className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
          <span className="font-bold text-sm" style={{ color: SILVER }}>Carregando dados...</span>
        </div>
      ) : (
        <>
          {/* ── Hotmart Revenue Box (mesmo estilo da página de campanhas) ── */}
          <div className="rounded-[28px] mb-6 relative overflow-hidden"
            style={{ ...glossy, padding: '28px', background: 'linear-gradient(160deg, rgba(232,120,13,0.12) 0%, rgba(0,10,30,0.6) 100%)', border: '1px solid rgba(232,120,13,0.28)' }}>
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5" style={{ background: '#E8380D', transform: 'translate(30%, -30%)' }} />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-5">
                <svg width="32" height="38" viewBox="0 0 100 120" fill="none"><path d="M50 0C50 0 85 28 85 62C85 81.8 69.3 98 50 98C30.7 98 15 81.8 15 62C15 28 50 0 50 0Z" fill="#E8380D"/><circle cx="50" cy="72" r="18" fill="white"/></svg>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Hotmart — Faturamento do Produto</p>
                  <p className="text-4xl font-black text-white">{R(revenue)}</p>
                  <p className="text-[9px] font-bold mt-1" style={{ color: 'rgba(251,191,36,0.65)' }}>⚠ Valor bruto · pré-taxas Hotmart</p>
                  {hotmart?.matchedProducts && hotmart.matchedProducts.length > 0 && (
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{hotmart.matchedProducts.join(', ')}</p>
                  )}
                </div>
              </div>

              {/* KPIs em linha */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-[16px] p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: SILVER }}>Vendas (Hotmart)</p>
                  <p className="text-2xl font-black text-white">{N(purchases)}</p>
                  <p className="text-[9px] font-bold mt-0.5" style={{ color: SILVER }}>transações confirmadas</p>
                </div>
                <div className="rounded-[16px] p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: SILVER }}>Investimento Total</p>
                  <p className="text-2xl font-black" style={{ color: '#ef4444' }}>{R(totalSpend)}</p>
                  <p className="text-[9px] font-bold mt-0.5" style={{ color: SILVER }}>meta ads</p>
                </div>
                <div className="rounded-[16px] p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: SILVER }}>ROAS</p>
                  <p className="text-2xl font-black" style={{ color: roas >= 1 ? '#22c55e' : '#ef4444' }}>{roas.toFixed(2)}x</p>
                  <p className="text-[9px] font-bold mt-0.5" style={{ color: SILVER }}>retorno sobre investimento</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Métricas: CAC, Ticket, Leads ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'CAC', value: cac > 0 ? R(cac) : '—', icon: 'person_add', accent: '#f97316', sub: 'custo por venda' },
              { label: 'Ticket Médio', value: ticketMedio > 0 ? R(ticketMedio) : '—', icon: 'receipt', accent: GOLD, sub: 'valor médio por venda' },
              { label: 'Leads Captados', value: totalLeads > 0 ? N(totalLeads) : '—', icon: 'group_add', accent: '#38bdf8', sub: `${leadCamps.length} campanha${leadCamps.length !== 1 ? 's' : ''} de captação` },
              { label: 'Custo por Lead', value: cpl > 0 ? R(cpl) : leadCamps.length === 0 ? 'Sem captação' : '—', icon: 'paid', accent: '#a78bfa', sub: leadCamps.length > 0 ? 'investimento em leads' : 'nenhuma campanha de leads' },
            ].map(k => (
              <div key={k.label} className="rounded-[20px] p-4 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', opacity: k.value === 'Sem captação' ? 0.45 : 1 }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `rgba(${k.accent === GOLD ? '232,177,79' : k.accent === '#22c55e' ? '34,197,94' : k.accent === '#f97316' ? '249,115,22' : k.accent === '#38bdf8' ? '56,189,248' : '167,139,250'},0.12)` }}>
                  <span className="material-symbols-outlined text-[20px]" style={{ color: k.accent }}>{k.icon}</span>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{k.label}</p>
                  <p className="font-black text-xl text-white">{k.value}</p>
                  <p className="text-[9px] font-bold" style={{ color: SILVER }}>{k.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Breakdown por moeda ── */}
          {hotmart?.currencyBreakdown && Object.keys(hotmart.currencyBreakdown).length > 0 && (
            <div className="rounded-[20px] p-5 mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: SILVER }}>
                <span className="material-symbols-outlined text-[14px]" style={{ color: GOLD }}>currency_exchange</span>Vendas por Moeda
              </p>
              <table className="w-full text-sm">
                <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Moeda','Vendas','Valor Original','≈ BRL'].map(h => (
                    <th key={h} className={`pb-2 font-black text-[10px] uppercase tracking-wider ${h !== 'Moeda' ? 'text-right' : 'text-left'}`} style={{ color: SILVER }}>{h}</th>
                  ))}
                </tr></thead>
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

          {/* ── Campanhas ── */}
          <div className="rounded-[20px] overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {/* Header */}
            <div className="grid px-5 py-3" style={{ gridTemplateColumns: '1fr 100px 80px 130px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { label: 'Nome da Campanha',  align: 'text-left'  },
                { label: 'Status',            align: 'text-center'},
                { label: 'Dias no Ar',        align: 'text-right' },
                { label: 'Investimento',      align: 'text-right' },
              ].map(h => (
                <span key={h.label} className={`text-[10px] font-black uppercase tracking-widest ${h.align}`} style={{ color: SILVER }}>{h.label}</span>
              ))}
            </div>
            {campaigns.map((c, i) => {
              const isVenda = c.objective === 'VENDAS';
              const active  = c.status === 'ACTIVE';
              const days    = daysActive(c.createdTime);
              const dateStr = c.createdTime
                ? new Date(c.createdTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
              return (
                <div key={c.id} className="grid px-5 items-center print-page"
                style={{ gridTemplateColumns: '1fr 100px 80px 130px', padding: '12px 20px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: i < campaigns.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div className="pr-4">
                  <p className="text-[13px] font-bold text-white leading-snug">{c.name}</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>Início: {fmtDate(c.createdTime ? c.createdTime.split('T')[0] : '')}</p>
                </div>
                <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold" style={{ color: active ? '#22c55e' : '#ef4444' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#22c55e' : '#ef4444' }} />
                  {active ? 'Ativa' : 'Pausada'}
                </span>
                <span className="text-right text-[13px] font-bold" style={{ color: SILVER }}>{days > 0 ? `${days}d` : '—'}</span>
                <span className="text-right text-[14px] font-black" style={{ color: 'white' }}>{R(c.spend || 0)}</span>
              </div>
              );
            })}
            <div className="flex justify-between items-center px-5 py-3" style={{ background: 'rgba(255,255,255,0.04)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}</span>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Total Investido</p>
                <p className="text-lg font-black" style={{ color: '#ef4444' }}>{R(totalSpend)}</p>
              </div>
            </div>
          </div>

          {/* ── Anúncios ── */}
          {[
            { label: 'Anúncios de Vendas',   ads: vendaAds,    accent: '#22c55e', icon: 'shopping_cart', border: 'rgba(34,197,94,0.18)',   bg: 'rgba(34,197,94,0.05)',  showLeads: false },
            { label: 'Anúncios de Captação', ads: captacaoAds, accent: GOLD,      icon: 'person_add',   border: 'rgba(232,177,79,0.18)', bg: 'rgba(232,177,79,0.04)', showLeads: true  },
            ...(outrosAds.length > 0 ? [{ label: 'Outros Anúncios', ads: outrosAds, accent: SILVER, icon: 'ads_click', border: 'rgba(255,255,255,0.07)', bg: 'rgba(255,255,255,0.03)', showLeads: false }] : []),
          ].filter(g => g.ads.length > 0).map(group => (
            <AdTable key={group.label} group={group} />
          ))}

          {topAds.length === 0 && (
            <div className="rounded-[20px] p-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="material-symbols-outlined text-3xl block mb-2" style={{ color: SILVER }}>ads_click</span>
              <p className="text-sm font-bold" style={{ color: SILVER }}>Nenhum anúncio encontrado para o período.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Saved Analyses List ─────────────────────────────────────────── */
function SavedAnalysesList({ analyses, onDelete }: { analyses: SavedAnalysis[]; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (analyses.length === 0) return null;

  const fmtDate = (d: string) => {
    if (!d) return d;
    const [y, m, day] = d.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${parseInt(day)} / ${months[parseInt(m)-1]} ${y}`;
  };

  return (
    <div className="mt-8">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 flex items-center gap-2" style={{ color: GOLD }}>
        <span className="material-symbols-outlined text-[14px]">bookmarks</span>Análises Salvas ({analyses.length})
      </p>
      <div className="flex flex-col gap-3">
        {analyses.map(a => {
          const isOpen = expanded === a.id;
          return (
            <div key={a.id} className="rounded-[20px] overflow-hidden transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isOpen ? 'rgba(232,177,79,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
              {/* Header */}
              <div className="px-5 py-4 flex items-center gap-4 cursor-pointer select-none"
                onClick={() => setExpanded(isOpen ? null : a.id)}>
                <span className="material-symbols-outlined text-[20px] transition-transform flex-shrink-0"
                  style={{ color: GOLD, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-[14px] truncate">{a.product}</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>
                    {fmtDate(a.dateFrom)} → {fmtDate(a.dateTo)} · {a.campaigns.length} campanha{a.campaigns.length !== 1 ? 's' : ''} · salvo em {new Date(a.savedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Faturamento</p>
                    <p className="text-[14px] font-black" style={{ color: '#22c55e' }}>{R(a.revenue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>ROAS</p>
                    <p className="text-[14px] font-black" style={{ color: a.totalSpend > 0 ? (a.revenue / a.totalSpend >= 1 ? '#22c55e' : '#ef4444') : SILVER }}>
                      {a.totalSpend > 0 ? `${(a.revenue / a.totalSpend).toFixed(2)}x` : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Investimento</p>
                    <p className="text-[14px] font-black" style={{ color: '#ef4444' }}>{R(a.totalSpend)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onDelete(a.id); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>

              {/* Expandável */}
              {isOpen && (
                <div className="border-t px-5 pb-5" style={{ borderColor: 'rgba(255,255,255,0.08)', paddingTop: 16 }}>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Vendas (Hotmart)', value: a.purchases > 0 ? N(a.purchases) : '—', color: '#22c55e' },
                      { label: 'Total Leads', value: a.totalLeads > 0 ? N(a.totalLeads) : '—', color: GOLD },
                      { label: 'CAC', value: a.purchases > 0 ? R(a.totalSpend / a.purchases) : '—', color: '#38bdf8' },
                      { label: 'Ticket Médio', value: a.purchases > 0 ? R(a.revenue / a.purchases) : '—', color: 'white' },
                    ].map(k => (
                      <div key={k.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: SILVER }}>{k.label}</p>
                        <p className="text-[15px] font-black" style={{ color: k.color }}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Campanhas */}
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>Campanhas</p>
                  <div className="flex flex-col gap-1">
                    {a.campaigns.map(c => (
                      <div key={c.id} className="flex justify-between items-center px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <span className="text-[12px] font-bold text-white truncate flex-1 pr-4">{c.name}</span>
                        <span className="text-[11px] font-black flex-shrink-0" style={{ color: GOLD }}>{R(c.spend || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── PAGE ────────────────────────────────────────────────────────── */
export function AnalisePage() {
  const [step,       setStep]       = useState(1);
  const [product,    setProduct]    = useState('');
  const [productId,  setProductId]  = useState<string | undefined>(undefined);
  const [campaigns,  setCampaigns]  = useState<Campaign[]>([]);
  const [saved,      setSaved]      = useState<SavedAnalysis[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('radexperts_analyses') || '[]'); } catch { return []; }
  });

  const handleSave = (a: SavedAnalysis) => {
    const next = [a, ...saved];
    setSaved(next);
    localStorage.setItem('radexperts_analyses', JSON.stringify(next));
  };
  const handleDelete = (id: string) => {
    const next = saved.filter(a => a.id !== id);
    setSaved(next);
    localStorage.setItem('radexperts_analyses', JSON.stringify(next));
  };
  const handleReset = () => { setStep(1); setProduct(''); setProductId(undefined); setCampaigns([]); };

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-10">
      <div className="mb-8 no-print">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: GOLD }}>Tráfego · Análise</p>
        <h1 className="text-4xl font-black text-white">Análise de Performance</h1>
        <p className="text-sm font-bold mt-1" style={{ color: SILVER }}>Combine dados da Hotmart com investimentos Meta Ads em 3 passos.</p>
      </div>

      <StepIndicator current={step} />

      <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}>
        {step === 1 && <Step1 onSelect={p => { setProduct(p.name); setProductId(p.id ? String(p.id) : undefined); setStep(2); }} />}
        {step === 2 && <Step2 product={product} onConfirm={c => { setCampaigns(c); setStep(3); }} onBack={() => setStep(1)} />}
        {step === 3 && <Step3 product={product} productId={productId} campaigns={campaigns} onBack={handleReset} onSave={handleSave} />}
      </div>

      {/* Saved analyses — below the wizard */}
      <SavedAnalysesList analyses={saved} onDelete={handleDelete} />
    </div>
  );
}
