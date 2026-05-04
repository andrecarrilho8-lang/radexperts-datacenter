'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDashboard } from '@/app/lib/context';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const GREEN  = '#22c55e';
const RED    = '#ef4444';
const BLUE   = '#3b82f6';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  // Conta Azul retorna datas como "01/01/2025" ou "2025-01-01"
  if (d.includes('/')) return d;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function statusColor(s: string) {
  // API CA v2 usa: ACQUITTED, PENDING, OVERDUE, CANCELLED
  // Frontend normaliza para: PAGO, PENDENTE, VENCIDO, CANCELADO (via status_traduzido)
  const upper = (s || '').toUpperCase();
  if (upper === 'ACQUITTED' || upper === 'RECEBIDO' || upper === 'PAGO')     return '#22c55e';
  if (upper === 'PENDING'   || upper === 'PENDENTE')                          return '#f59e0b';
  if (upper === 'OVERDUE'   || upper === 'VENCIDO')                           return '#ef4444';
  if (upper === 'CANCELLED' || upper === 'CANCELADO')                         return '#6b7280';
  return SILVER;
}

function statusLabel(s: string) {
  const upper = (s || '').toUpperCase();
  if (upper === 'ACQUITTED') return 'Recebido';
  if (upper === 'PENDING')   return 'Pendente';
  if (upper === 'OVERDUE')   return 'Vencido';
  if (upper === 'CANCELLED') return 'Cancelado';
  // Já vem traduzido (status_traduzido)
  return s || '—';
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Totais {
  totalReceitas:     number;
  totalDespesas:     number;
  receitasPagas:     number;
  receitasPendentes: number;
  despesasPendentes: number;
  receitasVencidas:  number;
  despesasVencidas:  number;
  saldoProjetado:    number;
}

interface Evento {
  id:               string;
  tipo:             string;    // 'RECEITA' | 'DESPESA'
  status:           string;    // API: ACQUITTED, PENDING, OVERDUE, CANCELLED
  status_traduzido: string;    // PT: RECEBIDO, PENDENTE, VENCIDO
  valor:            number;
  pago:             number;
  nao_pago:         number;
  descricao:        string;
  data_vencimento:  string;
  data_competencia: string;
  categoria:        string;
  centro_de_custo:  string;
  cliente:          string;
  cliente_id:       string;
}

interface Venda {
  id:         string;
  numero?:    number;
  status?:    string;
  valor?:     number;
  data?:      string;
  cliente?: { nome?: string };
}

interface Pessoa {
  id:    string;
  nome?: string;
  email?: string;
  cpf_cnpj?: string;
  tipo?: string;
}

interface Contrato {
  id:       string;
  descricao?: string;
  valor?:     number;
  status?:    string;
  data_inicio?: string;
  cliente?: { nome?: string };
}

// ── Card KPI ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: string;
}) {
  return (
    <div style={{
      background:   'rgba(255,255,255,0.03)',
      border:       `1px solid ${color}30`,
      borderRadius: 16, padding: '18px 20px',
      backdropFilter: 'blur(12px)',
      transition:   'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${color}20`; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ margin: 0, color: SILVER, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</p>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icon}</span>
      </div>
      <p style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 900 }}>{value}</p>
      {sub && <p style={{ margin: '4px 0 0', color, fontSize: 10, fontWeight: 700 }}>{sub}</p>}
    </div>
  );
}

