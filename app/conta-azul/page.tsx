'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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
  if (s === 'PAGO')      return '#22c55e';
  if (s === 'PENDENTE')  return '#f59e0b';
  if (s === 'VENCIDO')   return '#ef4444';
  if (s === 'CANCELADO') return '#6b7280';
  return SILVER;
}

function statusLabel(s: string) {
  const map: Record<string, string> = { PAGO: 'Pago', PENDENTE: 'Pendente', VENCIDO: 'Vencido', CANCELADO: 'Cancelado' };
  return map[s] || s;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Totais {
  totalReceitas:     number;
  totalDespesas:     number;
  receitasPendentes: number;
  despesasPendentes: number;
  receitasVencidas:  number;
  despesasVencidas:  number;
  saldoProjetado:    number;
}

interface Evento {
  id:              string;
  status:          string;
  valor_total?:    number;
  valor?:          number;
  data_vencimento?: string;
  descricao?:      string;
  evento?: {
    tipo:    string;
    rateio?: { nome_categoria: string; valor: number }[];
  };
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
  const [activeTab,  setActiveTab]  = useState<'financeiro' | 'vendas' | 'pessoas' | 'contratos'>('financeiro');
  const [connected,  setConnected]  = useState<boolean | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [totais,     setTotais]     = useState<Totais | null>(null);
  const [receitas,   setReceitas]   = useState<Evento[]>([]);
  const [despesas,   setDespesas]   = useState<Evento[]>([]);
  const [vendas,     setVendas]     = useState<Venda[]>([]);
  const [pessoas,    setPessoas]    = useState<Pessoa[]>([]);
  const [contratos,  setContratos]  = useState<Contrato[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<'' | 'RECEITA' | 'DESPESA'>('');
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
      const params = new URLSearchParams();
      if (tipoFiltro)    params.set('tipo',   tipoFiltro);
      if (statusFiltro)  params.set('status', statusFiltro);
      const res  = await fetch(`/api/conta-azul/financeiro?${params}`);
      const data = await res.json();
      if (data.error === 'not_connected') { setConnected(false); return; }
      setReceitas(data.receitas || []);
      setDespesas(data.despesas || []);
      setTotais(data.totais || null);
    } finally {
      setLoading(false);
    }
  }, [tipoFiltro, statusFiltro]);

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
  }, [activeTab, connected, tipoFiltro, statusFiltro]);

  const cardStyle: React.CSSProperties = {
    background:   'rgba(255,255,255,0.03)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: 24,
    backdropFilter: 'blur(12px)',
  };

  const allEventos = [...receitas, ...despesas];
  const eventosFiltrados = allEventos.filter(e => {
    if (tipoFiltro && e.evento?.tipo !== tipoFiltro) return false;
    if (statusFiltro && e.status !== statusFiltro)   return false;
    return true;
  });

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          <KPICard label="Total Receitas"   value={fmtBRL(totais.totalReceitas)}      color={GREEN}  icon="trending_up"          />
          <KPICard label="Total Despesas"   value={fmtBRL(totais.totalDespesas)}      color={RED}    icon="trending_down"        />
          <KPICard label="A Receber"        value={fmtBRL(totais.receitasPendentes)}  color={BLUE}   icon="account_balance_wallet" sub="Pendente" />
          <KPICard label="A Pagar"          value={fmtBRL(totais.despesasPendentes)}  color="#f59e0b" icon="payments"             sub="Pendente" />
          <KPICard label="Em Atraso"        value={fmtBRL(totais.receitasVencidas)}   color={RED}    icon="warning"              sub="Receitas vencidas" />
          <KPICard label="Saldo Projetado"  value={fmtBRL(totais.saldoProjetado)}
            color={totais.saldoProjetado >= 0 ? GREEN : RED}
            icon={totais.saldoProjetado >= 0 ? 'arrow_upward' : 'arrow_downward'}
            sub="Receber − Pagar" />
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
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Todos', value: '' },
              { label: 'Receitas', value: 'RECEITA' },
              { label: 'Despesas', value: 'DESPESA' },
            ].map(f => (
              <button key={f.value} onClick={() => setTipoFiltro(f.value as any)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: tipoFiltro === f.value ? GOLD : 'rgba(255,255,255,0.06)',
                color:      tipoFiltro === f.value ? NAVY : SILVER,
              }}>{f.label}</button>
            ))}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            {[
              { label: 'Todos', value: '' },
              { label: 'Pendente', value: 'PENDENTE' },
              { label: 'Pago', value: 'PAGO' },
              { label: 'Vencido', value: 'VENCIDO' },
            ].map(f => (
              <button key={f.value} onClick={() => setStatusFiltro(f.value)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: statusFiltro === f.value ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                color:      SILVER,
              }}>{f.label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: SILVER }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>sync</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'tipo',          label: 'Tipo',        render: r => <span style={{ color: r.evento?.tipo === 'RECEITA' ? GREEN : RED, fontWeight: 900, fontSize: 10, letterSpacing: '0.1em' }}>{r.evento?.tipo || '—'}</span> },
                { key: 'descricao',     label: 'Descrição',   render: r => <span style={{ color: '#fff' }}>{r.descricao || '—'}</span> },
                { key: 'status',        label: 'Status',      render: r => <span style={{ color: statusColor(r.status), fontWeight: 900, fontSize: 10 }}>{statusLabel(r.status)}</span> },
                { key: 'valor',         label: 'Valor',        render: r => <span style={{ color: '#fff', fontWeight: 700 }}>{fmtBRL(r.valor_total ?? r.valor ?? 0)}</span> },
                { key: 'vencimento',    label: 'Vencimento',  render: r => <span style={{ color: SILVER }}>{fmtDate(r.data_vencimento)}</span> },
                { key: 'categoria',     label: 'Categoria',   render: r => <span style={{ color: SILVER, fontSize: 11 }}>{r.evento?.rateio?.[0]?.nome_categoria || '—'}</span> },
              ]}
              rows={eventosFiltrados}
              emptyMsg={loading ? 'Carregando...' : 'Nenhum evento financeiro encontrado'}
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
