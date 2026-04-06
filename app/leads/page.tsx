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

const CARDS: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(0,22,55,0.85) 0%, rgba(0,14,36,0.9) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  backdropFilter: 'blur(16px)',
};

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

const PAGE = 200;
const HOT_TAG_THRESHOLD = 3; // ≥ this many tags → hot lead ⭐

function fmtDate(iso: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
      padding: '2px 7px', borderRadius: 5,
      background: 'rgba(232,177,79,0.10)', border: '1px solid rgba(232,177,79,0.22)',
      color: GOLD, whiteSpace: 'nowrap',
    }}>{tag}</span>
  );
}

function ContactRow({ c, rank }: { c: Contact; rank?: number }) {
  const isHot = c.tagCount >= HOT_TAG_THRESHOLD;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';

  return (
    <tr
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {rank !== undefined && (
        <td style={{ padding: '11px 16px', textAlign: 'center', width: 48 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: rank < 3 ? GOLD : SILVER }}>
            {rank < 3 ? ['🥇','🥈','🥉'][rank] : `#${rank + 1}`}
          </span>
        </td>
      )}
      <td style={{ padding: '11px 16px 11px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isHot && <span title="Lead quente" style={{ fontSize: 14 }}>⭐</span>}
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{fullName.toUpperCase()}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: SKY, marginTop: 2 }}>{c.email}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap' }}>
        {c.phone || '—'}
      </td>
      <td style={{ padding: '11px 16px' }}>
        {c.isAluno ? (
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', padding: '3px 10px',
            borderRadius: 6, background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.3)', color: GREEN,
          }}>✓ ALUNO</span>
        ) : (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>—</span>
        )}
      </td>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 340 }}>
          {c.tags.slice(0, 6).map(t => <TagBadge key={t} tag={t} />)}
          {c.tags.length > 6 && (
            <span style={{ fontSize: 9, color: SILVER, fontWeight: 700 }}>+{c.tags.length - 6}</span>
          )}
        </div>
      </td>
      <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap' }}>
        <span style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
          fontWeight: 900, color: c.tagCount > 0 ? GOLD : SILVER }}>
          {c.tagCount}
        </span>
      </td>
      <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap' }}>
        {fmtDate(c.createdAt)}
      </td>
    </tr>
  );
}