// ── Tabela genérica ───────────────────────────────────────────────────────────
function DataTable({ columns, rows, emptyMsg }: {
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  rows:    any[];
  emptyMsg?: string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{
                padding: '10px 14px', textAlign: 'left', fontWeight: 900, fontSize: 9,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px', color: 'rgba(168,178,192,0.4)', fontSize: 12 }}>
                {emptyMsg || 'Nenhum registro encontrado'}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={row.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '10px 14px', color: '#fff', verticalAlign: 'middle' }}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContaAzulPage() {
  const { userRole, checkingAuth } = useDashboard();
  const router = useRouter();

  // ── Role guard: apenas TOTAL ─────────────────────────────────────────────
  useEffect(() => {
    // Wait until auth has been fully loaded from localStorage before checking
    if (checkingAuth) return;
    if (userRole !== 'TOTAL') {
      router.replace('/resumo');
    }
  }, [checkingAuth, userRole, router]);

  const [activeTab,  setActiveTab]  = useState<'financeiro' | 'vendas' | 'pessoas' | 'contratos'>('financeiro');
  const [connected,  setConnected]  = useState<boolean | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [totais,     setTotais]     = useState<Totais | null>(null);
  const [receitas,   setReceitas]   = useState<Evento[]>([]);
  // Map cliente_id → email (fetched from CA Pessoas API together with receitas)
  const [pessoaEmailMap, setPessoaEmailMap] = useState<Map<string, string>>(new Map());
  const [vendas,     setVendas]     = useState<Venda[]>([]);
  const [pessoas,    setPessoas]    = useState<Pessoa[]>([]);
  const [contratos,  setContratos]  = useState<Contrato[]>([]);
  // Always show only RECEITA — despesas not shown in this view
  const [statusFiltro, setStatusFiltro] = useState('');
  const [searchPessoa, setSearchPessoa] = useState('');

  const checkConnection = useCallback(async () => {
    try {
      const res  = await fetch('/api/conta-azul/status');
      const data = await res.json();
      setConnected(data.connected);
    } catch {
      setConnected(false);
    }
  }, []);

  const loadFinanceiro = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch receitas + pessoas in parallel for email enrichment
      const params = new URLSearchParams({ tipo: 'RECEITA', size: '200' });
      if (statusFiltro) params.set('status', statusFiltro);
      const [finRes, pesRes] = await Promise.all([
        fetch(`/api/conta-azul/financeiro?${params}`),
        fetch('/api/conta-azul/pessoas?size=500'),
      ]);
      const finData = await finRes.json();
      const pesData = await pesRes.json();
      if (finData.error === 'not_connected') { setConnected(false); return; }

      // Build Map<cliente_id, email> from Pessoas API
      const emailMap = new Map<string, string>();
      const pesItems: any[] = pesData.pessoas || [];
      for (const p of pesItems) {
        if (p.id && p.email) emailMap.set(p.id, p.email);
      }
      setPessoaEmailMap(emailMap);

      // Sort by data_vencimento descending (most recent first)
      const sorted = (finData.receitas || []).slice().sort((a: Evento, b: Evento) => {
        const da = a.data_vencimento || a.data_criacao || '';
        const db = b.data_vencimento || b.data_criacao || '';
        return db.localeCompare(da);
      });
      setReceitas(sorted);
      setTotais(finData.totais || null);
    } finally {
      setLoading(false);
    }
  }, [statusFiltro]);

  const loadVendas = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/conta-azul/vendas');
      const data = await res.json();
      if (data.error === 'not_connected') { setConnected(false); return; }
      setVendas(data.vendas || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPessoas = useCallback(async () => {
    setLoading(true);
    try {
      const params = searchPessoa ? `?busca=${encodeURIComponent(searchPessoa)}` : '';
      const res  = await fetch(`/api/conta-azul/pessoas${params}`);
      const data = await res.json();
      if (data.error === 'not_connected') { setConnected(false); return; }
      setPessoas(data.pessoas || []);
    } finally {
      setLoading(false);
    }
  }, [searchPessoa]);

  const loadContratos = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/conta-azul/contratos');
      const data = await res.json();
      if (data.error === 'not_connected') { setConnected(false); return; }
      setContratos(data.contratos || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  useEffect(() => {
    if (connected === false) return;
    if (activeTab === 'financeiro') loadFinanceiro();
    if (activeTab === 'vendas')     loadVendas();
    if (activeTab === 'pessoas')    loadPessoas();
    if (activeTab === 'contratos')  loadContratos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, connected, statusFiltro]);

  const cardStyle: React.CSSProperties = {
    background:   'rgba(255,255,255,0.03)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: 24,
    backdropFilter: 'blur(12px)',
  };

  // Shows only receitas — filtered by status, already sorted by date (desc)
  const eventosFiltrados = receitas.filter(e => {
    if (statusFiltro) {
      const statusMap: Record<string, string> = { PAGO: 'ACQUITTED', PENDENTE: 'PENDING', VENCIDO: 'OVERDUE' };
      const apiStatus = statusMap[statusFiltro] || statusFiltro;
      if (e.status !== apiStatus) return false;
    }
    return true;
  });

  // A Receber = pending + overdue (what hasn't been paid yet)
  const totalAReceber = totais ? (totais.receitasPendentes + totais.receitasVencidas) : 0;

  // ── Not connected ─────────────────────────────────────────────────────────
  if (connected === false) {
    return (
      <main style={{ paddingTop: 120, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: 'linear-gradient(135deg, #0066CC, #004499)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 8px 24px rgba(0,102,204,0.4)',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 32 }}>cloud_off</span>
          </div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 900, margin: '0 0 8px' }}>Conta Azul não conectado</h2>
          <p style={{ color: SILVER, fontSize: 13, margin: '0 0 24px', lineHeight: 1.6 }}>
            Configure a integração com o ERP para visualizar os dados financeiros.
          </p>
          <Link href="/conta-azul/setup" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 24px', borderRadius: 12,
            background: `linear-gradient(135deg, ${GOLD}, #c8902a)`,
            color: NAVY, textDecoration: 'none',
            fontWeight: 900, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
            boxShadow: `0 4px 16px ${GOLD}40`,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>settings</span>
            Configurar Integração
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ paddingTop: 120, minHeight: '100vh', maxWidth: 1400, margin: '0 auto', padding: '120px 24px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #0066CC, #004499)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,102,204,0.4)',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>account_balance</span>
          </div>
          <div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0 }}>Conta Azul ERP</h1>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
              Dados do ERP — Sincronizado
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/conta-azul/setup" style={{
            padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: SILVER, textDecoration: 'none',
            fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>settings</span>
            Setup
          </Link>
          <button onClick={() => { if (activeTab === 'financeiro') loadFinanceiro(); if (activeTab === 'vendas') loadVendas(); if (activeTab === 'pessoas') loadPessoas(); if (activeTab === 'contratos') loadContratos(); }} style={{
            padding: '8px 14px', borderRadius: 10, border: `1px solid ${GOLD}40`,
            background: `${GOLD}15`, color: GOLD, cursor: 'pointer',
            fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards (só no financeiro) */}
      {activeTab === 'financeiro' && totais && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 28 }}>
          <KPICard label="Total a Receber"  value={fmtBRL(totais.totalReceitas)}     color={GREEN}          icon="trending_up"            />
          <KPICard label="Já Recebido"      value={fmtBRL(totais.receitasPagas)}     color={GREEN}          icon="check_circle"           sub="Pago" />
          <KPICard label="A Receber"        value={fmtBRL(totalAReceber)}            color={BLUE}           icon="account_balance_wallet" sub="Pendente + Vencido" />
          <KPICard label="Pendente"         value={fmtBRL(totais.receitasPendentes)} color={'#f59e0b'}       icon="schedule"              sub="Aguardando" />
          <KPICard label="Em Atraso"        value={fmtBRL(totais.receitasVencidas)}  color={RED}            icon="warning"               sub="Vencido" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 14, padding: 4, maxWidth: 560 }}>
        {([
          { id: 'financeiro', label: 'Financeiro',  icon: 'account_balance_wallet' },
          { id: 'vendas',     label: 'Vendas',       icon: 'shopping_cart'          },
          { id: 'pessoas',    label: 'Clientes',     icon: 'group'                  },
          { id: 'contratos',  label: 'Contratos',    icon: 'description'            },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '9px 4px', borderRadius: 10, border: 'none',
              cursor: 'pointer', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: activeTab === tab.id ? GOLD : 'transparent',
              color:      activeTab === tab.id ? NAVY : SILVER,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all 0.2s',
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{tab.icon}</span>
            <span className="hidden-xs">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── FINANCEIRO ─────────────────────────────────────────────────────── */}
      {activeTab === 'financeiro' && (
        <div style={cardStyle}>
          {/* Cabeçalho da seção */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: 14 }}>Contas a Receber</p>
              <p style={{ margin: 0, color: SILVER, fontSize: 11, marginTop: 2 }}>
                {eventosFiltrados.length} lançamento{eventosFiltrados.length !== 1 ? 's' : ''}
                {statusFiltro ? ` · filtro: ${statusFiltro.toLowerCase()}` : ''}
              </p>
            </div>
            {/* Filtros de status */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'Todos',    value: '',         color: SILVER },
                { label: 'Pendente', value: 'PENDENTE', color: '#f59e0b' },
                { label: 'Recebido', value: 'PAGO',     color: GREEN },
                { label: 'Vencido',  value: 'VENCIDO',  color: RED },
              ].map(f => {
                const isActive = statusFiltro === f.value;
                return (
                  <button key={f.value} onClick={() => setStatusFiltro(f.value)} style={{
                    padding: '6px 14px', borderRadius: 8, border: `1px solid ${isActive ? f.color + '60' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer', fontSize: 10, fontWeight: 900,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: isActive ? f.color + '18' : 'rgba(255,255,255,0.03)',
                    color: isActive ? f.color : SILVER,
                    transition: 'all 0.18s',
                  }}>{f.label}</button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: SILVER }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>sync</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'descricao', label: 'Descrição', render: r => <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{r.descricao || '—'}</span> },
                { key: 'cliente',   label: 'Cliente',   render: r => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{r.cliente || '—'}</span>
                    {pessoaEmailMap.get(r.cliente_id) && (
                      <span style={{ color: 'rgba(168,178,192,0.7)', fontSize: 10, fontFamily: 'monospace' }}>
                        {pessoaEmailMap.get(r.cliente_id)}
                      </span>
                    )}
                  </div>
                )},
                { key: 'categoria', label: 'Categoria', render: r => <span style={{ color: 'rgba(168,178,192,0.6)', fontSize: 10 }}>{r.categoria || r.centro_de_custo || '—'}</span> },
                { key: 'vencimento',label: 'Vencimento', render: r => <span style={{ color: SILVER, fontFamily: 'monospace', fontSize: 11 }}>{fmtDate(r.data_vencimento)}</span> },
                { key: 'valor',     label: 'Valor',      render: r => <span style={{ color: GREEN, fontWeight: 900, fontSize: 13 }}>{fmtBRL(r.valor ?? 0)}</span> },
                { key: 'pago',      label: 'Recebido',   render: r => <span style={{ color: r.pago > 0 ? GREEN : 'rgba(168,178,192,0.4)', fontWeight: 700 }}>{fmtBRL(r.pago ?? 0)}</span> },
                { key: 'status',    label: 'Status',     render: r => (
                  <span style={{
                    color: statusColor(r.status), fontWeight: 900, fontSize: 9,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: statusColor(r.status) + '15',
                    border: `1px solid ${statusColor(r.status)}40`,
                    padding: '2px 8px', borderRadius: 99,
                  }}>{statusLabel(r.status)}</span>
                )},
              ]}
              rows={eventosFiltrados}
              emptyMsg={loading ? 'Carregando...' : 'Nenhuma receita encontrada'}
            />
          )}
        </div>
      )}

      {/* ── VENDAS ─────────────────────────────────────────────────────────── */}
      {activeTab === 'vendas' && (
        <div style={cardStyle}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: SILVER }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>sync</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'numero',  label: 'Nº Venda',  render: r => <span style={{ color: GOLD, fontWeight: 900 }}>#{r.numero || r.id?.slice(0,8)}</span> },
                { key: 'cliente', label: 'Cliente',   render: r => <span style={{ color: '#fff' }}>{r.cliente?.nome || '—'}</span> },
                { key: 'status',  label: 'Status',    render: r => <span style={{ color: statusColor(r.status || ''), fontWeight: 900, fontSize: 10 }}>{r.status || '—'}</span> },
                { key: 'valor',   label: 'Valor',     render: r => <span style={{ fontWeight: 700, color: GREEN }}>{fmtBRL(r.valor || 0)}</span> },
                { key: 'data',    label: 'Data',      render: r => <span style={{ color: SILVER }}>{fmtDate(r.data)}</span> },
              ]}
              rows={vendas}
              emptyMsg="Nenhuma venda encontrada"
            />
          )}
        </div>
      )}

      {/* ── PESSOAS ─────────────────────────────────────────────────────────── */}
      {activeTab === 'pessoas' && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={searchPessoa}
              onChange={e => setSearchPessoa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadPessoas()}
              placeholder="Buscar por nome, email ou CPF/CNPJ..."
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 12,
                outline: 'none', width: '100%', boxSizing: 'border-box' as any,
              }}
            />
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: SILVER }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>sync</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'nome',      label: 'Nome',      render: r => <span style={{ color: '#fff', fontWeight: 700 }}>{r.nome || '—'}</span> },
                { key: 'email',     label: 'Email',     render: r => <span style={{ color: SILVER }}>{r.email || '—'}</span> },
                { key: 'cpf_cnpj', label: 'CPF/CNPJ',  render: r => <span style={{ color: SILVER, fontFamily: 'monospace' }}>{r.cpf_cnpj || '—'}</span> },
                { key: 'tipo',     label: 'Tipo',       render: r => <span style={{ color: GOLD, fontSize: 10, fontWeight: 900 }}>{r.tipo || '—'}</span> },
              ]}
              rows={pessoas}
              emptyMsg="Nenhuma pessoa encontrada"
            />
          )}
        </div>
      )}

      {/* ── CONTRATOS ──────────────────────────────────────────────────────── */}
      {activeTab === 'contratos' && (
        <div style={cardStyle}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: SILVER }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>sync</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'descricao',   label: 'Descrição',  render: r => <span style={{ color: '#fff', fontWeight: 700 }}>{r.descricao || '—'}</span> },
                { key: 'cliente',     label: 'Cliente',    render: r => <span style={{ color: SILVER }}>{r.cliente?.nome || '—'}</span> },
                { key: 'valor',       label: 'Valor',      render: r => <span style={{ color: GREEN, fontWeight: 700 }}>{fmtBRL(r.valor || 0)}</span> },
                { key: 'status',      label: 'Status',     render: r => <span style={{ color: statusColor(r.status || ''), fontWeight: 900, fontSize: 10 }}>{statusLabel(r.status || '')}</span> },
                { key: 'data_inicio', label: 'Início',     render: r => <span style={{ color: SILVER }}>{fmtDate(r.data_inicio)}</span> },
              ]}
              rows={contratos}
              emptyMsg="Nenhum contrato encontrado"
            />
          )}
        </div>
      )}
    </main>
  );
}
