'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

type Student = {
  name: string; email: string; phone: string;
  entryDate: number | null; turma: string;
  valor: number; currency: string;
  source: string; transaction: string;
  paymentType: string; paymentInstallments: number;
  paymentIsSub: boolean; paymentRecurrency: number;
};

function fmtDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCurrency(val: number, curr: string): string {
  if (!val) return '—';
  try { return val.toLocaleString('pt-BR', { style: 'currency', currency: curr, minimumFractionDigits: 2 }); }
  catch { return `${curr} ${val.toFixed(2)}`; }
}

function PaymentCell({ s }: { s: Student }) {
  const { paymentType: t, paymentInstallments: inst, paymentIsSub: isSub, paymentRecurrency: recur } = s;

  // Installments paid (credit card): estimate by months since entry
  const monthsSince = s.entryDate
    ? Math.floor((Date.now() - s.entryDate) / (30 * 24 * 60 * 60 * 1000)) + 1
    : 1;
  const paid      = Math.min(monthsSince, inst);
  const remaining = inst - paid;

  let badge = SILVER; let badgeBg = 'rgba(255,255,255,0.08)';
  let mainLabel = t || '—';
  let subLabel  = '';

  if (isSub) {
    mainLabel = 'Assinatura'; badgeBg = 'rgba(56,189,248,0.14)'; badge = '#38bdf8';
    subLabel  = `Parcela ${recur}`;
  } else if (t.includes('PIX')) {
    mainLabel = 'Pix'; badgeBg = 'rgba(52,211,153,0.14)'; badge = '#34d399';
  } else if (t.includes('BILLET') || t.includes('BOLETO')) {
    mainLabel = 'Boleto'; badgeBg = 'rgba(251,191,36,0.14)'; badge = '#fbbf24';
  } else if (t.includes('PAYPAL')) {
    mainLabel = 'PayPal'; badgeBg = 'rgba(99,102,241,0.14)'; badge = '#818cf8';
  } else if (t.includes('GOOGLE')) {
    mainLabel = 'Google Pay'; badgeBg = 'rgba(234,67,53,0.12)'; badge = '#f87171';
  } else if (t.includes('CREDIT') || t.includes('CARD') || t.includes('DEBIT')) {
    if (inst > 1) {
      mainLabel = `Cartão ${inst}x`; badgeBg = 'rgba(232,177,79,0.14)'; badge = GOLD;
      subLabel  = `${paid}/${inst} pagas${remaining > 0 ? ` · ${remaining} faltam` : ' ✓'}`;
    } else {
      mainLabel = t.includes('DEBIT') ? 'Cartão Débito' : 'Cartão à Vista';
      badgeBg = 'rgba(232,177,79,0.14)'; badge = GOLD;
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block w-fit"
        style={{ background: badgeBg, color: badge }}>
        {mainLabel}
      </span>
      {subLabel && (
        <span className="text-[10px] font-bold" style={{ color: SILVER }}>{subLabel}</span>
      )}
    </div>
  );
}

const GRID = '130px 1fr 1fr 130px 120px 175px 110px';
const COLS = [
  { key: 'entryDate', label: 'Data Entrada', sortable: true },
  { key: 'name',      label: 'Nome',         sortable: false },
  { key: 'email',     label: 'Email',        sortable: false },
  { key: 'phone',     label: 'Telefone',     sortable: false },
  { key: 'valor',     label: 'Valor',        sortable: false },
  { key: 'payment',   label: 'Pagamento',    sortable: false },
  { key: 'source',    label: 'Origem',       sortable: false },
];

export default function CursoDetailPage({ params }: { params: Promise<{ courseName: string }> }) {
  const { courseName } = use(params);
  const decoded = decodeURIComponent(courseName);
  const router  = useRouter();

  const [students,  setStudents]  = useState<Student[]>([]);
  const [turmas,    setTurmas]    = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [turmaFilter, setTurmaFilter] = useState('');
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(0);
  const [pageSize,  setPageSize]  = useState(50);
  const [sortDir,   setSortDir]   = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ ...(turmaFilter ? { turma: turmaFilter } : {}) });
    fetch(`/api/cursos/${encodeURIComponent(decoded)}?${p}`)
      .then(r => r.json())
      .then(d => { setStudents(d.students || []); setTurmas(d.turmas || []); setLoading(false); setPage(0); })
      .catch(() => setLoading(false));
  }, [decoded, turmaFilter]);

  const filtered = students.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search)
  );

  const sorted = [...filtered].sort((a, b) =>
    sortDir === 'desc'
      ? (b.entryDate || 0) - (a.entryDate || 0)
      : (a.entryDate || 0) - (b.entryDate || 0)
  );

  const paginated  = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <LoginWrapper>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          nav, .h-\\[80px\\] { display: none !important; }
          body { background: white !important; color: black !important; }
          main { padding: 0 !important; max-width: 100% !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-4 md:px-6 max-w-[1700px] mx-auto pt-10 pb-24">

          {/* Header */}
          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/cursos')} className="no-print w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(232,177,79,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: SILVER }}>arrow_back</span>
              </button>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)' }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: GOLD }}>menu_book</span>
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white leading-tight">{decoded}</h1>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] mt-0.5" style={{ color: SILVER }}>
                  {loading ? 'Carregando...' : `${sorted.length.toLocaleString('pt-BR')} aluno${sorted.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {/* PDF export */}
            <button onClick={handlePrint} className="no-print flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.1)')}>
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              Salvar PDF
            </button>
          </div>

          {/* Filters bar */}
          <div className="no-print flex flex-wrap items-center gap-3 mb-6">
            {/* Search */}
            <div className="relative min-w-[260px] max-w-[400px] flex-1">
              <span className="material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
              <input type="text" placeholder="Buscar aluno por nome, email ou fone..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }} />
            </div>

            {/* Turmas */}
            {turmas.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Turma:</span>
                <button onClick={() => setTurmaFilter('')}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                  style={{ background: !turmaFilter ? GOLD : 'rgba(255,255,255,0.07)', color: !turmaFilter ? NAVY : SILVER, border: `1px solid ${!turmaFilter ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                  Todas
                </button>
                {turmas.map(t => (
                  <button key={t} onClick={() => setTurmaFilter(t === turmaFilter ? '' : t)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                    style={{ background: turmaFilter === t ? GOLD : 'rgba(255,255,255,0.07)', color: turmaFilter === t ? NAVY : SILVER, border: `1px solid ${turmaFilter === t ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-3xl overflow-hidden"
            style={{ background: 'rgba(0,15,40,0.85)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(20px)' }}>

            {/* Header row */}
            <div className="grid px-5 py-3.5"
              style={{ gridTemplateColumns: GRID, background: 'rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {COLS.map(col => (
                <div key={col.key}
                  className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer select-none group' : ''}`}
                  onClick={col.sortable ? () => { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); setPage(0); } : undefined}>
                  <span className="text-[10px] font-black uppercase tracking-widest transition-colors"
                    style={{ color: col.sortable ? GOLD : SILVER }}>
                    {col.label}
                  </span>
                  {col.sortable && (
                    <span className="material-symbols-outlined text-[13px]" style={{ color: GOLD }}>
                      {sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {loading ? (
              [...Array(10)].map((_, i) => (
                <div key={i} className="grid px-5 py-4 animate-pulse"
                  style={{ gridTemplateColumns: GRID, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {[...Array(7)].map((_, j) => (
                    <div key={j} className="h-4 rounded-lg mr-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
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
                  className="grid px-5 py-3 items-center transition-colors group"
                  style={{ gridTemplateColumns: GRID, background: idx % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent')}>
                  <span className="text-[12px] font-bold" style={{ color: SILVER }}>{fmtDate(s.entryDate)}</span>
                  <span className="text-[12px] font-black text-white truncate pr-2">{s.name}</span>
                  <span className="text-[11px] font-bold truncate pr-2" style={{ color: SILVER }}>{s.email}</span>
                  <span className="text-[11px] font-bold" style={{ color: SILVER }}>{s.phone}</span>
                  <span className="text-[12px] font-bold" style={{ color: GOLD }}>{fmtCurrency(s.valor, s.currency)}</span>
                  <PaymentCell s={s} />
                  <span className="text-[11px] font-bold truncate" style={{ color: s.source !== '—' ? '#38bdf8' : SILVER }}>{s.source}</span>
                </div>
              ))
            )}
          </div>

          {/* Bottom bar: page size + pagination */}
          <div className="no-print flex items-center justify-between mt-5 flex-wrap gap-3">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Por página:</span>
              {[50, 100, 150, 200].map(n => (
                <button key={n} onClick={() => { setPageSize(n); setPage(0); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                  style={{ background: pageSize === n ? GOLD : 'rgba(255,255,255,0.07)', color: pageSize === n ? NAVY : SILVER, border: `1px solid ${pageSize === n ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                  {n}
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                  ← Anterior
                </button>
                <span className="text-[12px] font-bold px-3" style={{ color: SILVER }}>
                  {page + 1} / {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                  Próxima →
                </button>
              </div>
            )}

            <span className="text-[11px] font-bold" style={{ color: SILVER }}>
              {sorted.length.toLocaleString('pt-BR')} alunos no total
            </span>
          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
