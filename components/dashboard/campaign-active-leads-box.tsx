'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 20px 40px -8px rgba(0,0,0,0.5)',
  borderRadius: 28,
  position: 'relative',
  overflow: 'hidden',
};

function R(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function N(v: number) {
  return v.toLocaleString('pt-BR');
}

function DiffBadge({ pct, invertColor = false }: { pct: number; invertColor?: boolean }) {
  // invertColor=true: negative pct is GOOD (e.g. CPL Real < CPL Meta means cheaper leads)
  const isGood = invertColor ? pct <= 0 : pct >= 0;
  const color  = pct === 0 ? SILVER : isGood ? '#22c55e' : '#ef4444';
  const icon   = pct === 0 ? 'remove' : pct > 0 ? 'arrow_upward' : 'arrow_downward';
  return (
    <span
      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-black"
      style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}
    >
      <span className="material-symbols-outlined text-[11px]">{icon}</span>
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

interface Props {
  campaignId: string;
  metaLeads:  number;  // leads registrados pelo pixel Meta
  metaSpend:  number;  // investimento total da campanha
}

type Phase = 'loading' | 'no-tag' | 'selecting' | 'counting' | 'ready' | 'error';

interface TagOption {
  id:   string;
  name: string;
}

interface SavedTag {
  tagId:   string;
  tagName: string;
}

export function CampaignActiveLeadsBox({ campaignId, metaLeads, metaSpend }: Props) {
  const [phase, setPhase]         = useState<Phase>('loading');
  const [savedTag, setSavedTag]   = useState<SavedTag | null>(null);
  const [acCount, setAcCount]     = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Tag selector modal state
  const [allTags, setAllTags]     = useState<TagOption[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<TagOption | null>(null);
  const [saving, setSaving]       = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── 1. On mount, check if a tag is already saved for this campaign ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/campaign-tags?campaignId=${encodeURIComponent(campaignId)}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.tagId) {
          setSavedTag({ tagId: data.tagId, tagName: data.tagName });
          setPhase('counting');
        } else {
          setPhase('no-tag');
        }
      } catch {
        if (!cancelled) setPhase('no-tag');
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  // ── 2. Whenever savedTag changes and phase=counting, fetch AC count ──────────
  useEffect(() => {
    if (!savedTag || phase !== 'counting') return;
    let cancelled = false;

    (async () => {
      try {
        const res  = await fetch(`/api/leads/count?tagId=${encodeURIComponent(savedTag.tagId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setAcCount(data.count ?? 0);
        setPhase('ready');
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message);
          setPhase('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [savedTag, phase]);

  // ── 3. Load tags from AC when modal opens ───────────────────────────────────
  const openSelector = useCallback(async () => {
    setPhase('selecting');
    setTagSearch('');
    setSelectedTag(null);
    if (allTags.length > 0) return; // already loaded

    setTagsLoading(true);
    try {
      const res  = await fetch('/api/leads/tags');
      const data = await res.json();
      setAllTags(data.tags || []);
    } catch {
      setAllTags([]);
    } finally {
      setTagsLoading(false);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [allTags.length]);

  // ── 4. Save tag ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedTag) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/campaign-tags', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaignId, tagId: selectedTag.id, tagName: selectedTag.name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedTag({ tagId: selectedTag.id, tagName: selectedTag.name });
      setAcCount(null);
      setPhase('counting');
    } catch (e: any) {
      setError(e.message);
      setPhase('error');
    } finally {
      setSaving(false);
    }
  }, [campaignId, selectedTag]);

  // ── 5. Computed KPIs ─────────────────────────────────────────────────────────
  const cplMeta = metaLeads > 0 ? metaSpend / metaLeads : 0;
  const cplReal = acCount && acCount > 0 ? metaSpend / acCount : 0;

  const leadsDiffPct = metaLeads > 0 && acCount !== null
    ? ((acCount - metaLeads) / metaLeads) * 100
    : 0;

  const cplDiffPct = cplMeta > 0 && cplReal > 0
    ? ((cplReal - cplMeta) / cplMeta) * 100
    : 0;

  const filteredTags = allTags.filter(t =>
    !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  const accentColor = '#38bdf8'; // sky blue — diferencia do gold do Meta

  return (
    <div
      style={{
        ...glossy,
        border: `1px solid rgba(56,189,248,0.25)`,
        background: 'linear-gradient(160deg, rgba(56,189,248,0.07) 0%, rgba(0,10,30,0.55) 100%)',
        padding: '28px 32px',
        marginBottom: 16,
      }}
    >
      {/* Shine overlay */}
      <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)', position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 28 }} />

      <div className="relative z-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `rgba(56,189,248,0.12)`, border: `1px solid rgba(56,189,248,0.25)` }}
            >
              <span className="material-symbols-outlined text-[22px]" style={{ color: accentColor }}>group</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: accentColor }}>Leads no Active</p>
              {savedTag && phase !== 'selecting' && (
                <p className="text-[11px] font-bold mt-0.5 flex items-center gap-1.5" style={{ color: SILVER }}>
                  <span className="material-symbols-outlined text-[12px]" style={{ color: accentColor }}>label</span>
                  {savedTag.tagName}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {(phase === 'ready' || phase === 'error' || phase === 'no-tag' || phase === 'counting') && (
              <button
                onClick={openSelector}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                  background: savedTag ? 'rgba(255,255,255,0.06)' : `rgba(56,189,248,0.12)`,
                  border:     savedTag ? '1px solid rgba(255,255,255,0.12)' : `1px solid rgba(56,189,248,0.3)`,
                  color:      savedTag ? SILVER : accentColor,
                }}
              >
                <span className="material-symbols-outlined text-[13px]">{savedTag ? 'edit' : 'add_circle'}</span>
                {savedTag ? 'Alterar Tag' : 'Definir Tag'}
              </button>
            )}
            {phase === 'ready' && savedTag && acCount !== null && (
              <button
                onClick={() => { setAcCount(null); setPhase('counting'); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}
                title="Atualizar contagem"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Phase: loading ─── */}
        {phase === 'loading' && (
          <div className="flex items-center gap-3 py-4 justify-center">
            <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
            <span className="text-[11px] font-bold" style={{ color: SILVER }}>Verificando configuração...</span>
          </div>
        )}

        {/* ── Phase: no-tag (prompt) ─── */}
        {phase === 'no-tag' && (
          <div className="flex flex-col items-center justify-center py-6 gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
              <span className="material-symbols-outlined text-[26px]" style={{ color: accentColor }}>label_off</span>
            </div>
            <p className="text-sm font-bold text-center" style={{ color: SILVER }}>
              Nenhuma tag do Active Campaign vinculada a esta campanha.
            </p>
            <button
              onClick={openSelector}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ background: `rgba(56,189,248,0.15)`, border: `1px solid rgba(56,189,248,0.35)`, color: accentColor }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.15)')}
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              Definir Tag
            </button>
          </div>
        )}

        {/* ── Phase: counting ─── */}
        {phase === 'counting' && (
          <div className="flex items-center gap-3 py-4 justify-center">
            <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
            <span className="text-[11px] font-bold" style={{ color: SILVER }}>Buscando leads no Active Campaign...</span>
          </div>
        )}

        {/* ── Phase: error ─── */}
        {phase === 'error' && (
          <div className="flex items-center gap-3 py-4 px-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: '#ef4444' }}>error</span>
            <p className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{error || 'Erro ao buscar dados do Active Campaign.'}</p>
          </div>
        )}

        {/* ── Phase: ready — KPIs ─── */}
        {phase === 'ready' && acCount !== null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Card: Leads AC */}
            <div className="rounded-[18px] p-5" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)' }}>
              <p className="text-[10px] uppercase font-black tracking-widest mb-2" style={{ color: `${accentColor}cc` }}>
                Nº de Leads Active
              </p>
              <div className="flex items-end gap-3">
                <p className="font-headline font-black text-3xl" style={{ color: accentColor }}>
                  {N(acCount)}
                </p>
                {metaLeads > 0 && (
                  <DiffBadge pct={leadsDiffPct} invertColor={false} />
                )}
              </div>
              {metaLeads > 0 && (
                <p className="text-[10px] font-bold mt-2" style={{ color: SILVER }}>
                  Meta registrou <span className="font-black text-white">{N(metaLeads)}</span> leads
                  {' '}·{' '}
                  {acCount > metaLeads
                    ? <span style={{ color: '#22c55e' }}>+{N(acCount - metaLeads)} a mais no Active</span>
                    : acCount < metaLeads
                    ? <span style={{ color: '#f87171' }}>{N(metaLeads - acCount)} a menos no Active</span>
                    : <span style={{ color: SILVER }}>em sincronia com o Meta</span>
                  }
                </p>
              )}
            </div>

            {/* Card: CPL Real */}
            <div className="rounded-[18px] p-5" style={{ background: 'rgba(232,177,79,0.06)', border: '1px solid rgba(232,177,79,0.18)' }}>
              <p className="text-[10px] uppercase font-black tracking-widest mb-2" style={{ color: `${GOLD}cc` }}>
                Custo por Lead Real
              </p>
              <div className="flex items-end gap-3">
                <p className="font-headline font-black text-3xl" style={{ color: GOLD }}>
                  {acCount > 0 ? R(cplReal) : '—'}
                </p>
                {cplMeta > 0 && cplReal > 0 && (
                  <DiffBadge pct={cplDiffPct} invertColor={true} />
                )}
              </div>
              {cplMeta > 0 && (
                <p className="text-[10px] font-bold mt-2" style={{ color: SILVER }}>
                  CPL Meta: <span className="font-black text-white">{R(cplMeta)}</span>
                  {cplReal > 0 && (
                    <>
                      {' '}·{' '}
                      {cplReal < cplMeta
                        ? <span style={{ color: '#22c55e' }}>Real {R(cplMeta - cplReal)} mais barato</span>
                        : cplReal > cplMeta
                        ? <span style={{ color: '#f87171' }}>Real {R(cplReal - cplMeta)} mais caro</span>
                        : <span style={{ color: SILVER }}>igual ao Meta</span>
                      }
                    </>
                  )}
                </p>
              )}
            </div>

          </div>
        )}

        {/* ── Phase: selecting — Tag Modal Inline ─── */}
        {phase === 'selecting' && (
          <div className="rounded-[20px] overflow-hidden" style={{ background: 'rgba(0,15,35,0.8)', border: '1px solid rgba(56,189,248,0.2)' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(56,189,248,0.06)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
                Selecionar Tag do Active Campaign
              </p>
              <button
                onClick={() => setPhase(savedTag ? 'ready' : 'no-tag')}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none" style={{ color: SILVER }}>search</span>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Buscar tag..."
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-[12px] font-bold outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                  }}
                />
              </div>
            </div>

            {/* Tag list */}
            <div className="max-h-52 overflow-y-auto">
              {tagsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
                  <span className="text-[11px] font-bold" style={{ color: SILVER }}>Carregando tags...</span>
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[11px] font-bold" style={{ color: SILVER }}>
                    {tagSearch ? 'Nenhuma tag encontrada.' : 'Sem tags disponíveis.'}
                  </p>
                </div>
              ) : filteredTags.map(tag => {
                const isSelected = selectedTag?.id === tag.id;
                return (
                  <button
                    key={tag.id}
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm font-bold transition-all"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background:   isSelected ? 'rgba(56,189,248,0.1)' : 'transparent',
                      color:        isSelected ? accentColor : '#fff',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(56,189,248,0.1)' : 'transparent'; }}
                  >
                    <span className="material-symbols-outlined text-[16px] flex-shrink-0" style={{ color: isSelected ? accentColor : SILVER }}>
                      {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span className="leading-snug text-[12px]">{tag.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold" style={{ color: SILVER }}>
                {selectedTag
                  ? <span>Selecionada: <span className="font-black" style={{ color: accentColor }}>{selectedTag.name}</span></span>
                  : 'Selecione uma tag para vincular a esta campanha'
                }
              </p>
              <button
                onClick={handleSave}
                disabled={!selectedTag || saving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                style={{
                  background: selectedTag ? accentColor : 'rgba(255,255,255,0.06)',
                  color:      selectedTag ? NAVY : SILVER,
                  border:     selectedTag ? 'none' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {saving
                  ? <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${NAVY} transparent transparent transparent` }} />
                  : <span className="material-symbols-outlined text-[13px]">save</span>
                }
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
