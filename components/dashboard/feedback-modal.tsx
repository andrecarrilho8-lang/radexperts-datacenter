'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { R, N, D } from '@/app/lib/utils';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

export function FeedbackModal({ camp, ctx, onClose }: { camp: any, ctx: any, onClose: () => void }) {
  const [ads, setAds] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (camp && ctx?.dateFrom && ctx?.dateTo) {
      setLoading(true);
      fetch(`/api/meta/campaign/${camp.id}/topAds?dateFrom=${ctx.dateFrom}&dateTo=${ctx.dateTo}&objective=${camp.objective}`)
        .then(r => r.json())
        .then(d => { setAds((d.topAds || []).slice(0, 3)); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [camp, ctx?.dateFrom, ctx?.dateTo]);

  const isLeads    = camp.objective === 'LEADS';
  const resultLabel = isLeads ? 'Leads' : 'Vendas';
  const resultCount = isLeads ? (camp.leads || 0) : (camp.purchases || 0);
  const costLabel   = isLeads ? 'CPL' : 'CPA';
  const costAmount  = isLeads ? (camp.costPerLead || 0) : (camp.spend / (camp.purchases || 1));

  /* ── Copiar feedback ── */
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
        const adResults = isLeads ? (ad.leads || 0) : (ad.purchases || 0);
        const adCost    = isLeads ? (ad.cpl || 0) : (ad.cpa || 0);
        txt += `${i+1}. ${ad.name}\n`;
        txt += `   ↳ Gasto: ${R(ad.spend)} | ${resultLabel}: ${N(adResults)} | ${costLabel}: ${R(adCost)}\n`;
        if (ad.landingPageUrl) txt += `   🔗 Site: ${ad.landingPageUrl}\n`;
        if (ad.instagramPermalink) txt += `   🖼️ Criativo: ${ad.instagramPermalink}\n`;
        txt += `\n`;
      });
    }
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Salvar como imagem ── */
  const handleSaveImage = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: NAVY,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `feedback_${camp.name.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Erro ao salvar imagem:', e);
    }
    setSaving(false);
  };

  const cardBorder = 'rgba(255,255,255,0.10)';
  const adBg       = 'rgba(255,255,255,0.04)';

  return createPortal((
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ background: 'rgba(0,5,20,0.85)', backdropFilter: 'blur(12px)' }}>

      <div ref={cardRef} className="w-full max-w-xl flex flex-col rounded-[36px] overflow-hidden"
        style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.8) 100%)', border: `1px solid ${cardBorder}`, backdropFilter: 'blur(24px)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>

        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(232,177,79,0.15)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>
              <span className="material-symbols-outlined text-[24px]">chat</span>
            </div>
            <div>
              <h2 className="font-headline font-black text-2xl text-white leading-tight">Feedback de Performance</h2>
              <p className="text-[10px] uppercase font-black tracking-widest" style={{ color: SILVER }}>Inteligência Automática</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: SILVER }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = SILVER)}>
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-8 max-h-[70vh] overflow-y-auto">

          {/* Campaign info */}
          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: SILVER }}>Campanha Selecionada</p>
            <p className="font-headline font-black text-white text-lg leading-snug mb-3">{camp.name}</p>
            <span className="text-[11px] font-black px-3 py-1.5 rounded-lg inline-block"
              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
              Período: {D(ctx.dateFrom)} → {D(ctx.dateTo)}
            </span>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: 'Total Gasto', value: R(camp.spend) },
              { label: resultLabel,   value: N(resultCount) },
              { label: costLabel,     value: R(costAmount)  },
            ].map(k => (
              <div key={k.label} className="p-4 rounded-2xl" style={{ background: adBg, border: `1px solid ${cardBorder}` }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: SILVER }}>{k.label}</p>
                <p className="font-headline font-black text-xl text-white">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Ads section */}
          <div className="flex items-center gap-3 mb-5">
            <span className="material-symbols-outlined text-[20px]" style={{ color: GOLD }}>stars</span>
            <h3 className="font-black text-white text-sm uppercase tracking-widest">Melhores Criativos</h3>
            <div className="flex-1 h-px" style={{ background: 'rgba(232,177,79,0.2)' }} />
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin" style={{ borderColor: `${GOLD} transparent transparent transparent` }}/>
            </div>
          ) : ads && ads.length > 0 ? (
            <div className="flex flex-col gap-3">
              {ads.map((ad, i) => {
                const adResults = isLeads ? (ad.leads || 0) : (ad.purchases || 0);
                const adCost    = isLeads ? (ad.cpl    || 0) : (ad.cpa    || 0);
                return (
                  <div key={ad.id} className="p-4 rounded-2xl flex gap-4 items-start"
                    style={{ background: adBg, border: `1px solid ${cardBorder}` }}>

                    {/* Thumbnail */}
                    <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}` }}>
                      {ad.thumbnailUrl
                        ? <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl" style={{ color: SILVER }}>image</span>
                          </div>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xs text-white truncate uppercase tracking-tight mb-2">
                        <span className="font-black mr-2" style={{ color: GOLD }}>#{i+1}</span>
                        {ad.name}
                      </p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Gasto</p>
                          <p className="text-xs font-black text-white">{R(ad.spend)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{resultLabel}</p>
                          <p className="text-xs font-black" style={{ color: '#22c55e' }}>{N(adResults)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{costLabel}</p>
                          <p className="text-xs font-black text-white">{R(adCost)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-10 font-bold uppercase text-[10px]" style={{ color: SILVER }}>Sem dados de criativos no período.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 flex justify-between items-center gap-3" style={{ borderTop: `1px solid ${cardBorder}`, background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={onClose}
            className="px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
            style={{ color: SILVER }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = SILVER)}
          >Fechar</button>

          <div className="flex items-center gap-3">
            {/* Salvar como imagem */}
            <button onClick={handleSaveImage} disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: cardBorder, color: SILVER }}>
              <span className="material-symbols-outlined text-[16px]">{saving ? 'hourglass_empty' : 'download'}</span>
              {saving ? 'Salvando...' : 'Salvar Imagem'}
            </button>

            {/* Copiar feedback */}
            <button onClick={handleCopy}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
              style={copied
                ? { background: '#22c55e', color: '#fff' }
                : { background: `linear-gradient(135deg, ${GOLD}, #c8922a)`, color: NAVY, boxShadow: '0 4px 20px rgba(232,177,79,0.4)' }}>
              <span className="material-symbols-outlined text-[16px]">{copied ? 'done_all' : 'content_copy'}</span>
              {copied ? 'Copiado!' : 'Copiar Feedback'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
