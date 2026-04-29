'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { useDashboard } from '@/app/lib/context';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

/* ── Action config ─────────────────────────────────────────────────────────── */
const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  LOGIN:                  { label: 'Login',              icon: 'login',            color: '#22c55e'  },
  LOGOUT:                 { label: 'Logout',             icon: 'logout',           color: '#94a3b8'  },
  STUDENT_CREATED:        { label: 'Aluno Criado',       icon: 'person_add',       color: '#38bdf8'  },
  STUDENT_UPDATED:        { label: 'Aluno Editado',      icon: 'edit',             color: GOLD       },
  STUDENT_DELETED:        { label: 'Aluno Removido',     icon: 'person_remove',    color: '#f87171'  },
  INSTALLMENT_PAID:       { label: 'Parcela Paga',       icon: 'payments',         color: '#4ade80'  },
  STUDENT_HIDDEN:         { label: 'Aluno Ocultado',     icon: 'visibility_off',   color: '#a78bfa'  },
  STUDENT_MERGED:         { label: 'Perfis Unidos',      icon: 'merge',            color: '#fb923c'  },
  USER_CREATED:           { label: 'Usuário Criado',     icon: 'manage_accounts',  color: '#38bdf8'  },
  USER_DELETED:           { label: 'Usuário Removido',   icon: 'no_accounts',      color: '#f87171'  },
  USER_PASSWORD_CHANGED:  { label: 'Senha Alterada',     icon: 'key',              color: '#fbbf24'  },
  CSV_IMPORTED:           { label: 'CSV Importado',      icon: 'upload_file',      color: '#a78bfa'  },
  MANUAL_PAYMENT_CREATED: { label: 'Pagamento Manual',   icon: 'receipt_long',     color: '#4ade80'  },
  PAYMENT_STATUS_CHANGED: { label: 'Status Alterado',    icon: 'sync_alt',         color: GOLD       },
};

