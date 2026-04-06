'use client';

import React, { useState, useCallback } from 'react';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, N, P, D } from '@/app/lib/utils';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import Link from 'next/link';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const GREEN  = '#22c55e';
const SKY    = '#38bdf8';

// ── shared card style ────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, rgba(0,10,30,0.5) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 20px 40px -8px rgba(0,0,0,0.5)',
  borderRadius: 24,
  position: 'relative',
  overflow: 'hidden',
};

// ── Metric chip ──────────────────────────────────────────────────────────────
function Chip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 64 }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: SILVER }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 900, color: accent || '#fff', lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// ── Ads table inside accordion ───────────────────────────────────────────────
const TD: React.CSSProperties = {
  padding: '14px 16px 14px 0', verticalAlign: 'middle',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  fontSize: 16, fontWeight: 900, color: '#fff',
  whiteSpace: 'nowrap',
};
const TH: React.CSSProperties = {
  padding: '0 16px 10px 0', verticalAlign: 'bottom',
  fontSize: 9, fontWeight: 900, letterSpacing: '0.13em',
  textTransform: 'uppercase', color: SILVER, whiteSpace: 'nowrap',
};

function AdsTable({ ads, objective }: { ads: any[]; objective: string }) {
  const isVendas = objective === 'VENDAS';
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th style={{ ...TH, width: 28 }}>#</th>
            <th style={{ ...TH, width: 80 }}></th>
            <th style={{ ...TH, minWidth: 200, textAlign: 'left' }}>Anúncio</th>
            <th style={{ ...TH, textAlign: 'right' }}>Gasto</th>
            <th style={{ ...TH, textAlign: 'right' }}>CTR</th>
            <th style={{ ...TH, textAlign: 'right' }}>Connect</th>
            {isVendas ? (<>
              <th style={{ ...TH, textAlign: 'right' }}>Checkout</th>
              <th style={{ ...TH, textAlign: 'right' }}>Purchase</th>
              <th style={{ ...TH, textAlign: 'right' }}>Vendas</th>
              <th style={{ ...TH, textAlign: 'right' }}>CPA</th>
            </>) : (<>
              <th style={{ ...TH, textAlign: 'right' }}>Leads</th>
              <th style={{ ...TH, textAlign: 'right' }}>CPL</th>
              <th style={{ ...TH, textAlign: 'right' }}>Taxa Conv.</th>
            </>)}
          </tr>
        </thead>
        <tbody>
          {ads.slice(0, 10).map((ad, i) => {
            const rank    = i + 1;
            const checkR  = ad.checkoutRate ?? (ad.landingPageViews > 0 ? (ad.checkouts / ad.landingPageViews * 100) : 0);
            const purchR  = ad.checkouts > 0 ? (ad.purchases / ad.checkouts * 100) : 0;
            const leadCV  = ad.landingPageViews > 0 ? (ad.leads / ad.landingPageViews * 100) : 0;
            const cpa     = ad.spend > 0 && (ad.purchases || 0) > 0 ? ad.spend / ad.purchases : 0;
            const cpl     = ad.spend > 0 && (ad.leads || 0) > 0    ? ad.spend / ad.leads    : 0;
            const connClr = (ad.connectRate || 0) > 70 ? GREEN : (ad.connectRate || 0) < 50 ? '#ef4444' : SILVER;
            return (
              <tr key={ad.id || i}>
                {/* Rank */}
                <td style={{ ...TD, paddingLeft: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: rank <= 3 ? 'rgba(232,177,79,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${rank <= 3 ? 'rgba(232,177,79,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    fontSize: 11, fontWeight: 900, color: rank <= 3 ? GOLD : SILVER,
                  }}>{rank}</div>
                </td>
                {/* Thumb */}
                <td style={{ ...TD }}>
                  <div style={{ position: 'relative', width: 80, height: 80, display: 'inline-block' }}
                    onMouseEnter={e => { const t = e.currentTarget.querySelector<HTMLElement>('.thumb-tip'); if (t) t.style.display = 'block'; }}
                    onMouseLeave={e => { const t = e.currentTarget.querySelector<HTMLElement>('.thumb-tip'); if (t) t.style.display = 'none'; }}>
                    <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'zoom-in' }}>
                      {ad.thumbnailUrl
                        ? <img src={ad.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: SILVER }}>image</span>
                          </div>}
                    </div>
                    {ad.thumbnailUrl && (
                      <div className="thumb-tip" style={{ display: 'none', position: 'fixed', zIndex: 99999, width: 280, height: 280, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)', transform: 'translate(90px,-100px)' }}>
                        <img src={ad.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      </div>
                    )}
                  </div>
                </td>
                {/* Name */}
                <td style={{ ...TD, maxWidth: 260 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em', maxWidth: 260 }} title={ad.name}>{ad.name}</p>
                </td>
                {/* Gasto */}
                <td style={{ ...TD, textAlign: 'right', color: '#fff' }}>{R(ad.spend || 0)}</td>
                {/* CTR */}
                <td style={{ ...TD, textAlign: 'right', color: SKY }}>{P(ad.ctr || 0)}</td>
                {/* Connect */}
                <td style={{ ...TD, textAlign: 'right', color: connClr }}>{P(ad.connectRate || 0)}</td>
                {isVendas ? (<>
                  <td style={{ ...TD, textAlign: 'right', color: SILVER }}>{P(checkR)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: SILVER }}>{P(purchR)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: GREEN }}>{N(ad.purchases || 0)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#ef4444' }}>{cpa > 0 ? R(cpa) : '—'}</td>
                </>) : (<>
                  <td style={{ ...TD, textAlign: 'right', color: GOLD }}>{N(ad.leads || 0)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: GOLD }}>{cpl > 0 ? R(cpl) : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', color: SILVER }}>{P(leadCV)}</td>
                </>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Campaign Accordion Card ──────────────────────────────────────────────────
function CampaignCard({ camp, dateFrom, dateTo }: { camp: any; dateFrom: string; dateTo: string }) {
  const [open, setOpen]       = useState(false);
  const [ads, setAds]         = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const isVendas  = camp.objective === 'VENDAS';
  const accent    = isVendas ? GREEN : GOLD;
  const cpa       = (camp.purchases || 0) > 0 ? camp.spend / camp.purchases : 0;
  const cpl       = (camp.leads || 0) > 0     ? camp.spend / camp.leads     : 0;
  const checkR    = camp.checkoutRate ?? (camp.landingPageViews > 0 ? (camp.checkouts / camp.landingPageViews * 100) : 0);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && !fetched) {
      setLoading(true);
      try {
        const r = await fetch(`/api/meta/campaign/${camp.id}/topAds?dateFrom=${dateFrom}&dateTo=${dateTo}&objective=${camp.objective}`);
        const d = await r.json();
        setAds(d.topAds || []);
      } catch { setAds([]); }
      finally { setLoading(false); setFetched(true); }
    }
  }, [open, fetched, camp.id, camp.objective, dateFrom, dateTo]);

  return (
    <div style={{
      ...card,
      borderColor: open ? `${accent}40` : 'rgba(255,255,255,0.10)',
      boxShadow: open ? `0 0 0 1px ${accent}20, 0 20px 48px -8px rgba(0,0,0,0.6)` : (card.boxShadow as string),
      transition: 'border-color 0.25s, box-shadow 0.25s',
      overflow: 'visible',
    }}>
      {/* Shine */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 35%)', borderRadius: 24, pointerEvents: 'none' }} />

      {/* Accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: accent, borderRadius: '24px 0 0 24px', opacity: 0.6 }} />

      <div style={{ position: 'relative', zIndex: 1, padding: '20px 22px 20px 26px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            {/* Live pulse */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 6px ${GREEN}`, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.15em', color: GREEN }}>AO VIVO</span>
            </span>
            {/* Objective badge */}
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: `${accent}18`, border: `1px solid ${accent}30`, color: accent }}>{camp.objective}</span>
          </div>
          {/* Toggle chevron */}
          <button onClick={toggle}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, border: `1px solid ${open ? accent + '50' : 'rgba(255,255,255,0.1)'}`, background: open ? `${accent}10` : 'rgba(255,255,255,0.04)', color: open ? accent : SILVER, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, transition: 'transform 0.25s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
          </button>
        </div>

        {/* Campaign name */}
        <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1.25, letterSpacing: '-0.01em', marginBottom: 14, textTransform: 'uppercase', cursor: 'pointer' }} onClick={toggle}>
          {camp.name}
        </h3>

        {/* Metrics row */}
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <Chip label="Gasto"   value={R(camp.spend || 0)}         accent="#fff" />
          <Chip label="CTR"     value={P(camp.ctr || 0)}           accent={SKY} />
          <Chip label="Connect" value={P(camp.connectRate || 0)}   accent={(camp.connectRate || 0) > 70 ? GREEN : (camp.connectRate || 0) < 50 ? '#ef4444' : SILVER} />
          {isVendas ? (<>
            <Chip label="Checkout" value={P(checkR)}                 accent={SILVER} />
            <Chip label="Vendas"   value={N(camp.purchases || 0)}    accent={GREEN} />
            <Chip label="CPA"      value={cpa > 0 ? R(cpa) : '—'}   accent="#ef4444" />
          </>) : (<>
            <Chip label="Leads"    value={N(camp.leads || 0)}        accent={GOLD} />
            <Chip label="CPL"      value={cpl > 0 ? R(cpl) : '—'}   accent={GOLD} />
          </>)}
          <Chip label="Criada" value={camp.createdTime ? D(camp.createdTime) : '—'} />
        </div>

        {/* ── ACCORDION ── */}
        {open && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            {/* Sub-header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>stars</span>
                Anúncios desta campanha
              </p>
              <Link href={`/campanhas/${camp.id}`}
                style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', padding: '4px 10px', borderRadius: 8, border: `1px solid ${accent}30`, background: `${accent}0A` }}
                onClick={e => e.stopPropagation()}>
                Ver completo
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
              </Link>
            </div>

            {/* Ads list */}
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: GOLD, fontSize: 22, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: SILVER }}>Carregando anúncios…</span>
              </div>
            ) : ads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: SILVER, fontSize: 12, fontWeight: 700 }}>
                Nenhum anúncio encontrado no período.
              </div>
            ) : (
              <AdsTable ads={ads} objective={camp.objective} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CampanhasAtivasPage() {
  const { dateFrom, dateTo } = useDashboard();
  const data  = useDashboardData();
  const [tab, setTab] = useState<'GERAL' | 'VENDAS' | 'LEADS'>('GERAL');
  const [search, setSearch] = useState('');

  // Filter: only ACTIVE campaigns
  const allActive = data.tableData.filter((c: any) => (c.status || '').toUpperCase() === 'ACTIVE');
  const byTab     = tab === 'GERAL' ? allActive : allActive.filter((c: any) => c.objective === tab);
  const filtered  = search.trim()
    ? byTab.filter((c: any) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : byTab;

  // KPI totals
  const totalSpend    = allActive.reduce((s: number, c: any) => s + (c.spend || 0), 0);
  const totalPurchases= allActive.reduce((s: number, c: any) => s + (c.purchases || 0), 0);
  const totalLeads    = allActive.reduce((s: number, c: any) => s + (c.leads || 0), 0);
  const cntVendas     = allActive.filter((c: any) => c.objective === 'VENDAS').length;
  const cntLeads      = allActive.filter((c: any) => c.objective === 'LEADS').length;

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: 'GERAL',  label: 'Todas',  count: allActive.length },
    { key: 'VENDAS', label: 'Vendas', count: cntVendas },
    { key: 'LEADS',  label: 'Leads',  count: cntLeads },
  ];

  return (
    <LoginWrapper>
      {/* Keyframe for spin + pulse via global style injected once */}
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.4); } }
      `}</style>

      <div style={{ position: 'relative', minHeight: '100vh' }}>
        {/* Fixed background — same as all other pages */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '100vh',
          backgroundImage: 'url(/rad.jpg)', backgroundSize: 'cover',
          backgroundPosition: 'top center', backgroundRepeat: 'no-repeat',
          pointerEvents: 'none', zIndex: 0,
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,20,0.55)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, #001a35 95%)', pointerEvents: 'none' }} />
        </div>

        {/* Content above background */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Navbar />
          <div className="h-[80px]" />

          <main className="px-6 max-w-[1600px] mx-auto pt-8 pb-24">

          {/* ── PAGE HEADER ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.28)', flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: GOLD }}>bolt</span>
              </div>
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  Campanhas <span style={{ color: GOLD }}>Ativas</span>
                </h1>
                <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: SILVER, marginTop: 4 }}>
                  Período: {D(dateFrom)} → {D(dateTo)}
                </p>
              </div>
              {/* Live indicator */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 8px ${GREEN}`, animation: 'pulse 2s infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 900, color: GREEN, letterSpacing: '0.1em' }}>{allActive.length} campanhas ao vivo</span>
              </div>
            </div>
          </div>

          {/* ── KPI CARDS ── */}
          {!data.fastLoading && (() => {
            const dayCount = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1);
            const avgDaily = totalSpend / dayCount;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                {[
                  { label: 'Total Investido',  value: R(totalSpend),       sub: `Média/dia: ${R(avgDaily)}`, accent: GOLD,  icon: 'paid' },
                  { label: 'Campanhas Ativas', value: N(allActive.length), sub: null,                         accent: GREEN, icon: 'campaign' },
                  { label: 'Vendas Meta',      value: N(totalPurchases),   sub: null,                         accent: GREEN, icon: 'shopping_cart' },
                  { label: 'Leads Captados',   value: N(totalLeads),       sub: null,                         accent: GOLD,  icon: 'person_add' },
                ].map((k, i) => (
                  <div key={i} style={{ ...card, padding: '20px 22px' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 40%)', borderRadius: 24, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: k.accent }}>{k.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: SILVER }}>{k.label}</span>
                      </div>
                      <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: k.sub ? 6 : 0 }}>{k.value}</p>
                      {k.sub && <p style={{ fontSize: 10, fontWeight: 700, color: SILVER, marginTop: 4 }}>{k.sub}</p>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── CONTROLS: TABS + SEARCH ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ padding: '7px 18px', borderRadius: 10, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
                    background: tab === t.key ? GOLD : 'transparent',
                    color: tab === t.key ? '#001535' : SILVER,
                    boxShadow: tab === t.key ? '0 2px 10px rgba(232,177,79,0.35)' : 'none',
                    border: 'none',
                  }}>
                  {t.label} <span style={{ opacity: 0.7 }}>({t.count})</span>
                </button>
              ))}
            </div>

            {/* Search + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: SILVER, pointerEvents: 'none' }}>search</span>
                <input
                  type="text"
                  placeholder="Buscar campanha..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
                    borderRadius: 12, fontSize: 12, fontWeight: 700,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', outline: 'none', width: 260,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderColor = GOLD)}
                  onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
              </div>
              <p style={{ fontSize: 10, fontWeight: 700, color: SILVER, whiteSpace: 'nowrap' }}>
                {filtered.length} campanha{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* ── CAMPAIGN CARDS ── */}
          {data.fastLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ ...card, height: 140 }} className="animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: SILVER, display: 'block', marginBottom: 16 }}>signal_disconnected</span>
              <p style={{ fontSize: 16, fontWeight: 900, color: SILVER }}>Nenhuma campanha{search ? ` encontrada para "${search}"` : ` ativa${tab !== 'GERAL' ? ` do tipo ${tab}` : ''}`}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: SILVER, opacity: 0.6, marginTop: 6 }}>no período {D(dateFrom)} → {D(dateTo)}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered
                .sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0))
                .map((camp: any) => (
                  <CampaignCard key={camp.id} camp={camp} dateFrom={dateFrom} dateTo={dateTo} />
                ))}
            </div>
          )}
          </main>
        </div>
      </div>
    </LoginWrapper>
  );
}
