'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar }       from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import * as XLSX from 'xlsx';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const GREEN  = '#4ade80';
const SKY    = '#38bdf8';

const card: React.CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(160deg, rgba(0,22,55,0.85) 0%, rgba(0,14,36,0.9) 100%)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 24,
  backdropFilter: 'blur(16px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

function fmtDate(ms: number | null | undefined) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleDateString('pt-BR');
}
function fmtMoney(v: number | null | undefined, currency = 'BRL') {
  if (!v && v !== 0) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(v);
  } catch {
    return `BRL ${v.toFixed(2)}`;
  }
}

function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

function emailToId(email: string): string {
  return btoa((email || '').toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Export helpers ────────────────────────────────────────────────────────────
function generatePDF(students: any[]) {
  const rows = students.map((s, i) => {
    const bg = i % 2 === 0 ? '#f8faff' : '#fff';
    const courses = (s.courses || []).join(' · ') || '—';
    const sources = (s.sources || []).map((src: string) => src === 'manual' ? 'Manual' : 'Hotmart').join(' + ');
    return `<tr style="background:${bg}">
      <td style="color:#888;text-align:center">${i + 1}</td>
      <td><strong>${s.name || '—'}</strong></td>
      <td style="font-size:11px;color:#374151">${s.email}</td>
      <td style="font-size:10px;color:#374151">${s.phone || '—'}</td>
      <td>${fmtDate(s.lastEntry)}</td>
      <td style="font-size:10px">${courses}</td>
      <td style="color:#b45309;font-weight:700">${sources}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Todos os Alunos</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
    h1 { font-size: 18px; color: #1e3a5f; margin-bottom: 4px; }
    .meta { font-size: 10px; color: #888; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    @media print { body { margin: 0; } }
  </style></head><body>
  <h1>Todos os Alunos — RadExperts</h1>
  <div class="meta">Gerado em ${new Date().toLocaleString('pt-BR')} · ${students.length} aluno(s)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Nome</th><th>Email</th><th>Telefone</th><th>Última Entrada</th><th>Cursos</th><th>Origem</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>window.print();</script>
  </body></html>`);
  win.document.close();
}

function generateXLS(students: any[]) {
  const wb = XLSX.utils.book_new();
  const headers = ['#', 'NOME', 'EMAIL', 'TELEFONE', 'ÚLTIMA ENTRADA', 'PRIMEIRA ENTRADA', 'CURSOS', 'ORIGEM'];
  const data = students.map((s, i) => [
    i + 1,
    s.name || '',
    s.email,
    s.phone || '',
    s.lastEntry  ? new Date(Number(s.lastEntry)).toLocaleDateString('pt-BR')  : '',
    s.firstEntry ? new Date(Number(s.firstEntry)).toLocaleDateString('pt-BR') : '',
    (s.courses  || []).join(' | '),
    (s.sources  || []).map((src: string) => src === 'manual' ? 'Manual' : 'Hotmart').join(' + '),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [
    { wch: 4 }, { wch: 40 }, { wch: 36 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 60 }, { wch: 16 },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Alunos');
  XLSX.writeFile(wb, `todos_os_alunos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AlunosPage() {
  const router = useRouter();
  const [students,    setStudents]    = useState<any[]>([]);
  const [total,       setTotal]       = useState(0);
  const [allCourses,  setAllCourses]  = useState<string[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [page,        setPage]        = useState(0);
  const PAGE_SIZE = 100;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, courseFilter]);

  const fetchStudents = useCallback(async (p: number, s: string, c: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(p), size: String(PAGE_SIZE),
        ...(s ? { search: s } : {}),
        ...(c ? { course: c } : {}),
      });
      const resp = await fetch(`/api/alunos/all?${qs}`);
      const d    = await resp.json();
      setStudents(d.students || []);
      setTotal(d.total || 0);
      if (d.courses?.length) setAllCourses(d.courses);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStudents(page, debouncedSearch, courseFilter);
  }, [page, debouncedSearch, courseFilter, fetchStudents]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <LoginWrapper>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
      `}</style>

      <div style={{ position: 'relative', minHeight: '100vh' }}>
        {/* Background */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '100vh',
          backgroundImage: 'url(/rad.jpg)', backgroundSize: 'cover',
          backgroundPosition: 'top center', backgroundRepeat: 'no-repeat',
          pointerEvents: 'none', zIndex: 0,
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,20,0.55)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, #001a35 95%)' }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Navbar />
          <div className="h-[80px]" />

          <main className="px-6 max-w-[1600px] mx-auto pt-8 pb-24">

            {/* ── PAGE HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.28)', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: GOLD }}>school</span>
                </div>
                <div>
                  <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    Todos os <span style={{ color: GOLD }}>Alunos</span>
                  </h1>
                  <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: SILVER, marginTop: 4 }}>
                    {loading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} aluno${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              {/* Export buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => generatePDF(students)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
                  PDF
                </button>
                <button
                  onClick={() => generateXLS(students)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: SKY, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_view</span>
                  Planilha
                </button>
              </div>
            </div>

            {/* ── FILTERS ── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 17, color: SILVER, pointerEvents: 'none' }}>search</span>
                <input
                  type="text"
                  placeholder="Buscar por nome, email ou curso…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: 40, paddingRight: 14, paddingTop: 11, paddingBottom: 11, borderRadius: 14, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e  => (e.target.style.borderColor = GOLD)}
                  onBlur={e   => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
              </div>

              {/* Course filter */}
              <select
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
                style={{ padding: '11px 14px', borderRadius: 14, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: courseFilter ? '#fff' : SILVER, outline: 'none', cursor: 'pointer', minWidth: 200, flex: '0 1 280px' }}
              >
                <option value="">Todos os Cursos</option>
                {allCourses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* ── TABLE ── */}
            <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
              {/* Shine */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 35%)', borderRadius: 24, pointerEvents: 'none' }} />

              <div style={{ overflowX: 'auto', position: 'relative', zIndex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {['#', 'Última Entrada', 'Nome', 'Email', 'Telefone', 'Cursos', 'Origem'].map(h => (
                        <th key={h} style={{ padding: '14px 18px', textAlign: 'left', fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: SILVER, whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.2)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td key={j} style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <div style={{ height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.5s ease-in-out infinite', width: j === 2 ? '70%' : j === 3 ? '90%' : j === 4 ? '85%' : '50%' }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '64px 0', textAlign: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 48, color: SILVER, display: 'block', marginBottom: 12 }}>person_search</span>
                          <p style={{ fontSize: 14, fontWeight: 900, color: SILVER }}>Nenhum aluno encontrado</p>
                        </td>
                      </tr>
                    ) : (
                      students.map((s, i) => {
                        const globalIdx = page * PAGE_SIZE + i + 1;
                        const rowBg     = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent';
                        const studentId = emailToId(s.email);
                        const isHotmart = (s.sources || []).includes('hotmart');
                        const isManual  = (s.sources || []).includes('manual');
                        return (
                          <tr key={s.email}
                            onClick={() => router.push(`/alunos/${studentId}`)}
                            style={{ background: rowBg, animation: 'fadeIn 0.2s ease', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                          >
                            <td style={{ padding: '14px 18px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                              {globalIdx.toLocaleString('pt-BR')}
                            </td>
                            <td style={{ padding: '14px 18px', fontSize: 12, fontWeight: 700, color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                              {fmtDate(s.lastEntry)}
                            </td>
                            <td style={{ padding: '14px 18px', fontSize: 13, fontWeight: 900, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.name || '—'}
                            </td>
                            <td style={{ padding: '14px 18px', fontSize: 11, fontWeight: 700, color: SKY, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                              <a href={`mailto:${s.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.email}</a>
                            </td>
                            {/* Phone */}
                            <td style={{ padding: '14px 18px', fontSize: 11, fontWeight: 700, color: SILVER, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                              {s.phone
                                ? <a href={`tel:${s.phone}`} onClick={e => e.stopPropagation()} style={{ color: SILVER, textDecoration: 'none' }}>{s.phone}</a>
                                : '—'
                              }
                            </td>
                            {/* Courses as badges */}
                            <td style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', maxWidth: 380 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(s.courses || []).map((c: string) => (
                                  <Link
                                    key={c}
                                    href={`/cursos/${slugify(c)}`}
                                    onClick={e => e.stopPropagation()}
                                    title={c}
                                    style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 6, background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.2)', color: GOLD, textDecoration: 'none', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                                  >
                                    {c}
                                  </Link>
                                ))}
                              </div>
                            </td>
                            {/* Sources */}
                            <td style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {isHotmart && (
                                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 6, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: SKY }}>Hotmart</span>
                                )}
                                {isManual && (
                                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 6, background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>Manual</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── PAGINATION ── */}
            {!loading && totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                <button onClick={() => setPage(0)}         disabled={page === 0}             style={pagBtn(page === 0)}>«</button>
                <button onClick={() => setPage(p => p-1)} disabled={page === 0}             style={pagBtn(page === 0)}>‹</button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const half = Math.floor(Math.min(7, totalPages) / 2);
                  let p = page - half + i;
                  p = Math.max(0, Math.min(totalPages - 1, p));
                  return (
                    <button key={p} onClick={() => setPage(p)} style={pagBtn(false, page === p)}>
                      {p + 1}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => p+1)} disabled={page >= totalPages-1} style={pagBtn(page >= totalPages-1)}>›</button>
                <button onClick={() => setPage(totalPages-1)} disabled={page >= totalPages-1} style={pagBtn(page >= totalPages-1)}>»</button>
                <span style={{ fontSize: 10, fontWeight: 700, color: SILVER, marginLeft: 8 }}>
                  Página {page + 1} de {totalPages} · {total.toLocaleString('pt-BR')} alunos
                </span>
              </div>
            )}

          </main>
        </div>
      </div>
    </LoginWrapper>
  );
}

function pagBtn(disabled: boolean, active = false): React.CSSProperties {
  return {
    minWidth: 36, height: 36, borderRadius: 10,
    border: active ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.1)',
    background: active ? `rgba(232,177,79,0.15)` : 'rgba(255,255,255,0.04)',
    color: active ? GOLD : disabled ? 'rgba(255,255,255,0.2)' : SILVER,
    fontSize: 13, fontWeight: 900, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  };
}
