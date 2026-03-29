'use client';

import React, { useState, useMemo } from 'react';
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

/** Deduz comissão de co-produtor do valor bruto.
 *  A Hotmart retorna purchase.commission.VALUE para comissões de afiliados/co-produtores.
 *  O campo actual_value já tem as taxas da Hotmart deduzidas, mas NÃO a comissão do co-produtor.
 *  Aqui usamos o campo commission para mostrar o valor líquido real.
 */
function getNetValue(s: any): number {
  const gross = s.purchase?.price?.value ?? 0;
  // commission.VALUE = valor repassado ao co-produtor (quando há)
  const coProducerCommission = s.purchase?.commission?.VALUE ?? 0;
  return gross - coProducerCommission;
}

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

export default function HotmartPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data = useDashboardData();
  const [selectedProductTags, setSelectedProductTags] = useState<string[]>([]);
  const [productSearch, setProductSearch]             = useState('');
  const [clientSearch,  setClientSearch]              = useState('');
  const [pageSize,      setPageSize]                  = useState(50);
  const [page,          setPage]                      = useState(1);

  // Filtered by product tag
  const productFiltered = useMemo(() =>
    (data.hotmartSales || []).filter((s: any) =>
      selectedProductTags.length === 0 || selectedProductTags.includes(s.product?.name)
    ),
  [data.hotmartSales, selectedProductTags]);

  // Filtered by client name/email search
  const clientFiltered = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return productFiltered;
    return productFiltered.filter((s: any) =>
      (s.buyer?.name || '').toLowerCase().includes(q) ||
      (s.buyer?.email || '').toLowerCase().includes(q)
    );
  }, [productFiltered, clientSearch]);

  // Sort by date desc
  const sortedSales = useMemo(() =>
    [...clientFiltered].sort((a: any, b: any) =>
      new Date(b.purchase.order_date).getTime() - new Date(a.purchase.order_date).getTime()
    ),
  [clientFiltered]);

  // Pagination
  const totalPages  = Math.max(1, Math.ceil(sortedSales.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedSales  = sortedSales.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset page when filter/pagesize changes
  const resetPage = () => setPage(1);

  // Revenue calcs based on ALL filtered (not just page)
  const brlSales       = productFiltered.filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') === 'BRL');
  const intlSales      = productFiltered.filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') !== 'BRL');
  const totalSalesCount = productFiltered.length;
  const brlCount       = brlSales.length;
  const intlCount      = intlSales.length;

  // Net (líquido) = producer_net quando disponível, senão bruto - hotmart_fee
  const getBrlNet = (s: any): number => {
    const net = s.purchase?.producer_net;
    if (net != null) return net;
    const gross = s.purchase?.price?.value ?? 0;
    const fee   = s.purchase?.hotmart_fee?.total ?? 0;
    return Math.max(0, gross - fee);
  };
  const brlNetRevenue   = brlSales.reduce((acc: number, s: any) => acc + getBrlNet(s), 0);
  const brlGrossRevenue = brlSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.value ?? 0), 0);
  const brlHotmartFees  = brlSales.reduce((acc: number, s: any) => acc + (s.purchase?.hotmart_fee_total ?? s.purchase?.hotmart_fee?.total ?? 0), 0);
  const brlCoProducerFees = brlSales.reduce((acc: number, s: any) => {
    const net   = s.purchase?.producer_net;
    const gross = s.purchase?.price?.value ?? 0;
    const fee   = s.purchase?.hotmart_fee_total ?? s.purchase?.hotmart_fee?.total ?? 0;
    return acc + (net != null ? Math.max(0, gross - fee - net) : 0);
  }, 0);

  // Intl: líquido em BRL = converted_BRL × (producer_net / gross_original) ou fallback
  const getIntlNetBRL = (s: any): number => {
    const convertedGross = s.purchase?.price?.converted_value || 0;
    const gross          = s.purchase?.price?.value ?? 0;
    const producerNet    = s.purchase?.producer_net;
    if (producerNet != null && gross > 0) {
      return convertedGross * (producerNet / gross);
    }
    // fallback: aplica ratio (gross - hotmart_fee) / gross
    const fee = s.purchase?.hotmart_fee?.total ?? 0;
    const ratio = gross > 0 ? Math.max(0, gross - fee) / gross : 1;
    return convertedGross * ratio;
  };
  const intlNetBRL        = intlSales.reduce((acc: number, s: any) => acc + getIntlNetBRL(s), 0);
  const intlGrossBRL      = intlSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.converted_value || 0), 0);
  const intlHotmartFeesBRL = intlSales.reduce((acc: number, s: any) => {
    const cv  = s.purchase?.price?.converted_value || 0;
    const g   = s.purchase?.price?.value ?? 0;
    const fee = s.purchase?.hotmart_fee?.total ?? 0;
    return acc + (g > 0 ? cv * (fee / g) : 0);
  }, 0);
  const intlCoProducerFeesBRL = intlGrossBRL - intlHotmartFeesBRL - intlNetBRL;

  // keep for backwards compat (used inside LATAM table)
  const intlRevenueBRL = intlNetBRL;

  // Unique products sorted by most recent sale
  const uniqueProducts: string[] = useMemo(() => {
    const productLastSale: Record<string, number> = {};
    (data.hotmartSales || []).forEach((s: any) => {
      const name = s.product?.name;
      if (!name) return;
      const t = new Date(s.purchase?.approved_date || s.purchase?.order_date || 0).getTime();
      if (!productLastSale[name] || t > productLastSale[name]) productLastSale[name] = t;
    });
    return Object.entries(productLastSale)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);
  }, [data.hotmartSales]);

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: '—', time: '' };
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const currentRevenueByCurrency: Record<string, number> = {};
  const currentCountByCurrency:   Record<string, number> = {};
  productFiltered.forEach((s: any) => {
    const cur = s.purchase?.price?.currency_code || 'BRL';
    const val = s.purchase?.price?.value ?? 0;
    currentRevenueByCurrency[cur] = (currentRevenueByCurrency[cur] || 0) + val;
    currentCountByCurrency[cur]   = (currentCountByCurrency[cur]   || 0) + 1;
  });

  const CURRENCY_TO_COUNTRY: Record<string, string> = {
    BRL: 'BR', COP: 'CO', BOB: 'BO', MXN: 'MX', ARS: 'AR',
    CLP: 'CL', PEN: 'PE', UYU: 'UY', CRC: 'CR', HNL: 'HN',
    PYG: 'PY', GTQ: 'GT', DOP: 'DO', CUP: 'CU', VES: 'VE',
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

  // Pagination range helper
  const pageRange = () => {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, currentPage - delta); i <= Math.min(totalPages, currentPage + delta); i++) {
      range.push(i);
    }
    return range;
  };

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
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>Faturamento Líquido BRL</p>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: SILVER }}>receita líquida em reais · após hotmart + co-produtores</p>
                  <p className="font-headline font-black text-5xl text-white tracking-tighter leading-none mb-1">
                    {R(brlNetRevenue)}
                  </p>
                  {/* Info tooltip */}
                  <div className="relative inline-flex group mt-1">
                    <span className="text-[10px] font-bold flex items-center gap-1 cursor-help" style={{ color: SILVER }}>
                      <span className="material-symbols-outlined text-[13px]">info</span>
                      Ver breakdown
                    </span>
                    <div className="absolute bottom-full left-0 mb-2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      style={{ minWidth: 240, background: '#0d1f33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                      <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: GOLD }}>Detalhamento BRL</p>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px]" style={{ color: SILVER }}>🟡 Bruto</span>
                          <span className="text-[11px] font-black text-white">{R(brlGrossRevenue)}</span>
                        </div>
                        {brlHotmartFees > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[11px]" style={{ color: '#f87171' }}>🔴 Taxas Hotmart</span>
                            <span className="text-[11px] font-black" style={{ color: '#f87171' }}>− {R(brlHotmartFees)}</span>
                          </div>
                        )}
                        {brlCoProducerFees > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[11px]" style={{ color: '#fb923c' }}>🟠 Co-produtores</span>
                            <span className="text-[11px] font-black" style={{ color: '#fb923c' }}>− {R(brlCoProducerFees)}</span>
                          </div>
                        )}
                        <div className="border-t mt-1 pt-1" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black" style={{ color: '#4ade80' }}>✓ Líquido</span>
                            <span className="text-[11px] font-black" style={{ color: '#4ade80' }}>{R(brlNetRevenue)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden md:block w-px h-16" style={{ background: 'rgba(255,255,255,0.1)' }} />

                {/* Outras moedas */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[20px]" style={{ color: '#38bdf8' }}>currency_exchange</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: '#38bdf8' }}>Internacional Líquido (BRL)</p>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: SILVER }}>líquido estimado em reais · demais moedas</p>
                  <p className="font-headline font-black text-4xl text-white tracking-tighter leading-none">
                    {R(intlNetBRL)}
                  </p>
                  {/* Info tooltip - intl */}
                  <div className="relative inline-flex group mt-1">
                    <span className="text-[10px] font-bold flex items-center gap-1 cursor-help" style={{ color: SILVER }}>
                      <span className="material-symbols-outlined text-[13px]">info</span>
                      Ver breakdown
                    </span>
                    <div className="absolute bottom-full left-0 mb-2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      style={{ minWidth: 240, background: '#0d1f33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                      <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: '#38bdf8' }}>Detalhamento Internacional</p>
                      <p className="text-[9px] mb-2" style={{ color: SILVER }}>Valores convertidos proporcionalmente</p>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px]" style={{ color: SILVER }}>🟡 Bruto</span>
                          <span className="text-[11px] font-black text-white">{R(intlGrossBRL)}</span>
                        </div>
                        {intlHotmartFeesBRL > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[11px]" style={{ color: '#f87171' }}>🔴 Taxas Hotmart</span>
                            <span className="text-[11px] font-black" style={{ color: '#f87171' }}>− {R(intlHotmartFeesBRL)}</span>
                          </div>
                        )}
                        {intlCoProducerFeesBRL > 0.01 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[11px]" style={{ color: '#fb923c' }}>🟠 Co-produtores</span>
                            <span className="text-[11px] font-black" style={{ color: '#fb923c' }}>− {R(intlCoProducerFeesBRL)}</span>
                          </div>
                        )}
                        <div className="border-t mt-1 pt-1" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black" style={{ color: '#4ade80' }}>✓ Líquido</span>
                            <span className="text-[11px] font-black" style={{ color: '#4ade80' }}>{R(intlNetBRL)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Count */}
                <div className="flex flex-col items-end gap-0 min-w-[140px]" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 28 }}>
                  <div className="flex items-center gap-2 mb-2 self-start">
                    <span className="material-symbols-outlined text-[18px]" style={{ color: '#22c55e' }}>shopping_cart</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: '#22c55e' }}>Vendas</p>
                  </div>
                  <div className="flex items-end gap-2 self-start">
                    <p className="font-headline font-black leading-none" style={{ fontSize: 64, color: 'white', lineHeight: 1 }}>{N(brlCount)}</p>
                    <p className="text-[12px] font-black mb-1" style={{ color: SILVER }}>BRL</p>
                  </div>
                  {intlCount > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 self-start px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)' }}>
                      <span className="material-symbols-outlined text-[13px]" style={{ color: '#38bdf8' }}>public</span>
                      <p className="text-[11px] font-black" style={{ color: '#38bdf8' }}>+{intlCount} internacional</p>
                    </div>
                  )}
                  <div className="mt-1.5 self-start px-2.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-[11px] font-black" style={{ color: SILVER }}>Total: {N(totalSalesCount)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-tabela moedas */}
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
                          const converted = productFiltered
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
                              <td className="py-2 text-right font-black">{productFiltered.filter((s: any) => s.purchase.price.currency_code === cur).length}</td>
                              <td className="py-2 text-right font-black text-[9px]" style={{ color: SILVER }}>{RF(val, cur)}</td>
                              <td className="py-2 text-right">
                                <div className="flex flex-col items-end">
                                  {/* Líquido em verde */}
                                  <span className="font-black" style={{ color: '#4ade80' }}>
                                    {R((() => {
                                      const sales = productFiltered.filter((s: any) => s.purchase.price.currency_code === cur);
                                      return sales.reduce((acc: number, s: any) => acc + getIntlNetBRL(s), 0);
                                    })())}
                                  </span>
                                  {/* Bruto em cinza */}
                                  <span className="text-[8px]" style={{ color: SILVER }}>
                                    bruto {R(productFiltered.filter((s: any) => s.purchase.price.currency_code === cur).reduce((acc: number, s: any) => acc + (s.purchase.price.converted_value || 0), 0))}
                                  </span>
                                </div>
                              </td>
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
            <div className="rounded-[24px] p-6 mb-8 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(232,177,79,0.07) 0%, rgba(255,255,255,0.03) 60%, rgba(232,177,79,0.04) 100%)',
                border: '1px solid rgba(232,177,79,0.18)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 4px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(232,177,79,0.12)',
              }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(232,177,79,0.06) 0%, transparent 50%)', borderRadius: 24 }} />
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
                      onClick={() => { setSelectedProductTags(prev => isSelected ? prev.filter(t => t !== p) : [...prev, p]); resetPage(); }}
                      className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                      style={isSelected
                        ? { background: GOLD, color: NAVY, border: `1px solid ${GOLD}`, boxShadow: `0 0 12px rgba(232,177,79,0.35)` }
                        : { background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: SILVER }}
                      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; e.currentTarget.style.boxShadow = `0 0 10px rgba(232,177,79,0.2)`; } }}
                      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = cardBorder; e.currentTarget.style.color = SILVER; e.currentTarget.style.boxShadow = 'none'; } }}>
                      {p}
                    </button>
                  );
                })}
                {selectedProductTags.length > 0 && (
                  <button onClick={() => { setSelectedProductTags([]); resetPage(); }}
                    className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-[28px] overflow-hidden mb-12" style={{ ...glossy, padding: 0 }}>

            {/* Toolbar: Título | Busca + Paginação + PDF */}
            <div className="p-5 flex flex-wrap items-center justify-between gap-4" style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <div>
                <p className="font-black text-white text-base">Vendas Recentes</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                  {sortedSales.length} transações {clientSearch ? `(filtrado de ${productFiltered.length})` : 'no período'}
                </p>
              </div>

              {/* Busca + Paginação + PDF — todos na direita */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Busca por cliente */}
                <div className="relative">
                  <span className="material-symbols-outlined text-[16px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>person_search</span>
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); resetPage(); }}
                    className="pl-9 pr-8 py-2.5 rounded-xl text-[12px] font-bold outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${clientSearch ? 'rgba(232,177,79,0.4)' : cardBorder}`, color: 'white', width: 200 }}
                  />
                  {clientSearch && (
                    <button onClick={() => { setClientSearch(''); resetPage(); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: SILVER }}>
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  )}
                </div>

                {/* Itens por página */}
                <div className="flex items-center gap-1.5 rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
                  {PAGE_SIZE_OPTIONS.map(opt => (
                    <button key={opt}
                      onClick={() => { setPageSize(opt); resetPage(); }}
                      className="px-3 py-2 text-[11px] font-black transition-all"
                      style={pageSize === opt
                        ? { background: GOLD, color: NAVY }
                        : { background: 'transparent', color: SILVER }}>
                      {opt}
                    </button>
                  ))}
                </div>

                {/* PDF */}
                <button onClick={() => window.print()}
                  className="px-5 py-2.5 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all"
                  style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
                  <span className="material-symbols-outlined text-lg">picture_as_pdf</span> PDF
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '240px' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Data / Hora</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color: SILVER }}>Faturamento</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '120px' }}>Pagamento</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '240px' }}>Cliente</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER, minWidth: '180px' }}>Produto</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSales.map((s: any, idx: number) => {
                    const dt             = formatDateTime(s.purchase.order_date);
                    const paymentMethod  = s.purchase?.payment?.type || s.purchase?.payment_type || s.purchase?.payment?.method || '';
                    const installTotal   = s.purchase?.payment?.installments_number || 1;
                    // recurrency_number = número da parcela atual (debug confirmado)
                    const installCurrent = s.purchase?.recurrency_number || null;
                    const isSubscription = s.purchase?.is_subscription === true;
                    const grossValue     = s.purchase?.price?.value ?? 0;
                    const currency       = s.purchase?.price?.currency_code || 'BRL';
                    // hotmart_fee.total = taxa real cobrada pela Hotmart (debug confirmado)
                    const hotmartFee     = s.purchase?.hotmart_fee?.total ?? 0;
                    const hotmartFeePct  = s.purchase?.hotmart_fee?.percentage ?? 0;

                    // Prioridade para producer_net (injetado pelo backend via /sales/commissions)
                    // Confirmado: source:"PRODUCER" = valor exato que a RadExperts recebeu
                    // Fallback: commission.value no item | bruto - hotmartFee
                    const producerNet    = s.purchase?.producer_net ?? s.purchase?.commission?.value ?? null;
                    const hasProducerNet = producerNet !== null;
                    const netValue       = hasProducerNet ? (producerNet as number) : Math.max(0, grossValue - hotmartFee);
                    const coProducerAmt  = hasProducerNet ? Math.max(0, grossValue - hotmartFee - (producerNet as number)) : 0;
                    const hasCoProducer  = coProducerAmt > 0.01;
                    const fmt = (v: number) => currency !== 'BRL' ? RF(v, currency) : R(v);

                    let installLabel = '';
                    let installStyle: React.CSSProperties = {};
                    if (isSubscription) {
                      installLabel = installCurrent ? `Assinatura · Ciclo ${installCurrent}` : 'Assinatura';
                      installStyle = { background: 'rgba(56,189,248,0.12)', color: '#38bdf8' };
                    } else if (installTotal > 1) {
                      installLabel = installCurrent ? `Parcela ${installCurrent}/${installTotal}` : `${installTotal}× parcelado`;
                      installStyle = { background: 'rgba(99,102,241,0.15)', color: '#818cf8' };
                    } else {
                      installLabel = 'À vista';
                      installStyle = { background: 'rgba(34,197,94,0.08)', color: '#86efac' };
                    }

                    return (
                      <tr key={idx}
                        style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${cardBorder}` }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}>

                        {/* Data */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white">{dt.date}</span>
                            <span className="text-[10px] font-bold mt-0.5 flex items-center gap-1" style={{ color: SILVER }}>
                              <span className="material-symbols-outlined text-[11px]">schedule</span>{dt.time}
                            </span>
                          </div>
                        </td>

                        {/* Faturamento */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end gap-1">

                            {/* LÍQUIDO — principal */}
                            <span className="font-headline font-black text-xl" style={{ color: '#4ade80' }}>
                              {fmt(netValue)}
                            </span>

                            {/* BRL aprox. se moeda estrangeira */}
                            {currency !== 'BRL' && s.purchase?.price?.converted_value && (
                              <span className="text-[10px] font-bold" style={{ color: SILVER }}>
                                ≈ {R(s.purchase.price.converted_value)}
                              </span>
                            )}

                            {/* Badge parcela/ciclo */}
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={installStyle}>
                              {installLabel}
                            </span>

                            {/* ⓘ Tooltip de breakdown */}
                            <div className="relative group">
                              <span className="flex items-center gap-0.5 cursor-help" style={{ color: SILVER }}>
                                <span className="material-symbols-outlined text-[12px]">info</span>
                                <span className="text-[9px] font-bold">bruto {fmt(grossValue)}</span>
                              </span>
                              {/* Tooltip */}
                              <div
                                className="absolute right-0 bottom-full mb-2 z-[999] pointer-events-none
                                  opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                                style={{
                                  minWidth: 220, background: '#0d1f33',
                                  border: '1px solid rgba(255,255,255,0.14)',
                                  borderRadius: 10, padding: '10px 12px',
                                  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                                }}>
                                <p className="text-[9px] font-black uppercase tracking-wider mb-2" style={{ color: GOLD }}>Detalhamento</p>
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between gap-4">
                                    <span className="text-[10px]" style={{ color: SILVER }}>🟡 Bruto</span>
                                    <span className="text-[10px] font-black text-white">{fmt(grossValue)}</span>
                                  </div>
                                  {hotmartFee > 0 && (
                                    <div className="flex justify-between gap-4">
                                      <span className="text-[10px]" style={{ color: '#f87171' }}>🔴 Hotmart {hotmartFeePct > 0 ? `${hotmartFeePct}%` : ''}</span>
                                      <span className="text-[10px] font-black" style={{ color: '#f87171' }}>− {fmt(hotmartFee)}</span>
                                    </div>
                                  )}
                                  {/* Co-produtores com nome */}
                                  {(s.purchase?.co_producers || []).length > 0
                                    ? (s.purchase.co_producers as {name:string;amount:number}[]).map((cp, ci) => (
                                      <div key={ci} className="flex justify-between gap-4">
                                        <span className="text-[10px]" style={{ color: '#fb923c' }}>🟠 {cp.name}</span>
                                        <span className="text-[10px] font-black" style={{ color: '#fb923c' }}>− {fmt(cp.amount)}</span>
                                      </div>
                                    ))
                                    : hasCoProducer && (
                                      <div className="flex justify-between gap-4">
                                        <span className="text-[10px]" style={{ color: '#fb923c' }}>🟠 Co-produtor</span>
                                        <span className="text-[10px] font-black" style={{ color: '#fb923c' }}>− {fmt(coProducerAmt)}</span>
                                      </div>
                                    )
                                  }
                                  <div className="border-t pt-1 mt-0.5" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-[10px] font-black" style={{ color: '#4ade80' }}>✓ Você recebeu</span>
                                      <span className="text-[10px] font-black" style={{ color: '#4ade80' }}>{fmt(netValue)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                          </div>
                        </td>

                        {/* Pagamento */}
                        <td className="py-3 px-4"><PaymentBadge method={paymentMethod} /></td>

                        {/* Cliente */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 leading-tight">
                              {getFlagImgByCurrency(s.purchase?.price?.currency_code, 18)}
                              <span className="text-sm font-black text-white">{s.buyer.name}</span>
                            </div>
                            <span className="text-[10px] font-bold" style={{ color: SILVER }}>{s.buyer.email}</span>
                          </div>
                        </td>

                        {/* Produto */}
                        <td className="py-3 px-4">
                          <span className="text-[11px] font-black uppercase tracking-tight whitespace-normal leading-4 block" style={{ color: SILVER }}>{s.product.name}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedSales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-16 text-center font-bold uppercase text-[11px] tracking-widest" style={{ color: SILVER }}>
                        {clientSearch ? `Nenhum cliente encontrado para "${clientSearch}"` : 'Nenhuma venda encontrada no período'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: `1px solid ${cardBorder}` }}>
                <p className="text-[11px] font-bold" style={{ color: SILVER }}>
                  Página {currentPage} de {totalPages} · {sortedSales.length} vendas
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={currentPage === 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                    <span className="material-symbols-outlined text-[16px]">first_page</span>
                  </button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  </button>
                  {pageRange().map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-black transition-all"
                      style={p === currentPage
                        ? { background: GOLD, color: NAVY }
                        : { background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                  <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                    <span className="material-symbols-outlined text-[16px]">last_page</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
