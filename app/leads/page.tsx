'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar }       from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { useDashboard } from '@/app/lib/context';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const GREEN  = '#4ade80';
const SKY    = '#38bdf8';

/* ─── Glassmorphism card — matches hotmart/financeiro pages ─── */
const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 24px 48px -12px rgba(0,0,0,0.5)',
  borderRadius: 24,
  position: 'relative',
  overflow: 'hidden',
};

const PAGE    = 200;
const HOT_MIN = 3; // ≥ this many tags → hot lead ⭐

type Contact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: string;
  tags: string[];
  tagCount: number;
  isAluno: boolean;
};

function fmtDate(iso: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

/* ── Table header cell ───────────────────────────────────────── */
function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
      letterSpacing: '0.15em', textTransform: 'uppercase',
      textAlign: right ? 'right' : 'left',
      background: 'rgba(232,177,79,0.06)',
      borderBottom: '1px solid rgba(232,177,79,0.1)',
    }}>{children}</th>
  );
}

/* ── Skeleton row ───────────────────────────────────────────── */
function SkelRow({ cols }: { cols: number }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.06)',
            width: `${[70, 55, 45, 30, 60, 35, 45][i % 7]}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

/* ── Contact row ─────────────────────────────────────────────── */
function ContactRow({ c, rank }: { c: Contact; rank?: number }) {
  const isHot     = c.tagCount >= HOT_MIN;
  const fullName  = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
  const rowBg     = rank !== undefined && rank % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent';

  return (
    <tr style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>

      {rank !== undefined && (
        <td style={{ padding: '12px 16px', textAlign: 'center', width: 50 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: rank < 3 ? GOLD : SILVER }}>
            {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
          </span>
        </td>
      )}

      {/* Name + email */}
      <td style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isHot && <span title="Lead quente" style={{ fontSize: 13, flexShrink: 0 }}>⭐</span>}
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.02em' }}>
              {fullName.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: SKY, marginTop: 2 }}>{c.email}</div>
          </div>
        </div>
      </td>

      {/* Phone */}
      <td style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap' }}>
        {c.phone || '—'}
      </td>

      {/* Aluno badge */}
      <td style={{ padding: '12px 16px' }}>
        {c.isAluno ? (
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', padding: '4px 10px',
            borderRadius: 8, background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.35)', color: GREEN, whiteSpace: 'nowrap',
          }}>✓ ALUNO</span>
        ) : (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>—</span>
        )}
      </td>

      {/* Tags */}
      <td style={{ padding: '10px 16px', maxWidth: 320 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {c.tags.slice(0, 5).map(t => (
            <span key={t} style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px',
              borderRadius: 5, background: 'rgba(232,177,79,0.10)',
              border: '1px solid rgba(232,177,79,0.22)', color: GOLD, whiteSpace: 'nowrap',
            }}>{t}</span>
          ))}
          {c.tags.length > 5 && (
            <span style={{ fontSize: 9, color: SILVER, fontWeight: 700, alignSelf: 'center' }}>
              +{c.tags.length - 5}
            </span>
          )}
        </div>
      </td>

      {/* Tag count */}
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <span style={{
          fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 8,
          background: c.tagCount > 0 ? 'rgba(232,177,79,0.12)' : 'rgba(255,255,255,0.05)',
          color: c.tagCount > 0 ? GOLD : 'rgba(255,255,255,0.25)',
          border: c.tagCount > 0 ? '1px solid rgba(232,177,79,0.25)' : '1px solid rgba(255,255,255,0.08)',
        }}>{c.tagCount}</span>
      </td>

      {/* Date */}
      <td style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap' }}>
        {fmtDate(c.createdAt)}
      </td>
    </tr>
  );
}

/* ── Pagination button style ─────────────────────────────────── */
function pagBtn(disabled: boolean, active = false): React.CSSProperties {
  return {
    minWidth: 36, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: active ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.1)',
    background: active ? 'rgba(232,177,79,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? GOLD : disabled ? 'rgba(255,255,255,0.2)' : SILVER,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

/* ── Main page ───────────────────────────────────────────────── */
function LeadsPage() {
  const { userRole } = useDashboard();
  const [tab, setTab]         = useState<'geral' | 'melhores'>('geral');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [bestLeads, setBestLeads] = useState<Contact[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(0);

  const fetchPage = useCallback(async (pageIndex: number) => {
    setLoading(true);
    setError('');
    try {
      const offset = pageIndex * PAGE;
      const res  = await fetch(`/api/leads/contacts?offset=${offset}&limit=${PAGE}&sort=date`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setLoading(false); return; }
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  const fetchBest = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/leads/contacts?offset=0&limit=${PAGE}&sort=tags`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setLoading(false); return; }
      setBestLeads(data.contacts || []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  const handleTab = (t: typeof tab) => {
    setTab(t);
    if (t === 'melhores' && bestLeads.length === 0) fetchBest();
  };

  const handlePage = (p: number) => {
    setPage(p);
    fetchPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(total / PAGE);
  const currentContacts = tab === 'geral' ? contacts : bestLeads;

  const alunoCount = currentContacts.filter(c => c.isAluno).length;
  const hotCount   = currentContacts.filter(c => c.tagCount >= HOT_MIN).length;

  if (userRole !== 'TOTAL' && userRole !== 'COMERCIAL') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', fontWeight: 900, fontSize: 20 }}>Acesso negado.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 20% 20%, rgba(0,26,53,0.95) 0%, rgba(0,5,15,1) 70%)' }}>
      <Navbar />
      <main className="px-3 sm:px-6 pb-20" style={{ paddingTop: 100, maxWidth: 1400, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(232,177,79,0.12)',
              border: '1px solid rgba(232,177,79,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: GOLD, fontSize: 22 }}>contacts</span>
            </div>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                Leads — Active Campaign
              </h1>
              <p style={{ color: SILVER, fontSize: 11, fontWeight: 700, margin: '3px 0 0',
                textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Contatos do AC · cruzado com base de alunos
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
          {[
            { icon: 'group', label: 'Total de Leads', value: loading ? '…' : total.toLocaleString('pt-BR'), color: GOLD },
            { icon: 'school', label: 'Já são Alunos', value: loading ? '…' : alunoCount, color: GREEN },
            { icon: 'star', label: 'Leads Quentes ⭐', value: loading ? '…' : hotCount, color: '#f97316' },
          ].map(s => (
            <div key={s.label} style={{ ...glossy, padding: '18px 24px', minWidth: 170, flex: '1 1 160px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span className="material-symbols-outlined" style={{ color: s.color, fontSize: 20 }}>{s.icon}</span>
                <p style={{ fontSize: 9, fontWeight: 900, color: SILVER, letterSpacing: '0.15em',
                  textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 28, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 14, padding: '14px 20px', marginBottom: 24, color: '#f87171',
            fontSize: 13, fontWeight: 700 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Main card ── */}
        <div style={glossy}>

          {/* Card header + tabs */}
          <div style={{ padding: '20px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: 0 }}>
                  {tab === 'geral' ? '📋 Lista Geral de Leads' : '⭐ Melhores Leads'}
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, color: SILVER, letterSpacing: '0.1em',
                  textTransform: 'uppercase', margin: '4px 0 0' }}>
                  {tab === 'geral'
                    ? `${PAGE} por página · ordenado por data de cadastro`
                    : 'Top 200 com mais tags · oportunidades quentes para o comercial'}
                </p>
              </div>
              {tab === 'geral' && !loading && total > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: SILVER }}>
                  {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total.toLocaleString('pt-BR')}
                </span>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0 }}>
              {([
                { key: 'geral',    label: '📋 Lista Geral'    },
                { key: 'melhores', label: '⭐ Melhores Leads'  },
              ] as const).map(t => (
                <button key={t.key} onClick={() => handleTab(t.key)}
                  style={{
                    padding: '10px 20px', fontWeight: 900, fontSize: 11, cursor: 'pointer',
                    border: 'none', borderBottom: `2px solid ${tab === t.key ? GOLD : 'transparent'}`,
                    background: 'transparent', color: tab === t.key ? GOLD : SILVER,
                    letterSpacing: '0.05em', transition: 'all 0.2s',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {tab === 'melhores' && <TH>#</TH>}
                  <TH>Contato</TH>
                  <TH>Telefone</TH>
                  <TH>É Aluno?</TH>
                  <TH>Tags</TH>
                  <TH>Nº Tags</TH>
                  <TH>Cadastro</TH>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkelRow key={i} cols={tab === 'melhores' ? 7 : 6} />)
                  : currentContacts.length === 0
                    ? (
                      <tr><td colSpan={7} style={{ padding: 60, textAlign: 'center',
                        color: SILVER, fontSize: 13, fontWeight: 700 }}>
                        Nenhum lead encontrado.
                      </td></tr>
                    )
                    : currentContacts.map((c, i) => (
                      <ContactRow key={c.id} c={c} rank={tab === 'melhores' ? i : undefined} />
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Pagination (Lista Geral only) ── */}
        {tab === 'geral' && !loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
            <button onClick={() => handlePage(0)} disabled={page === 0} style={pagBtn(page === 0)}>«</button>
            <button onClick={() => handlePage(page - 1)} disabled={page === 0} style={pagBtn(page === 0)}>‹</button>
            {(() => {
              const winSize = Math.min(7, totalPages);
              let ws = Math.max(0, page - Math.floor(winSize / 2));
              if (ws + winSize > totalPages) ws = Math.max(0, totalPages - winSize);
              return Array.from({ length: winSize }, (_, i) => ws + i).map(p => (
                <button key={p} onClick={() => handlePage(p)} style={pagBtn(false, page === p)}>{p + 1}</button>
              ));
            })()}
            <button onClick={() => handlePage(page + 1)} disabled={page >= totalPages - 1} style={pagBtn(page >= totalPages - 1)}>›</button>
            <button onClick={() => handlePage(totalPages - 1)} disabled={page >= totalPages - 1} style={pagBtn(page >= totalPages - 1)}>»</button>
            <span style={{ fontSize: 10, fontWeight: 700, color: SILVER, marginLeft: 8 }}>
              Página {page + 1} de {totalPages}
            </span>
          </div>
        )}

      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

export default function LeadsPageWrapper() {
  return (
    <LoginWrapper>
      <LeadsPage />
    </LoginWrapper>
  );
}
