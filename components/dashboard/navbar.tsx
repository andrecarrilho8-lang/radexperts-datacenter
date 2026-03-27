'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { today, Preset } from '@/app/lib/utils';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

export function Navbar() {
  const { dateFrom, dateTo, setDateRange, activePreset, setActivePreset, presets, userRole, userName, logout } = useDashboard();
  const [showCustom, setShowCustom] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tmpFrom, setTmpFrom] = useState(dateFrom);
  const [tmpTo,   setTmpTo]   = useState(dateTo);
  const pathname  = usePathname();
  const customRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function clickOutside(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) setShowCustom(false);
    }
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

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

  const allNavItems = [
    { label: 'Resumo',    href: '/resumo',    roles: ['TOTAL', 'NORMAL'] },
    { label: 'Campanhas', href: '/campanhas', roles: ['TOTAL', 'NORMAL'] },
    { label: 'Hotmart',   href: '/hotmart',   roles: ['TOTAL'] },
    { label: 'Histórico', href: '/historico', roles: ['TOTAL'] },
  ];
  const navItems = allNavItems.filter(i => i.roles.includes(userRole));

  const navStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(0,10,28,0.97) 0%, rgba(0,26,53,0.97) 100%)',
    borderBottom: '1px solid rgba(232,177,79,0.18)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 4px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(232,177,79,0.1) inset',
  };

  return (
    <>
      <nav className="fixed top-0 w-full z-50 flex items-stretch justify-between p-0 h-[80px]" style={navStyle}>
        <div className="flex items-stretch">
          {/* Logo */}
          <div className="px-6 md:px-8 flex flex-col items-center justify-center border-r min-w-[160px] md:min-w-[220px]"
            style={{ borderColor: 'rgba(232,177,79,0.15)', background: 'rgba(0,0,0,0.2)' }}>
            <Link href="/resumo" className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-105">
              <img src="/logo_radexperts.png" alt="RadExperts" className="h-8 object-contain mb-1.5" />
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GOLD }} />
                <span className="text-[8px] font-black uppercase tracking-[0.4em] leading-none" style={{ color: SILVER }}>DATA CENTER</span>
              </div>
            </Link>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-1 px-6 lg:px-10 items-center h-full">
            {navItems.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className="text-[12px] font-black uppercase tracking-[0.2em] cursor-pointer transition-all relative h-full flex items-center px-5"
                  style={{
                    color: isActive ? GOLD : SILVER,
                    background: isActive ? 'rgba(232,177,79,0.07)' : 'transparent',
                  }}
                >
                  {item.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 w-full h-[2px] rounded-full"
                      style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 px-4 md:px-8 ml-auto">
          {/* Date presets */}
          <div className="hidden xl:flex items-center gap-2 relative" ref={customRef}>
            <div className="flex items-center gap-1 p-1 rounded-2xl border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
              {presets.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className="px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                  style={activePreset === p.label
                    ? { background: GOLD, color: NAVY, boxShadow: `0 4px 12px rgba(232,177,79,0.4)` }
                    : { color: SILVER }
                  }>
                  {p.label}
                </button>
              ))}
            </div>

            <button onClick={() => setShowCustom(v => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all border"
              style={activePreset === 'Personalizado'
                ? { background: GOLD, color: NAVY, borderColor: GOLD }
                : { background: 'rgba(255,255,255,0.05)', color: SILVER, borderColor: 'rgba(255,255,255,0.1)' }
              }>
              <span className="material-symbols-outlined text-[18px] leading-none">calendar_month</span>
              <span className="hidden lg:inline">Calendário</span>
            </button>

            {showCustom && (
              <div className="absolute top-14 right-0 z-[100] rounded-2xl p-6 shadow-2xl flex flex-col gap-5 min-w-[280px] border animate-in fade-in slide-in-from-top-2 duration-200"
                style={{ background: '#001a35', borderColor: 'rgba(232,177,79,0.2)', boxShadow: '0 32px 64px rgba(0,0,0,0.8)' }}>
                <header className="flex justify-between items-center pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="font-black text-[10px] uppercase tracking-widest" style={{ color: GOLD }}>Período customizado</p>
                  <span className="material-symbols-outlined text-sm" style={{ color: SILVER }}>settings_input_component</span>
                </header>
                {[{lbl:'De',val:tmpFrom,set:setTmpFrom,max:tmpTo},{lbl:'Até',val:tmpTo,set:setTmpTo,min:tmpFrom,max:today}].map(f => (
                  <div key={f.lbl} className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: SILVER }}>{f.lbl}</label>
                    <input type="date" value={f.val} max={f.max} min={f.min} onChange={e => f.set(e.target.value)}
                      className="px-4 py-2 rounded-xl text-xs font-bold outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
                  </div>
                ))}
                <button onClick={applyCustom} className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all btn-gold">
                  Atualizar Vista
                </button>
              </div>
            )}
          </div>

          <div className="w-px h-8 mx-1 hidden md:block" style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* User info */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black uppercase tracking-widest leading-none" style={{ color: SILVER }}>Olá,</span>
              <span className="text-[10px] font-black flex items-center gap-1 mt-1" style={{ color: '#22c55e' }}>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {userName || 'Usuário'}
              </span>
            </div>
            {userRole === 'TOTAL' && (
              <Link href="/admin" title="Gerenciar Usuários"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer border"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: SILVER }}>
                <span className="material-symbols-outlined text-xl">manage_accounts</span>
              </Link>
            )}
            <button onClick={logout} title="Sair"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer border"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: SILVER }}>
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>

          {/* Hamburger */}
          <button onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: SILVER }}>
            <span className="material-symbols-outlined text-xl">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed top-[80px] left-0 w-full z-40 border-b shadow-2xl animate-in slide-in-from-top-2 duration-200"
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
          </div>
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
          <div className="px-4 pb-4 border-t flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-[10px] font-black flex items-center gap-2" style={{ color: '#22c55e' }}>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {userName || 'Usuário'}
            </span>
            <div className="flex items-center gap-2">
              {userRole === 'TOTAL' && (
                <Link href="/admin" className="w-10 h-10 rounded-full flex items-center justify-center border"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: SILVER }}>
                  <span className="material-symbols-outlined text-xl">manage_accounts</span>
                </Link>
              )}
              <button onClick={logout} className="w-10 h-10 rounded-full flex items-center justify-center border"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#ef4444' }}>
                <span className="material-symbols-outlined text-xl">logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