function LeadsTable({ contacts, sort, showRank }: { contacts: Contact[]; sort?: string; showRank?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr style={{ background: 'rgba(232,177,79,0.06)', borderBottom: '1px solid rgba(232,177,79,0.1)' }}>
            {showRank && <th style={{ padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'center' }}>#</th>}
            <th style={{ padding: '10px 20px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'left' }}>CONTATO</th>
            <th style={{ padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'left' }}>TELEFONE</th>
            <th style={{ padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'left' }}>É ALUNO?</th>
            <th style={{ padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'left' }}>TAGS</th>
            <th style={{ padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'left' }}>Nº TAGS</th>
            <th style={{ padding: '10px 16px', fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.15em', textAlign: 'left' }}>CADASTRO</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => (
            <ContactRow key={c.id} c={c} rank={showRank ? i : undefined} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
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

// ── Main Page ─────────────────────────────────────────────────────────────────
function LeadsPage() {
  const { userRole } = useDashboard();
  const [tab, setTab]           = useState<'geral' | 'melhores'>('geral');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(0);

  // For "Melhores" tab we fetch all by tag sort and slice client-side
  const [allByTag, setAllByTag] = useState<Contact[]>([]);
  const [tagLoaded, setTagLoaded] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/leads/contacts?offset=${offset}&limit=${PAGE}&sort=date`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setLoading(false); return; }
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  const loadBestLeads = useCallback(async () => {
    if (tagLoaded) return;
    setLoading(true);
    try {
      // Fetch all sorted by tags (server sorts, we take top 200)
      const res  = await fetch(`/api/leads/contacts?offset=0&limit=200&sort=tags`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setLoading(false); return; }
      setAllByTag(data.contacts || []);
      setTagLoaded(true);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [tagLoaded]);

  useEffect(() => { load(0); }, [load]);

  useEffect(() => {
    if (tab === 'melhores') loadBestLeads();
  }, [tab, loadBestLeads]);

  const handlePage = (p: number) => {
    setPage(p);
    load(p * PAGE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(total / PAGE);

  // Access guard
  if (userRole !== 'TOTAL' && userRole !== 'COMERCIAL') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', fontWeight: 900, fontSize: 20 }}>Acesso negado.</p>
      </div>
    );
  }

  const alunoCount = contacts.filter(c => c.isAluno).length;
  const hotCount   = (tab === 'melhores' ? allByTag : contacts).filter(c => c.tagCount >= HOT_TAG_THRESHOLD).length;

  const tabs = [
    { key: 'geral',    label: 'Lista Geral'     },
    { key: 'melhores', label: 'Melhores Leads'  },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #000a1c 0%, #001a35 100%)' }}>
      <Navbar />
      <main style={{ paddingTop: 100, paddingBottom: 60, paddingLeft: 24, paddingRight: 24, maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0 }}>
            Leads — Active Campaign
          </h1>
          <p style={{ color: SILVER, fontSize: 12, fontWeight: 700, marginTop: 6 }}>
            Contatos do AC · sem filtro de período · cruzado com base de alunos
          </p>
        </div>

        {/* Stats row */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'Total de Leads', value: total.toLocaleString('pt-BR'), color: GOLD },
              { label: 'Já são Alunos', value: alunoCount, color: GREEN },
              { label: 'Leads Quentes ⭐', value: hotCount, color: '#f97316' },
            ].map(stat => (
              <div key={stat.label} style={{ ...CARDS, padding: '16px 24px', minWidth: 160 }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: SILVER, letterSpacing: '0.15em',
                  textTransform: 'uppercase', margin: 0 }}>{stat.label}</p>
                <p style={{ fontSize: 26, fontWeight: 900, color: stat.color, margin: '4px 0 0' }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20,
          background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4, width: 'fit-content' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '8px 22px', borderRadius: 10, fontWeight: 900, fontSize: 11,
                cursor: 'pointer', border: 'none', letterSpacing: '0.08em',
                background: tab === t.key ? GOLD : 'transparent',
                color: tab === t.key ? NAVY : SILVER,
                transition: 'all 0.2s',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 14, padding: '16px 20px', marginBottom: 24, color: '#f87171',
            fontSize: 13, fontWeight: 700 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Content card */}
        <div style={{ ...CARDS, overflow: 'hidden' }}>
          {/* Tab header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 16, margin: 0 }}>
                {tab === 'geral' ? '📋 Lista Geral de Leads' : '⭐ Melhores Leads'}
              </h2>
              <p style={{ color: SILVER, fontSize: 10, fontWeight: 700, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {tab === 'geral'
                  ? `${PAGE} por página · leads cadastrados no Active Campaign`
                  : `Top 200 leads com mais tags · oportunidades quentes para o comercial`}
              </p>
            </div>
            {tab === 'geral' && !loading && (
              <span style={{ fontSize: 11, fontWeight: 700, color: SILVER }}>
                Mostrando {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total.toLocaleString('pt-BR')}
              </span>
            )}
          </div>

          {/* Loading skeleton */}
          {loading ? (
            <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span className="material-symbols-outlined" style={{ color: GOLD, fontSize: 24,
                animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <span style={{ color: SILVER, fontWeight: 700, fontSize: 13 }}>
                Carregando leads do Active Campaign...
              </span>
            </div>
          ) : tab === 'geral' ? (
            <>
              {contacts.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: SILVER, fontSize: 13, fontWeight: 700 }}>
                  Nenhum lead encontrado.
                </div>
              ) : (
                <LeadsTable contacts={contacts} />
              )}
            </>
          ) : (
            <>
              {allByTag.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: SILVER, fontSize: 13, fontWeight: 700 }}>
                  Nenhum lead encontrado.
                </div>
              ) : (
                <LeadsTable contacts={allByTag} showRank />
              )}
            </>
          )}
        </div>

        {/* Pagination (Lista Geral only) */}
        {tab === 'geral' && !loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
            <button onClick={() => handlePage(0)} disabled={page === 0} style={pagBtn(page === 0)}>«</button>
            <button onClick={() => handlePage(page - 1)} disabled={page === 0} style={pagBtn(page === 0)}>‹</button>
            {(() => {
              const winSize = Math.min(7, totalPages);
              let winStart = Math.max(0, page - Math.floor(winSize / 2));
              if (winStart + winSize > totalPages) winStart = Math.max(0, totalPages - winSize);
              return Array.from({ length: winSize }, (_, i) => winStart + i).map(p => (
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

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
