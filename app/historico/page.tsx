'use client';

import React from 'react';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { HistoricoView } from '@/components/dashboard/historico-view';

export default function HistoricoPage() {
  return (
    <LoginWrapper>
      <Navbar />
      <div className="h-[80px]" />
      <main className="px-6 max-w-[1600px] mx-auto pt-20">
        <h2 className="font-headline font-black text-3xl text-slate-900 mb-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-indigo-600 text-4xl">history</span>
          Clientes com maior LTV
        </h2>
        <HistoricoView />
      </main>
    </LoginWrapper>
  );
}
