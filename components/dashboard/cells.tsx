import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { R, N, D, P, today } from '@/app/lib/utils';

export function RateCell({ val, thresholds, arrows }: { val: number; thresholds: [number, number]; arrows: [string, string, string] }) {
  const p = P(val);
  const color = val < thresholds[0] ? 'text-rose-600' : val < thresholds[1] ? 'text-amber-500' : 'text-emerald-500';
  const arrow = val < thresholds[0] ? arrows[0] : val < thresholds[1] ? arrows[1] : arrows[2];
  return (
    <span className={`${color} inline-flex items-center gap-1 justify-end w-full whitespace-nowrap`}>
      {p} <span className="material-symbols-outlined text-[13px] font-black">{arrow}</span>
    </span>
  );
}

export function SpendCell({ camp, ctx }: { camp: any, ctx: any }) {
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
  const avgSales = camp.purchases / daysActive;
  const avgLeads = camp.leads / daysActive;

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
        
        {isVendas && (
          <div className="flex justify-between items-center"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MÉDIA VENDAS DIÁRIAS:</span><span className="text-xs font-black text-emerald-600">{N(avgSales)}</span></div>
        )}
        
        {isLeads && (
          <div className="flex justify-between items-center"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MÉDIA LEADS DIÁRIOS:</span><span className="text-xs font-black text-blue-600">{N(avgLeads)}</span></div>
        )}

        {(isVendas || isLeads) && (
          loading ? (
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MELHOR DIA:</span><span className="w-4 h-4 border-2 border-violet-500 border-t-white rounded-full animate-spin"/></div>
          ) : data ? (
            <>
              {isVendas && (
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MELHOR DIA P/ VENDAS:</span><span className="text-xs font-black text-emerald-500">{data.bestDay || 'Sem dados'}</span></div>
              )}
              {isLeads && (
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">MELHOR DIA P/ LEADS:</span><span className="text-xs font-black text-emerald-500">{data.bestDayLeads || 'Sem dados'}</span></div>
              )}
            </>
          ) : null
        )}
      </div>
      <div className="absolute -bottom-[9px] right-6 w-[18px] h-[18px] bg-white border-b border-r border-slate-200 transform rotate-45" />
    </div>
  ) : null;

  return (
    <div className="relative inline-flex justify-end w-full group" onMouseEnter={onEnter} onMouseLeave={() => setHover(false)}>
      <span className="cursor-help border-b border-dashed border-slate-300 pb-[1px] group-hover:text-violet-600 transition-colors whitespace-nowrap">{R(camp.spend)}</span>
      {hover && typeof window !== 'undefined' ? createPortal(portalContent, document.body) : null}
    </div>
  );
}

