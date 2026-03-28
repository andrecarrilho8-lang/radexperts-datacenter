'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, N, D } from '@/app/lib/utils';
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

  const filteredSales = (data.hotmartSales || []).filter((s: any) =>
    selectedProductTags.length === 0 || selectedProductTags.includes(s.product?.name)
  );

  const totalRevenue    = filteredSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.value || 0), 0);
  const totalSalesCount = filteredSales.length;
  const uniqueProducts  = Array.from(new Set((data.hotmartSales || []).map((s: any) => s.product?.name))).filter(Boolean).sort() as string[];

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: '—', time: '' };
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const cardBorder = 'rgba(255,255,255,0.08)';

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-20" style={{ backgroundColor: NAVY }}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {[
              { label: 'Faturamento no Período', sub: 'receita bruta · Hotmart', value: R(totalRevenue),    icon: 'payments',      accent: GOLD },
              { label: 'Número de Vendas',       sub: 'transações confirmadas',  value: N(totalSalesCount), icon: 'shopping_cart', accent: '#22c55e' },
            ].map(k => (
              <div key={k.label} style={{ ...glossy, padding: '28px 32px', minHeight: 140 }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 40%)', borderRadius: 24 }} />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[20px]" style={{ color: k.accent }}>{k.icon}</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: k.accent }}>{k.label}</p>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: SILVER }}>{k.sub}</p>
                  <p className="font-headline font-black text-5xl text-white tracking-tighter leading-none">{k.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtro por Produto */}
          {uniqueProducts.length > 0 && (
            <div className="rounded-[24px] p-6 mb-8"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cardBorder}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: SILVER }}>
                <span className="material-symbols-outlined text-sm" style={{ color: GOLD }}>filter_alt</span>
                Filtrar por Produto
              </p>
              <div className="flex flex-wrap gap-2">
                {uniqueProducts.map(p => {
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
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cardBorder}` }}>

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
                    {['Data / Hora', 'Valor', 'Pagamento', 'Cliente', 'Produto'].map((h, i) => (
                      <th key={h} className={`py-4 px-6 text-[10px] font-black uppercase tracking-widest ${i === 1 ? 'text-right' : ''}`}
                        style={{ color: SILVER }}>
                        {h}
                      </th>
                    ))}
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
                          style={{ background: idx % 2 === 0 ? '透明' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}>
                          <td className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-white">{dt.date}</span>
                              <span className="text-[10px] font-bold mt-0.5 flex items-center gap-1" style={{ color: SILVER }}>
                                <span className="material-symbols-outlined text-[11px]">schedule</span>{dt.time}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="font-black text-white text-base" style={{ color: GOLD }}>{R(s.purchase.price.value)}</span>
                          </td>
                          <td className="py-4 px-6"><PaymentBadge method={paymentMethod} /></td>
                          <td className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-white">{s.buyer.name}</span>
                              <span className="text-[10px] font-bold" style={{ color: SILVER }}>{s.buyer.email}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="text-[11px] font-black uppercase tracking-tight" style={{ color: SILVER }}>{s.product.name}</span>
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
