'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

type SubStatus = 'ACTIVE' | 'OVERDUE' | 'CANCELLED';

type Student = {
  name: string; email: string; phone: string;
  entryDate: number | null; lastPayDate: number | null;
  turma: string; valor: number; currency: string;
  source: string; transaction: string;
  paymentType: string; paymentInstallments: number;
  paymentIsSub: boolean; paymentRecurrency: number;
  subStatus: SubStatus;
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
  const { paymentType: t, paymentInstallments: inst, paymentIsSub: isSub,
    paymentRecurrency: paid, subStatus } = s;

  // Estimate installments paid for credit cards
  const monthsSince = s.entryDate
    ? Math.max(1, Math.floor((Date.now() - s.entryDate) / (30 * 24 * 60 * 60 * 1000)) + 1)
    : 1;
  const cardPaid = Math.min(monthsSince, inst);
  const cardLeft = inst - cardPaid;

  if (isSub) {
    const statusColor = subStatus === 'ACTIVE' ? '#4ade80' : subStatus === 'OVERDUE' ? '#fbbf24' : '#f87171';
    const statusLabel = subStatus === 'ACTIVE' ? '✓ Ativa' : subStatus === 'OVERDUE' ? '⚠ Em atraso' : '✗ Inativa';
    return (
      <div className="flex flex-col gap-0.5">
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block w-fit"
          style={{ background: 'rgba(56,189,248,0.14)', color: '#38bdf8' }}>Assinatura</span>
        <span className="text-[10px] font-bold" style={{ color: SILVER }}>
          {paid} pgto{paid !== 1 ? 's' : ''} realizados
        </span>
        <span className="text-[10px] font-black" style={{ color: statusColor }}>{statusLabel}</span>
      </div>
    );
  }

  if (t.includes('PIX')) return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block"
      style={{ background: 'rgba(52,211,153,0.14)', color: '#34d399' }}>Pix</span>
  );
  if (t.includes('BILLET') || t.includes('BOLETO')) return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block"
      style={{ background: 'rgba(251,191,36,0.14)', color: '#fbbf24' }}>Boleto</span>
  );
  if (t.includes('PAYPAL')) return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block"
      style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}>PayPal</span>
  );
  if (t.includes('GOOGLE')) return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block"
      style={{ background: 'rgba(234,67,53,0.12)', color: '#f87171' }}>Google Pay</span>
  );
  if (t.includes('CREDIT') || t.includes('CARD') || t.includes('DEBIT')) {
    if (inst > 1) return (
      <div className="flex flex-col gap-0.5">
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase inline-block w-fit"
          style={{ background: 'rgba(232,177,79,0.14)', color: GOLD }}>Cartão {inst}x</span>
        <span className="text-[10px] font-bold" style={{ color: SILVER }}>
          {cardPaid}/{inst} pagas{cardLeft > 0 ? ` · ${cardLeft} faltam` : ' · Quitado ✓'}
        </span>
      </div>
    );
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-block"
        style={{ background: 'rgba(232,177,79,0.14)', color: GOLD }}>
        {t.includes('DEBIT') ? 'Cartão Débito' : 'Cartão à Vista'}
      </span>
    );
  }
  return <span className="text-[11px] font-bold" style={{ color: SILVER }}>{t || '—'}</span>;
}