export function FeedbackModal({ camp, ctx, onClose }: { camp: any, ctx: any, onClose: () => void }) {
  const [ads, setAds] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (camp && ctx?.dateFrom && ctx?.dateTo) {
      setLoading(true);
      fetch(`/api/meta/campaign/${camp.id}/topAds?dateFrom=${ctx.dateFrom}&dateTo=${ctx.dateTo}&objective=${camp.objective}`)
        .then(r => r.json())
        .then(d => { setAds((d.topAds || []).slice(0, 3)); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [camp, ctx?.dateFrom, ctx?.dateTo]);

  const isLeads = camp.objective === 'LEADS';
  const resultLabel = isLeads ? 'Leads' : 'Vendas';
  const resultCount = isLeads ? camp.leads : camp.purchases;
  const costLabel = isLeads ? 'Custo / Lead' : 'CPA';
  const costAmount = isLeads ? camp.costPerLead : camp.cpa;

  const handleCopy = () => {
    let txt = `📊 *FEEDBACK DA CAMPANHA*\n`;
    txt += `📍 *Campanha:* ${camp.name}\n`;
    txt += `📅 *Período:* ${D(ctx.dateFrom)} até ${D(ctx.dateTo)}\n`;
    txt += `💰 *Valor Gasto:* ${R(camp.spend)}\n`;
    txt += `🎯 *${resultLabel}:* ${N(resultCount)}\n`;
    txt += `💵 *${costLabel}:* ${R(costAmount)}\n\n`;

    if (ads && ads.length > 0) {
      txt += `🏆 *MELHORES ANÚNCIOS:*\n`;
      ads.forEach((ad, i) => {
        const adResults = isLeads ? ad.leads : ad.purchases;
        const adCost = isLeads ? ad.cpl : ad.cpa;
        const lp = ad.landingPageUrl || ad.displayUrl || ad.url;
        
        txt += `${i+1}. ${ad.name}\n`;
        txt += `   ↳ Gasto: ${R(ad.spend)} | ${resultLabel}: ${N(adResults)} | ${costLabel}: ${R(adCost)}\n`;
        if (lp) {
          txt += `   🔗 Site: ${lp}\n`;
        }
        if (ad.instagramPermalink) {
          txt += `   🖼️ Criativo: ${ad.instagramPermalink}\n`;
        }
        txt += `\n`; // blank line between ads
      });
    }

    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal((
    <div className="fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">
              <span className="material-symbols-outlined">chat</span>
            </div>
            <div>
              <h2 className="font-headline font-bold text-lg text-slate-800 leading-tight">Gerar Feedback</h2>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Resumo da Campanha</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-400 mb-1">Campanha</p>
            <p className="font-bold text-slate-800 text-base leading-tight mb-1">{camp.name}</p>
            <p className="text-[11px] font-semibold text-violet-600 bg-violet-50 inline-block px-2 py-0.5 rounded border border-violet-100">
              Período analisado: {D(ctx.dateFrom)} até {D(ctx.dateTo)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Valor Gasto</p>
              <p className="font-black text-lg text-slate-800">{R(camp.spend)}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{resultLabel}</p>
              <p className="font-black text-lg text-slate-800">{N(resultCount)}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{costLabel}</p>
              <p className="font-black text-lg text-slate-800">{R(costAmount)}</p>
            </div>
          </div>

          <div className="mb-2">
            <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500 text-[18px]">workspace_premium</span>
              Melhores Anúncios
            </h3>
            
            {loading ? (
              <div className="flex justify-center py-6">
                <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : ads && ads.length > 0 ? (
              <div className="space-y-3">
                {ads.map((ad, i) => {
                  const adResults = isLeads ? ad.leads : ad.purchases;
                  const adCost = isLeads ? ad.cpl : ad.cpa;
                  return (
                    <div key={ad.id} className="flex flex-col p-4 rounded-xl border border-slate-100 bg-white">
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <p className="font-bold text-sm text-slate-700 truncate"><span className="text-violet-500 mr-1">{i+1}.</span>{ad.name}</p>
                        {ad.instagramPermalink && (
                          <a href={ad.instagramPermalink} target="_blank" rel="noopener noreferrer" title="Ver anúncio no Instagram"
                             className="text-pink-600 hover:text-white hover:bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center w-6 h-6 rounded-md bg-pink-50 transition-all flex-shrink-0">
                            <i className="fa-brands fa-instagram text-[13px]"></i>
                          </a>
                        )}
                      </div>
                      <div className="flex gap-4">
                        <p className="text-xs"><span className="text-slate-400 font-semibold mr-1">Gasto:</span><span className="font-bold text-slate-700">{R(ad.spend)}</span></p>
                        <p className="text-xs"><span className="text-slate-400 font-semibold mr-1">{resultLabel}:</span><span className="font-bold text-slate-700">{N(adResults)}</span></p>
                        <p className="text-xs"><span className="text-slate-400 font-semibold mr-1">{costLabel}:</span><span className="font-bold text-slate-700">{R(adCost)}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-slate-100">Nenhum anúncio destacado encontrado.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-[24px]">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200 transition-colors">
            Fechar
          </button>
          <button onClick={handleCopy} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all shadow-lg ${copied ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-violet-600 shadow-violet-600/20 hover:bg-violet-700'}`}>
            <span className="material-symbols-outlined text-[18px]">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Feedback Copiado!' : 'Copiar Feedback'}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
