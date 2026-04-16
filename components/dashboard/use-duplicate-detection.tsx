'use client';

import React, { useState, useRef, useCallback } from 'react';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const GREEN  = '#4ade80';
const NAVY   = '#001a35';

export type DupMatch = { email: string; name: string; courses: string[] };

type Options = {
  /** Current email value in the form, used for pre-fill and merge */
  getEmail: () => string;
  /** Called when "use existing email" is clicked */
  onEmailSet: (email: string) => void;
};

export function useDuplicateDetection({ getEmail, onEmailSet }: Options) {
  const [dupMatches,   setDupMatches]   = useState<DupMatch[]>([]);
  const [dupLoading,   setDupLoading]   = useState(false);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [mergeTarget,  setMergeTarget]  = useState<DupMatch | null>(null);
  const [merging,      setMerging]      = useState(false);
  const [mergeError,   setMergeError]   = useState('');
  const [mergeDone,    setMergeDone]    = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNameChange = useCallback(async (name: string, setName: (v: string) => void) => {
    setName(name);
    setDupDismissed(false);
    setMergeTarget(null);
    setMergeDone(false);
    setMergeError('');
    if (timer.current) clearTimeout(timer.current);
    const trimmed = name.trim();
    if (trimmed.length < 3) { setDupMatches([]); return; }
    timer.current = setTimeout(async () => {
      setDupLoading(true);
      try {
        const res = await fetch(`/api/alunos/search-by-name?name=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setDupMatches(data.matches || []);
      } catch { setDupMatches([]); }
      finally { setDupLoading(false); }
    }, 500);
  }, []);

  const handleMerge = useCallback(async () => {
    const email = getEmail().trim().toLowerCase();
    if (!mergeTarget || !email) { setMergeError('Preencha o email principal antes de unificar.'); return; }
    if (email === mergeTarget.email.toLowerCase()) {
      // Same email: just dismiss — same person, same profile
      setDupDismissed(true); setMergeTarget(null);
      return;
    }
    setMerging(true); setMergeError('');
    try {
      const res = await fetch('/api/admin/merge-student-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_email: email,
          hotmart_email: mergeTarget.email,
          name:          mergeTarget.name,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro na unificação'); }
      setMergeDone(true);
      setDupDismissed(true);
      setMergeTarget(null);
      setDupMatches([]);
    } catch (e: any) {
      setMergeError(e.message);
    } finally {
      setMerging(false);
    }
  }, [getEmail, mergeTarget]);

  const reset = useCallback(() => {
    setDupMatches([]); setDupLoading(false); setDupDismissed(false);
    setMergeTarget(null); setMerging(false); setMergeError(''); setMergeDone(false);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Renders the duplicate detection card — place it after the Nome/Email row */
  const DuplicateCard = useCallback(() => {
    if (dupDismissed) {
      if (mergeDone) return (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12,
          background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: GREEN, fontSize: 16 }}>check_circle</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Perfis unificados com sucesso!</span>
        </div>
      );
      return null;
    }

    if (!dupLoading && dupMatches.length === 0) return null;

    // ── Loading indicator ──
    if (dupLoading) return (
      <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)',
          borderTopColor: SILVER, animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
        <span style={{ fontSize: 10, color: SILVER }}>Verificando cadastros similares...</span>
      </div>
    );

    // ── Merge confirmation step ──
    if (mergeTarget) {
      const primaryEmail = getEmail().trim();
      return (
        <div style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 14,
          background: 'rgba(99,179,237,0.07)', border: '1.5px solid rgba(99,179,237,0.35)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="material-symbols-outlined" style={{ color: '#63b3ed', fontSize: 18 }}>link</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#63b3ed' }}>Confirmar Unificação de Perfis</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.2)' }}>
              <p style={{ fontSize: 9, fontWeight: 900, color: GREEN, textTransform: 'uppercase',
                letterSpacing: '0.1em', margin: '0 0 4px' }}>✦ Email Principal</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'white', margin: 0 }}>
                {primaryEmail || <span style={{ color: '#f87171' }}>⚠ Preencha o email acima</span>}
              </p>
              <p style={{ fontSize: 9, color: SILVER, margin: '2px 0 0' }}>Perfil unificado e manual</p>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(232,177,79,0.08)',
              border: '1px solid rgba(232,177,79,0.2)' }}>
              <p style={{ fontSize: 9, fontWeight: 900, color: GOLD, textTransform: 'uppercase',
                letterSpacing: '0.1em', margin: '0 0 4px' }}>Hotmart (alias)</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'white', margin: 0 }}>{mergeTarget.email}</p>
              {mergeTarget.courses.length > 0 && (
                <p style={{ fontSize: 9, color: SILVER, margin: '2px 0 0' }}>{mergeTarget.courses.join(', ')}</p>
              )}
            </div>
          </div>

          <p style={{ fontSize: 10, color: SILVER, margin: '0 0 12px', lineHeight: 1.5 }}>
            O perfil <strong style={{ color: 'white' }}>{primaryEmail || '(email principal)'}</strong> passará a exibir
            as compras Hotmart de <strong style={{ color: GOLD }}>{mergeTarget.email}</strong>.
          </p>

          {mergeError && (
            <p style={{ fontSize: 10, color: '#f87171', marginBottom: 8 }}>⚠ {mergeError}</p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleMerge} disabled={merging || !primaryEmail}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontWeight: 900, fontSize: 11, cursor: 'pointer',
                background: (!primaryEmail || merging) ? 'rgba(255,255,255,0.06)' : 'rgba(99,179,237,0.15)',
                border: `1.5px solid ${(!primaryEmail || merging) ? 'rgba(255,255,255,0.1)' : 'rgba(99,179,237,0.5)'}`,
                color: (!primaryEmail || merging) ? SILVER : '#63b3ed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
              {merging
                ? <><span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)',
                    borderTopColor: '#63b3ed', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />Unificando...</>
                : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>Confirmar Unificação</>}
            </button>
            <button type="button" onClick={() => setMergeTarget(null)}
              style={{ padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }

    // ── Match list step ──
    return (
      <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 14,
        background: 'rgba(251,191,36,0.06)', border: '1.5px solid rgba(251,191,36,0.28)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="material-symbols-outlined" style={{ color: '#fbbf24', fontSize: 18, flexShrink: 0 }}>person_search</span>
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#fbbf24', margin: 0 }}>
              {dupMatches.length === 1 ? 'Encontramos 1 cadastro com nome similar' : `Encontramos ${dupMatches.length} cadastros com nomes similares`}
            </p>
            <p style={{ fontSize: 10, color: SILVER, margin: '2px 0 0' }}>
              É a mesma pessoa? Use uma das opções abaixo.
            </p>
          </div>
        </div>

        {dupMatches.map((m, idx) => (
          <div key={m.email} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: idx < dupMatches.length - 1 ? 8 : 0,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: 'white', margin: 0, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</p>
                <p style={{ fontSize: 10, color: SILVER, margin: '2px 0 0', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</p>
                {m.courses.length > 0 && (
                  <p style={{ fontSize: 9, color: GOLD, margin: '2px 0 0', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.courses.join(' · ')}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                <button type="button"
                  onClick={() => { onEmailSet(m.email); setDupDismissed(true); setDupMatches([]); }}
                  style={{ padding: '5px 10px', borderRadius: 8, fontWeight: 800, fontSize: 10, cursor: 'pointer',
                    background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: GREEN,
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>login</span>
                  Usar email
                </button>
                <button type="button" onClick={() => setMergeTarget(m)}
                  style={{ padding: '5px 10px', borderRadius: 8, fontWeight: 800, fontSize: 10, cursor: 'pointer',
                    background: 'rgba(99,179,237,0.10)', border: '1px solid rgba(99,179,237,0.3)', color: '#63b3ed',
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>link</span>
                  Unificar perfis
                </button>
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={() => setDupDismissed(true)}
          style={{ marginTop: 10, width: '100%', padding: '7px 0', borderRadius: 9, fontWeight: 700, fontSize: 10,
            cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: SILVER, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>person_off</span>
          Não, são pessoas diferentes — continuar assim
        </button>
      </div>
    );
  }, [dupLoading, dupMatches, dupDismissed, mergeTarget, merging, mergeError, mergeDone, getEmail, handleMerge, onEmailSet]);

  return { handleNameChange, DuplicateCard, reset };
}
