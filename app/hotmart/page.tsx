'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, RF, N, D } from '@/app/lib/utils';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 24px 48px -12px rgba(0,0,0,0.5)',
  borderRadius: 24,
  position: 'relative',
  overflow: 'hidden',
};

function PaymentBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  let label = method || '—';
  let bg = 'rgba(255,255,255,0.08)';
  let color = SILVER;

  if (m.includes('CREDIT') || m.includes('CARTAO') || m.includes('CARD')) {
    label = 'Cartão Crédito'; bg = 'rgba(56,189,248,0.12)'; color = '#38bdf8';
  } else if (m.includes('PIX')) {
    label = 'Pix'; bg = 'rgba(34,197,94,0.12)'; color = '#22c55e';
  } else if (m.includes('BOLETO') || m.includes('BILLET')) {
    label = 'Boleto'; bg = 'rgba(232,177,79,0.12)'; color = GOLD;
  } else if (m.includes('PAYPAL')) {
    label = 'PayPal'; bg = 'rgba(99,102,241,0.14)'; color = '#818cf8';
  } else if (m.includes('DEBIT') || m.includes('DEBITO')) {
    label = 'Cartão Débito'; bg = 'rgba(232,177,79,0.1)'; color = GOLD;
  }

  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
      style={{ background: bg, border: `1px solid ${color}30`, color }}>
      {label}
    </span>
  );
}

