import React, { useState } from 'react';
import { R, N, P } from '@/app/lib/utils';

export function TopPageCard({ page, type, rank }: { page: any; type: 'VENDAS' | 'LEADS'; rank: number }) {
  const isVendas = type === 'VENDAS';
  const resultValue = isVendas ? (page.purchases || 0) : (page.leads || 0);
  const resultLabel = isVendas ? 'Vendas' : 'Leads';
  const convRate = isVendas ? (page.salesConv || 0) : (page.leadsConv || 0);
  const bg     = isVendas ? 'bg-emerald-50' : 'bg-sky-50';
  const border = isVendas ? 'border-emerald-100' : 'border-sky-100';

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
  const [acTags, setAcTags] = React.useState<{ name: string }[]>([]);
  const [phone, setPhone] = React.useState<string>(customer.phone || '');

  const GOLD   = '#E8B14F';
  const SILVER = '#A8B2C0';
  const NAVY   = '#001a35';

  // Auto-load AC tags + phone fallback on mount
  React.useEffect(() => {
    if (!customer.email) return;
    fetch(`/api/leads/contact-by-email?email=${encodeURIComponent(customer.email)}`)
      .then(r => r.json())
      .then(d => {
        setAcTags(d.tags || []);
        if (!customer.phone && d.contact?.phone) setPhone(d.contact.phone);
      })
      .catch(() => {});
  }, [customer.email]);

  const scoreStyle =
    customer.score === 'TOP' ? { bg: 'rgba(232,177,79,0.25)',  color: GOLD,      border: 'rgba(232,177,79,0.5)'  } :
    customer.score === 'BOM' ? { bg: 'rgba(74,222,128,0.20)',  color: '#4ade80', border: 'rgba(74,222,128,0.45)' } :
                               { bg: 'rgba(255,255,255,0.10)', color: SILVER,    border: 'rgba(255,255,255,0.18)' };

  const rankColor =
    rank === 1 ? { bg: '#E8B14F', color: NAVY,  glow: '0 0 20px rgba(232,177,79,0.7)'  } :
    rank === 2 ? { bg: '#9BAAC0', color: '#fff', glow: '0 0 12px rgba(155,170,192,0.5)' } :
    rank === 3 ? { bg: '#CD7F32', color: '#fff', glow: '0 0 12px rgba(205,127,50,0.5)'  } :
                 { bg: 'rgba(255,255,255,0.12)', color: '#fff', glow: 'none' };

  const pmIcon = (pm: string) => {
    const m = (pm || '').toUpperCase();
    if (m.includes('PIX'))    return 'bolt';
    if (m.includes('CREDIT') || m.includes('CARD')) return 'credit_card';
    if (m.includes('BOLETO') || m.includes('BILLET')) return 'receipt';
    if (m.includes('DEBIT'))  return 'credit_card';
    if (m.includes('PAYPAL')) return 'account_balance_wallet';
    return 'payments';
  };

  const pmLabel = (pm: string) => {
    const m = (pm || '').toUpperCase();
    if (m.includes('PIX'))    return 'Pix';
    if (m.includes('CREDIT')) return 'Crédito';
    if (m.includes('BOLETO')) return 'Boleto';
    if (m.includes('DEBIT'))  return 'Débito';
    return pm;
  };

  const sources: string[] = customer.sources || [];
  const studentLink = customer.studentId ? `/alunos/${customer.studentId}` : null;

  const cardBg      = 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 50%, rgba(0,10,35,0.55) 100%)';
  const cardBgHover = 'linear-gradient(160deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 50%, rgba(0,10,35,0.45) 100%)';

  return (
    <div
      className="group flex flex-col gap-4 p-6 rounded-3xl transition-all duration-200"
      style={{
        background: cardBg,
        border: rank <= 3 ? '1px solid rgba(232,177,79,0.30)' : '1px solid rgba(255,255,255,0.10)',
        boxShadow: rank <= 3
          ? '0 6px 40px rgba(232,177,79,0.10), 0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.3) inset'
          : '0 2px 20px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset',
        backdropFilter: 'blur(20px)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = cardBgHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = cardBg; }}
    >
      {/* Row 1: Rank + Name + Revenue */}
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center font-black text-[15px]"
          style={{ background: rankColor.bg, color: rankColor.color, boxShadow: rankColor.glow }}>
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {studentLink ? (
              <a href={studentLink}
                className="font-black text-white text-[17px] uppercase tracking-tight leading-snug hover:underline decoration-amber-400 underline-offset-2">
                {customer.name || customer.email}
              </a>
            ) : (
              <p className="font-black text-white text-[17px] uppercase tracking-tight leading-snug">
                {customer.name || customer.email}
              </p>
            )}
            <span className="flex-shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
              style={{ background: scoreStyle.bg, color: scoreStyle.color, border: `1px solid ${scoreStyle.border}` }}>
              {customer.score}
            </span>
          </div>
          <p className="text-[13px] font-medium" style={{ color: SILVER }}>{customer.email}</p>
          {phone && (
            <p className="text-[13px] font-bold mt-0.5" style={{ color: SILVER }}>📞 {phone}</p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className="font-black text-[22px] leading-none" style={{ color: GOLD }}>
            {(customer.totalRevenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })}
          </p>
          <p className="text-[12px] font-bold mt-1" style={{ color: SILVER }}>
            {customer.purchaseCount} compra{customer.purchaseCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Row 2: Sources + Products */}
      <div className="flex flex-wrap gap-2 items-center">
        {sources.map((s: string, i: number) => (
          <span key={i} className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg"
            style={s === 'Hotmart'
              ? { background: 'rgba(255,100,0,0.18)', color: '#ff8040', border: '1px solid rgba(255,100,0,0.3)' }
              : { background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
            {s}
          </span>
        ))}
        {(customer.products as string[] || []).slice(0, 4).map((p: string, i: number) => (
          <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg max-w-[240px] truncate"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
            {p}
          </span>
        ))}
        {(customer.products?.length || 0) > 4 && (
          <span className="text-[12px] font-bold" style={{ color: SILVER }}>+{customer.products.length - 4}</span>
        )}
      </div>

      {/* Row 3: AC Tags (auto-loaded on mount) */}
      {acTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[9px] font-black uppercase tracking-widest mr-1" style={{ color: SILVER }}>ActiveCampaign</span>
          {acTags.slice(0, 8).map((t, i) => (
            <span key={i} className="text-[11px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' }}>
              {t.name}
            </span>
          ))}
          {acTags.length > 8 && (
            <span className="text-[11px] font-bold" style={{ color: SILVER }}>+{acTags.length - 8}</span>
          )}
        </div>
      )}

      {/* Row 4: Payment methods */}
      <div className="flex flex-wrap gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {(customer.paymentMethods as string[] || []).slice(0, 4).map((pm: string, i: number) => (
          <span key={i} className="flex items-center gap-1 text-[11px] font-bold rounded-xl px-2.5 py-1"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
            <span className="material-symbols-outlined text-[13px]">{pmIcon(pm)}</span>
            {pmLabel(pm)}
          </span>
        ))}
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
      <div className="absolute inset-0">
        <img src="/xray-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'saturate(0.7) brightness(0.45)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,10,30,0.85) 0%, rgba(0,20,50,0.70) 50%, rgba(0,8,25,0.88) 100%)' }} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ width: 600, height: 600, background: 'radial-gradient(ellipse, rgba(232,177,79,0.08) 0%, transparent 70%)', borderRadius: '50%' }} />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-[440px] mx-6" style={{ animation: 'fadeInUp 0.7s cubic-bezier(.16,1,.3,1) both' }}>
        <style>{`
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(32px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes shimmer { 0% { transform: translateX(-100%) skewX(-12deg); } 100% { transform: translateX(300%) skewX(-12deg); } }
          .login-btn:hover .shimmer { animation: shimmer 0.9s ease forwards; }
        `}</style>

        <div className="absolute -inset-[1px] rounded-[36px] pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(232,177,79,0.4) 0%, rgba(255,255,255,0.05) 50%, rgba(232,177,79,0.15) 100%)' }} />

        <div className="relative rounded-[34px] p-10 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(0,18,48,0.96) 0%, rgba(0,10,32,0.98) 100%)', boxShadow: '0 4px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.5) inset, 0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,177,79,0.12)', backdropFilter: 'blur(40px)' }}>

          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 30%, rgba(232,177,79,0.3) 50%, rgba(255,255,255,0.18) 70%, transparent 100%)' }} />
          <div className="absolute top-0 left-0 right-0 h-40 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)', borderRadius: '34px 34px 0 0' }} />

          <div className="flex flex-col items-center mb-10">
            <div className="mb-6 relative">
              <div className="absolute inset-0 blur-2xl opacity-40" style={{ background: 'radial-gradient(ellipse, rgba(232,177,79,0.6) 0%, transparent 70%)' }} />
              <img src="/logo_radexperts.png" alt="RAD Experts" className="relative h-14 drop-shadow-lg" style={{ filter: 'brightness(1.1)' }} />
            </div>
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(232,177,79,0.3))' }} />
              <span className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: 'rgba(232,177,79,0.6)' }}>Data Center</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(232,177,79,0.3), transparent)' }} />
            </div>
            <p className="text-center text-[11px] font-medium leading-relaxed px-2" style={{ color: 'rgba(160,180,210,0.8)', fontStyle: 'italic' }}>"{greeting}"</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.25em] mb-2 ml-1" style={{ color: 'rgba(232,177,79,0.7)' }}>Usuário</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: 'rgba(160,180,210,0.5)' }}>person</span>
                <input type="text" value={user} onChange={e => setUser(e.target.value)}
                  className="w-full pl-11 pr-5 py-4 rounded-2xl text-sm font-bold outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)' }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(232,177,79,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onBlur={e  => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  placeholder="Insira seu login" required autoFocus />
              </div>
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.25em] mb-2 ml-1" style={{ color: 'rgba(232,177,79,0.7)' }}>Senha</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: 'rgba(160,180,210,0.5)' }}>lock</span>
                <input type="password" value={pass} onChange={e => setPass(e.target.value)}
                  className="w-full pl-11 pr-5 py-4 rounded-2xl text-sm font-bold outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)' }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(232,177,79,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onBlur={e  => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  placeholder="••••••••" required />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span className="material-symbols-outlined text-[15px] text-red-400">error</span>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="login-btn relative w-full overflow-hidden rounded-2xl py-5 mt-2 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #c99a38 0%, #E8B14F 40%, #d4a43e 100%)', boxShadow: '0 2px 0 rgba(255,255,255,0.25) inset, 0 -2px 0 rgba(0,0,0,0.25) inset, 0 12px 32px rgba(232,177,79,0.35)', color: '#001a35' }}>
              <div className="shimmer absolute top-0 left-0 w-1/3 h-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }} />
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

          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <p className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.2)' }}>v 3.0.0 · Acesso Restrito</p>
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
