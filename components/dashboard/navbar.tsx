'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { today, Preset } from '@/app/lib/utils';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

const TRAFEGO_ITEMS = [
  { label: 'Campanhas',        href: '/campanhas',         icon: 'campaign'   },
  { label: 'Campanhas Ativas', href: '/campanhas-ativas',  icon: 'bolt'       },
  { label: 'Análise',          href: '/trafego/analise',   icon: 'analytics'  },
  { label: 'Histórico',        href: '/historico',         icon: 'history'    },
];

const FINANCEIRO_ITEMS = [
  { label: 'Overview', href: '/financeiro/overview', icon: 'account_balance_wallet' },
];

export function Navbar() {
  const { dateFrom, dateTo, setDateRange, activePreset, setActivePreset, presets, userRole, userName, logout } = useDashboard();
  const [showCustom,     setShowCustom]     = useState(false);
  const [mobileOpen,     setMobileOpen]     = useState(false);
  const [trafegoOpen,    setTrafegoOpen]    = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [tmpFrom, setTmpFrom] = useState(dateFrom);
  const [tmpTo,   setTmpTo]   = useState(dateTo);
  const pathname      = usePathname();
  const customRef     = useRef<HTMLDivElement>(null);
  const trafegoRef    = useRef<HTMLDivElement>(null);
  const financeiroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function clickOutside(e: MouseEvent) {
      if (customRef.current     && !customRef.current.contains(e.target as Node))     setShowCustom(false);
      if (trafegoRef.current    && !trafegoRef.current.contains(e.target as Node))    setTrafegoOpen(false);
      if (financeiroRef.current && !financeiroRef.current.contains(e.target as Node)) setFinanceiroOpen(false);
    }
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  useEffect(() => { setMobileOpen(false); setTrafegoOpen(false); setFinanceiroOpen(false); }, [pathname]);

  const applyPreset = (p: Preset) => {
    setDateRange(p.from, p.to);
    setActivePreset(p.label);
    setTmpFrom(p.from);
    setTmpTo(p.to);
    setMobileOpen(false);
  };

  const applyCustom = () => {
    setDateRange(tmpFrom, tmpTo);
    setActivePreset('Personalizado');
    setShowCustom(false);
  };

  const isTrafegoActive    = TRAFEGO_ITEMS.some(i => pathname.startsWith(i.href));
  const isFinanceiroActive = FINANCEIRO_ITEMS.some(i => pathname.startsWith(i.href));

  const topNavItems = [
    { label: 'Resumo',  href: '/resumo',  roles: ['TOTAL', 'NORMAL', 'TRAFEGO'] },
    { label: 'Hotmart', href: '/hotmart', roles: ['TOTAL', 'COMERCIAL'] },
  ];
  const navItems = topNavItems.filter(i => i.roles.includes(userRole));

  const showTrafego    = userRole === 'TOTAL' || userRole === 'NORMAL' || userRole === 'TRAFEGO';
  const showCursos     = userRole === 'TOTAL' || userRole === 'NORMAL' || userRole === 'COMERCIAL';
  const showAlunos     = userRole === 'TOTAL' || userRole === 'NORMAL' || userRole === 'COMERCIAL';
  const showLeads      = userRole === 'TOTAL' || userRole === 'COMERCIAL';
  const showFinanceiro = userRole === 'TOTAL';
  const showAdmin      = userRole === 'TOTAL';

  const isCursosActive = pathname.startsWith('/cursos');
  const isAlunosActive = pathname === '/alunos';

  const homePage =
    userRole === 'TRAFEGO'   ? '/campanhas' :
    userRole === 'COMERCIAL' ? '/hotmart'   : '/resumo';

  // ── Shared link style helpers ────────────────────────────
  const menuLinkStyle = (active: boolean): React.CSSProperties => ({
    color: active ? '#fff' : NAVY,
    background: active ? 'rgba(0,0,0,0.18)' : 'transparent',
    fontWeight: 900,
  });

  // ── Top bar: Navy glossy ───────────────────────────────────
  const topbarStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(18,22,36,0.97) 0%, rgba(24,28,42,0.97) 50%, rgba(18,22,36,0.97) 100%)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 2px 20px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
  };

  // ── Menu bar: Charcoal glossy ──────────────────────────────
  const menubarStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(232,177,79,0.72) 0%, rgba(216,160,50,0.75) 50%, rgba(232,177,79,0.72) 100%)',
    borderBottom: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '0 4px 24px rgba(200,146,42,0.35), 0 1px 0 rgba(255,255,255,0.4) inset',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  // ── Dropdown shared style ──────────────────────────────────
  const dropdownStyle: React.CSSProperties = {
    background: 'linear-gradient(160deg, rgba(0,16,40,0.99) 0%, rgba(0,10,28,0.99) 100%)',
    border: '1px solid rgba(232,177,79,0.15)',
    backdropFilter: 'blur(24px)',
  };

  return (
    <>
      {/* ════════════════════════════════════════════════════
          TOP BAR  —  Logo · Data Center | Presets · User
          ════════════════════════════════════════════════════ */}
      <div className="fixed top-0 w-full z-50 h-[62px] flex items-center justify-between px-4 md:px-8" style={topbarStyle}>

        {/* Left: Logo + Data Center */}
        <Link href={homePage} className="flex items-center gap-3 group transition-opacity hover:opacity-80">
          <img src="/logo_radexperts.png" alt="RadExperts" className="h-9 object-contain" />
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse hidden sm:block" style={{ background: GOLD }} />
            <span className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: GOLD }}>Data Center</span>
          </div>
        </Link>

        {/* Right: Presets + User + Icons */}
        <div className="flex items-center gap-2 md:gap-3">

          {/* Date presets — hidden on small screens */}
          <div className="hidden lg:flex items-center gap-1.5 relative" ref={customRef}>
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl border"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
              {presets.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className="px-3 py-1.5 rounded-lg font-black text-[8px] uppercase tracking-widest transition-all"
                  style={activePreset === p.label
                    ? { background: GOLD, color: NAVY, boxShadow: '0 2px 8px rgba(232,177,79,0.4)' }
                    : { color: SILVER }
                  }>
                  {p.label}
                </button>
              ))}
            </div>

            <button onClick={() => setShowCustom(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[8px] uppercase tracking-widest transition-all border"
              style={activePreset === 'Personalizado'
                ? { background: GOLD, color: NAVY, borderColor: GOLD }
                : { background: 'rgba(255,255,255,0.06)', color: SILVER, borderColor: 'rgba(255,255,255,0.1)' }
              }>
              <span className="material-symbols-outlined text-[15px] leading-none">calendar_month</span>
              <span className="hidden xl:inline">Calendário</span>
            </button>

            {showCustom && (
              <div className="absolute top-full right-0 mt-1 z-[100] rounded-2xl p-6 shadow-2xl flex flex-col gap-4 min-w-[260px] border"
                style={{ background: '#001a35', borderColor: 'rgba(232,177,79,0.2)', boxShadow: '0 32px 64px rgba(0,0,0,0.8)' }}>
                <header className="flex justify-between items-center pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="font-black text-[9px] uppercase tracking-widest" style={{ color: GOLD }}>Período customizado</p>
                  <span className="material-symbols-outlined text-sm" style={{ color: SILVER }}>settings_input_component</span>
                </header>
                {[{lbl:'De',val:tmpFrom,set:setTmpFrom,max:tmpTo},{lbl:'Até',val:tmpTo,set:setTmpTo,min:tmpFrom,max:today}].map(f => (
                  <div key={f.lbl} className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{f.lbl}</label>
                    <input type="date" value={f.val} max={f.max} min={f.min} onChange={e => f.set(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs font-bold outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
                  </div>
                ))}
                <button onClick={applyCustom} className="w-full py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest"
                  style={{ background: GOLD, color: NAVY }}>
                  Atualizar Vista
                </button>
              </div>
            )}
          </div>

          <div className="hidden lg:block w-px h-5" style={{ background: 'rgba(255,255,255,0.12)' }} />

          {/* User info */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'rgba(168,178,192,0.6)' }}>Olá,</span>
              <span className="text-[9px] font-black flex items-center gap-1" style={{ color: '#22c55e' }}>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {userName || 'Usuário'}
              </span>
            </div>
          </div>

          {showAdmin && (
            <Link href="/admin" title="Gerenciar Usuários"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: SILVER }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = SILVER; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}>
              <span className="material-symbols-outlined text-[15px]">manage_accounts</span>
            </Link>
          )}

          <button onClick={logout} title="Sair"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all border"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: SILVER }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = SILVER; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}>
            <span className="material-symbols-outlined text-[15px]">logout</span>
          </button>

          {/* Hamburger — mobile only */}
          <button onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center border"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: SILVER }}>
            <span className="material-symbols-outlined text-[18px]">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          MENU BAR  —  Navigation links (desktop)
          ════════════════════════════════════════════════════ */}
      <div className="fixed top-[62px] w-full z-40 h-[44px] hidden md:flex items-stretch" style={menubarStyle}>

        {/* Nav links */}
        <div className="flex items-stretch gap-0 px-6 lg:px-8 h-full">

          {/* Resumo / Hotmart */}
          {navItems.map(item => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className="text-[11px] font-black uppercase tracking-[0.18em] transition-all relative flex items-center px-4 h-full"
                style={menuLinkStyle(isActive)}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(0,0,0,0.12)'; }}}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = 'transparent'; }}}>
                {item.label}
                {isActive && <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)' }} />}
              </Link>
            );
          })}

          {/* TRÁFEGO dropdown */}
          {showTrafego && (
            <div className="relative h-full flex items-center" ref={trafegoRef} onMouseLeave={() => setTrafegoOpen(false)}>
              <button
                onMouseEnter={() => setTrafegoOpen(true)}
                onClick={() => setTrafegoOpen(o => !o)}
                className="text-[11px] font-black uppercase tracking-[0.18em] transition-all relative h-full flex items-center gap-1 px-4"
                style={{ color: isTrafegoActive ? '#fff' : trafegoOpen ? '#fff' : NAVY, background: isTrafegoActive || trafegoOpen ? 'rgba(0,0,0,0.18)' : 'transparent' }}>
                Tráfego
                <span className={`material-symbols-outlined text-[14px] transition-transform duration-200 ${trafegoOpen ? 'rotate-180' : ''}`}>expand_more</span>
                {isTrafegoActive && <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)' }} />}
              </button>
              {trafegoOpen && (
                <div className="absolute left-0 top-full w-52 rounded-2xl overflow-hidden shadow-2xl" style={dropdownStyle}>
                  {TRAFEGO_ITEMS.map(item => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link key={item.href} href={item.href}
                        className="flex items-center gap-3 px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all"
                        style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.08)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = GOLD; e.currentTarget.style.background = 'rgba(232,177,79,0.06)'; }}}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = SILVER; e.currentTarget.style.background = 'transparent'; }}}>
                        <span className="material-symbols-outlined text-[15px]">{item.icon}</span>
                        {item.label}
                        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* CURSOS */}
          {showCursos && (
            <Link href="/cursos"
              className="text-[11px] font-black uppercase tracking-[0.18em] transition-all relative flex items-center px-4 h-full"
              style={menuLinkStyle(isCursosActive)}
              onMouseEnter={e => { if (!isCursosActive) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(0,0,0,0.12)'; }}}
              onMouseLeave={e => { if (!isCursosActive) { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = 'transparent'; }}}>
              Cursos
              {isCursosActive && <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)' }} />}
            </Link>
          )}

          {/* ALUNOS */}
          {showAlunos && (
            <Link href="/alunos"
              className="text-[11px] font-black uppercase tracking-[0.18em] transition-all relative flex items-center px-4 h-full"
              style={menuLinkStyle(isAlunosActive)}
              onMouseEnter={e => { if (!isAlunosActive) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(0,0,0,0.12)'; }}}
              onMouseLeave={e => { if (!isAlunosActive) { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = 'transparent'; }}}>
              Alunos
              {isAlunosActive && <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)' }} />}
            </Link>
          )}

          {/* LEADS */}
          {showLeads && (() => {
            const isActive = pathname.startsWith('/leads');
            return (
              <Link href="/leads"
                className="text-[11px] font-black uppercase tracking-[0.18em] transition-all relative flex items-center px-4 h-full"
                style={menuLinkStyle(isActive)}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(0,0,0,0.12)'; }}}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = 'transparent'; }}}>
                Leads
                {isActive && <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)' }} />}
              </Link>
            );
          })()}

          {/* FINANCEIRO dropdown */}
          {showFinanceiro && (
            <div className="relative h-full flex items-center" ref={financeiroRef} onMouseLeave={() => setFinanceiroOpen(false)}>
              <button
                onMouseEnter={() => setFinanceiroOpen(true)}
                onClick={() => setFinanceiroOpen(o => !o)}
                className="text-[11px] font-black uppercase tracking-[0.18em] transition-all relative h-full flex items-center gap-1 px-4"
                style={{ color: isFinanceiroActive ? '#fff' : financeiroOpen ? '#fff' : NAVY, background: isFinanceiroActive || financeiroOpen ? 'rgba(0,0,0,0.18)' : 'transparent' }}>
                Financeiro
                <span className={`material-symbols-outlined text-[14px] transition-transform duration-200 ${financeiroOpen ? 'rotate-180' : ''}`}>expand_more</span>
                {isFinanceiroActive && <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)' }} />}
              </button>
              {financeiroOpen && (
                <div className="absolute left-0 top-full w-52 rounded-2xl overflow-hidden shadow-2xl" style={dropdownStyle}>
                  {FINANCEIRO_ITEMS.map(item => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link key={item.href} href={item.href}
                        className="flex items-center gap-3 px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all"
                        style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.08)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = GOLD; e.currentTarget.style.background = 'rgba(232,177,79,0.06)'; }}}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = SILVER; e.currentTarget.style.background = 'transparent'; }}}>
                        <span className="material-symbols-outlined text-[15px]">{item.icon}</span>
                        {item.label}
                        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          MOBILE DRAWER
          ════════════════════════════════════════════════════ */}
      {mobileOpen && (
        <div className="fixed top-[62px] left-0 w-full z-40 border-b shadow-2xl overflow-y-auto max-h-[calc(100vh-62px)] md:hidden"
          style={{ background: '#001a35', borderColor: 'rgba(232,177,79,0.15)' }}>
          <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>

            {navItems.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className="px-6 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-between"
                  style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.06)' : 'transparent' }}>
                  {item.label}
                  {isActive && <span className="material-symbols-outlined text-lg" style={{ color: GOLD }}>arrow_forward</span>}
                </Link>
              );
            })}

            {showCursos && (() => {
              const isActive = pathname.startsWith('/cursos');
              return (
                <Link href="/cursos" className="px-6 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-between"
                  style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.06)' : 'transparent' }}>
                  Cursos
                  {isActive && <span className="material-symbols-outlined text-lg" style={{ color: GOLD }}>arrow_forward</span>}
                </Link>
              );
            })()}

            {showAlunos && (() => {
              const isActive = pathname.startsWith('/alunos');
              return (
                <Link href="/alunos" className="px-6 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-between"
                  style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.06)' : 'transparent' }}>
                  Alunos
                  {isActive && <span className="material-symbols-outlined text-lg" style={{ color: GOLD }}>arrow_forward</span>}
                </Link>
              );
            })()}

            {showLeads && (() => {
              const isActive = pathname.startsWith('/leads');
              return (
                <Link href="/leads" className="px-6 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-between"
                  style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.06)' : 'transparent' }}>
                  Leads
                  {isActive && <span className="material-symbols-outlined text-lg" style={{ color: GOLD }}>arrow_forward</span>}
                </Link>
              );
            })()}

            {showTrafego && (
              <div style={{ background: 'rgba(0,0,0,0.2)' }}>
                <p className="px-6 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest" style={{ color: GOLD }}>Tráfego</p>
                {TRAFEGO_ITEMS.map(item => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}
                      className="px-8 py-3 text-sm font-black uppercase tracking-widest flex items-center gap-3"
                      style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.06)' : 'transparent' }}>
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}

            {showFinanceiro && (
              <div style={{ background: 'rgba(0,0,0,0.15)' }}>
                <p className="px-6 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest" style={{ color: GOLD }}>Financeiro</p>
                {FINANCEIRO_ITEMS.map(item => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}
                      className="px-8 py-3 text-sm font-black uppercase tracking-widest flex items-center gap-3"
                      style={{ color: isActive ? GOLD : SILVER, background: isActive ? 'rgba(232,177,79,0.06)' : 'transparent' }}>
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Date presets no mobile */}
            <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: SILVER }}>Período</p>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                    style={activePreset === p.label
                      ? { background: GOLD, color: NAVY }
                      : { background: 'rgba(255,255,255,0.06)', color: SILVER }
                    }>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* User / logout no mobile */}
            <div className="px-4 py-4 border-t flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <span className="text-[11px] font-black flex items-center gap-2" style={{ color: '#22c55e' }}>
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                {userName || 'Usuário'}
              </span>
              <div className="flex items-center gap-2">
                {showAdmin && (
                  <Link href="/admin" className="w-9 h-9 rounded-full flex items-center justify-center border"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: SILVER }}>
                    <span className="material-symbols-outlined text-xl">manage_accounts</span>
                  </Link>
                )}
                <button onClick={logout} className="w-9 h-9 rounded-full flex items-center justify-center border"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#ef4444' }}>
                  <span className="material-symbols-outlined text-xl">logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
