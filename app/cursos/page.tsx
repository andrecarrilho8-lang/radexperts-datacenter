'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { slugify } from '@/app/lib/slug';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';

type Course = { id: number; name: string; students: number };
type Tab     = 'posgraduacao' | 'highlights' | 'outros';

/** Classify a course by its name */
function classify(name: string): Tab {
  const n = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('highlight'))                                   return 'highlights';
  if (
    n.includes('pos-graduacao') || n.includes('posgraduacao') ||
    n.includes('pos graduacao') || n.includes('posgrado')    ||
    n.includes('pós-graduação') || n.includes('pós graduação')
  )                                                              return 'posgraduacao';
  return 'outros';
}

const TAB_CONFIG: { key: Tab; label: string; icon: string; accent: string }[] = [
  { key: 'posgraduacao', label: 'Pós-Graduações', icon: 'workspace_premium', accent: '#E8B14F' },
  { key: 'highlights',   label: 'Highlights',     icon: 'auto_awesome',      accent: '#60a5fa' },
  { key: 'outros',       label: 'Outros',          icon: 'category',          accent: '#a78bfa' },
];

export default function CursosPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('posgraduacao');

  useEffect(() => {
    fetch('/api/cursos')
      .then(r => r.json())
      .then(d => { setCourses(d.courses || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const goTo = (course: Course) => {
    router.push(`/cursos/${slugify(course.name)}`);
  };

  /** Courses for the active tab, filtered by search */
  const tabCourses = courses
    .filter(c => classify(c.name) === activeTab)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  /** Count per tab (unfiltered by search) */
  const counts = courses.reduce<Record<Tab, number>>(
    (acc, c) => { acc[classify(c.name)]++; return acc; },
    { posgraduacao: 0, highlights: 0, outros: 0 }
  );

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[106px]" />
        <main className="px-3 sm:px-6 max-w-[1400px] mx-auto pt-6 sm:pt-10 pb-24">

          {/* ── Header ─────────────────────────────────── */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>school</span>
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white">Cursos</h1>
                <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: SILVER }}>
                  {loading ? 'Carregando...' : `${courses.length} curso${courses.length !== 1 ? 's' : ''} encontrado${courses.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────── */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {TAB_CONFIG.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  id={`tab-${tab.key}`}
                  onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition-all"
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, ${tab.accent}22, ${tab.accent}08)`
                      : 'rgba(255,255,255,0.04)',
                    border: isActive
                      ? `1.5px solid ${tab.accent}55`
                      : '1.5px solid rgba(255,255,255,0.08)',
                    color: isActive ? tab.accent : SILVER,
                    boxShadow: isActive ? `0 0 18px ${tab.accent}18` : 'none',
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                  {tab.label}
                  {!loading && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black"
                      style={{
                        background: isActive ? `${tab.accent}22` : 'rgba(255,255,255,0.06)',
                        color: isActive ? tab.accent : SILVER,
                      }}>
                      {counts[tab.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Search ─────────────────────────────────── */}
          <div className="relative mb-8 w-full sm:max-w-[480px]">
            <span className="material-symbols-outlined text-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
            <input
              type="text"
              placeholder={`Buscar em ${TAB_CONFIG.find(t => t.key === activeTab)?.label || ''}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm font-bold outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
            />
          </div>

          {/* ── Grid ───────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-3xl p-6 animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', height: 120 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tabCourses.map(course => {
                const accent = TAB_CONFIG.find(t => t.key === activeTab)?.accent || GOLD;
                return (
                  <button
                    key={course.name}
                    id={`course-${course.id || course.name.slice(0, 20).replace(/\s+/g, '-')}`}
                    onClick={() => goTo(course)}
                    className="rounded-3xl p-6 text-left flex items-center gap-4 transition-all group cursor-pointer"
                    style={{
                      background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(0,10,30,0.4) 100%)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      backdropFilter: 'blur(20px)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.border = `1px solid ${accent}55`;
                      e.currentTarget.style.background = `linear-gradient(160deg, ${accent}0d 0%, rgba(0,10,30,0.55) 100%)`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)';
                      e.currentTarget.style.background = 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(0,10,30,0.4) 100%)';
                    }}
                  >
                    <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all group-hover:scale-105"
                      style={{ background: `${accent}1a`, border: `1px solid ${accent}33` }}>
                      <span className="material-symbols-outlined text-2xl"
                        style={{ color: accent }}>
                        {TAB_CONFIG.find(t => t.key === activeTab)?.icon || 'menu_book'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-white leading-snug line-clamp-2 mb-1">{course.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px]" style={{ color: SILVER }}>group</span>
                        <span className="text-[11px] font-bold" style={{ color: SILVER }}>
                          {course.students.toLocaleString('pt-BR')} aluno{course.students !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[20px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      style={{ color: accent }}>
                      arrow_forward
                    </span>
                  </button>
                );
              })}

              {tabCourses.length === 0 && !loading && (
                <div className="col-span-3 py-20 text-center">
                  <span className="material-symbols-outlined text-5xl mb-4 block" style={{ color: SILVER }}>school</span>
                  <p className="font-bold text-sm" style={{ color: SILVER }}>Nenhum curso encontrado.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </LoginWrapper>
  );
}
