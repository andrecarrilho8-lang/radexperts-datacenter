import React from 'react';

export function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
      {active ? 'Ativa' : 'Pausada'}
    </span>
  );
}
