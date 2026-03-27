import React from 'react';
import { R, N, P, PALETTE } from '@/app/lib/utils';
import { StatCard, MetricPill, MetricPillAmber } from '@/components/ui/cards';

export function TopAdCard({ ad, type, rank, hideCampaign, onHover, onMove, onLeave }: { ad: any; type: 'VENDAS' | 'LEADS'; rank: number, hideCampaign?: boolean, onHover?: (e: React.MouseEvent, ad: any) => void, onMove?: (e: React.MouseEvent) => void, onLeave?: () => void }) {
  const link = ad.instagramPermalink || ad.adsManagerLink;
  const isVendas = type === 'VENDAS';
  const accentColor = isVendas ? 'indigo' : 'sky';
  const rankBg = isVendas ? 'bg-indigo-600' : 'bg-sky-500';

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden">
      <div className="p-6 flex gap-4 items-start">
        <div className="relative flex-shrink-0" onMouseEnter={(e) => onHover && onHover(e, ad)} onMouseMove={(e) => onMove && onMove(e)} onMouseLeave={() => onLeave && onLeave()}>
          <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-lg ${rankBg} text-white font-black text-[10px] flex items-center justify-center z-10 shadow-lg border-2 border-white`}>
            {rank}
          </div>
          <div className="cursor-pointer" onClick={() => window.open(link, '_blank')}>
            {ad.thumbnailUrl ? (
              <img src={ad.thumbnailUrl} alt={ad.name}
                className="w-44 h-44 rounded-2xl object-cover border border-slate-100 shadow-md transition-transform group-hover:scale-105" />
            ) : (
              <div className="w-44 h-44 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                <span className="material-symbols-outlined text-slate-300 text-4xl">image</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-headline font-black text-lg text-slate-900 leading-snug mb-0.5 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">{ad.name}</h3>
          {ad.adStatus && (
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full w-fit ${
              ad.adStatus === 'ACTIVE'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {ad.adStatus === 'ACTIVE' ? '● Ativado' : '○ Desativado'}
            </span>
          )}
          {!hideCampaign && (
            <p className="text-[10px] text-slate-400 font-bold mb-4 flex items-center gap-1.5 truncate uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm">folder</span>
              {ad.campaignName || 'Campanha'}
            </p>
          )}
        </div>
      </div>

      <div className="mx-5 border-t border-slate-100 mb-4" />

      <div className="px-5 pb-5">
        {type === 'VENDAS' ? (
          <>
            <div className="mb-3">
              <MetricPill label="📊 Investido" value={R(ad.spend)} small />
            </div>
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="Vendas"         value={N(ad.purchases)} icon="shopping_cart" color="emerald" small />
              <StatCard label="CTR"            value={P(ad.ctr)} icon="ads_click" color="blue" small />
              <StatCard label="Connect"        value={P(ad.connectRate)} icon="query_stats" color="slate" small />
              <StatCard label="Inic. Checkout" value={P(ad.checkoutRate || (ad.landingPageViews > 0 ? (ad.checkouts / ad.landingPageViews * 100) : 0))} icon="shopping_basket" color="orange" small />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <MetricPillAmber label="🎯 Leads Gerados"   value={N(ad.leads)} accent small />
              <MetricPillAmber label="📊 Investido"       value={R(ad.spend)} small />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="Custo/Lead" value={R(ad.costPerLead)} icon="payments" color="amber" small />
              <StatCard label="CTR"        value={P(ad.ctr)} icon="ads_click" color="blue" small />
              <StatCard label="Connect"    value={P(ad.connectRate)} icon="query_stats" color="slate" small />
              <StatCard label="Taxa Conv." value={P(ad.leadsRate || (ad.landingPageViews > 0 ? (ad.leads / ad.landingPageViews * 100) : 0))} icon="touch_app" color="orange" small />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AdsInsights({ ads, type }: { ads: any[], type: 'VENDAS' | 'LEADS' }) {
    if (!ads || ads.length === 0) return null;
    const tImps  = ads.reduce((s, a) => s + (a.impressions || 0), 0) || 1;
    const tClics = ads.reduce((s, a) => s + (a.clicks || 0), 0) || 1;
    const tOuts  = ads.reduce((s, a) => s + (a.outboundClicks || 0), 0) || 1;
    const tLPV   = ads.reduce((s, a) => s + (a.landingPageViews || 0), 0) || 1;
    const tCheck = ads.reduce((s, a) => s + (a.checkouts || 0), 0) || 0;
    const tLeads = ads.reduce((s, a) => s + (a.leads || 0), 0) || 0;
    
    const avgCTR     = (tClics / tImps) * 100;
    const avgConnect = (tLPV / tOuts) * 100;
    const avgCheck   = (tCheck / tLPV) * 100;
    const avgLeadCV  = (tLeads / tLPV) * 100;

    const validAds = ads.slice(0, 2); 
    if (validAds.length === 0) return null;

    return (
        <div className="bg-slate-900 rounded-3xl p-8 mb-12 text-white border-2 border-violet-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />
            <h3 className="font-headline font-black text-2xl mb-8 flex items-center gap-3 relative z-10 text-white">
                <span className="material-symbols-outlined text-violet-400 text-[36px]">monitoring</span>
                Insights do Analista
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                {validAds.map((ad, idx) => {
                    const insights: string[] = [];
                    const adCheckR = ad.checkoutRate || (ad.landingPageViews > 0 ? (ad.checkouts / ad.landingPageViews * 100) : 0);
                    const adLeadCV = ad.landingPageViews > 0 ? (ad.leads / ad.landingPageViews * 100) : 0;
                    const compare = (val: number, avg: number, label: string) => {
                        const diff = val - avg;
                        const pct = avg > 0 ? (diff / avg * 100) : 0;
                        return (
                           <div className="mb-4">
                              <div className="flex justify-between items-end mb-1">
                                 <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-sans">{label}</span>
                                 <span className="text-xs font-black text-white">{P(val)} <span className={diff > 0 ? "text-emerald-400 font-bold" : "text-rose-400 text-[10px]"}>({diff > 0 ? '+' : ''}{pct.toFixed(0)}% vs média)</span></span>
                              </div>
                              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                 <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-400 rounded-full" style={{ width: `${Math.min(val*5, 100)}%` }} />
                              </div>
                           </div>
                        );
                    };
                    return (
                        <div key={idx} className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col">
                            <div className="flex items-center gap-3 mb-6">
                               <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center font-black text-violet-400 border border-violet-500/30">{idx+1}</div>
                               <p className="font-bold text-sm text-slate-100 line-clamp-1 truncate">{ad.name}</p>
                            </div>
                            {compare(ad.ctr, avgCTR, 'Taxa de Cliques (CTR)')}
                            {compare(ad.connectRate, avgConnect, 'Connect Rate (LPV/Outbound)')}
                            {type === 'VENDAS' ? compare(adCheckR, avgCheck, 'Início de Checkout') : compare(adLeadCV, avgLeadCV, 'Taxa de Leads')}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function CampaignPagesSection({ ads, type }: { ads: any[], type: 'VENDAS' | 'LEADS' }) {
    if (!ads || ads.length === 0) return null;
    const pagesMap = new Map();
    ads.forEach(ad => {
        const url = ad.landingPageUrl || ad.displayUrl || ad.url || 'URL não identificada';
        const curr = pagesMap.get(url) || { url, spend: 0, outbound: 0, lpv: 0, results: 0, checkouts: 0 };
        curr.spend += (ad.spend || 0);
        curr.outbound += (ad.outboundClicks || 0);
        curr.lpv += (ad.landingPageViews || 0);
        curr.results += (type === 'VENDAS' ? (ad.purchases || 0) : (ad.leads || 0));
        curr.checkouts += (ad.checkouts || 0);
        pagesMap.set(url, curr);
    });
    const pageList = Array.from(pagesMap.values()).sort((a,b) => b.results - a.results || b.spend - a.spend);

    return (
        <div className="mb-12">
            <h3 className="font-headline font-bold text-2xl text-slate-800 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500 text-[28px]">web_asset</span>
                Páginas de Destino
                <span className="text-xs text-slate-400 font-normal ml-2">({pageList.length} URLs rastreadas via anúncios)</span>
            </h3>
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="py-4 px-6 text-xs font-black uppercase tracking-widest text-slate-400">Link da página</th>
                                <th className="py-4 px-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Gasto</th>
                                <th className="py-4 px-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Connect Rate</th>
                                <th className="py-4 px-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Resultados</th>
                                <th className="py-4 px-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Custo/Result.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageList.map((p, i) => {
                                const connect = p.outbound > 0 ? (p.lpv / p.outbound * 100) : 0;
                                const isRealUrl = p.url.startsWith('http');
                                return (
                                    <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i === 0 && p.results > 0 ? 'bg-emerald-50/20' : ''}`}>
                                        <td className="py-5 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-slate-800 text-sm truncate max-w-md" title={p.url}>{isRealUrl ? p.url.replace(/^https?:\/\//, '') : p.url}</p>
                                                    {isRealUrl && <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1 mt-0.5"><span className="material-symbols-outlined text-[12px]">open_in_new</span>Abrir Site</a>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-5 px-4 font-black text-slate-700 text-sm text-right">{R(p.spend)}</td>
                                        <td className="py-5 px-4 text-right">
                                            <span className={`font-black text-sm ${connect > 70 ? 'text-emerald-600' : connect < 50 ? 'text-rose-600' : 'text-slate-800'}`}>{P(connect)}</span>
                                        </td>
                                        <td className="py-5 px-4 text-right">
                                            <div className="flex flex-col items-end">
                                              <span className="font-black text-slate-900 text-sm">{N(p.results)}</span>
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{type === 'VENDAS' ? 'VENDAS' : 'LEADS'}</span>
                                            </div>
                                        </td>
                                        <td className="py-5 px-4 font-black text-slate-700 text-sm text-right">{R(p.spend / (p.results || 1))}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export function BudgetSplit({ spend, dayCount }: { spend: Record<string, number>; dayCount: number }) {
  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
      {Object.entries(spend).map(([obj, val]) => {
        const p = (val / total) * 100;
        const pal = PALETTE[obj as keyof typeof PALETTE] || PALETTE.OUTROS;
        const accentColor = obj === 'VENDAS' ? '#22c55e' : obj === 'LEADS' ? '#E8B14F' : '#A8B2C0';
        return (
          <div key={obj} style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 20px 40px -8px rgba(0,0,0,0.5)',
            borderRadius: 28,
            padding: '28px 28px',
            position: 'relative',
            overflow: 'hidden',
            minHeight: 155,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s',
          }}
            className="hover:scale-[1.01] group"
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)', borderRadius: 28 }} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-5">
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: accentColor }}>{obj}</p>
                <p style={{ fontSize: 11, fontWeight: 900, color: accentColor, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '3px 10px' }}>{p.toFixed(1)}%</p>
              </div>
              <p style={{ fontFamily: 'var(--font-jakarta)', fontWeight: 900, fontSize: 'clamp(1.5rem,3vw,2rem)', lineHeight: 1, color: '#fff' }}>{R(val)}</p>
            </div>
            <div className="relative z-10 flex items-center justify-between" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#A8B2C0' }}>Média Diária:</p>
              <p style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{R(val / dayCount)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CampaignAdsTable({ ads, type, onHover, onMove, onLeave }: { ads: any[], type: 'VENDAS' | 'LEADS', onHover?: any, onMove?: any, onLeave?: any }) {
  if (!ads || ads.length === 0) return null;
  
  return (
    <div className="mb-12">
      <h3 className="font-headline font-bold text-2xl text-slate-800 mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-orange-500 text-[28px]">ads_click</span>
        Lista de Todos os Anúncios
        <span className="text-xs text-slate-400 font-normal ml-2">({ads.length} criativos ativos no período)</span>
      </h3>
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Anúncio</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Gasto</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">CTR</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Connect</th>
                {type === 'VENDAS' && (
                  <>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Checkout</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Purchase</th>
                  </>
                )}
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Resultados</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Custo/Result.</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad, i) => {
                const isVendas = type === 'VENDAS';
                const results = isVendas ? (ad.purchases || 0) : (ad.leads || 0);
                const cost = results > 0 ? ad.spend / results : ad.spend;
                return (
                  <tr key={ad.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {/* Status indicator */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            ad.adStatus === 'ACTIVE' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-slate-300'
                          }`} title={ad.adStatus === 'ACTIVE' ? 'Ativo' : 'Pausado'} />
                        </div>
                        <div 
                          className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-slate-100 bg-slate-50 cursor-help"
                          onMouseEnter={(e) => onHover && onHover(e, ad)}
                          onMouseMove={(e) => onMove && onMove(e)}
                          onMouseLeave={() => onLeave && onLeave()}
                        >
                          {ad.thumbnailUrl ? <img src={ad.thumbnailUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><span className="material-symbols-outlined text-sm">image</span></div>}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate max-w-xs">{ad.name}</p>
                          {ad.adStatus && (
                            <span className={`text-[8px] font-black uppercase tracking-widest ${
                              ad.adStatus === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'
                            }`}>{ad.adStatus === 'ACTIVE' ? '● Ativo' : '○ Pausado'}</span>
                          )}
                          <a href={ad.instagramPermalink || ad.adsManagerLink} target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1 mt-0.5">
                            <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                            Ver Anúncio
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-black text-slate-900 text-sm text-right">{R(ad.spend)}</td>
                    <td className="py-4 px-4 font-black text-slate-700 text-sm text-right">{P(ad.ctr)}</td>
                    <td className="py-4 px-4 font-black text-slate-600 text-sm text-right">{P(ad.connectRate)}</td>
                    {isVendas && (
                      <>
                        <td className="py-4 px-4 font-black text-orange-500 text-sm text-right">{P(ad.landingPageViews > 0 ? (ad.checkouts / ad.landingPageViews * 100) : 0)}</td>
                        <td className="py-4 px-4 font-black text-violet-600 text-sm text-right">{P(ad.checkouts > 0 ? (ad.purchases / ad.checkouts * 100) : 0)}</td>
                      </>
                    )}
                    <td className="py-4 px-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`font-black text-sm ${results > 0 ? 'text-blue-600' : 'text-slate-400'}`}>{N(results)}</span>
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">{isVendas ? 'Vendas' : 'Leads'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-black text-slate-700 text-sm text-right">{R(cost || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
