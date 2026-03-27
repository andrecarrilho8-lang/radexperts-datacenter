import React from 'react';

export function MetricPill({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-xl ${small ? 'px-4 py-3' : 'px-5 py-4'} ${accent ? 'bg-blue-50 border border-blue-100 shadow-sm' : 'bg-slate-50 border border-slate-100'}`}>
      <p className={`${small ? 'text-[11px]' : 'text-[12px] lg:text-[13px]'} font-bold uppercase tracking-[0.1em] mb-1.5 ${accent ? 'text-blue-500' : 'text-slate-400'}`}>{label}</p>
      <p className={`font-black ${small ? 'text-2xl lg:text-3xl' : 'text-3xl lg:text-4xl'} font-headline leading-none ${accent ? 'text-blue-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

export function MetricPillAmber({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-xl ${small ? 'px-4 py-3' : 'px-5 py-4'} ${accent ? 'bg-sky-50 border border-sky-100 shadow-sm' : 'bg-slate-50 border border-slate-100'}`}>
      <p className={`${small ? 'text-[11px]' : 'text-[12px] lg:text-[13px]'} font-bold uppercase tracking-[0.1em] mb-1.5 ${accent ? 'text-sky-500' : 'text-slate-400'}`}>{label}</p>
      <p className={`font-black ${small ? 'text-2xl lg:text-3xl' : 'text-3xl lg:text-4xl'} font-headline leading-none ${accent ? 'text-sky-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

export function StatCard({ label, value, icon, color = 'slate', small = false }: { label: string; value: string; icon: string; color?: 'violet' | 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'orange'; small?: boolean }) {
  const themes = {
    violet:  'bg-indigo-50/50 text-indigo-700 border-indigo-100 hover:bg-indigo-100/50',
    emerald: 'bg-emerald-50/50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/50',
    amber:   'bg-amber-50/50 text-amber-700 border-amber-100 hover:bg-amber-100/50',
    blue:    'bg-blue-50/50 text-blue-700 border-blue-100 hover:bg-blue-100/50',
    rose:    'bg-rose-50/50 text-rose-700 border-rose-100 hover:bg-rose-100/50',
    orange:  'bg-orange-50/50 text-orange-700 border-orange-100 hover:bg-orange-100/50',
    slate:   'bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-100',
  };

  return (
    <div className={`p-4 lg:p-5 rounded-2xl border transition-all duration-300 group shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-md ${themes[color as keyof typeof themes]}`}>
      <div className="flex items-center gap-2.5 mb-2 relative z-10">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-transform group-hover:scale-110`}>
          <span className="material-symbols-outlined text-[18px] opacity-80">{icon}</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-none">{label}</p>
      </div>
      
      <p className={`font-black tracking-tight relative z-10 font-headline ${small ? 'text-lg lg:text-xl' : 'text-2xl lg:text-3xl'}`}>
        {value}
      </p>
    </div>
  );
}
