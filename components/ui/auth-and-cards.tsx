import React, { useState } from 'react';
import { R, N, P } from '@/app/lib/utils';

export function TopPageCard({ page, type, rank }: { page: any; type: 'VENDAS' | 'LEADS'; rank: number }) {
  const isVendas = type === 'VENDAS';
  const bg = isVendas ? 'bg-emerald-50' : 'bg-sky-50';
  const border = isVendas ? 'border-emerald-100' : 'border-sky-100';
  const resultValue = isVendas ? (page.purchases || 0) : (page.leads || 0);
  const resultLabel = isVendas ? 'Vendas' : 'Leads';
  const convRate = isVendas ? (page.salesConv || 0) : (page.leadsConv || 0);

  return (
    <div className={`p-6 rounded-[32px] border ${border} ${bg} transition-all hover:shadow-xl group relative overflow-hidden h-full flex flex-col justify-between`}>
      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
        <span className="material-symbols-outlined text-[100px] text-slate-800">language</span>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-8 h-8 rounded-lg ${isVendas ? 'bg-emerald-600' : 'bg-sky-500'} text-white flex items-center justify-center font-black text-sm shadow-lg`}>{rank}</div>
        </div>
        <p className="text-slate-900 font-black text-lg break-all line-clamp-2 mb-4 leading-tight group-hover:text-blue-600 transition-colors uppercase tracking-tight" title={page.url}>
          {page.url.replace(/^https?:\/\//, '').split('?')[0]}
        </p>
      </div>
      <div className="mt-4 pt-4 border-t border-black/5 flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{resultLabel}</span>
          <span className="text-xl font-black text-slate-900">{N(resultValue)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Conv.</span>
          <span className="text-sm font-black text-slate-700">{P(convRate)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Investido</span>
          <span className="text-sm font-black text-slate-700">{R(page.spend || 0)}</span>
        </div>
        <a href={page.url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-200 shadow-sm transition-all hover:scale-110 flex-shrink-0">
          <span className="material-symbols-outlined text-[20px]">open_in_new</span>
        </a>
      </div>
    </div>
  );
}

export function CustomerCard({ customer, rank }: { customer: any; rank: number }) {
  const scoreBg =
    customer.score === 'TOP' ? 'bg-amber-400 text-white' :
    customer.score === 'BOM' ? 'bg-emerald-500 text-white' :
    'bg-slate-200 text-slate-500';

  const pmIcon = (pm: string) => {
    const m = (pm || '').toUpperCase();
    if (m.includes('PIX')) return { icon: 'bolt', label: 'Pix' };
    if (m.includes('CREDIT') || m.includes('CARD')) return { icon: 'credit_card', label: 'Crédito' };
    if (m.includes('BOLETO') || m.includes('BILLET')) return { icon: 'receipt', label: 'Boleto' };
    if (m.includes('DEBIT')) return { icon: 'credit_card', label: 'Débito' };
    if (m.includes('PAYPAL')) return { icon: 'account_balance_wallet', label: 'PayPal' };
    return { icon: 'payments', label: pm || '—' };
  };

  return (
    <div className={`group flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 md:px-5 py-4 md:py-3.5 rounded-2xl border transition-all hover:shadow-md hover:border-indigo-200 ${rank <= 3 ? 'bg-gradient-to-r from-slate-50 to-white border-slate-200' : 'bg-white border-slate-100'}`}>

      {/* Rank + Name row (mobile: side by side) */}
      <div className="flex items-start gap-3 md:contents">
        {/* Rank */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-sm ${
          rank === 1 ? 'bg-amber-400 text-white' :
          rank === 2 ? 'bg-slate-400 text-white' :
          rank === 3 ? 'bg-orange-400 text-white' :
          'bg-slate-800 text-white'}`}>{rank}</div>

        {/* Name + Email */}
        <div className="flex-1 md:flex-shrink-0 md:w-[200px] min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <p className="font-black text-slate-900 text-[12px] uppercase tracking-tight leading-snug">{customer.name}</p>
            <span className={`flex-shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${scoreBg}`}>{customer.score}</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium lowercase truncate">{customer.email}</p>
        </div>
      </div>

      {/* Products */}
      <div className="flex-1 flex flex-wrap gap-1 min-w-0">
        {(customer.products as string[] || []).map((p: string, i: number) => (
          <span key={i} className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 whitespace-nowrap">{p}</span>
        ))}
      </div>

      {/* Payment methods + Revenue: side by side on mobile */}
      <div className="flex items-center justify-between md:contents gap-4">
        {/* Payment methods */}
        <div className="flex-shrink-0 flex items-center flex-wrap gap-1">
          {(customer.paymentMethods as string[] || []).map((pm: string, i: number) => {
            const { icon, label } = pmIcon(pm);
            return (
              <span key={i} title={label} className="flex items-center gap-0.5 text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-1.5 py-1 whitespace-nowrap">
                <span className="material-symbols-outlined text-[11px] text-slate-400">{icon}</span>
                {label}
              </span>
            );
          })}
        </div>

        {/* Revenue + count */}
        <div className="flex-shrink-0 text-right md:ml-2">
          <p className="font-black text-slate-900 text-sm leading-none">{R(customer.totalRevenue)}</p>
          <p className="text-[10px] text-blue-500 font-bold mt-0.5">{customer.purchaseCount || customer.count} compras</p>
        </div>
      </div>
    </div>
  );
}

export function LoginScreen({ onLogin }: { onLogin: (token: string, role: string, name: string) => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao autenticar.');
        setLoading(false);
        return;
      }
      localStorage.setItem('auth_token_10x', data.token);
      onLogin(data.token, data.role, data.name);
    } catch {
      setError('Erro de conexão.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[150px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-violet-500 rounded-full blur-[150px]" />
      </div>
      <div className="w-full max-w-[420px] relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="bg-white rounded-[48px] p-12 shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-white/10">
          <div className="flex flex-col items-center mb-12">
            <img src="/logo_10x.png" alt="Advogado 10x" className="h-6 mb-4 filter drop-shadow-sm" />
            <div className="h-px w-8 bg-slate-100 mb-4" />
            <h1 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400">Restricted Access</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">USUÁRIO</label>
              <input
                type="text" value={user} onChange={e => setUser(e.target.value)}
                className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300 shadow-inner"
                placeholder="Insira seu login" required autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">SENHA</label>
              <input
                type="password" value={pass} onChange={e => setPass(e.target.value)}
                className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300 shadow-inner"
                placeholder="••••••••" required
              />
            </div>
            {error && (
              <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full bg-slate-900 border border-white/10 text-white font-black uppercase tracking-[0.2em] text-[10px] py-6 rounded-2xl hover:bg-black transition-all shadow-2xl active:scale-[0.98] disabled:opacity-50 group mt-4 overflow-hidden relative"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              ) : (
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Entrar no Data Center
                  <span className="material-symbols-outlined text-[14px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </span>
              )}
            </button>
          </form>
          <div className="mt-12 flex justify-center">
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">v 3.0.0-Lumina</p>
          </div>
        </div>
      </div>
    </div>
  );
}