// ── PDF Generation ────────────────────────────────────────────────────────────
function generatePDF(courseName: string, students: Student[]) {
  const rows = students.map((s, i) => {
    let payStr = s.paymentType;
    if (s.paymentIsSub) {
      const st = s.subStatus === 'ACTIVE' ? '✓ Ativa' : s.subStatus === 'OVERDUE' ? '⚠ Em atraso' : '✗ Inativa';
      payStr = `Assinatura · ${s.paymentRecurrency} pgtos · ${st}`;
    } else if (s.paymentInstallments > 1) {
      payStr = `Cartão ${s.paymentInstallments}x`;
    } else if (s.paymentType.includes('PIX')) payStr = 'Pix';
    else if (s.paymentType.includes('BILLET') || s.paymentType.includes('BOLETO')) payStr = 'Boleto';
    else if (s.paymentType.includes('PAYPAL')) payStr = 'PayPal';
    else if (s.paymentType.includes('CREDIT') || s.paymentType.includes('CARD')) payStr = 'Cartão à Vista';

    const rowBg = s.subStatus === 'OVERDUE' ? '#fff8e1' : s.subStatus === 'CANCELLED' ? '#fff0f0' : i % 2 === 0 ? '#f8faff' : '#fff';
    return `
      <tr style="background:${rowBg}">
        <td>${i + 1}</td>
        <td><strong>${s.name}</strong></td>
        <td>${s.email}</td>
        <td>${s.phone}</td>
        <td>${fmtDate(s.entryDate)}</td>
        <td>${s.valor ? s.valor.toLocaleString('pt-BR', { style: 'currency', currency: s.currency, minimumFractionDigits: 2 }) : '—'}</td>
        <td>${payStr}</td>
        <td>${s.source}</td>
      </tr>`;
  }).join('');

  const active    = students.filter(s => !s.paymentIsSub || s.subStatus === 'ACTIVE').length;
  const overdue   = students.filter(s => s.paymentIsSub && s.subStatus === 'OVERDUE').length;
  const cancelled = students.filter(s => s.paymentIsSub && s.subStatus === 'CANCELLED').length;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${courseName} — Lista de Alunos</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; color:#1a2035; background:#fff; padding:32px; font-size:12px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #E8B14F; }
    .course-name { font-size:20px; font-weight:900; color:#001a35; letter-spacing:-0.5px; }
    .meta { font-size:10px; color:#666; margin-top:4px; }
    .logo { font-size:11px; font-weight:900; color:#E8B14F; letter-spacing:2px; text-transform:uppercase; }
    .summary { display:flex; gap:16px; margin-bottom:20px; }
    .stat { padding:12px 18px; border-radius:10px; flex:1; text-align:center; }
    .stat.total { background:#f0f4ff; border:1px solid #c7d2fe; }
    .stat.active { background:#f0fff4; border:1px solid #86efac; }
    .stat.overdue { background:#fffbeb; border:1px solid #fde68a; }
    .stat.cancelled { background:#fff0f0; border:1px solid #fca5a5; }
    .stat-num { font-size:22px; font-weight:900; }
    .stat-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#666; }
    table { width:100%; border-collapse:collapse; }
    th { background:#001a35; color:#E8B14F; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; padding:8px 6px; text-align:left; }
    td { padding:7px 6px; font-size:11px; border-bottom:1px solid #eee; vertical-align:top; }
    td:first-child { color:#888; width:30px; text-align:center; }
    .footer { margin-top:20px; font-size:9px; color:#aaa; text-align:right; }
    @media print { body { padding:16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="course-name">${courseName}</div>
      <div class="meta">Lista de alunos · Gerado em ${new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
    </div>
    <div class="logo">RadExperts<br>Data Center</div>
  </div>
  <div class="summary">
    <div class="stat total"><div class="stat-num" style="color:#3b82f6">${students.length}</div><div class="stat-label">Total de Alunos</div></div>
    <div class="stat active"><div class="stat-num" style="color:#16a34a">${active}</div><div class="stat-label">Ativos</div></div>
    <div class="stat overdue"><div class="stat-num" style="color:#d97706">${overdue}</div><div class="stat-label">Em Atraso</div></div>
    <div class="stat cancelled"><div class="stat-num" style="color:#dc2626">${cancelled}</div><div class="stat-label">Inativo / Cancelado</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Nome</th><th>Email</th><th>Telefone</th><th>Data Entrada</th><th>Valor</th><th>Pagamento</th><th>Origem</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">RadExperts Data Center · ${window?.location?.hostname || 'radexperts-datacenter.vercel.app'}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Page ──────────────────────────────────────────────────────────────────────
const GRID = '130px 1fr 1fr 110px 110px 140px 180px 100px';
const COLS = [
  { key: 'entryDate', label: 'Data Entrada', sortable: true },
  { key: 'name',      label: 'Nome',         sortable: false },
  { key: 'email',     label: 'Email',        sortable: false },
  { key: 'phone',     label: 'Telefone',     sortable: false },
  { key: 'valor',     label: 'Valor',        sortable: false },
  { key: 'lastPay',   label: 'Último Pgto',  sortable: false },
  { key: 'payment',   label: 'Pagamento',    sortable: false },
  { key: 'source',    label: 'Origem',       sortable: false },
];

export default function CursoDetailPage({ params }: { params: Promise<{ courseName: string }> }) {
  const { courseName } = use(params);
  const decoded = decodeURIComponent(courseName);
  const router  = useRouter();

  const [students,    setStudents]    = useState<Student[]>([]);
  const [turmas,      setTurmas]      = useState<string[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [turmaFilter, setTurmaFilter] = useState('');
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(0);
  const [pageSize,    setPageSize]    = useState(50);
  const [sortDir,     setSortDir]     = useState<'desc' | 'asc'>('desc');
  const [statusFilter, setStatusFilter] = useState<'' | 'ACTIVE' | 'OVERDUE' | 'CANCELLED'>('');

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ ...(turmaFilter ? { turma: turmaFilter } : {}) });
    fetch(`/api/cursos/${encodeURIComponent(decoded)}?${p}`)
      .then(r => r.json())
      .then(d => { setStudents(d.students || []); setTurmas(d.turmas || []); setLoading(false); setPage(0); })
      .catch(() => setLoading(false));
  }, [decoded, turmaFilter]);

  const filtered = students.filter(s => {
    if (statusFilter && s.subStatus !== statusFilter && (statusFilter !== 'ACTIVE' || s.paymentIsSub)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.includes(q) || s.phone.includes(q);
  });

  const sorted = [...filtered].sort((a, b) =>
    sortDir === 'desc' ? (b.entryDate || 0) - (a.entryDate || 0) : (a.entryDate || 0) - (b.entryDate || 0)
  );

  const paginated  = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  // Stats
  const hasSubs    = students.some(s => s.paymentIsSub);
  const activeN    = students.filter(s => !s.paymentIsSub || s.subStatus === 'ACTIVE').length;
  const overdueN   = students.filter(s => s.paymentIsSub && s.subStatus === 'OVERDUE').length;
  const cancelledN = students.filter(s => s.paymentIsSub && s.subStatus === 'CANCELLED').length;

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-4 md:px-6 max-w-[1800px] mx-auto pt-10 pb-24">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/cursos')}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
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
            <button
              onClick={() => generatePDF(decoded, sorted)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.1)')}>
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              Exportar PDF
            </button>
          </div>

          {/* Summary cards (only for subscription products) */}
          {!loading && hasSubs && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total', val: students.length, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', filter: '' as '' },
                { label: 'Ativos', val: activeN, color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)', filter: 'ACTIVE' as 'ACTIVE' },
                { label: 'Em Atraso', val: overdueN, color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.2)', filter: 'OVERDUE' as 'OVERDUE' },
                { label: 'Cancelados', val: cancelledN, color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', filter: 'CANCELLED' as 'CANCELLED' },
              ].map(card => (
                <button key={card.label}
                  onClick={() => { setStatusFilter(statusFilter === card.filter ? '' : card.filter); setPage(0); }}
                  className="rounded-2xl p-4 text-left transition-all"
                  style={{ background: statusFilter === card.filter ? card.bg : 'rgba(255,255,255,0.04)', border: `1px solid ${statusFilter === card.filter ? card.border : 'rgba(255,255,255,0.08)'}` }}>
                  <p className="text-3xl font-black" style={{ color: card.color }}>{card.val.toLocaleString('pt-BR')}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] mt-1" style={{ color: SILVER }}>{card.label}</p>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative min-w-[260px] max-w-[400px] flex-1">
              <span className="material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SILVER }}>search</span>
              <input type="text" placeholder="Buscar aluno por nome, email ou fone..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }} />
            </div>
            {turmas.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Turma:</span>
                {['', ...turmas].map(t => (
                  <button key={t || 'all'}
                    onClick={() => { setTurmaFilter(t); setPage(0); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                    style={{ background: turmaFilter === t ? GOLD : 'rgba(255,255,255,0.07)', color: turmaFilter === t ? NAVY : SILVER, border: `1px solid ${turmaFilter === t ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                    {t || 'Todas'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-3xl overflow-hidden"
            style={{ background: 'rgba(0,12,35,0.92)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(24px)' }}>
            <div className="grid px-5 py-3.5"
              style={{ gridTemplateColumns: GRID, background: 'rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {COLS.map(col => (
                <div key={col.key}
                  className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                  onClick={col.sortable ? () => { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); setPage(0); } : undefined}>
                  <span className="text-[10px] font-black uppercase tracking-widest transition-colors"
                    style={{ color: col.sortable ? GOLD : SILVER }}>{col.label}</span>
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
                  {[...Array(8)].map((_, j) => (
                    <div key={j} className="h-4 rounded-lg mr-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
                  ))}
                </div>
              ))
            ) : paginated.length === 0 ? (
              <div className="py-20 text-center">
                <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: SILVER }}>group</span>
                <p className="font-bold text-sm" style={{ color: SILVER }}>Nenhum aluno encontrado.</p>
              </div>
            ) : (
              paginated.map((s, idx) => {
                const rowHighlight = s.paymentIsSub && s.subStatus === 'OVERDUE'
                  ? 'rgba(251,191,36,0.05)'
                  : s.paymentIsSub && s.subStatus === 'CANCELLED'
                    ? 'rgba(248,113,113,0.05)'
                    : idx % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent';
                return (
                  <div key={s.transaction || s.email + idx}
                    className="grid px-5 py-3 items-start transition-colors"
                    style={{ gridTemplateColumns: GRID, background: rowHighlight, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = rowHighlight)}>
                    <span className="text-[11px] font-bold pt-0.5" style={{ color: SILVER }}>{fmtDate(s.entryDate)}</span>
                    <span className="text-[12px] font-black text-white truncate pr-2 pt-0.5">{s.name}</span>
                    <span className="text-[11px] font-bold truncate pr-2 pt-0.5" style={{ color: SILVER }}>{s.email}</span>
                    <span className="text-[11px] font-bold pt-0.5" style={{ color: SILVER }}>{s.phone}</span>
                    <span className="text-[12px] font-bold pt-0.5" style={{ color: GOLD }}>{fmtCurrency(s.valor, s.currency)}</span>
                    <span className="text-[11px] font-bold pt-0.5" style={{ color: SILVER }}>{fmtDate(s.lastPayDate)}</span>
                    <PaymentCell s={s} />
                    <span className="text-[11px] font-bold truncate pt-0.5" style={{ color: s.source !== '—' ? '#38bdf8' : SILVER }}>{s.source}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Por página:</span>
              {[50, 100, 150, 200].map(n => (
                <button key={n} onClick={() => { setPageSize(n); setPage(0); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
                  style={{ background: pageSize === n ? GOLD : 'rgba(255,255,255,0.07)', color: pageSize === n ? NAVY : SILVER, border: `1px solid ${pageSize === n ? GOLD : 'rgba(255,255,255,0.1)'}` }}>
                  {n}
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                  ← Anterior
                </button>
                <span className="text-[12px] font-bold px-3" style={{ color: SILVER }}>{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                  Próxima →
                </button>
              </div>
            )}
            <span className="text-[11px] font-bold" style={{ color: SILVER }}>{sorted.length.toLocaleString('pt-BR')} alunos</span>
          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