const ALL_ACTIONS = Object.keys(ACTION_CONFIG);

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function fmt(ts: number | string) {
  const d = new Date(Number(ts));
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function relativeTime(ts: number | string) {
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'agora mesmo';
  if (m < 60) return `há ${m}min`;
  if (h < 24) return `há ${h}h`;
  return `há ${d}d`;
}

const card: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, rgba(0,10,30,0.5) 100%)',
  border: '1px solid rgba(255,255,255,0.09)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.1) inset, 0 20px 40px -10px rgba(0,0,0,0.5)',
  borderRadius: 20,
};

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function AtividadesPage() {
  const { userRole, authToken } = useDashboard();

  const [logs,        setLogs]        = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [search,       setSearch]       = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set('action',    filterAction);
      if (filterFrom)   params.set('date_from', filterFrom);
      if (filterTo)     params.set('date_to',   filterTo);
      params.set('limit', '1000');

      const res = await fetch(`/api/activity-log?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao buscar logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authToken, filterAction, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  if (userRole !== 'TOTAL') {
    return (
      <LoginWrapper>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl mb-4 block" style={{ color: '#ef4444' }}>block</span>
            <p className="font-black text-white text-xl">Sem permissão</p>
            <p className="text-sm mt-2" style={{ color: SILVER }}>Esta página é exclusiva para administradores.</p>
          </div>
        </div>
      </LoginWrapper>
    );
  }

  // Client-side text search
  const visible = logs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (l.user_name || '').toLowerCase().includes(s) ||
      (l.entity_name || '').toLowerCase().includes(s) ||
      (l.action || '').toLowerCase().includes(s) ||
      (l.ip || '').toLowerCase().includes(s)
    );
  });

  // Group by date
  const byDate: Record<string, any[]> = {};
  for (const log of visible) {
    const day = new Date(Number(log.created_at)).toLocaleDateString('pt-BR');
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(log);
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-24">
        <div className="h-[120px]" />

        <main className="px-4 sm:px-6 max-w-[1200px] mx-auto pt-8">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="font-black text-3xl text-white tracking-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl" style={{ color: GOLD }}>history</span>
                Registro de Atividades
              </h1>
              <p className="text-sm mt-1 font-bold" style={{ color: SILVER }}>
                Todas as ações realizadas no sistema · {logs.length} registros
              </p>
            </div>
            <button onClick={load}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.1)')}>
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Atualizar
            </button>
          </div>

          {/* ── Filters ── */}
          <div style={card} className="p-5 mb-6 flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Buscar</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[15px]" style={{ color: SILVER }}>search</span>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Nome, ação, IP..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-[12px] font-bold outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
                />
              </div>
            </div>
            {/* Action filter */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Ação</label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                className="px-3 py-2 rounded-xl text-[12px] font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
                <option value="">Todas</option>
                {ALL_ACTIONS.map(a => (
                  <option key={a} value={a}>{ACTION_CONFIG[a]?.label || a}</option>
                ))}
              </select>
            </div>
            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>De</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="px-3 py-2 rounded-xl text-[12px] font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
            </div>
            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Até</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="px-3 py-2 rounded-xl text-[12px] font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
            </div>
            {/* Clear */}
            {(filterAction || filterFrom || filterTo || search) && (
              <button onClick={() => { setFilterAction(''); setFilterFrom(''); setFilterTo(''); setSearch(''); }}
                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                Limpar
              </button>
            )}
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="rounded-2xl p-6 mb-6 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <span className="material-symbols-outlined text-3xl text-red-400 block mb-2">error</span>
              <p className="text-red-400 font-black text-sm">{error}</p>
            </div>
          )}

          {/* ── Loading ── */}
          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
            </div>
          )}

          {/* ── Empty ── */}
          {!loading && !error && visible.length === 0 && (
            <div className="text-center py-24">
              <span className="material-symbols-outlined text-5xl block mb-3" style={{ color: SILVER }}>history_toggle_off</span>
              <p className="font-black text-white">Nenhuma atividade encontrada</p>
              <p className="text-sm mt-1" style={{ color: SILVER }}>Tente ajustar os filtros</p>
            </div>
          )}

          {/* ── Logs by date ── */}
          {!loading && !error && Object.entries(byDate).map(([day, dayLogs]) => (
            <div key={day} className="mb-8">
              {/* Date separator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
                  {day}
                </span>
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
              </div>

              {/* Log entries */}
              <div className="space-y-2">
                {dayLogs.map((log) => {
                  const cfg    = ACTION_CONFIG[log.action] || { label: log.action, icon: 'info', color: SILVER };
                  const isOpen = expanded.has(log.id);
                  const meta   = log.metadata || {};
                  const hasMeta = Object.keys(meta).length > 0;

                  return (
                    <div key={log.id} style={{ ...card, borderRadius: 14, border: `1px solid rgba(255,255,255,0.07)` }}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        onClick={() => hasMeta && toggleExpand(log.id)}>

                        {/* Action icon */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40` }}>
                          <span className="material-symbols-outlined text-[15px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                        </div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-black text-white">{cfg.label}</span>
                            {log.entity_name && (
                              <span className="text-[11px] font-bold" style={{ color: SILVER }}>
                                · {log.entity_name}
                              </span>
                            )}
                            {meta.course && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}30`, color: GOLD }}>
                                {meta.course}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: SILVER }}>
                              <span className="material-symbols-outlined text-[11px]">person</span>
                              {log.user_name || 'Sistema'}
                            </span>
                            {log.ip && log.ip !== 'unknown' && (
                              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'rgba(168,178,192,0.6)' }}>
                                <span className="material-symbols-outlined text-[11px]">router</span>
                                {log.ip}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Timestamp */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] font-bold" style={{ color: SILVER }}>{relativeTime(log.created_at)}</p>
                          <p className="text-[9px]" style={{ color: 'rgba(168,178,192,0.5)' }}>{fmt(log.created_at).split(', ')[1]}</p>
                        </div>

                        {/* Expand chevron */}
                        {hasMeta && (
                          <span className={`material-symbols-outlined text-[16px] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            style={{ color: SILVER }}>
                            expand_more
                          </span>
                        )}
                      </div>

                      {/* Expanded metadata */}
                      {isOpen && hasMeta && (
                        <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(meta).map(([k, v]) => (
                              <div key={k} className="rounded-xl px-3 py-2"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: SILVER }}>{k}</p>
                                <p className="text-[11px] font-black text-white break-all">
                                  {Array.isArray(v) ? v.join(', ') : String(v ?? '—')}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        </main>
      </div>
    </LoginWrapper>
  );
}
