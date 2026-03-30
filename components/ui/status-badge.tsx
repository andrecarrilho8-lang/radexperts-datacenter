import React from 'react';

export function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
      style={active
        ? { background: '#16a34a', color: '#ffffff', boxShadow: '0 0 8px rgba(22,163,74,0.4)' }
        : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }
      }>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
      {active ? 'Ativa' : 'Pausada'}
    </span>
  );
}
