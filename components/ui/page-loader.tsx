'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PageLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startLoading = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setLoading(true);
    setVisible(true);
    setProgress(15);

    let p = 15;
    const tick = () => {
      p += p < 40 ? 10 : p < 70 ? 5 : p < 88 ? 2 : 0;
      setProgress(Math.min(p, 88));
      if (p < 88) timerRef.current = setTimeout(tick, 90);
    };
    timerRef.current = setTimeout(tick, 90);

    const completeTimer = setTimeout(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setProgress(100);
      setTimeout(() => setVisible(false), 350);
      setTimeout(() => { setLoading(false); setProgress(0); }, 750);
    }, 550);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(completeTimer);
    };
  }, []);

  // Trigger on route changes
  useEffect(() => {
    return startLoading();
  }, [pathname, searchParams, startLoading]);

  // Trigger on manual dashboard:loading events (period/filter changes)
  useEffect(() => {
    const handler = () => startLoading();
    window.addEventListener('dashboard:loading', handler);
    return () => window.removeEventListener('dashboard:loading', handler);
  }, [startLoading]);

  if (!loading && progress === 0) return null;

  return (
    <>
      {/* Top progress bar — 15px height */}
      <div
        className="fixed top-0 left-0 z-[99999] h-[8px]"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #7c3aed, #6366f1, #a78bfa)',
          boxShadow: '0 0 18px rgba(124, 58, 237, 0.85)',
          opacity: visible ? 1 : 0,
          transitionProperty: 'width, opacity',
          transitionDuration: '0.25s, 0.35s',
          transitionTimingFunction: 'cubic-bezier(0.4,0,0.2,1), ease',
          transitionDelay: visible ? '0s, 0s' : '0s, 0.1s',
        }}
      />

      {/* Spinner badge */}
      {loading && progress < 90 && (
        <div className="fixed top-5 right-6 z-[99995] flex items-center gap-2 bg-white/90 backdrop-blur-md border border-slate-100 shadow-xl rounded-full px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <svg className="w-3.5 h-3.5 animate-spin text-violet-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Carregando</span>
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-violet-500"
                style={{ animation: `pgdot 0.8s ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pgdot {
          0%, 80%, 100% { transform: scaleY(0.6); opacity: 0.5; }
          40% { transform: scaleY(1.2); opacity: 1; }
        }
      `}</style>
    </>
  );
}
