'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { useDashboard } from '@/app/lib/context';
import { R }            from '@/app/lib/utils';

/* ── Design tokens ────────────────────────────────────────────────────────── */
const GOLD   = '#E8B14F';
const SILVER = '#8899AA';
const GREEN  = '#4ade80';
const RED    = '#f87171';
const BLUE   = '#60a5fa';
const PURPLE = '#a78bfa';
const TEAL   = '#2dd4bf';

/* ── Types ────────────────────────────────────────────────────────────────── */
type EntityRow = {
  id:          string | null;
  name:        string;
  thumbnail:   string | null;
  spend:       number;
  checkouts:   number;
  pageviews:   number;
  compras:     number;
  revenue:     number;
  cpa:              number;
  compraCheckout:   number;
  checkoutPageview: number;
  cpCheckout:       number;
  webhookSales:     number;
  apiSales:         number;
  reportSales:      number;
  missingSales:     number;
};

type Data = {
  totalMetaSpend:      number;
  totalWebhookSales:   number;
  totalReportSales:    number;
  totalApiSales:       number;
  totalWebhookRevenue: number;
  totalReportRevenue:  number;
  totalApiRevenue:     number;
  attrBreakdown:       { complete: number; partial: number; missing: number };
  apiAttributionNote:  string;
  campaigns: EntityRow[];
  adsets:    EntityRow[];
  ads:       EntityRow[];
};

/* ── Formatters ───────────────────────────────────────────────────────────── */
const fmt  = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtR = (n: number)        => `R$\u00a0${fmt(n)}`;
const fmtP = (n: number)        => `${fmt(n, 2)}%`;
const dash  = () => <span style={{ color: SILVER }}>—</span>;

/* ── Totals helper ────────────────────────────────────────────────────────── */
function sumRows(rows: EntityRow[]) {
  const r = rows.reduce(
    (acc, row) => ({
      spend:     acc.spend     + row.spend,
      checkouts: acc.checkouts + row.checkouts,
      pageviews: acc.pageviews + row.pageviews,
      compras:   acc.compras   + row.compras,
      revenue:   acc.revenue   + row.revenue,
    }),
    { spend: 0, checkouts: 0, pageviews: 0, compras: 0, revenue: 0 },
  );
  const cpa              = r.compras   > 0 ? r.spend     / r.compras   : 0;
  const compraCheckout   = r.checkouts > 0 ? (r.compras  / r.checkouts) * 100 : 0;
  const checkoutPageview = r.pageviews > 0 ? (r.checkouts / r.pageviews) * 100 : 0;
  const cpCheckout       = r.checkouts > 0 ? r.spend     / r.checkouts  : 0;
  return { ...r, cpa, compraCheckout, checkoutPageview, cpCheckout };
}

/* ── Table ────────────────────────────────────────────────────────────────── */
type SortDir = 'asc' | 'desc';

