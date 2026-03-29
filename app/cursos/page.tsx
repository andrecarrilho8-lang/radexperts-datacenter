'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

type Course = { id: number; name: string; students: number };

export default function CursosPage() {
  const router = useRouter();
  const [courses, setCourses]   = useState<Course[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');

  useEffect(() => {
    fetch('/api/cursos')
      .then(r => r.json())
      .then(d => { setCourses(d.courses || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = courses.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const goTo = (course: Course) => {
    router.push(`/cursos/${encodeURIComponent(course.name)}`);
  };

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1400px] mx-auto pt-10 pb-24">

          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
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

          {/* Search */}
          <div className="relative mb-8 max-w-[480px]">
            <span className="material-symbols-outlined text-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
            <input
              type="text"
              placeholder="Buscar curso..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm font-bold outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
            />
          </div>

          {/* Course grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-3xl p-6 animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', height: 120 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(course => (
                <button
                  key={course.name}
                  onClick={() => goTo(course)}
                  className="rounded-3xl p-6 text-left flex items-center gap-4 transition-all group cursor-pointer"
                  style={{
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(0,10,30,0.4) 100%)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    backdropFilter: 'blur(20px)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.border = '1px solid rgba(232,177,79,0.35)';
                    e.currentTarget.style.background = 'linear-gradient(160deg, rgba(232,177,79,0.08) 0%, rgba(0,10,30,0.55) 100%)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)';
                    e.currentTarget.style.background = 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(0,10,30,0.4) 100%)';
                  }}
                >
                  <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all group-hover:scale-105"
                    style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.2)' }}>
                    <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>menu_book</span>
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
                  <span className="material-symbols-outlined text-[20px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: GOLD }}>
                    arrow_forward
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
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
