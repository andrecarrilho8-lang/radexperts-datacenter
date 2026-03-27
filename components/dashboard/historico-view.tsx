'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { R, N, D, P } from '@/app/lib/utils';
import { TopPageCard, CustomerCard } from '@/components/ui/auth-and-cards';
import { TopAdCard } from '@/components/dashboard/campaign-details';

type HistTab = 'MENU' | 'ADS_VENDAS' | 'ADS_LEADS' | 'PAGES_VENDAS' | 'PAGES_LEADS' | 'EXTRATO' | 'RECORRENCIA';

export function HistoricoView() {
  const [tab, setTab] = useState<HistTab>('MENU');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState('2026');

  const fetchHistorico = useCallback((type: HistTab, force = false, targetYear?: string) => {
    if (type === 'MENU') {
      setData([]);
      setTab('MENU');
      return;
    }
    const currentYear = targetYear || year;
    setTab(type);
    setLoading(true);
    setData([]);

    const forceParam = force ? '1' : '0';
    let url = `/api/meta/historico?type=${type}&force=${forceParam}`;
    if (type === 'EXTRATO') url = `/api/meta/historico/mensal?year=${currentYear}&force=${forceParam}`;
    if (type === 'RECORRENCIA') url = `/api/hotmart/historico/recorrencia?force=${forceParam}`;

    fetch(url)
      .then(r => r.json())
      .then(j => {
        setData(j.results || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year]);

  if (tab === 'MENU') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
        <MenuCard icon="🛒" title="Top Anúncios de Vendas" sub="10 criativos com mais volume de compras" color="violet-600" onClick={() => fetchHistorico('ADS_VENDAS')} />
        <MenuCard icon="🌐" title="Top Páginas de Vendas" sub="10 páginas com melhor taxa de conversão" color="emerald-600" onClick={() => fetchHistorico('PAGES_VENDAS')} />
        <MenuCard icon="🎯" title="Top Anúncios de Captação" sub="10 criativos com mais geração de leads" color="amber-500" onClick={() => fetchHistorico('ADS_LEADS')} />
        <MenuCard icon="📄" title="Top Páginas de Captação" sub="10 páginas com melhor conversão de leads" color="amber-600" onClick={() => fetchHistorico('PAGES_LEADS')} />
        <MenuCard icon="📑" title="Extrato Mensal" sub="Investimento e faturamento detalhado por mês" color="slate-800" onClick={() => fetchHistorico('EXTRATO')} />
        <MenuCard icon="💎" title="Clientes com maior LTV" sub="Top 100 clientes por receita acumulada" color="indigo-800" onClick={() => fetchHistorico('RECORRENCIA')} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 pb-20">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => setTab('MENU')} className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 border border-slate-200">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Menu de Inteligência
        </button>
        {tab === 'EXTRATO' && (
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            {['2025', '2026'].map(y => (
              <button key={y} onClick={() => { setYear(y); fetchHistorico('EXTRATO', false, y); }} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${year === y ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>{y}</button>
            ))}
          </div>
        )}
      </div>

      <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden min-h-[400px]">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-3xl shadow-xl">
             {tab === 'ADS_VENDAS' || tab === 'ADS_LEADS' ? '📊' : tab.includes('PAGES') ? '🌐' : tab === 'EXTRATO' ? '📑' : '💎'}
          </div>
          <h3 className="font-headline font-black text-3xl text-slate-900">
            {tab === 'ADS_VENDAS' && 'Top 10 Anúncios de Vendas'}
            {tab === 'PAGES_VENDAS' && 'Top 10 Páginas de Vendas'}
            {tab === 'ADS_LEADS' && 'Top 10 Anúncios de Captação'}
            {tab === 'PAGES_LEADS' && 'Top 10 Páginas de Captação'}
            {tab === 'EXTRATO' && `Extrato Mensal ${year}`}
            {tab === 'RECORRENCIA' && 'Clientes com maior LTV'}
          </h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
             <div className="w-12 h-12 border-4 border-violet-500 border-t-white rounded-full animate-spin"/>
             <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Analisando Data Lake...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16 text-slate-400 font-bold">Nenhum dado encontrado no semestre.</div>
        ) : (
          <div className={`grid grid-cols-1 ${tab === 'EXTRATO' || tab === 'RECORRENCIA' ? '' : 'lg:grid-cols-2'} gap-3`}>
            {data.map((item, i) => (
              <RenderListItem key={i} item={item} rank={i + 1} type={tab} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MenuCard({ icon, title, sub, color, onClick }: any) {
  return (
    <button onClick={onClick} className="flex items-center gap-4 bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 hover:shadow-xl hover:border-violet-300 transition-all text-left group">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg transition-transform group-hover:scale-110`} style={{ backgroundColor: color === 'violet-600' ? '#7c3aed' : color === 'emerald-600' ? '#059669' : color === 'amber-500' ? '#f59e0b' : color === 'amber-600' ? '#d97706' : color === 'slate-800' ? '#1e293b' : '#3730a3' }}>{icon}</div>
      <div>
        <h3 className="font-headline font-black text-2xl text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 font-bold opacity-80">{sub}</p>
      </div>
    </button>
  );
}

function RenderListItem({ item, rank, type }: any) {
  if (type === 'ADS_VENDAS' || type === 'ADS_LEADS') return <TopAdCard ad={item} type={type === 'ADS_VENDAS' ? 'VENDAS' : 'LEADS'} rank={rank} />;
  if (type === 'PAGES_VENDAS' || type === 'PAGES_LEADS') return <TopPageCard page={item} type={type === 'PAGES_VENDAS' ? 'VENDAS' : 'LEADS'} rank={rank} />;
  if (type === 'RECORRENCIA') return <CustomerCard customer={item} rank={rank} />;
  
  if (type === 'EXTRATO') {
    const months = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const isTotals = item.month === 0;
    const hotmart = item.hotmartRevenue || 0;

    if (isTotals) {
      return (
        <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 mt-4 shadow-xl">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total do Ano</p>
            <p className="font-black text-white text-lg leading-tight">CONSOLIDADO</p>
          </div>
          <div className="hidden sm:block w-px h-10 bg-slate-700" />
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Investido</p>
            <p className="font-black text-white text-lg">{R(item.spend)}</p>
          </div>
          <div className="hidden sm:block w-px h-10 bg-slate-700" />
          <div className="sm:flex-1 sm:text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Faturado Hotmart</p>
            <p className="font-black text-emerald-400 text-2xl">{R(hotmart)}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl px-4 md:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all">
        <div className="flex items-center justify-between sm:block sm:min-w-[130px]">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês</p>
          <p className="font-black text-slate-900">{months[item.month]}</p>
        </div>
        <div className="hidden sm:block w-px h-8 bg-slate-100" />
        <div className="hidden sm:block min-w-[140px]">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Investido</p>
          <p className="font-black text-slate-900">{R(item.spend)}</p>
        </div>
        {/* Mobile: show investido + faturamento side by side */}
        <div className="flex items-center justify-between sm:hidden">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Investido</p>
            <p className="font-black text-slate-900">{R(item.spend)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fat. Hotmart</p>
            <p className="font-black text-emerald-600 text-lg">{R(hotmart)}</p>
          </div>
        </div>
        <div className="hidden sm:block w-px h-8 bg-slate-100" />
        <div className="hidden sm:block flex-1 text-right">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Faturamento Hotmart</p>
          <p className="font-black text-emerald-600 text-lg">{R(hotmart)}</p>
        </div>
      </div>
    );
  }
  return null;
}

