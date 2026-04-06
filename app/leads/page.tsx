'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar }       from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { useDashboard } from '@/app/lib/context';
import { useRouter }    from 'next/navigation';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const GREEN  = '#4ade80';
const SKY    = '#38bdf8';

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
const HOT_MIN = 3; // ≥ this many tags = hot lead

type Contact = {
  id: string; email: string;
  firstName: string; lastName: string;
  phone: string; createdAt: string;
  tags: string[]; tagCount: number; isAluno: boolean;
};

function emailToId(email: string) {
  return btoa((email || '').toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

/* ── Skeleton ── */
function SkelRow({ cols }: { cols: number }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '13px 16px' }}>
          <div style={{ height: 11, borderRadius: 5, background: 'rgba(255,255,255,0.07)',
            width: `${[65, 50, 40, 30, 55, 30, 40][i % 7]}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

/* ── TH ── */
function TH({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th style={{
      padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
      letterSpacing: '0.15em', textTransform: 'uppercase',
      textAlign: center ? 'center' : 'left',
      background: 'rgba(232,177,79,0.06)',
      borderBottom: '1px solid rgba(232,177,79,0.1)',
    }}>{children}</th>
  );
}

/* ── Contact row ── */
function ContactRow({ c, rank, router }: { c: Contact; rank?: number; router: ReturnType<typeof useRouter> }) {
  const isHot     = c.tagCount >= HOT_MIN;
  const fullName  = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
  const rowBg     = typeof rank === 'number' && rank % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent';

  return (
    <tr style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>

      {/* Rank */}
      {typeof rank === 'number' && (
        <td style={{ padding: '12px 16px', textAlign: 'center', width: 50, verticalAlign: 'top' }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: rank < 3 ? GOLD : SILVER }}>
            {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
          </span>
        </td>
      )}

      {/* Name + email */}
      <td style={{ padding: '12px 18px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {isHot && <span title={`Lead quente (${c.tagCount} tags)`} style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⭐</span>}
          <div>
            {c.isAluno ? (
              <button onClick={() => router.push(`/alunos/${emailToId(c.email)}`)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 13, fontWeight: 900, color: GREEN, letterSpacing: '0.02em',
                  textAlign: 'left', textDecoration: 'underline', textDecorationStyle: 'dotted',
                  textUnderlineOffset: 3 }}>
                {fullName.toUpperCase()}
              </button>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.02em' }}>
                {fullName.toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, color: SKY, marginTop: 2 }}>{c.email}</div>
          </div>
        </div>
      </td>

      {/* Phone */}
      <td style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {c.phone || '—'}
      </td>

      {/* Tags */}
      <td style={{ padding: '10px 16px', maxWidth: 300, verticalAlign: 'top' }}>
        {c.tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {c.tags.slice(0, 5).map(t => (
              <span key={t} style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px',
                borderRadius: 5, background: 'rgba(232,177,79,0.10)',
                border: '1px solid rgba(232,177,79,0.22)', color: GOLD, whiteSpace: 'nowrap',
              }}>{t}</span>
            ))}
            {c.tags.length > 5 && (
              <span style={{ fontSize: 9, color: SILVER, fontWeight: 700, alignSelf: 'center' }}>+{c.tags.length - 5}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>—</span>
        )}
      </td>

      {/* Tag count */}
      <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'top' }}>
        <span style={{
          fontSize: 12, fontWeight: 900, padding: '3px 12px', borderRadius: 8,
          background: c.tagCount > 0 ? 'rgba(232,177,79,0.12)' : 'rgba(255,255,255,0.04)',
          color: c.tagCount > 0 ? GOLD : 'rgba(255,255,255,0.2)',
          border: c.tagCount > 0 ? '1px solid rgba(232,177,79,0.25)' : '1px solid rgba(255,255,255,0.06)',
        }}>{c.tagCount}</span>
      </td>

      {/* Date */}
      <td style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {fmtDate(c.createdAt)}
      </td>
    </tr>
  );
}

/* ── Pagination component ── */
function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = (disabled: boolean, active = false): React.CSSProperties => ({
    minWidth: 34, height: 34, borderRadius: 9, fontSize: 12, fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: active ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.1)',
    background: active ? 'rgba(232,177,79,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? GOLD : disabled ? 'rgba(255,255,255,0.2)' : SILVER,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const winSize = Math.min(7, totalPages);
  let ws = Math.max(0, page - Math.floor(winSize / 2));
  if (ws + winSize > totalPages) ws = Math.max(0, totalPages - winSize);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 0' }}>
      <button onClick={() => onPage(0)} disabled={page === 0} style={btn(page === 0)}>«</button>
      <button onClick={() => onPage(page - 1)} disabled={page === 0} style={btn(page === 0)}>‹</button>
      {Array.from({ length: winSize }, (_, i) => ws + i).map(p => (
        <button key={p} onClick={() => onPage(p)} style={btn(false, page === p)}>{p + 1}</button>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1} style={btn(page >= totalPages - 1)}>›</button>
      <button onClick={() => onPage(totalPages - 1)} disabled={page >= totalPages - 1} style={btn(page >= totalPages - 1)}>»</button>
      <span style={{ fontSize: 10, fontWeight: 700, color: SILVER, marginLeft: 6 }}>
        Página {page + 1} de {totalPages}
      </span>
    </div>
  );
}

/* ── Main page ── */
function LeadsPage() {
  const { userRole } = useDashboard();
  const router = useRouter();

  const [tab, setTab]           = useState<'geral' | 'melhores'>('geral');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [bestLeads, setBestLeads] = useState<Contact[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState('');

  const fetchPage = useCallback(async (pageIndex: number) => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/leads/contacts?offset=${pageIndex * PAGE}&limit=${PAGE}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setLoading(false); return; }
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  const fetchBest = useCallback(async () => {
    if (bestLeads.length > 0) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/leads/contacts?offset=0&limit=${PAGE}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setLoading(false); return; }
      // Sort by tag count desc
      const sorted = [...(data.contacts || [])].sort((a: Contact, b: Contact) => b.tagCount - a.tagCount);
      setBestLeads(sorted);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [bestLeads.length]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  const handleTab = (t: typeof tab) => {
    setTab(t);
    setSearch('');
    if (t === 'melhores') fetchBest();
  };

  const handlePage = (p: number) => {
    setPage(p); fetchPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(total / PAGE);
  const currentContacts = tab === 'geral' ? contacts : bestLeads;

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return currentContacts;
    const q = search.toLowerCase().trim();
    return currentContacts.filter(c =>
      c.email.includes(q) ||
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [currentContacts, search]);

  // Stats — counted from current page
  const alunoCount = currentContacts.filter(c => c.isAluno).length;
  const hotCount   = currentContacts.filter(c => !c.isAluno && c.tagCount >= HOT_MIN).length;

  if (userRole !== 'TOTAL' && userRole !== 'COMERCIAL') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', fontWeight: 900, fontSize: 20 }}>Acesso negado.</p>
      </div>
    );
  }

  const colCount = tab === 'melhores' ? 6 : 5;

  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(135deg, #000a1c 0%, #001224 40%, #000f20 100%)',
      minHeight: '100vh',
    }}>
      <Navbar />
      <main className="px-3 sm:px-6 pb-20" style={{ paddingTop: 100, maxWidth: 1440, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(232,177,79,0.12)',
            border: '1px solid rgba(232,177,79,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ color: GOLD, fontSize: 22 }}>contacts</span>
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
              Leads — Active Campaign
            </h1>
            <p style={{ color: SILVER, fontSize: 10, fontWeight: 700, margin: '3px 0 0',
              textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Contatos do AC · cruzado com base de alunos · sem filtro de período
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'group', label: 'Total no AC', value: loading ? '…' : total.toLocaleString('pt-BR'), color: GOLD,
              note: 'total de contatos' },
            { icon: 'school', label: 'Já são Alunos', value: loading ? '…' : String(alunoCount), color: GREEN,
              note: 'dos ' + PAGE + ' exibidos' },
            { icon: 'star', label: 'Leads Quentes', value: loading ? '…' : String(hotCount), color: '#f97316',
              note: `não-alunos com ≥${HOT_MIN} tags` },
          ].map(s => (
            <div key={s.label} style={{ ...glossy, padding: '16px 20px', minWidth: 160, flex: '1 1 150px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="material-symbols-outlined" style={{ color: s.color, fontSize: 18 }}>{s.icon}</span>
                <p style={{ fontSize: 9, fontWeight: 900, color: SILVER, letterSpacing: '0.13em',
                  textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 26, fontWeight: 900, color: s.color, margin: '0 0 2px', lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 9, color: 'rgba(168,178,192,0.6)', margin: 0, fontWeight: 600 }}>{s.note}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 14, padding: '14px 20px', marginBottom: 20, color: '#f87171', fontSize: 13, fontWeight: 700 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Main card */}
        <div style={glossy}>

          {/* Card header + tabs + search */}
          <div style={{ padding: '18px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0 }}>
                  {tab === 'geral' ? '📋 Lista Geral de Leads' : '⭐ Melhores Leads'}
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, color: SILVER, letterSpacing: '0.08em',
                  textTransform: 'uppercase', margin: '4px 0 0' }}>
                  {tab === 'geral'
                    ? `${PAGE} por página · data de cadastro decrescente`
                    : `Top leads por nº de tags · quanto mais tags, mais interesse demonstrado`}
                </p>
                {tab === 'melhores' && (
                  <p style={{ fontSize: 10, color: SILVER, margin: '4px 0 0' }}>
                    ⭐ = {HOT_MIN}+ tags &nbsp;·&nbsp; 🥇🥈🥉 = ranking geral &nbsp;·&nbsp;
                    <span style={{ color: GREEN }}>✓ VER ALUNO</span> = já comprou
                  </p>
                )}
              </div>

              {/* Search */}
              <div style={{ position: 'relative', minWidth: 240 }}>
                <span className="material-symbols-outlined" style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: SILVER, fontSize: 18, pointerEvents: 'none',
                }}>search</span>
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome, email, tag..."
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12, padding: '9px 12px 9px 38px', color: '#fff', fontSize: 12,
                    fontWeight: 600, width: '100%', outline: 'none',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: SILVER, cursor: 'pointer', fontSize: 18,
                  }}>×</button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0 }}>
              {([
                { key: 'geral',    label: '📋 Lista Geral'   },
                { key: 'melhores', label: '⭐ Melhores Leads' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => handleTab(t.key)} style={{
                  padding: '9px 18px', fontWeight: 900, fontSize: 11, cursor: 'pointer',
                  border: 'none', borderBottom: `2px solid ${tab === t.key ? GOLD : 'transparent'}`,
                  background: 'transparent', color: tab === t.key ? GOLD : SILVER,
                  letterSpacing: '0.05em', transition: 'all 0.2s',
                }}>{t.label}</button>
              ))}
              {!loading && (
                <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 10,
                  fontWeight: 700, color: SILVER, paddingRight: 4 }}>
                  {search ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` :
                    tab === 'geral' ? `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, total)} de ${total.toLocaleString('pt-BR')}` :
                    `${bestLeads.length} leads`}
                </span>
              )}
            </div>
          </div>

          {/* Top pagination */}
          {tab === 'geral' && !loading && !search && (
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <Pagination page={page} totalPages={totalPages} onPage={p => { setPage(p); fetchPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {tab === 'melhores' && <TH center>#</TH>}
                  <TH>Contato</TH>
                  <TH>Telefone</TH>
                  <TH>Tags</TH>
                  <TH center>Nº Tags</TH>
                  <TH>Cadastro</TH>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => <SkelRow key={i} cols={colCount} />)
                  : filtered.length === 0
                    ? <tr><td colSpan={colCount} style={{ padding: 60, textAlign: 'center',
                        color: SILVER, fontSize: 13, fontWeight: 700 }}>
                        {search ? `Nenhum resultado para "${search}"` : 'Nenhum lead encontrado.'}
                      </td></tr>
                    : filtered.map((c, i) => (
                      <ContactRow key={c.id} c={c} rank={tab === 'melhores' ? i : undefined} router={router} />
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* Bottom pagination */}
          {tab === 'geral' && !loading && !search && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <Pagination page={page} totalPages={totalPages} onPage={p => { setPage(p); fetchPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          )}
        </div>

      </main>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.85 } }
        input::placeholder { color: rgba(168,178,192,0.5) }
        input:focus { border-color: rgba(232,177,79,0.4) !important; box-shadow: 0 0 0 3px rgba(232,177,79,0.08) }
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
