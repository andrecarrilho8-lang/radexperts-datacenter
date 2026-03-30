'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { Navbar } from '@/components/dashboard/navbar';
import { R, RF } from '@/app/lib/utils';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, rgba(0,10,30,0.5) 100%)',
  border: '1px solid rgba(255,255,255,0.09)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.1) inset, 0 20px 40px -10px rgba(0,0,0,0.5)',
  borderRadius: 24,
};

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  const map: Record<string, { bg: string; color: string; label: string }> = {
    APPROVED:           { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', label: 'Aprovado' },
    COMPLETE:           { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', label: 'Completo' },
    PRODUCER_CONFIRMED: { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', label: 'Confirmado' },
    CONFIRMED:          { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', label: 'Confirmado' },
    CANCELED:           { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', label: 'Cancelado' },
    REFUNDED:           { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', label: 'Reembolsado' },
    CHARGEBACK:         { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', label: 'Chargeback' },
    EXPIRED:            { bg: 'rgba(107,114,128,0.2)', color: '#9ca3af', label: 'Expirado' },
    WAITING_PAYMENT:    { bg: 'rgba(232,177,79,0.12)', color: GOLD,      label: 'Aguardando' },
  };
  const cfg = map[s] || { bg: 'rgba(255,255,255,0.08)', color: SILVER, label: status };
  return (
    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
      {cfg.label}
    </span>
  );
}

function PayBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  if (m.includes('PIX'))    return <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 900 }}>● Pix</span>;
  if (m.includes('CREDIT') || m.includes('CARD')) return <span style={{ color: '#38bdf8', fontSize: 10, fontWeight: 900 }}>● Cartão</span>;
  if (m.includes('BOLETO') || m.includes('BILLET')) return <span style={{ color: GOLD, fontSize: 10, fontWeight: 900 }}>● Boleto</span>;
  if (m.includes('PAYPAL')) return <span style={{ color: '#818cf8', fontSize: 10, fontWeight: 900 }}>● PayPal</span>;
  return <span style={{ color: SILVER, fontSize: 10 }}>{method || '—'}</span>;
}

function D(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

function DT(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function Avatar({ name }: { name: string }) {
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #c47d1a 100%)`, color: NAVY, boxShadow: `0 0 0 3px rgba(232,177,79,0.3), 0 8px 24px rgba(232,177,79,0.25)` }}>
      {initials}
    </div>
  );
}

// ── Timeline Event ───────────────────────────────────────────────────────────
type TimelineEvent = {
  date: string;
  type: 'purchase' | 'ac_created' | 'tag' | 'list' | 'automation' | 'deal';
  title: string;
  subtitle?: string;
  color?: string;
  icon?: string;
};

export default function AlunoPage() {
  const params   = useParams();
  const router   = useRouter();
  const emailRaw = params?.email as string;
  const email    = decodeURIComponent(emailRaw);

  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    fetch(`/api/alunos/${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [email]);

  const handlePDF = () => {
    const style = document.createElement('style');
    style.innerHTML = `@media print { .no-print { display: none !important; } body { background: #fff !important; } }`;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.head.removeChild(style), 1000);
  };

  // Build timeline
  const timeline: TimelineEvent[] = [];
  if (data) {
    // Purchases
    (data.purchases || []).forEach((p: any) => {
      const isOk = ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'].includes(p.status?.toUpperCase());
      timeline.push({
        date:     p.date,
        type:     'purchase',
        title:    p.product,
        subtitle: `${RF(p.grossValue, p.currency)} · ${p.paymentType || 'Pagamento'} · ${p.status}`,
        color:    isOk ? '#4ade80' : '#f87171',
        icon:     'shopping_cart',
      });
    });

    // AC created
    if (data.ac?.created) {
      timeline.push({
        date:     data.ac.created,
        type:     'ac_created',
        title:    'Entrou no Active Campaign',
        subtitle: `Email: ${data.ac.email}`,
        color:    '#38bdf8',
        icon:     'person_add',
      });
    }

    // Tags
    (data.ac?.tags || []).forEach((t: any) => {
      if (t.created) timeline.push({
        date:     t.created,
        type:     'tag',
        title:    `Tag adicionada: ${t.tagName}`,
        color:    GOLD,
        icon:     'label',
      });
    });

    // Lists
    (data.ac?.lists || []).forEach((l: any) => {
      if (l.created) timeline.push({
        date:     l.created,
        type:     'list',
        title:    `Adicionado à lista: ${l.name}`,
        subtitle: l.status === '1' ? 'Inscrito' : 'Cancelado',
        color:    l.status === '1' ? '#4ade80' : '#f87171',
        icon:     'group',
      });
    });

    // Automations
    (data.ac?.automations || []).forEach((a: any) => {
      if (a.entered) timeline.push({
        date:     a.entered,
        type:     'automation',
        title:    `Entrou na automação: ${a.name}`,
        subtitle: a.completed ? 'Completada' : 'Em andamento',
        color:    '#818cf8',
        icon:     'alt_route',
      });
    });

    // Deals
    (data.ac?.deals || []).forEach((d: any) => {
      if (d.created) timeline.push({
        date:     d.created,
        type:     'deal',
        title:    `Deal criado: ${d.title || 'Sem título'}`,
        color:    '#fb923c',
        icon:     'handshake',
      });
    });

    // Sort desc
    timeline.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }

  const buyer = data?.buyer || {};
  const ac    = data?.ac;
  const name  = ac?.firstName ? `${ac.firstName} ${ac.lastName || ''}`.trim() : buyer.name || email;

  // Stats
  const approvedPurchases = (data?.purchases || []).filter((p: any) =>
    ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'].includes(p.status?.toUpperCase())
  );
  const totalSpentBRL = approvedPurchases.reduce((acc: number, p: any) => {
    if (p.currency === 'BRL') return acc + (p.netValue ?? p.grossValue ?? 0);
    return acc + (p.netBRL ?? p.convertedBRL ?? 0);
  }, 0);
  const uniqueProducts = [...new Set(approvedPurchases.map((p: any) => p.product))];

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-24" ref={pageRef}>
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-6 max-w-[1400px] mx-auto pt-10">

          {/* Back + Print */}
          <div className="flex items-center justify-between mb-8 no-print">
            <button onClick={() => router.back()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Voltar
            </button>
            <button onClick={handlePDF}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>
              <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
              Salvar PDF
            </button>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Carregando dossiê…</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-red-400 font-black text-sm">{error}</p>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-6">

              {/* ── HERO ──────────────────────────────────────────────────── */}
              <div style={glossy} className="p-8 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(232,177,79,0.06) 0%, transparent 60%)', borderRadius: 24 }} />
                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
                  <Avatar name={name} />
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center gap-3 flex-wrap justify-center md:justify-start mb-1">
                      <h1 className="font-headline font-black text-3xl md:text-4xl text-white tracking-tight leading-none">
                        {name}
                      </h1>
                      {ac && <span className="text-[9px] font-black px-2 py-1 rounded-lg" style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8' }}>AC #{ac.id}</span>}
                    </div>
                    <p className="text-base font-bold mb-3" style={{ color: SILVER }}>{email}</p>
                    <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                      {buyer.phone && (
                        <span className="flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                          <span className="material-symbols-outlined text-[14px]">phone</span>{buyer.phone}
                        </span>
                      )}
                      {buyer.document && (
                        <span className="flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: SILVER }}>
                          <span className="material-symbols-outlined text-[14px]">badge</span>{buyer.document}
                        </span>
                      )}
                      {ac?.score != null && (
                        <span className="flex items-center gap-1 text-[11px] font-black px-3 py-1 rounded-lg" style={{ background: 'rgba(232,177,79,0.12)', border: `1px solid rgba(232,177,79,0.3)`, color: GOLD }}>
                          <span className="material-symbols-outlined text-[14px]">star</span>Score AC: {ac.score}
                        </span>
                      )}
                    </div>
                    {ac?.created && (
                      <p className="text-[10px] font-bold mt-3" style={{ color: SILVER }}>
                        Entrou no AC: {DT(ac.created)} · Última atualização: {DT(ac.updated)}
                      </p>
                    )}
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-3 gap-4 flex-shrink-0">
                    {[
                      { label: 'Total Gasto', value: R(totalSpentBRL), color: '#4ade80' },
                      { label: 'Compras', value: String(approvedPurchases.length), color: GOLD },
                      { label: 'Produtos', value: String(uniqueProducts.length), color: '#818cf8' },
                    ].map(kpi => (
                      <div key={kpi.label} className="text-center rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="font-black text-xl" style={{ color: kpi.color }}>{kpi.value}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>{kpi.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── GRID: Timeline + Dados Pessoais ───────────────────────── */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Timeline (2/3) */}
                <div className="xl:col-span-2" style={{ ...glossy }}>
                  <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <span className="material-symbols-outlined text-sm">timeline</span>Linha do Tempo
                    </p>
                  </div>
                  <div className="p-6 max-h-[600px] overflow-y-auto">
                    {timeline.length === 0 ? (
                      <p className="text-center text-[11px] py-8" style={{ color: SILVER }}>Nenhum evento encontrado</p>
                    ) : (
                      <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                        <div className="space-y-4">
                          {timeline.map((ev, i) => (
                            <div key={i} className="flex gap-4 items-start">
                              {/* Icon */}
                              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                                style={{ background: `${ev.color}22`, border: `1px solid ${ev.color}55` }}>
                                <span className="material-symbols-outlined text-[14px]" style={{ color: ev.color }}>{ev.icon || 'circle'}</span>
                              </div>
                              {/* Content */}
                              <div className="flex-1 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <p className="text-[10px] font-bold mb-0.5" style={{ color: SILVER }}>{DT(ev.date)}</p>
                                <p className="font-black text-white text-sm leading-tight">{ev.title}</p>
                                {ev.subtitle && <p className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>{ev.subtitle}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dados Pessoais (1/3) */}
                <div className="flex flex-col gap-5">

                  {/* AC Data */}
                  {ac && (
                    <div style={glossy} className="p-5 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: '#38bdf8' }}>
                        <span className="material-symbols-outlined text-sm">person</span>ActiveCampaign
                      </p>
                      <div className="space-y-2">
                        {[
                          { label: 'Nome', value: `${ac.firstName || ''} ${ac.lastName || ''}`.trim() },
                          { label: 'Email', value: ac.email },
                          { label: 'Fone', value: ac.phone || '—' },
                          { label: 'ID', value: `#${ac.id}` },
                        ].map(row => (
                          <div key={row.label} className="flex justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SILVER }}>{row.label}</span>
                            <span className="text-[11px] font-black text-white text-right">{row.value || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hotmart Data */}
                  <div style={glossy} className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: GOLD }}>
                      <span className="material-symbols-outlined text-sm">store</span>Hotmart
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: 'Nome', value: buyer.name },
                        { label: 'Email', value: buyer.email },
                        { label: 'Telefone', value: buyer.phone || '—' },
                        { label: 'Documento', value: buyer.document || '—' },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SILVER }}>{row.label}</span>
                          <span className="text-[11px] font-black text-white text-right">{row.value || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags AC */}
                  {ac?.tags?.length > 0 && (
                    <div style={glossy} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: GOLD }}>
                        <span className="material-symbols-outlined text-sm">label</span>Tags ({ac.tags.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ac.tags.map((t: any, i: number) => (
                          <div key={i} className="group relative">
                            <span className="px-2 py-1 rounded-lg text-[10px] font-black cursor-default"
                              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>
                              {t.tagName}
                            </span>
                            {t.created && (
                              <span className="absolute -top-7 left-0 text-[9px] font-bold whitespace-nowrap px-2 py-0.5 rounded-lg z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: '#0d1f33', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                                {D(t.created)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AC Lists */}
                  {ac?.lists?.length > 0 && (
                    <div style={glossy} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: '#818cf8' }}>
                        <span className="material-symbols-outlined text-sm">group</span>Listas AC
                      </p>
                      <div className="space-y-2">
                        {ac.lists.map((l: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-white">{l.name}</span>
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-lg"
                              style={l.status === '1'
                                ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80' }
                                : { background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                              {l.status === '1' ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Automações AC ─────────────────────────────────────────── */}
              {ac?.automations?.length > 0 && (
                <div style={glossy}>
                  <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: '#818cf8' }}>
                      <span className="material-symbols-outlined text-sm">alt_route</span>Automações ActiveCampaign
                    </p>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {ac.automations.map((a: any, i: number) => (
                      <div key={i} className="rounded-2xl p-4" style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)' }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-black text-white text-[12px] leading-tight">{a.name}</p>
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-lg flex-shrink-0"
                            style={a.completed
                              ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80' }
                              : { background: 'rgba(232,177,79,0.1)', color: GOLD }}>
                            {a.completed ? 'Concluída' : 'Em andamento'}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold" style={{ color: SILVER }}>Entrou: {DT(a.entered)}</p>
                        {a.exited && <p className="text-[10px] font-bold" style={{ color: SILVER }}>Saiu: {DT(a.exited)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Histórico de Compras ───────────────────────────────────── */}
              <div style={{ ...glossy, padding: 0 }}>
                <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                    <span className="material-symbols-outlined text-sm">receipt_long</span>
                    Histórico de Compras Hotmart · {data.purchases?.length || 0} transações (todo período)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {['Data', 'Produto', 'Moeda', 'Bruto', 'Líquido (BRL)', 'Pagamento', 'Status', 'Parcelamento', 'UTM / Tracking'].map(h => (
                          <th key={h} className="py-3 px-4 text-left text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data.purchases || []).map((p: any, i: number) => {
                        const isOk = ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'].includes(p.status?.toUpperCase());
                        const netBRL = p.netBRL ?? p.convertedBRL ?? (p.currency === 'BRL' ? (p.netValue ?? p.grossValue) : null);
                        const hasUTM = p.utmSource || p.src || p.sck;
                        return (
                          <tr key={i}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            <td className="py-3 px-4 text-[11px] font-bold text-white whitespace-nowrap">{DT(p.date)}</td>
                            <td className="py-3 px-4 text-[11px] font-black text-white max-w-[200px]">
                              <span className="block leading-tight">{p.product}</span>
                            </td>
                            <td className="py-3 px-4 text-[11px] font-black" style={{ color: SILVER }}>{p.currency}</td>
                            <td className="py-3 px-4 text-[12px] font-black text-white whitespace-nowrap">{RF(p.grossValue, p.currency)}</td>
                            <td className="py-3 px-4 text-[12px] font-black whitespace-nowrap" style={{ color: isOk ? '#4ade80' : '#f87171' }}>
                              {netBRL != null ? R(netBRL) : '—'}
                            </td>
                            <td className="py-3 px-4"><PayBadge method={p.paymentType} /></td>
                            <td className="py-3 px-4"><StatusBadge status={p.status} /></td>
                            <td className="py-3 px-4 text-[10px]" style={{ color: SILVER }}>
                              {p.isSubscription ? `Assinatura · Ciclo ${p.recurrencyNum || '?'}` :
                               p.installments > 1 ? `${p.installments}× parcelas` : 'À vista'}
                            </td>
                            <td className="py-3 px-4">
                              {hasUTM ? (
                                <div className="text-[9px] font-bold space-y-0.5" style={{ color: SILVER }}>
                                  {p.src        && <div>src: <span className="text-white">{p.src}</span></div>}
                                  {p.sck        && <div>sck: <span className="text-white">{p.sck}</span></div>}
                                  {p.utmSource  && <div>utm_source: <span className="text-white">{p.utmSource}</span></div>}
                                  {p.utmMedium  && <div>utm_medium: <span className="text-white">{p.utmMedium}</span></div>}
                                  {p.utmCampaign && <div>utm_campaign: <span className="text-white">{p.utmCampaign}</span></div>}
                                </div>
                              ) : <span style={{ color: SILVER }} className="text-[10px]">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Produtos comprados ────────────────────────────────────── */}
              {uniqueProducts.length > 0 && (
                <div style={glossy} className="p-7">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-5 flex items-center gap-2" style={{ color: GOLD }}>
                    <span className="material-symbols-outlined text-sm">school</span>
                    Produtos Adquiridos
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {uniqueProducts.map((prod: any, i) => {
                      const saleProd = approvedPurchases.find((p: any) => p.product === prod);
                      const allSalesProd = approvedPurchases.filter((p: any) => p.product === prod);
                      const firstDate = allSalesProd.slice(-1)[0]?.date;
                      return (
                        <div key={i} className="flex items-start gap-3 rounded-2xl p-4"
                          style={{ background: 'rgba(232,177,79,0.05)', border: '1px solid rgba(232,177,79,0.15)' }}>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(232,177,79,0.15)' }}>
                            <span className="material-symbols-outlined text-[16px]" style={{ color: GOLD }}>menu_book</span>
                          </div>
                          <div>
                            <p className="font-black text-white text-[12px] leading-tight">{prod}</p>
                            <p className="text-[10px] font-bold mt-0.5" style={{ color: SILVER }}>
                              {allSalesProd.length > 1 ? `${allSalesProd.length} compras` : `1 compra`} · Primeira: {D(firstDate)}
                            </p>
                            <p className="text-[10px] font-bold" style={{ color: SILVER }}>
                              {saleProd?.paymentType && <><PayBadge method={saleProd.paymentType} /></>}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Deals AC ─────────────────────────────────────────────── */}
              {ac?.deals?.length > 0 && (
                <div style={glossy} className="p-7">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: '#fb923c' }}>
                    <span className="material-symbols-outlined text-sm">handshake</span>Deals (CRM)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {ac.deals.map((d: any, i: number) => (
                      <div key={i} className="rounded-2xl p-4" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}>
                        <p className="font-black text-white text-sm mb-1">{d.title || '—'}</p>
                        <p className="text-[10px] font-bold" style={{ color: SILVER }}>Criado: {DT(d.created)}</p>
                        {d.value > 0 && <p className="text-[11px] font-black mt-1" style={{ color: '#fb923c' }}>{R(d.value / 100)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      </div>
    </LoginWrapper>
  );
}