export default function HotmartPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data = useDashboardData();
  const [selectedProductTags, setSelectedProductTags] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const filteredSales = (data.hotmartSales || []).filter((s: any) =>
    selectedProductTags.length === 0 || selectedProductTags.includes(s.product?.name)
  );

  const totalRevenue    = filteredSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.value || 0), 0);
  const totalSalesCount = filteredSales.length;

  // Ordena do produto com venda mais recente para o mais antigo
  const uniqueProducts: string[] = (() => {
    const productLastSale: Record<string, number> = {};
    (data.hotmartSales || []).forEach((s: any) => {
      const name = s.product?.name;
      if (!name) return;
      const t = new Date(s.purchase?.order_date || 0).getTime();
      if (!productLastSale[name] || t > productLastSale[name]) productLastSale[name] = t;
    });
    return Object.entries(productLastSale)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);
  })();

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: '—', time: '' };
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const currentRevenueByCurrency: Record<string, number> = {};
  filteredSales.forEach((s: any) => {
    const cur = s.purchase?.price?.currency_code || 'BRL';
    currentRevenueByCurrency[cur] = (currentRevenueByCurrency[cur] || 0) + (s.purchase?.price?.value || 0);
  });

  // Moedas com país único e inequívoco
  const CURRENCY_TO_COUNTRY: Record<string, string> = {
    BRL: 'BR', COP: 'CO', BOB: 'BO', MXN: 'MX', ARS: 'AR',
    CLP: 'CL', PEN: 'PE', UYU: 'UY', CRC: 'CR', HNL: 'HN',
    PYG: 'PY', GTQ: 'GT', DOP: 'DO', CUP: 'CU', VES: 'VE',
  };

  const getCountryName = (code: string) => {
    if (!code) return '—';
    try {
      return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code.toUpperCase()) || code;
    } catch { return code; }
  };

  const getFlagImg = (isoCode: string, size = 24) => {
    if (!isoCode) return null;
    return (
      <img
        src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/flags/4x3/${isoCode.toLowerCase()}.svg`}
        width={size}
        height={Math.round(size * 0.75)}
        alt={isoCode}
        style={{ borderRadius: 3, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      />
    );
  };

  const getFlagImgByCurrency = (currency: string, size = 20) => {
    const iso = CURRENCY_TO_COUNTRY[(currency || 'BRL').toUpperCase()];
    return iso ? getFlagImg(iso, size) : null;
  };

  const cardBorder = 'rgba(255,255,255,0.08)';

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-20">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1600px] mx-auto pt-10">

          {/* Header */}
          <div className="flex items-center gap-5 mb-8">
            <img src="/hotmart-logo.png" alt="Hotmart" style={{ height: 40, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div>
              <h2 className="font-headline font-black text-3xl text-white leading-none">Gestão de Vendas</h2>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>
                Período: {D(dateFrom)} → {D(dateTo)}
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div style={{ ...glossy, padding: '28px 32px' }} className="lg:col-span-2 flex flex-col justify-center">
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 40%)', borderRadius: 24 }} />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 h-full">
                {/* BRL principal */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[20px]" style={{ color: GOLD }}>payments</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>Faturamento BRL</p>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: SILVER }}>receita bruta em reais · Hotmart</p>
                  <p className="font-headline font-black text-5xl text-white tracking-tighter leading-none">
                    {R(filteredSales.filter(s => (s.purchase?.price?.currency_code || 'BRL') === 'BRL').reduce((acc: number, s: any) => acc + (s.purchase?.price?.value || 0), 0))}
                  </p>
                </div>

                {/* Vertical Divider */}
                <div className="hidden md:block w-px h-16" style={{ background: 'rgba(255,255,255,0.1)' }} />

                {/* Outras moedas convertidas */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[20px]" style={{ color: '#38bdf8' }}>currency_exchange</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: '#38bdf8' }}>Internacional (Convertido)</p>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: SILVER }}>estimativa em BRL · demais moedas</p>
                  <p className="font-headline font-black text-4xl text-white tracking-tighter leading-none">
                    {R(filteredSales.filter(s => (s.purchase?.price?.currency_code || 'BRL') !== 'BRL').reduce((acc: number, s: any) => acc + (s.purchase?.price?.converted_value || 0), 0))}
                  </p>
                </div>

                {/* Vendas Count */}
                <div className="flex flex-col gap-1 items-end min-w-[120px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[18px]" style={{ color: '#22c55e' }}>shopping_cart</span>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22c55e' }}>Vendas</p>
                  </div>
                  <p className="font-headline font-black text-5xl text-white mr-1">{N(totalSalesCount)}</p>
                </div>
              </div>
            </div>

            {/* Sub-tabela de moedas se houver */}
            {Object.keys(currentRevenueByCurrency).length > 1 && (
              <div style={{ ...glossy, padding: '20px 24px' }} className="flex flex-col">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-4 flex items-center gap-2" style={{ color: SILVER }}>
                  <span className="material-symbols-outlined text-sm" style={{ color: GOLD }}>public</span>
                  Vendas Internacionais (LATAM)
                </p>
                <div className="flex-1 overflow-y-auto max-h-[160px] custom-scrollbar pr-1">
                  <table className="w-full text-[10px] font-bold">
                    <thead style={{ color: SILVER }} className="uppercase tracking-tighter">
                      <tr className="border-b border-white/5">
                        <th className="text-left pb-2">Moeda/País</th>
                        <th className="text-right pb-2">Vendas</th>
                        <th className="text-right pb-2">Original</th>
                        <th className="text-right pb-2">Convertido</th>
                      </tr>
                    </thead>
                    <tbody className="text-white">
                      {Object.entries(currentRevenueByCurrency)
                        .filter(([cur]) => cur !== 'BRL')
                        .sort(([,a], [,b]) => b - a)
                        .map(([cur, val]) => {
                          const converted = filteredSales
                            .filter((s: any) => s.purchase.price.currency_code === cur)
                            .reduce((acc: number, s: any) => acc + (s.purchase.price.converted_value || 0), 0);
                          
                          return (
                            <tr key={cur} className="border-b border-white/5 last:border-0">
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  {getFlagImg(CURRENCY_TO_COUNTRY[cur.toUpperCase()] || '', 16)}
                                  <span className="uppercase">{cur}</span>
                                </div>
                              </td>
                              <td className="py-2 text-right font-black">{filteredSales.filter((s: any) => s.purchase.price.currency_code === cur).length}</td>
                              <td className="py-2 text-right font-black text-[9px]">{RF(val, cur)}</td>
                              <td className="py-2 text-right font-black" style={{ color: GOLD }}>{R(converted)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Filtro por Produto */}
          {uniqueProducts.length > 0 && (
            <div className="rounded-[24px] p-6 mb-8"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cardBorder}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: SILVER }}>
                <span className="material-symbols-outlined text-sm" style={{ color: GOLD }}>filter_alt</span>
                Filtrar por Produto
              </p>
              <div className="relative mb-4">
                <span className="material-symbols-outlined text-[16px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
                <input
                  type="text"
                  placeholder="Buscar produto..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-[12px] font-bold outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: 'white' }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueProducts
                  .filter(p => p.toLowerCase().includes(productSearch.toLowerCase()))
                  .map(p => {
                  const isSelected = selectedProductTags.includes(p);
                  return (
                    <button key={p}
                      onClick={() => setSelectedProductTags(prev => isSelected ? prev.filter(t => t !== p) : [...prev, p])}
                      className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                      style={isSelected
                        ? { background: GOLD, color: NAVY, border: `1px solid ${GOLD}` }
                        : { background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: SILVER }}>
                      {p}
                    </button>
                  );
                })}
                {selectedProductTags.length > 0 && (
                  <button onClick={() => setSelectedProductTags([])}
                    className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-[28px] overflow-hidden mb-12"
            style={{ ...glossy, padding: 0 }}>

            <div className="p-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <div>
                <p className="font-black text-white text-base">Vendas Recentes</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{filteredSales.length} transações no período</p>
              </div>
              <button onClick={() => window.print()}
                className="px-5 py-2.5 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all"
                style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
                <span className="material-symbols-outlined text-lg">picture_as_pdf</span> PDF
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '110px' }}>Data / Hora</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER, minWidth: '160px' }}>Faturamento</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '120px' }}>Pagamento</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '240px' }}>Cliente</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '180px' }}>Produto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales
                    .sort((a: any, b: any) => new Date(b.purchase.order_date).getTime() - new Date(a.purchase.order_date).getTime())
                    .map((s: any, idx: number) => {
                      const dt = formatDateTime(s.purchase.order_date);
                      const paymentMethod = s.purchase?.payment?.type || s.purchase?.payment_type || s.purchase?.payment?.method || '';
                      return (
                        <tr key={idx}
                          style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-white">{dt.date}</span>
                              <span className="text-[10px] font-bold mt-0.5 flex items-center gap-1" style={{ color: SILVER }}>
                                <span className="material-symbols-outlined text-[11px]">schedule</span>{dt.time}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-headline font-black text-white text-xl" style={{ color: GOLD }}>
                                {R(s.purchase.price.converted_value || s.purchase.price.value)}
                              </span>
                              {(s.purchase.price.currency_code || 'BRL') !== 'BRL' && (
                                <span className="text-[12px] font-bold mt-0.5" style={{ color: SILVER }}>
                                  {RF(s.purchase.price.value, s.purchase.price.currency_code)}
                                </span>
                              )}
                              {(() => {
                                const n = s.purchase?.payment?.installments_number || 1;
                                const curr = s.purchase?.payment?.installments_current;
                                if (n > 1) {
                                  return (
                                    <span className="text-[10px] font-black mt-1 px-2 py-0.5 rounded-md" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                                      {curr ? `Parcela ${curr}/${n}` : `${n}× parcelado`}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-[10px] font-black mt-1 px-2 py-0.5 rounded-md" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                                    Pgto. Único
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="py-3 px-4"><PaymentBadge method={paymentMethod} /></td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 leading-tight">
                                {getFlagImgByCurrency(s.purchase?.price?.currency_code, 18)}
                                <span className="text-sm font-black text-white">{s.buyer.name}</span>
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: SILVER }}>{s.buyer.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-black uppercase tracking-tight whitespace-normal leading-4 block" style={{ color: SILVER }}>{s.product.name}</span>
                          </td>
                        </tr>
                      );
                    })}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-16 text-center font-bold uppercase text-[11px] tracking-widest" style={{ color: SILVER }}>
                        Nenhuma venda encontrada no período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
