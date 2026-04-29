'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';

/* ── Types ── */
type ResultItem = {
  type:     string;
  id:       string;
  title:    string;
  subtitle: string | null;
  badge:    string | null;
  href:     string;
  icon:     string;
  color:    string;
};
type Results = {
  alunos:    ResultItem[];
  cursos:    ResultItem[];
  vendas:    ResultItem[];
  campanhas: ResultItem[];
};

const SECTION_LABELS: Record<keyof Results, string> = {
  alunos:    'Alunos',
  cursos:    'Cursos',
  vendas:    'Transações',
  campanhas: 'Campanhas',
};

/* ── Debounce hook ── */
function useDebounce(value: string, delay: number) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

/* ── Component ── */
export function GlobalSearch() {
  const { authToken, isAuthenticated } = useDashboard();
  const router = useRouter();

  // Don't render on the login screen
  if (!isAuthenticated) return null;


  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(-1);   // flat index of focused result
  const inputRef  = useRef<HTMLInputElement>(null);
  const debouncedQ = useDebounce(query, 300);

  /* Flatten results for keyboard nav */
  const flat: ResultItem[] = results
    ? (Object.keys(SECTION_LABELS) as (keyof Results)[]).flatMap(k => results[k] || [])
    : [];

  /* ── Open / close ── */
  const openSearch = useCallback(() => {
    setOpen(true);
    setQuery('');
    setResults(null);
    setFocused(-1);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults(null);
    setFocused(-1);
  }, []);

  /* ── Global Ctrl+K listener + navbar icon trigger ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        open ? closeSearch() : openSearch();
      }
      if (e.key === 'Escape' && open) closeSearch();
    };
    const iconHandler = () => openSearch();
    window.addEventListener('keydown', handler);
    window.addEventListener('global-search:open', iconHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('global-search:open', iconHandler);
    };
  }, [open, openSearch, closeSearch]);

  /* ── Fetch results ── */
  useEffect(() => {
    if (!debouncedQ || debouncedQ.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    setFocused(-1);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQ)}&limit=5`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then(r => r.json())
      .then(data => { setResults(data.results || null); })
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQ, authToken]);

  /* ── Keyboard navigation ── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocused(f => (f + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocused(f => (f - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter' && focused >= 0) {
      router.push(flat[focused].href);
      closeSearch();
    }
  };

  const navigateTo = (href: string) => {
    router.push(href);
    closeSearch();
  };

  const totalResults = flat.length;
  const hasResults   = results && totalResults > 0;
  const isEmpty      = results && totalResults === 0 && !loading;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200]"
        style={{ background: 'rgba(0,5,20,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={closeSearch}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-[10vh] z-[201] w-full max-w-[640px] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          transform: 'translateX(-50%)',
          background: 'linear-gradient(160deg, rgba(0,20,50,0.98) 0%, rgba(0,10,30,0.98) 100%)',
          border: '1px solid rgba(232,177,79,0.2)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.05) inset, 0 40px 80px rgba(0,0,0,0.8)',
        }}>

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {loading
            ? <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
            : <span className="material-symbols-outlined text-[20px] flex-shrink-0" style={{ color: GOLD }}>search</span>
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar aluno, curso, transação, lead, campanha..."
            className="flex-1 bg-transparent outline-none text-white text-sm font-medium placeholder:font-normal"
            style={{ caretColor: GOLD }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="material-symbols-outlined text-[18px]"
              style={{ color: SILVER }}>close</button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">

          {/* Empty state */}
          {isEmpty && (
            <div className="py-12 text-center">
              <span className="material-symbols-outlined text-4xl block mb-2" style={{ color: SILVER }}>search_off</span>
              <p className="text-sm font-bold" style={{ color: SILVER }}>Nenhum resultado para "<span className="text-white">{query}</span>"</p>
            </div>
          )}

          {/* Hint — waiting */}
          {!results && !loading && (
            <div className="py-8 text-center">
              <p className="text-sm font-bold" style={{ color: 'rgba(168,178,192,0.5)' }}>
                Digite pelo menos 2 caracteres para buscar
              </p>
              <div className="flex items-center justify-center gap-4 mt-4">
                {[
                  { icon: 'person',        label: 'Alunos'     },
                  { icon: 'school',        label: 'Cursos'     },
                  { icon: 'shopping_cart', label: 'Transações' },
                  { icon: 'campaign',      label: 'Campanhas'  },
                ].map(h => (
                  <div key={h.label} className="flex flex-col items-center gap-1">
                    <span className="material-symbols-outlined text-[18px]" style={{ color: 'rgba(168,178,192,0.4)' }}>{h.icon}</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(168,178,192,0.4)' }}>{h.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          {hasResults && (
            <div className="py-2">
              {(Object.keys(SECTION_LABELS) as (keyof Results)[]).map(section => {
                const items = results[section];
                if (!items?.length) return null;

                // Compute flat index offset for this section
                let sectionOffset = 0;
                for (const s of Object.keys(SECTION_LABELS) as (keyof Results)[]) {
                  if (s === section) break;
                  sectionOffset += (results[s] || []).length;
                }

                return (
                  <div key={section}>
                    {/* Section header */}
                    <div className="px-5 py-2 flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'rgba(168,178,192,0.5)' }}>
                        {SECTION_LABELS[section]}
                      </span>
                      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    </div>

                    {/* Items */}
                    {items.map((item, i) => {
                      const flatIdx = sectionOffset + i;
                      const isFocused = flatIdx === focused;
                      return (
                        <button
                          key={item.id + i}
                          onClick={() => navigateTo(item.href)}
                          onMouseEnter={() => setFocused(flatIdx)}
                          onMouseLeave={() => setFocused(-1)}
                          className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-all duration-150"
                          style={{
                            background: isFocused ? 'rgba(232,177,79,0.1)' : 'transparent',
                            borderLeft: `2px solid ${isFocused ? GOLD : 'transparent'}`,
                            cursor: 'pointer',
                            transform: isFocused ? 'translateX(2px)' : 'translateX(0)',
                          }}>
                          {/* Icon */}
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${item.color}18`, border: `1px solid ${item.color}30` }}>
                            <span className="material-symbols-outlined text-[15px]" style={{ color: item.color }}>{item.icon}</span>
                          </div>
                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-white leading-tight truncate">
                              {highlightMatch(item.title, query)}
                            </p>
                            {item.subtitle && (
                              <p className="text-[10px] font-medium truncate mt-0.5" style={{ color: SILVER }}>
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                          {/* Badge */}
                          {item.badge && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: `${item.color}18`, border: `1px solid ${item.color}30`, color: item.color }}>
                              {item.badge}
                            </span>
                          )}
                          {/* Arrow */}
                          {isFocused && (
                            <span className="material-symbols-outlined text-[14px] flex-shrink-0" style={{ color: GOLD }}>
                              arrow_forward
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className="px-5 py-2.5 border-t flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-[10px] font-bold" style={{ color: 'rgba(168,178,192,0.5)' }}>
              {totalResults} resultado{totalResults !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'rgba(168,178,192,0.4)' }}>
                <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>↑↓</kbd>
                navegar
              </span>
              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'rgba(168,178,192,0.4)' }}>
                <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>↵</kbd>
                abrir
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Highlight matching text ── */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(232,177,79,0.3)', color: GOLD, borderRadius: 3, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
