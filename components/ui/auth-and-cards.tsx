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

  const sources: string[] = customer.sources || [];

  return (
    <div className={`group flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 md:px-5 py-4 md:py-3.5 rounded-2xl border transition-all hover:shadow-md hover:border-indigo-200 ${rank <= 3 ? 'bg-gradient-to-r from-slate-50 to-white border-slate-200' : 'bg-white border-slate-100'}`}>

      {/* Rank + Name row */}
      <div className="flex items-start gap-3 md:contents">
        {/* Rank */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-sm ${
          rank === 1 ? 'bg-amber-400 text-white' :
          rank === 2 ? 'bg-slate-400 text-white' :
          rank === 3 ? 'bg-orange-400 text-white' :
          'bg-slate-800 text-white'}`}>{rank}</div>

        {/* Name + Email + Phone */}
        <div className="flex-1 md:flex-shrink-0 md:w-[220px] min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <p className="font-black text-slate-900 text-[12px] uppercase tracking-tight leading-snug">{customer.name}</p>
            <span className={`flex-shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${scoreBg}`}>{customer.score}</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium lowercase truncate">{customer.email}</p>
          {customer.phone && (
            <p className="text-[10px] text-slate-500 font-bold mt-0.5">
              📞 {customer.phone}
            </p>
          )}
        </div>
      </div>

      {/* Fontes */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1 flex-shrink-0">
          {sources.map((s: string, i: number) => (
            <span key={i} className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
              s === 'Hotmart' ? 'bg-orange-100 text-orange-600' :
              s === 'Manual'  ? 'bg-sky-100    text-sky-600'    :
              'bg-slate-100 text-slate-500'}`}>{s}</span>
          ))}
        </div>
      )}

      {/* Products */}
      <div className="flex-1 flex flex-wrap gap-1 min-w-0">
        {(customer.products as string[] || []).map((p: string, i: number) => (
          <span key={i} className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 whitespace-nowrap">{p}</span>
        ))}
      </div>

      {/* Payment methods + Revenue */}
      <div className="flex items-center justify-between md:contents gap-4">
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

const GREETINGS = [
  'Diagnóstico preciso começa com dados confiáveis.',
  'Cada imagem conta uma história. Cada dado, uma decisão.',
  'Transformando inteligência em resultados clínicos reais.',
  'Onde a radiologia encontra o poder da análise estratégica.',
  'Bem-vindo ao centro de comando da RAD Experts.',
  'Precisão diagnóstica elevada à máxima potência.',
  'Visão completa. Tomada de decisão cirúrgica.',
];

