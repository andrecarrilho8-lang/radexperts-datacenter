'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { R, N, D } from '@/app/lib/utils';

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
  const costLabel = isLeads ? 'CPL' : 'CPA';
  const costAmount = isLeads ? camp.costPerLead : (camp.spend / (camp.purchases || 1));

  const handleCopy = () => {
    let txt = `📊 *FEEDBACK DA CAMPANHA*\n`;
    txt += `📍 *Campanha:* ${camp.name}\n`;
    txt += `📅 *Período:* ${D(ctx.dateFrom)} até ${D(ctx.dateTo)}\n`;
    txt += `💰 *Valor Gasto:* ${R(camp.spend)}\n`;
    txt += `🎯 *${resultLabel}:* ${N(resultCount)}\n`;
    txt += `💸 *${costLabel}:* ${R(costAmount)}\n\n`;

    if (ads && ads.length > 0) {
      txt += `🏆 *MELHORES ANÚNCIOS:*\n`;
      ads.forEach((ad, i) => {
        const adResults = isLeads ? ad.leads : ad.purchases;
        const adCost = isLeads ? ad.cpl : ad.cpa;
        const lp = ad.landingPageUrl || ad.displayUrl || ad.url;
        
        txt += `${i+1}. ${ad.name}\n`;
        txt += `   ↳ Gasto: ${R(ad.spend)} | ${resultLabel}: ${N(adResults)} | ${costLabel}: ${R(adCost)}\n`;
        if (lp) txt += `   🔗 Site: ${lp}\n`;
        if (ad.instagramPermalink) txt += `   🖼️ Criativo: ${ad.instagramPermalink}\n`;
        txt += `\n`;
      });
    }

    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal((
    <div className="fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-white/20">
        <div className="px-10 py-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-200">
              <span className="material-symbols-outlined">chat</span>
            </div>
            <div>
              <h2 className="font-headline font-black text-2xl text-slate-800 leading-tight">Feedback de Performance</h2>
              <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Inteligência Automática</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all shadow-sm">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="p-10">
          <div className="mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Campanha Selecionada</p>
            <p className="font-headline font-black text-slate-800 text-xl leading-snug mb-2">{camp.name}</p>
            <p className="text-[11px] font-black text-violet-600 bg-violet-50 inline-block px-3 py-1.5 rounded-lg border border-violet-100">
              Período: {D(ctx.dateFrom)} → {D(ctx.dateTo)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Total Gasto</p>
              <p className="font-black text-lg text-slate-800">{R(camp.spend)}</p>
            </div>
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{resultLabel}</p>
              <p className="font-black text-lg text-slate-800">{N(resultCount)}</p>
            </div>
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{costLabel}</p>
              <p className="font-black text-lg text-slate-800">{R(costAmount)}</p>
            </div>
          </div>

          <h3 className="font-black text-sm text-slate-800 mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-500">stars</span>
            Melhores Criativos (Destaques)
          </h3>
          
          {loading ? (
             <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : ads && ads.length > 0 ? (
            <div className="space-y-4">
              {ads.map((ad, i) => (
                <div key={ad.id} className="p-5 rounded-3xl border border-slate-100 bg-slate-50 group hover:border-violet-200 transition-all">
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <p className="font-black text-sm text-slate-800 truncate uppercase tracking-tight"><span className="text-violet-500 mr-2">#{i+1}</span>{ad.name}</p>
                  </div>
                  <div className="flex gap-6">
                    <p className="text-[11px] font-bold"><span className="text-slate-400 uppercase mr-1">Gasto:</span>{R(ad.spend)}</p>
                    <p className="text-[11px] font-bold"><span className="text-slate-400 uppercase mr-1">{resultLabel}:</span>{N(isLeads ? ad.leads : ad.purchases)}</p>
                    <p className="text-[11px] font-bold"><span className="text-slate-400 uppercase mr-1">ROI:</span>{(ad.spend > 0 ? (ad.revenue / ad.spend) : 0).toFixed(2)}x</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-center py-10 text-slate-400 font-bold uppercase text-[10px]">Sem dados de criativos no período.</p>}
        </div>

        <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 rounded-b-[48px]">
          <button onClick={onClose} className="px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-white transition-all">Fechar</button>
          <button onClick={handleCopy} className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white transition-all shadow-xl ${copied ? 'bg-emerald-500' : 'bg-slate-900 hover:scale-105 active:scale-95'}`}>
            <span className="material-symbols-outlined text-[18px]">{copied ? 'done_all' : 'content_copy'}</span>
            {copied ? 'Feedback Copiado!' : 'Copiar Feedback'}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
