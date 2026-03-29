'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

type Student = {
  email: string; name: string; phone: string;
  entryDate: number | null; lastAccess: string | null;
  payment: string; turma: string; transaction: string;
};

function fmtDate(ts: number | null | string): string {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PayBadge({ label }: { label: string }) {
  const l = label.toLowerCase();
  let bg = 'rgba(255,255,255,0.08)'; let color = SILVER;
  if (l.includes('pix'))        { bg = 'rgba(52,211,153,0.12)'; color = '#34d399'; }
  else if (l.includes('assina')) { bg = 'rgba(56,189,248,0.12)'; color = '#38bdf8'; }
  else if (l.includes('boleto')){ bg = 'rgba(251,191,36,0.12)'; color = '#fbbf24'; }
  else if (l.includes('paypal')){ bg = 'rgba(99,102,241,0.12)'; color = '#818cf8'; }
  else if (l.includes('cartão') || l.includes('credito') || l.includes('crédito')){ bg = 'rgba(232,177,79,0.12)'; color = GOLD; }
  return (
    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-block"
      style={{ background: bg, color }}>{label}</span>
  );
}

export default function CursoDetailPage({ params }: { params: Promise<{ courseName: string }> }) {
  const { courseName } = use(params);
  const decoded = decodeURIComponent(courseName);
  const router  = useRouter();

  const [students,  setStudents]  = useState<Student[]>([]);
  const [turmas,    setTurmas]    = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [turma,     setTurma]     = useState('');
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ courseName: decoded, ...(turma ? { turma } : {}) });
    fetch(`/api/cursos/${encodeURIComponent(decoded)}?${params}`)
      .then(r => r.json())
      .then(d => {
        setStudents(d.students || []);
        setTurmas(d.turmas || []);
        setLoading(false);
        setPage(0);
      })
      .catch(() => setLoading(false));
  }, [decoded, turma]);

  const filtered = students.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search)
  );

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-4 md:px-6 max-w-[1600px] mx-auto pt-10 pb-24">

          {/* Header */}
          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/cursos')}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(232,177,79,0.4)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: SILVER }}>arrow_back</span>
              </button>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>menu_book</span>
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white leading-tight">{decoded}</h1>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] mt-0.5" style={{ color: SILVER }}>
                  {loading ? 'Carregando alunos...' : `${filtered.length.toLocaleString('pt-BR')} aluno${filtered.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {/* Export hint */}
            <div className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: SILVER }}>
              URL compartilhável ✓
            </div>
          </div>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px] max-w-[400px]">
              <span className="material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
              <input
                type="text"
                placeholder="Buscar por nome, email ou fone..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
              />
            </div>

            {/* Turmas filter */}
            {turmas.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Turma:</span>
                <button
                  onClick={() => setTurma('')}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                  style={{ background: !turma ? GOLD : 'rgba(255,255,255,0.07)', color: !turma ? NAVY : SILVER, border: `1px solid ${!turma ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                  Todas
                </button>
                {turmas.map(t => (
                  <button key={t}
                    onClick={() => setTurma(t === turma ? '' : t)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                    style={{ background: turma === t ? GOLD : 'rgba(255,255,255,0.07)', color: turma === t ? NAVY : SILVER, border: `1px solid ${turma === t ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(0,10,30,0.5) 100%)', border: '1px solid rgba(255,255,255,0.09)' }}>

            {/* Header row */}
            <div className="grid px-5 py-3.5"
              style={{
                gridTemplateColumns: '160px 1fr 1fr 160px 140px 130px',
                background: 'rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}>
              {['Data de Entrada', 'Nome', 'Email', 'Telefone', 'Forma de Pgto', 'Último Acesso'].map(h => (
                <span key={h} className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</span>
              ))}
            </div>

            {loading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="grid px-5 py-4 animate-pulse"
                  style={{ gridTemplateColumns: '160px 1fr 1fr 160px 140px 130px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[...Array(6)].map((_, j) => (
                    <div key={j} className="h-4 rounded-lg mr-4" style={{ background: 'rgba(255,255,255,0.07)' }} />
                  ))}
                </div>
              ))
            ) : paginated.length === 0 ? (
              <div className="py-20 text-center">
                <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: SILVER }}>group</span>
                <p className="font-bold text-sm" style={{ color: SILVER }}>Nenhum aluno encontrado.</p>
              </div>
            ) : (
              paginated.map((s, idx) => (
                <div key={s.transaction || s.email + idx}
                  className="grid px-5 py-3.5 items-center transition-colors"
                  style={{
                    gridTemplateColumns: '160px 1fr 1fr 160px 140px 130px',
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,177,79,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'}
                >
                  {/* Data Entrada */}
                  <span className="text-[12px] font-bold" style={{ color: SILVER }}>{fmtDate(s.entryDate)}</span>
                  {/* Nome */}
                  <span className="text-[13px] font-black text-white truncate pr-3">{s.name}</span>
                  {/* Email */}
                  <span className="text-[12px] font-bold truncate pr-3" style={{ color: SILVER }}>{s.email}</span>
                  {/* Telefone */}
                  <span className="text-[12px] font-bold" style={{ color: SILVER }}>{s.phone}</span>
                  {/* Pagamento */}
                  <div><PayBadge label={s.payment} /></div>
                  {/* Último Acesso */}
                  <span className="text-[12px] font-bold" style={{ color: s.lastAccess ? '#4ade80' : SILVER }}>
                    {s.lastAccess ? fmtDate(s.lastAccess) : '—'}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                ← Anterior
              </button>
              <span className="text-[12px] font-bold px-4" style={{ color: SILVER }}>
                {page + 1} / {totalPages} · {filtered.length} alunos
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                Próxima →
              </button>
            </div>
          )}
        </main>
      </div>
    </LoginWrapper>
  );
}
