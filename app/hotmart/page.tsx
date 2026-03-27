'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, N, D } from '@/app/lib/utils';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

// Hotmart brand orange
const HM_ORANGE = '#FF6E2D';

function HotmartLogo({ height = 36 }: { height?: number }) {
  return <img src="/hotmart-logo.png" alt="Hotmart" style={{ height, objectFit: 'contain' }} />;
}

function PaymentBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  let label = method || '—';
  let cls = 'bg-slate-100 text-slate-600';

  if (m.includes('CREDIT') || m.includes('CARTAO') || m.includes('CARD')) {
    label = 'Cartão Crédito'; cls = 'bg-blue-50 text-blue-700';
  } else if (m.includes('PIX')) {
    label = 'Pix'; cls = 'bg-emerald-50 text-emerald-700';
  } else if (m.includes('BOLETO') || m.includes('BILLET')) {
    label = 'Boleto'; cls = 'bg-amber-50 text-amber-700';
  } else if (m.includes('PAYPAL')) {
    label = 'PayPal'; cls = 'bg-indigo-50 text-indigo-700';
  } else if (m.includes('DEBIT') || m.includes('DEBITO')) {
    label = 'Cartão Débito'; cls = 'bg-purple-50 text-purple-700';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

export default function HotmartPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data = useDashboardData();
  const [selectedProductTags, setSelectedProductTags] = useState<string[]>([]);

  const filteredSales = (data.hotmartSales || []).filter((s: any) =>
    selectedProductTags.length === 0 || selectedProductTags.includes(s.product?.name)
  );

  const totalRevenue = filteredSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.value || 0), 0);
  const totalSalesCount = filteredSales.length;

  const uniqueProducts = Array.from(new Set((data.hotmartSales || []).map((s: any) => s.product?.name))).filter(Boolean).sort() as string[];

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  };

  return (
    <LoginWrapper>
      <div className="min-h-screen bg-[#f3f3f3] pb-20">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1600px] mx-auto pt-10">

          {/* Header */}
          <div className="flex items-center gap-5 mb-8">
            <HotmartLogo height={40} />
            <div className="w-px h-10 bg-slate-200" />
            <div>
              <h2 className="font-headline font-black text-3xl text-slate-900 leading-none">Gestão de Vendas</h2>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-1">Período: {D(dateFrom)} → {D(dateTo)}</p>
            </div>
          </div>

          {/* KPI Cards — Hotmart orange */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Faturamento */}
            <div className="relative overflow-hidden rounded-[32px] p-8 shadow-sm border border-orange-200 bg-gradient-to-br from-[#FF6E2D]/10 via-orange-50 to-orange-50 group hover:shadow-lg transition-all">
              <div className="absolute top-4 right-6 opacity-10 pointer-events-none">
                <svg width="80" height="80" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 28V12h4v6.5c1.2-1.1 2.7-1.7 4.3-1.7 3.7 0 6.2 2.6 6.2 6.4 0 3.8-2.6 6.5-6.3 6.5-1.7 0-3.1-.6-4.2-1.7V28H13zm4-4.8c0 2 1.3 3.4 3.2 3.4 1.9 0 3.1-1.3 3.1-3.3 0-2-1.2-3.3-3.1-3.3-1.9 0-3.2 1.3-3.2 3.2z" fill="#FF6E2D"/>
                </svg>
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 mb-1">Faturamento no Período</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-orange-800/50 mb-4">receita bruta · Hotmart</p>
                <p className="font-headline font-black text-5xl text-slate-900 tracking-tighter leading-none">{R(totalRevenue)}</p>
              </div>
            </div>

            {/* Número de Vendas */}
            <div className="relative overflow-hidden rounded-[32px] p-8 shadow-sm border border-orange-200 bg-gradient-to-br from-[#FF6E2D]/10 via-orange-50 to-orange-50 group hover:shadow-lg transition-all">
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-[100px] leading-none text-orange-500">shopping_cart</span>
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 mb-1">Número de Vendas</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-orange-800/50 mb-4">transações confirmadas</p>
                <p className="font-headline font-black text-5xl text-slate-900 tracking-tighter leading-none">{N(totalSalesCount)}</p>
              </div>
            </div>
          </div>

          {/* Filtro por Produto */}
          {uniqueProducts.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm mb-8">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">filter_alt</span>
                Filtrar por Produto
              </p>
              <div className="flex flex-wrap gap-2">
                {uniqueProducts.map(p => {
                  const isSelected = selectedProductTags.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => setSelectedProductTags(prev => isSelected ? prev.filter(t => t !== p) : [...prev, p])}
                      className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border ${isSelected ? 'text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-orange-200'}`}
                      style={isSelected ? { background: HM_ORANGE, borderColor: HM_ORANGE } : {}}
                    >
                      {p}
                    </button>
                  );
                })}
                {selectedProductTags.length > 0 && (
                  <button onClick={() => setSelectedProductTags([])} className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tabela */}
          <div className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden mb-12">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-black text-slate-900 text-base">Vendas Recentes</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredSales.length} transações no período</p>
                </div>
              </div>
              <button onClick={() => window.print()} className="px-5 py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg flex items-center gap-2 hover:bg-black transition-all">
                <span className="material-symbols-outlined text-lg">picture_as_pdf</span> PDF
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Data / Hora</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Valor</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Pagamento</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Cliente</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Produto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales
                    .sort((a: any, b: any) => new Date(b.purchase.order_date).getTime() - new Date(a.purchase.order_date).getTime())
                    .map((s: any, idx: number) => {
                      const dt = formatDateTime(s.purchase.order_date);
                      const paymentMethod = s.purchase?.payment?.type || s.purchase?.payment_type || s.purchase?.payment?.method || '';
                      return (
                        <tr key={idx} className={`border-b border-slate-50 hover:bg-orange-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-slate-900">{typeof dt === 'object' ? dt.date : dt}</span>
                              <span className="text-[10px] font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px]">schedule</span>
                                {typeof dt === 'object' ? dt.time : ''}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="font-black text-slate-900 text-base">{R(s.purchase.price.value)}</span>
                          </td>
                          <td className="py-4 px-6">
                            <PaymentBadge method={paymentMethod} />
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-slate-800">{s.buyer.name}</span>
                              <span className="text-[10px] font-bold text-slate-400">{s.buyer.email}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-tight">{s.product.name}</span>
                          </td>
                        </tr>
                      );
                    })}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-slate-400 font-bold uppercase text-[11px] tracking-widest">
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