function VendasTable({
  label, rows, loading, accent,
  showThumb = false,
  onRowClick, selectedId,
}: {
  label:      string;
  rows:       EntityRow[];
  loading:    boolean;
  accent:     string;
  showThumb?: boolean;
  onRowClick?: (id: string | null, name: string) => void;
  selectedId?: string | null;
}) {
  const [sortCol, setSortCol] = useState<string>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      const diff = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [rows, sortCol, sortDir]);

  const totals = sumRows(rows);

  const TH = ({
    col, children, right = false, w,
  }: { col: string; children: React.ReactNode; right?: boolean; w?: string }) => {
    const active = sortCol === col;
    return (
      <th
        onClick={() => handleSort(col)}
        style={{
          padding: '10px 12px',
          textAlign: right ? 'right' : 'left',
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: active ? accent : SILVER,
          borderBottom: `2px solid ${accent}30`,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          width: w,
          background: `${accent}08`,
        }}
      >
        {children}
        {active && <span style={{ marginLeft: 4 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </th>
    );
  };

  const skeletonCols = showThumb ? 9 : 8;

  return (
    <div
      className="rounded-[20px] overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(0,8,24,0.94) 100%)',
        border: `1px solid ${accent}25`,
        backdropFilter: 'blur(24px)',
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.45), 0 0 40px ${accent}06`,
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${accent}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: `${accent}05`,
        }}
      >
        <h2
          style={{
            fontSize: 15,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {label}
        </h2>
        {!loading && (
          <span
            style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: accent,
              background: `${accent}18`, border: `1px solid ${accent}30`,
              padding: '3px 10px', borderRadius: 99,
            }}
          >
            {rows.length} {label.toLowerCase()}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {showThumb && <th style={{ width: 48, padding: '10px 8px', borderBottom: `2px solid ${accent}30`, background: `${accent}08` }} />}
              <TH col="name" w="280px">{label.replace('s', '').replace('Anúncios', 'Anúncio').replace('Campanha', 'Campanha').replace('Conjunto', 'Conjunto')}</TH>
              <TH col="cpa" right>CPA</TH>
              <TH col="spend" right>Gasto</TH>
              <TH col="compras" right>Compras</TH>
              <TH col="compraCheckout" right>Compra/Checkout</TH>
              <TH col="checkouts" right>Checkouts</TH>
              <TH col="checkoutPageview" right>Checkout/Pageview</TH>
              <TH col="cpCheckout" right>CP Checkout</TH>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(skeletonCols)].map((__, j) => (
                      <td key={j} style={{ padding: '12px 12px' }}>
                        <div
                          style={{
                            height: 11, borderRadius: 6,
                            background: 'rgba(255,255,255,0.05)',
                            width: j === 0 ? '65%' : '50%',
                            animation: 'pulse 1.5s infinite',
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.length === 0
              ? (
                  <tr>
                    <td colSpan={skeletonCols} style={{ padding: '40px 20px', textAlign: 'center', color: SILVER, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Nenhum dado no período
                    </td>
                  </tr>
                )
              : sorted.map((row, idx) => {
                  const isSel = selectedId === row.id || selectedId === row.name;
                  const bg    = isSel
                    ? `${accent}18`
                    : idx % 2 === 0
                    ? 'transparent'
                    : 'rgba(255,255,255,0.015)';

                  return (
                    <tr
                      key={row.id || row.name}
                      onClick={() => onRowClick?.(row.id, row.name)}
                      style={{
                        background: bg,
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: onRowClick ? 'pointer' : 'default',
                        outline: isSel ? `1px solid ${accent}40` : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = `${accent}0E`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSel ? `${accent}18` : bg; }}
                    >
                      {/* Thumbnail */}
                      {showThumb && (
                        <td style={{ padding: '8px 10px', width: 48 }}>
                          {row.thumbnail
                            ? <img src={row.thumbnail} alt="" style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                            : <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: SILVER }}>image</span>
                              </div>
                          }
                        </td>
                      )}

                      {/* Name + source badges */}
                      <td style={{ padding: '10px 12px', maxWidth: 280 }}>
                        <span style={{
                          display: 'block',
                          fontSize: 12, fontWeight: 700, color: isSel ? accent : '#e8ecf0',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {row.name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          {(row.webhookSales ?? 0) > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 800, background: `${TEAL}22`, border: `1px solid ${TEAL}44`, color: TEAL, borderRadius: 99, padding: '1px 6px' }}>
                              ⚡ WEBHOOK{(row.webhookSales ?? 0) > 1 ? ` ×${row.webhookSales}` : ''}
                            </span>
                          )}
                          {(row.apiSales ?? 0) > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 800, background: `${BLUE}22`, border: `1px solid ${BLUE}44`, color: BLUE, borderRadius: 99, padding: '1px 6px' }}>
                              📡 API{(row.apiSales ?? 0) > 1 ? ` ×${row.apiSales}` : ''}
                            </span>
                          )}
                          {((row as any).reportSales ?? 0) > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 800, background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD, borderRadius: 99, padding: '1px 6px' }}>
                              📋 IMPORT{((row as any).reportSales ?? 0) > 1 ? ` ×${(row as any).reportSales}` : ''}
                            </span>
                          )}
                        </span>
                      </td>

                      {/* CPA */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.cpa > 0
                          ? <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{fmtR(row.cpa)}</span>
                          : dash()}
                      </td>

                      {/* Gasto */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: BLUE }}>{fmtR(row.spend)}</span>
                      </td>

                      {/* Compras */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {row.compras > 0
                          ? <span style={{ fontSize: 13, fontWeight: 900, color: GREEN }}>{row.compras}</span>
                          : <span style={{ fontSize: 11, color: SILVER }}>0</span>}
                      </td>

                      {/* Compra/Checkout */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {row.checkouts > 0
                          ? <span style={{ fontSize: 12, fontWeight: 800,
                              color: row.compraCheckout >= 5 ? GREEN : row.compraCheckout >= 1 ? GOLD : RED }}>
                              {fmtP(row.compraCheckout)}
                            </span>
                          : dash()}
                      </td>

                      {/* Checkouts */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#e8ecf0' }}>
                          {row.checkouts > 0 ? row.checkouts.toLocaleString('pt-BR') : '0'}
                        </span>
                      </td>

                      {/* Checkout/Pageview */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {row.pageviews > 0
                          ? <span style={{ fontSize: 12, fontWeight: 800,
                              color: row.checkoutPageview >= 5 ? GREEN : row.checkoutPageview >= 1 ? GOLD : RED }}>
                              {fmtP(row.checkoutPageview)}
                            </span>
                          : dash()}
                      </td>

                      {/* CP Checkout */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.cpCheckout > 0
                          ? <span style={{ fontSize: 12, fontWeight: 800, color: '#e8ecf0' }}>{fmtR(row.cpCheckout)}</span>
                          : dash()}
                      </td>
                    </tr>
                  );
                })
            }

            {/* Total geral row */}
            {!loading && sorted.length > 0 && (() => {
              const t = totals;
              return (
                <tr style={{ borderTop: `2px solid ${accent}30`, background: `${accent}0A` }}>
                  {showThumb && <td style={{ padding: '11px 10px' }} />}
                  <td style={{ padding: '11px 12px' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: accent }}>Total geral</span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>
                      {t.cpa > 0 ? fmtR(t.cpa) : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: BLUE }}>{fmtR(t.spend)}</span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: GREEN }}>{t.compras}</span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 900,
                      color: t.compraCheckout >= 5 ? GREEN : t.compraCheckout >= 1 ? GOLD : SILVER }}>
                      {t.checkouts > 0 ? fmtP(t.compraCheckout) : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>{t.checkouts.toLocaleString('pt-BR')}</span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 900,
                      color: t.checkoutPageview >= 5 ? GREEN : t.checkoutPageview >= 1 ? GOLD : SILVER }}>
                      {t.pageviews > 0 ? fmtP(t.checkoutPageview) : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>
                      {t.cpCheckout > 0 ? fmtR(t.cpCheckout) : '—'}
                    </span>
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Hero stat card ───────────────────────────────────────────────────────── */
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 18px', borderRadius: 16, background: `${color}0A`, border: `1px solid ${color}22` }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: SILVER }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 900, marginTop: 3, color }}>{value}</span>
      {sub && <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2, color: SILVER }}>{sub}</span>}
    </div>
  );
}

/* ── Webhook banner ───────────────────────────────────────────────────────── */
function WebhookBanner({ data }: { data: Data }) {
  const { totalWebhookSales, totalApiSales, attrBreakdown, apiAttributionNote } = data;
  const hasData = totalWebhookSales > 0 || totalApiSales > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
      {/* Main banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 18px', borderRadius: 16,
        background: hasData
          ? 'linear-gradient(90deg, rgba(45,212,191,0.09) 0%, transparent 100%)'
          : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hasData ? 'rgba(45,212,191,0.22)' : 'rgba(255,255,255,0.07)'}`,
      }}>
        <span className="material-symbols-outlined" style={{ color: hasData ? TEAL : SILVER, fontSize: 20 }}>
          {hasData ? 'track_changes' : 'wifi_tethering_off'}
        </span>
        <div style={{ flex: 1 }}>
          {hasData ? (
            <span style={{ fontSize: 13, color: '#e8ecf0', fontWeight: 700 }}>
              {totalWebhookSales > 0 && <><strong style={{ color: TEAL }}>⚡ {totalWebhookSales} webhook</strong>{' (tempo real) '}</>}
              {totalApiSales     > 0 && <><strong style={{ color: BLUE }}>📡 {totalApiSales} histórico</strong>{' (API) '}</>}
              {'capturadas no período · '}
              <span style={{ color: GREEN }}>{attrBreakdown.complete} completa{attrBreakdown.complete !== 1 ? 's' : ''}</span>
              {attrBreakdown.partial > 0  && <span style={{ color: GOLD }}> · {attrBreakdown.partial} parcial{attrBreakdown.partial !== 1 ? 's' : ''}</span>}
              {attrBreakdown.missing > 0  && <span style={{ color: RED }}> · {attrBreakdown.missing} sem UTM</span>}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: SILVER, fontWeight: 600 }}>
              Nenhuma venda capturada ainda. Configure o webhook Hotmart apontando para{' '}
              <code style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', fontFamily: 'monospace' }}>
                /api/hotmart/webhook
              </code>
            </span>
          )}
        </div>
      </div>
      {/* API note */}
      {apiAttributionNote && (
        <div style={{
          padding: '8px 14px', borderRadius: 12, fontSize: 10, fontWeight: 700,
          background: `${BLUE}08`, border: `1px solid ${BLUE}18`, color: SILVER,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: BLUE }}>info</span>
          <span>{apiAttributionNote}</span>
        </div>
      )}
    </div>
  );
}

