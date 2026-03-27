'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { today, Preset } from '@/app/lib/utils';

export function Navbar() {
  const { dateFrom, dateTo, setDateRange, activePreset, setActivePreset, presets, userRole, userName, logout } = useDashboard();
  const [showCustom, setShowCustom] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tmpFrom, setTmpFrom] = useState(dateFrom);
  const [tmpTo, setTmpTo] = useState(dateTo);
  const pathname = usePathname();
  const customRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function clickOutside(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  // Close mobile menu on route change
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
    { label: 'Resumo', href: '/resumo', roles: ['TOTAL', 'NORMAL'] },
    { label: 'Campanhas', href: '/campanhas', roles: ['TOTAL', 'NORMAL'] },
    { label: 'Hotmart', href: '/hotmart', roles: ['TOTAL'] },
    { label: 'Histórico', href: '/historico', roles: ['TOTAL'] },
  ];
  const navItems = allNavItems.filter(i => i.roles.includes(userRole));

  return (
    <>
      <nav className="fixed top-0 w-full z-50 bg-gradient-to-r from-[#121c35] to-[#162545] shadow-2xl flex items-stretch justify-between p-0 h-[80px] border-b border-white/10">
        <div className="flex items-stretch">
          {/* Logo */}
          <div className="px-4 md:px-8 flex flex-col items-center justify-center border-r border-slate-800 min-w-[120px] md:min-w-[200px] bg-black/20">
            <Link href="/resumo" className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-105">
              <img src="/logo_10x.png" alt="Advogado 10X" className="h-4.5 object-contain mb-1" />
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 leading-none">DATA CENTER</span>
              </div>
            </Link>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-4 px-6 lg:px-10 items-center h-full">
            {navItems.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-[13px] font-black uppercase tracking-[0.2em] cursor-pointer transition-all relative h-full flex items-center px-4 ${isActive ? 'text-[#bd9a41] bg-white/5' : 'text-white hover:text-[#bd9a41]'}`}
                >
                  {item.label}
                  {isActive && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#bd9a41]" />}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 px-4 md:px-8 ml-auto">
          {/* Desktop date presets */}
          <div className="hidden xl:flex items-center gap-2 relative" ref={customRef}>
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/10">
              {presets.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${activePreset === p.label ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCustom(v => !v)}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all border ${activePreset === 'Personalizado' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border-slate-700 shadow-sm'}`}>
              <span className="material-symbols-outlined text-[18px] leading-none">calendar_month</span>
              <span className="hidden lg:inline">Calendário</span>
            </button>

            {showCustom && (
              <div className="absolute top-14 right-0 z-[100] bg-white rounded-2xl p-6 shadow-2xl flex flex-col gap-5 min-w-[280px] border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                <header className="flex justify-between items-center border-b border-slate-50 pb-4">
                  <p className="font-headline font-black text-[10px] uppercase tracking-widest text-slate-800">Período customizado</p>
                  <span className="material-symbols-outlined text-slate-300 text-sm">settings_input_component</span>
                </header>
                {[{lbl:'De',val:tmpFrom,set:setTmpFrom,max:tmpTo},{lbl:'Até',val:tmpTo,set:setTmpTo,min:tmpFrom,max:today}].map(f => (
                  <div key={f.lbl} className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{f.lbl}</label>
                    <input type="date" value={f.val} max={f.max} min={f.min} onChange={e => f.set(e.target.value)}
                      className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold outline-none focus:ring-4 ring-blue-500/5 transition-all" />
                  </div>
                ))}
                <button onClick={applyCustom} className="w-full py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl mt-2">Atualizar Vista</button>
              </div>
            )}
          </div>

          <div className="w-px h-8 bg-slate-800 mx-1 hidden md:block" />

          {/* User info + actions (desktop) */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none">Olá,</span>
              <span className="text-[10px] font-black text-emerald-400 flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {userName || 'Usuário'}
              </span>
            </div>
            {userRole === 'TOTAL' && (
              <Link href="/admin" title="Gerenciar Usuários" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-violet-400 transition-colors cursor-pointer border border-white/5">
                <span className="material-symbols-outlined text-xl">manage_accounts</span>
              </Link>
            )}
            <button onClick={logout} title="Sair" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors cursor-pointer border border-white/5">
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>

          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 border border-white/5"
          >
            <span className="material-symbols-outlined text-xl">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed top-[80px] left-0 w-full z-40 bg-[#121c35] border-b border-white/10 shadow-2xl animate-in slide-in-from-top-2 duration-200">
          {/* Nav links */}
          <div className="flex flex-col divide-y divide-white/5">
            {navItems.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`px-6 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-between ${isActive ? 'text-[#bd9a41] bg-white/5' : 'text-slate-300'}`}>
                  {item.label}
                  {isActive && <span className="material-symbols-outlined text-[#bd9a41] text-lg">arrow_forward</span>}
                </Link>
              );
            })}
          </div>

          {/* Date presets mobile */}
          <div className="px-4 py-4 border-t border-white/10">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Período</p>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activePreset === p.label ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* User + actions mobile */}
          <div className="px-4 pb-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {userName || 'Usuário'}
            </span>
            <div className="flex items-center gap-2">
              {userRole === 'TOTAL' && (
                <Link href="/admin" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-white/5">
                  <span className="material-symbols-outlined text-xl">manage_accounts</span>
                </Link>
              )}
              <button onClick={logout} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-rose-400 border border-white/5">
                <span className="material-symbols-outlined text-xl">logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
