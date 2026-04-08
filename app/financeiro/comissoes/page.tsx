'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDashboard } from '@/app/lib/context';
import { R, D } from '@/app/lib/utils';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001535';

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,40,0.60) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 20px 40px -8px rgba(0,0,0,0.55)',
  borderRadius: 28,
  position: 'relative',
  overflow: 'hidden',
};

const shine: React.CSSProperties = {
  position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)',
};

// ── Nota Fiscal Modal ────────────────────────────────────────────────────────
function NotaFiscalModal({
  vendedor, itens, dateFrom, dateTo, onClose
}: {
  vendedor: string;
  itens: any[];
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}) {
  const totalH  = itens.filter(i => i.fonte === 'hotmart').reduce((s, i) => s + i.valor, 0);
  const totalM  = itens.filter(i => i.fonte === 'manual').reduce((s, i) => s + i.valor, 0);
  const total   = totalH + totalM;
  const emissao = new Date().toLocaleDateString('pt-BR');
  const perH    = itens.filter(i => i.fonte === 'hotmart');
  const perM    = itens.filter(i => i.fonte === 'manual');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,5,0.80)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '40px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 760,
        background: '#f8f7f2', borderRadius: 20,
        boxShadow: '0 40px 100px rgba(0,0,0,0.9)',
        overflow: 'hidden',
        fontFamily: 'var(--font-inter, Inter, sans-serif)',
        color: '#111',
      }}>
        {/* Cabeçalho */}
        <div style={{ background: NAVY, padding: '28px 36px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>RadExperts · Data Center</p>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Relatório de Produções</h2>
            <p style={{ fontSize: 12, color: SILVER, marginTop: 4 }}>Vendedor: <strong style={{ color: '#fff' }}>{vendedor}</strong></p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: SILVER }}>Período</p>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{D(dateFrom)} → {D(dateTo)}</p>
            <p style={{ fontSize: 10, fontWeight: 700, color: SILVER, marginTop: 8 }}>Emissão</p>
            <p style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>{emissao}</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: '#e2e0d8' }}>
          {[
            { label: 'Total Faturado', value: R(total),        bg: '#fff8ee', color: '#b47e00' },
            { label: 'Vendas Hotmart', value: `${perH.length} venda${perH.length !== 1 ? 's' : ''}`, bg: '#fff', color: '#001a35' },
            { label: 'Vendas Manual',  value: `${perM.length} venda${perM.length !== 1 ? 's' : ''}`, bg: '#fff', color: '#001a35' },
          ].map((k, i) => (
            <div key={i} style={{ background: k.bg, padding: '18px 20px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#888', marginBottom: 4 }}>{k.label}</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Corpo */}
        <div style={{ padding: '24px 36px 36px' }}>
          {/* Hotmart */}
          {perH.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: '#e8720c' }} />
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#e8720c' }}>Hotmart · Valor Líquido ao Produtor</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e8e6de' }}>
                    {['#','Aluno','E-mail','Produto','Data','Valor Liq.'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 900, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perH.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #edeae0', background: idx % 2 === 0 ? '#fff' : '#faf9f5' }}>
                      <td style={{ padding: '9px 8px', color: '#888', fontSize: 11, fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '9px 8px', fontWeight: 700, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.nome}>{it.nome}</td>
                      <td style={{ padding: '9px 8px', color: '#555', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.email}>{it.email}</td>
                      <td style={{ padding: '9px 8px', color: '#444', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.produto}>{it.produto}</td>
                      <td style={{ padding: '9px 8px', whiteSpace: 'nowrap', color: '#555' }}>{it.data !== '—' ? D(it.data) : '—'}</td>
                      <td style={{ padding: '9px 8px', fontWeight: 900, color: '#b47e00', whiteSpace: 'nowrap' }}>{R(it.valor)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #e8e6de', background: '#fff8ee' }}>
                    <td colSpan={5} style={{ padding: '10px 8px', fontWeight: 900, fontSize: 11, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888' }}>Subtotal Hotmart</td>
                    <td style={{ padding: '10px 8px', fontWeight: 900, fontSize: 15, color: '#b47e00' }}>{R(totalH)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Manual */}
          {perM.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: '#2563eb' }} />
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2563eb' }}>Cadastros Manuais</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e8e6de' }}>
                    {['#','Aluno','E-mail','Pagamento','Data','Valor'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 900, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perM.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #edeae0', background: idx % 2 === 0 ? '#fff' : '#faf9f5' }}>
                      <td style={{ padding: '9px 8px', color: '#888', fontSize: 11, fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '9px 8px', fontWeight: 700, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.nome}>{it.nome}</td>
                      <td style={{ padding: '9px 8px', color: '#555', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.email}>{it.email}</td>
                      <td style={{ padding: '9px 8px', color: '#444' }}>{it.produto}</td>
                      <td style={{ padding: '9px 8px', whiteSpace: 'nowrap', color: '#555' }}>{it.data !== '—' ? D(it.data) : '—'}</td>
                      <td style={{ padding: '9px 8px', fontWeight: 900, color: '#1d4ed8' }}>{R(it.valor)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #e8e6de', background: '#eff6ff' }}>
                    <td colSpan={5} style={{ padding: '10px 8px', fontWeight: 900, fontSize: 11, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888' }}>Subtotal Manual</td>
                    <td style={{ padding: '10px 8px', fontWeight: 900, fontSize: 15, color: '#1d4ed8' }}>{R(totalM)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Total Geral */}
          <div style={{ background: NAVY, borderRadius: 14, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: SILVER }}>
              Total Geral · {itens.length} venda{itens.length !== 1 ? 's' : ''}
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: GOLD, letterSpacing: '-0.02em' }}>{R(total)}</p>
          </div>

          {/* Rodapé */}
          <p style={{ fontSize: 9, color: '#aaa', textAlign: 'center', marginTop: 20, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            RadExperts Data Center · Documento gerado em {emissao} · Uso interno
          </p>
        </div>

        {/* Ações */}
        <div style={{ padding: '0 36px 28px', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid #ddd', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#555' }}>
            Fechar
          </button>
          <button onClick={() => window.print()}
            style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: NAVY, fontSize: 11, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
            Imprimir / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ComissoesPage() {
  const { dateFrom, dateTo } = useDashboard();
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [nota,    setNota]    = useState<any | null>(null); // vendedor selecionado para modal

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/financeiro/comissoes?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar');
      setData(json.vendedores || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totais = useMemo(() => ({
    faturado: data.reduce((s, v) => s + v.totalValor, 0),
    vendas:   data.reduce((s, v) => s + v.totalVendas, 0),
    hotmart:  data.reduce((s, v) => s + v.hotmartValor, 0),
    manual:   data.reduce((s, v) => s + v.manualValor, 0),
  }), [data]);

  const kpis = [
    { label: 'Total Faturado',    value: R(totais.faturado), icon: 'payments',     accent: GOLD  },
    { label: 'Total de Vendas',   value: String(totais.vendas),  icon: 'shopping_cart', accent: '#22c55e' },
    { label: 'Hotmart (líquido)', value: R(totais.hotmart),  icon: 'store',         accent: '#f97316' },
    { label: 'Manuais',           value: R(totais.manual),   icon: 'edit_note',     accent: '#38bdf8' },
  ];

  return (
    <LoginWrapper>
      {/* Charcoal overlay — cinza chumbo quase preto */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(8,8,12,0.72) 0%, rgba(18,18,24,0.65) 100%)' }} />

      <div className="min-h-screen pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <div className="h-[146px]" />

        <main className="px-3 sm:px-6 max-w-[1400px] mx-auto pt-4 sm:pt-10">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <div style={{ width: 52, height: 52, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.28)', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: GOLD }}>percent</span>
            </div>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                Comissões <span style={{ color: GOLD }}>por Vendedor</span>
              </h1>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: SILVER, marginTop: 4 }}>
                {D(dateFrom)} → {D(dateTo)}
              </p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={fetchData}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 14, border: '1px solid rgba(232,177,79,0.3)', background: 'rgba(232,177,79,0.08)', color: GOLD, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
                <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>sync</span>
                Atualizar
              </button>
            </div>
          </div>

          {/* ── KPI Cards ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {kpis.map((k, i) => (
              <div key={i} style={{ ...glossy, padding: '20px 22px' }}>
                <div style={shine} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: k.accent }}>{k.icon}</span>
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: SILVER }}>{k.label}</span>
                  </div>
                  <p style={{ fontSize: loading ? 14 : 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {loading ? <span style={{ color: SILVER }}>Calculando…</span> : k.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Tabela ────────────────────────────────────────────────────────── */}
          <div style={{ ...glossy, overflow: 'hidden' }}>
            <div style={shine} />
            <div style={{ position: 'relative', zIndex: 1 }}>

              {/* Table header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: GOLD, fontSize: 20 }}>table_chart</span>
                <h2 style={{ fontSize: 14, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Desempenho por Vendedor</h2>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: SILVER }}>
                  {data.length} vendedor{data.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
                  <span className="material-symbols-outlined animate-spin" style={{ color: GOLD, fontSize: 24 }}>progress_activity</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: SILVER }}>Consultando Hotmart e banco de dados…</span>
                </div>
              ) : error ? (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#ef4444', display: 'block', marginBottom: 12 }}>error</span>
                  <p style={{ color: '#ef4444', fontWeight: 700 }}>{error}</p>
                </div>
              ) : data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: SILVER, display: 'block', marginBottom: 12 }}>person_off</span>
                  <p style={{ color: SILVER, fontWeight: 700, fontSize: 14 }}>Nenhum vendedor encontrado neste período</p>
                  <p style={{ color: SILVER, fontSize: 11, marginTop: 6, opacity: 0.6 }}>Verifique se há vendedores cadastrados nos alunos e compras Hotmart</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {[
                          { label: '#',             align: 'center' as const, w: 44  },
                          { label: 'VENDEDOR',      align: 'left'   as const       },
                          { label: 'VD. HOTMART',   align: 'right'  as const       },
                          { label: 'LÍQ. HOTMART',  align: 'right'  as const       },
                          { label: 'VD. MANUAL',    align: 'right'  as const       },
                          { label: 'VL. MANUAL',    align: 'right'  as const       },
                          { label: 'TOTAL VENDAS',  align: 'right'  as const       },
                          { label: 'TOTAL FATURADO',align: 'right'  as const       },
                          { label: 'NOTA',          align: 'center' as const, w: 80 },
                        ].map(col => (
                          <th key={col.label} style={{ padding: '12px 14px', fontSize: 9, fontWeight: 900, letterSpacing: '0.13em', textTransform: 'uppercase', color: SILVER, textAlign: col.align, width: col.w }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((v, idx) => {
                        const isTop = idx === 0;
                        return (
                          <tr key={v.nome}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                            {/* Rank */}
                            <td style={{ padding: '18px 14px', textAlign: 'center' }}>
                              <div style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                                background: isTop ? 'rgba(232,177,79,0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${isTop ? 'rgba(232,177,79,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                fontSize: 12, fontWeight: 900, color: isTop ? GOLD : SILVER }}>
                                {idx + 1}
                              </div>
                            </td>

                            {/* Nome */}
                            <td style={{ padding: '18px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  background: `rgba(232,177,79,${isTop ? '0.15' : '0.07'})`,
                                  border: `1px solid rgba(232,177,79,${isTop ? '0.3' : '0.15'})` }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: GOLD }}>person</span>
                                </div>
                                <div>
                                  <p style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{v.nome}</p>
                                  <p style={{ fontSize: 9, fontWeight: 700, color: SILVER, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{v.totalVendas} venda{v.totalVendas !== 1 ? 's' : ''} no período</p>
                                </div>
                              </div>
                            </td>

                            {/* Vendas Hotmart */}
                            <td style={{ padding: '18px 14px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: v.hotmartVendas > 0 ? '#f97316' : SILVER }}>
                              {v.hotmartVendas}
                            </td>

                            {/* Liq Hotmart */}
                            <td style={{ padding: '18px 14px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: v.hotmartValor > 0 ? '#f97316' : SILVER }}>
                              {v.hotmartValor > 0 ? R(v.hotmartValor) : '—'}
                            </td>

                            {/* Vendas Manual */}
                            <td style={{ padding: '18px 14px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: v.manualVendas > 0 ? '#38bdf8' : SILVER }}>
                              {v.manualVendas}
                            </td>

                            {/* Val Manual */}
                            <td style={{ padding: '18px 14px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: v.manualValor > 0 ? '#38bdf8' : SILVER }}>
                              {v.manualValor > 0 ? R(v.manualValor) : '—'}
                            </td>

                            {/* Total vendas */}
                            <td style={{ padding: '18px 14px', textAlign: 'right', fontSize: 16, fontWeight: 900, color: '#fff' }}>
                              {v.totalVendas}
                            </td>

                            {/* Total faturado */}
                            <td style={{ padding: '18px 14px', textAlign: 'right' }}>
                              <span style={{ fontSize: 18, fontWeight: 900, color: GOLD }}>{R(v.totalValor)}</span>
                            </td>

                            {/* Nota Fiscal */}
                            <td style={{ padding: '18px 14px', textAlign: 'center' }}>
                              <button onClick={() => setNota(v)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12,
                                  border: '1px solid rgba(232,177,79,0.3)', background: 'rgba(232,177,79,0.08)',
                                  color: GOLD, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                                  transition: 'all 0.2s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(232,177,79,0.18)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(232,177,79,0.08)'; }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>receipt_long</span>
                                Nota
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Footer totais */}
                    <tfoot>
                      <tr style={{ borderTop: '2px solid rgba(232,177,79,0.25)', background: 'rgba(232,177,79,0.04)' }}>
                        <td colSpan={2} style={{ padding: '16px 14px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: GOLD }}>
                          TOTAL GERAL
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, color: '#f97316' }}>{totais.vendas}</td>
                        <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, color: '#f97316' }}>{R(totais.hotmart)}</td>
                        <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, color: '#38bdf8' }}>{data.reduce((s, v) => s + v.manualVendas, 0)}</td>
                        <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, color: '#38bdf8' }}>{R(totais.manual)}</td>
                        <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, color: '#fff', fontSize: 16 }}>{totais.vendas}</td>
                        <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, color: GOLD, fontSize: 18 }}>{R(totais.faturado)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { color: '#f97316', label: 'Hotmart — valor líquido recebido pelo produtor' },
              { color: '#38bdf8', label: 'Manuais — valor cadastrado no perfil do aluno' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: SILVER }}>{l.label}</span>
              </div>
            ))}
          </div>

        </main>
      </div>

      {/* Nota Fiscal Modal */}
      {nota && (
        <NotaFiscalModal
          vendedor={nota.nome}
          itens={nota.itens}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setNota(null)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          body > * { display: none !important; }
          [style*="position: fixed"][style*="z-index: 99999"] { display: block !important; position: absolute !important; inset: 0 !important; }
          [style*="position: fixed"][style*="z-index: 99999"] > div { box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; }
          [style*="z-index: 0"], .material-symbols-outlined { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </LoginWrapper>
  );
}