/* ── Active filter chip ───────────────────────────────────────────────────── */
function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 12px', borderRadius: 99, fontSize: 10, fontWeight: 800,
      background: `${GOLD}1E`, border: `1px solid ${GOLD}40`, color: GOLD,
    }}>
      {label.length > 50 ? label.slice(0, 50) + '…' : label}
      <button onClick={onClear} style={{ marginLeft: 2, cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', padding: 0, lineHeight: 1, fontSize: 12 }}>✕</button>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Page                                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function VendasPorOrigemPage() {
  const { dateFrom, dateTo } = useDashboard();
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [selCamp,  setSelCamp]  = useState<string | null>(null);
  const [selAdset, setSelAdset] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setSelCamp(null);
    setSelAdset(null);
    window.dispatchEvent(new CustomEvent('dashboard:loading', { detail: { show: true } }));
    const qs = new URLSearchParams({ dateFrom, dateTo }).toString();
    fetch(`/api/trafego/vendas-por-origem?${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => {
        setLoading(false);
        window.dispatchEvent(new CustomEvent('dashboard:loading', { detail: { show: false } }));
      });
  }, [dateFrom, dateTo]);

  /* ── Filtered adsets: match by campaign name tokens ── */
  const filteredAdsets = useMemo(() => {
    if (!data?.adsets || !selCamp) return data?.adsets || [];
    const tokens = selCamp.toLowerCase().split(/[\s_\-]+/).filter(t => t.length > 3);
    return data.adsets.filter(a =>
      tokens.some(tok => a.name.toLowerCase().includes(tok))
    );
  }, [data, selCamp]);

  /* ── Filtered ads: match by adset (priority) or campaign ── */
  const filteredAds = useMemo(() => {
    if (!data?.ads) return [];
    const filterBy = selAdset || selCamp;
    if (!filterBy) return data.ads;
    const tokens = filterBy.toLowerCase().split(/[\s_\-]+/).filter(t => t.length > 3);
    return data.ads.filter(a =>
      tokens.some(tok => a.name.toLowerCase().includes(tok))
    );
  }, [data, selCamp, selAdset]);

  const handleCampClick  = (_id: string | null, name: string) => {
    setSelCamp(prev => prev === name ? null : name);
    setSelAdset(null);
  };
  const handleAdsetClick = (_id: string | null, name: string) => {
    setSelAdset(prev => prev === name ? null : name);
  };

  return (
    <LoginWrapper>
      <div style={{ minHeight: '100vh' }}>
        <div style={{ height: 80 }} />

        <main style={{ padding: 'clamp(16px, 3vw, 40px) clamp(12px, 3vw, 24px) 96px', maxWidth: 1900, margin: '0 auto' }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 30, color: GOLD }}>route</span>
                Vendas por Origem
              </h1>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: SILVER, margin: '6px 0 0' }}>
                Meta Ads · Funil de Conversão · Atribuição via Webhook Hotmart (UTM)
              </p>
            </div>

            {/* Hero stats */}
            {!loading && data && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Stat label="Total Investido"    value={fmtR(data.totalMetaSpend)}       sub="Meta Ads no período"      color={BLUE} />
                <Stat label="Webhook (Tempo Real)" value={String(data.totalWebhookSales)} sub={data.totalWebhookSales > 0 ? `R$ ${fmt(data.totalWebhookRevenue)} receita` : 'próxima venda capturada'} color={TEAL} />
                <Stat label="Importadas (Relatório)" value={String(data.totalReportSales ?? 0)} sub={data.totalReportSales > 0 ? `R$ ${fmt(data.totalReportRevenue ?? 0)} receita` : 'via /api/hotmart/import-utm'} color={GOLD} />
                <Stat label="Atrib. Completa"    value={`${data.attrBreakdown.complete}`} sub="todas 5 UTMs presentes"   color={GREEN} />
              </div>
            )}
          </div>

          {/* ── Webhook banner ── */}
          {!loading && data && <WebhookBanner data={data} />}

          {/* ── Active filters ── */}
          {(selCamp || selAdset) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: SILVER }}>Filtros:</span>
              {selCamp  && <ActiveChip label={selCamp}  onClear={() => { setSelCamp(null); setSelAdset(null); }} />}
              {selAdset && <ActiveChip label={selAdset} onClear={() => setSelAdset(null)} />}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 16, fontSize: 13, fontWeight: 700, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: RED }}>
              Erro: {error}
            </div>
          )}

          {/* ── Tables ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            <VendasTable
              label="Campanhas"
              rows={data?.campaigns || []}
              loading={loading}
              accent={GOLD}
              onRowClick={handleCampClick}
              selectedId={selCamp}
            />

            <VendasTable
              label="Conjuntos"
              rows={filteredAdsets}
              loading={loading}
              accent={BLUE}
              onRowClick={handleAdsetClick}
              selectedId={selAdset}
            />

            <VendasTable
              label="Anúncios"
              rows={filteredAds}
              loading={loading}
              accent={PURPLE}
              showThumb
            />

          </div>
        </main>
      </div>
    </LoginWrapper>
  );
}