export function LoginScreen({ onLogin }: { onLogin: (token: string, role: string, name: string) => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Background: x-ray image with dark overlay ── */}
      <div className="absolute inset-0">
        <img
          src="/xray-bg.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'saturate(0.7) brightness(0.45)' }}
        />
        {/* Dark navy gradient over the image */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, rgba(0,10,30,0.85) 0%, rgba(0,20,50,0.70) 50%, rgba(0,8,25,0.88) 100%)' }} />
        {/* Radial gold glow behind the card */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ width: 600, height: 600, background: 'radial-gradient(ellipse, rgba(232,177,79,0.08) 0%, transparent 70%)', borderRadius: '50%' }} />
        </div>
      </div>

      {/* ── Glossy login card ── */}
      <div className="relative z-10 w-full max-w-[440px] mx-6"
        style={{ animation: 'fadeInUp 0.7s cubic-bezier(.16,1,.3,1) both' }}>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(32px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)    scale(1);    }
          }
          @keyframes shimmer {
            0%   { transform: translateX(-100%) skewX(-12deg); }
            100% { transform: translateX(300%)  skewX(-12deg); }
          }
          .login-btn:hover .shimmer { animation: shimmer 0.9s ease forwards; }
        `}</style>

        {/* Outer glow ring */}
        <div className="absolute -inset-[1px] rounded-[36px] pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(232,177,79,0.4) 0%, rgba(255,255,255,0.05) 50%, rgba(232,177,79,0.15) 100%)' }} />

        {/* Card glass */}
        <div className="relative rounded-[34px] p-10 overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, rgba(0,18,48,0.96) 0%, rgba(0,10,32,0.98) 100%)',
            boxShadow: '0 4px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.5) inset, 0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,177,79,0.12)',
            backdropFilter: 'blur(40px)',
          }}>

          {/* Glass highlight top */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 30%, rgba(232,177,79,0.3) 50%, rgba(255,255,255,0.18) 70%, transparent 100%)' }} />

          {/* Subtle inner gloss arc */}
          <div className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)', borderRadius: '34px 34px 0 0' }} />

          {/* ── Logo ── */}
          <div className="flex flex-col items-center mb-10">
            <div className="mb-6 relative">
              {/* Gold glow behind logo */}
              <div className="absolute inset-0 blur-2xl opacity-40"
                style={{ background: 'radial-gradient(ellipse, rgba(232,177,79,0.6) 0%, transparent 70%)' }} />
              <img
                src="/logo_radexperts.png"
                alt="RAD Experts"
                className="relative h-14 drop-shadow-lg"
                style={{ filter: 'brightness(1.1)' }}
              />
            </div>
            {/* Divider */}
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(232,177,79,0.3))' }} />
              <span className="text-[9px] font-black uppercase tracking-[0.4em]"
                style={{ color: 'rgba(232,177,79,0.6)' }}>Data Center</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(232,177,79,0.3), transparent)' }} />
            </div>
            {/* Greeting */}
            <p className="text-center text-[11px] font-medium leading-relaxed px-2"
              style={{ color: 'rgba(160,180,210,0.8)', fontStyle: 'italic' }}>
              "{greeting}"
            </p>
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* User field */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.25em] mb-2 ml-1"
                style={{ color: 'rgba(232,177,79,0.7)' }}>Usuário</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px]"
                  style={{ color: 'rgba(160,180,210,0.5)' }}>person</span>
                <input
                  type="text" value={user} onChange={e => setUser(e.target.value)}
                  className="w-full pl-11 pr-5 py-4 rounded-2xl text-sm font-bold outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
                  }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(232,177,79,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  placeholder="Insira seu login" required autoFocus
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.25em] mb-2 ml-1"
                style={{ color: 'rgba(232,177,79,0.7)' }}>Senha</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px]"
                  style={{ color: 'rgba(160,180,210,0.5)' }}>lock</span>
                <input
                  type="password" value={pass} onChange={e => setPass(e.target.value)}
                  className="w-full pl-11 pr-5 py-4 rounded-2xl text-sm font-bold outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
                  }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(232,177,79,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  placeholder="••••••••" required
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span className="material-symbols-outlined text-[15px] text-red-400">error</span>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit" disabled={loading}
              className="login-btn relative w-full overflow-hidden rounded-2xl py-5 mt-2 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #c99a38 0%, #E8B14F 40%, #d4a43e 100%)',
                boxShadow: '0 2px 0 rgba(255,255,255,0.25) inset, 0 -2px 0 rgba(0,0,0,0.25) inset, 0 12px 32px rgba(232,177,79,0.35)',
                color: '#001a35',
              }}>
              {/* Shimmer */}
              <div className="shimmer absolute top-0 left-0 w-1/3 h-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }} />
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#001a35', animationDelay: '0s' }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#001a35', animationDelay: '0.12s' }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#001a35', animationDelay: '0.24s' }} />
                </div>
              ) : (
                <span className="relative font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-2">
                  Entrar no Data Center
                  <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                </span>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <p className="text-[8px] font-black uppercase tracking-[0.3em]"
              style={{ color: 'rgba(255,255,255,0.2)' }}>v 3.0.0 · Acesso Restrito</p>
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
