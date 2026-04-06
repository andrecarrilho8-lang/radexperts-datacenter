'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { Navbar } from '@/components/dashboard/navbar';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';

const card: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, rgba(0,10,30,0.5) 100%)',
  border: '1px solid rgba(255,255,255,0.09)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.1) inset, 0 20px 40px -10px rgba(0,0,0,0.5)',
  borderRadius: 24,
};

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
function RF(v: number, cur: string) {
  if (!v) return '—';
  if (cur === 'BRL') return R(v);
  try { return v.toLocaleString('pt-BR', { style: 'currency', currency: cur }); }
  catch { return `${cur} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; }
}
function DT(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}
function D(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); }
  catch { return iso; }
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg"
      style={{ background: bg, color, border: `1px solid ${color}30` }}>{label}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  const approved = ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'];
  const cancelled = ['CANCELED','REFUNDED','CHARGEBACK','EXPIRED'];
  if (approved.includes(s)) return <Badge label="Aprovado" bg="rgba(34,197,94,0.12)" color="#4ade80" />;
  if (cancelled.includes(s)) return <Badge label={s === 'REFUNDED' ? 'Reembolsado' : s === 'CHARGEBACK' ? 'Chargeback' : 'Cancelado'} bg="rgba(239,68,68,0.12)" color="#f87171" />;
  if (s === 'WAITING_PAYMENT') return <Badge label="Aguardando" bg="rgba(232,177,79,0.12)" color={GOLD} />;
  return <Badge label={s} bg="rgba(255,255,255,0.07)" color={SILVER} />;
}

function InitialsAvatar({ name, email }: { name?: string | null; email: string }) {
  const initials = (name || email || '?').split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #c47d1a 100%)`, color: NAVY, boxShadow: `0 0 0 4px rgba(232,177,79,0.2), 0 8px 32px rgba(232,177,79,0.3)` }}>
      {initials}
    </div>
  );
}

type TimelineEvent = {
  date: string; type: string; title: string; subtitle?: string; color: string; icon: string;
};

export default function AlunoPage() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params?.id as string;

  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadErr,   setUploadErr]   = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/alunos/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);

  // Load attachments once we have the student email
  useEffect(() => {
    if (!data?.email) return;
    fetch(`/api/alunos/attachments?email=${encodeURIComponent(data.email)}`)
      .then(r => r.json())
      .then(d => setAttachments(d.attachments || []))
      .catch(() => {});
  }, [data?.email]);

  const handleUpload = async (file: File) => {
    if (!data?.email) return;
    setUploading(true); setUploadErr('');
    try {
      const fd = new FormData();
      fd.append('email', data.email);
      fd.append('file', file);
      const res  = await fetch('/api/alunos/attachments', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao enviar');
      setAttachments(prev => [json.attachment, ...prev]);
    } catch (e: any) { setUploadErr(e.message); }
    finally { setUploading(false); }
  };

  const handleDeleteAttachment = async (attId: string) => {
    await fetch(`/api/alunos/attachments?id=${attId}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  const [pdfState, setPdfState] = React.useState<'idle' | 'printing' | 'done'>('idle');

  const handlePDF = () => {
    if (pdfState !== 'idle') return;
    setPdfState('printing');
    const s = document.createElement('style');
    s.innerHTML = `
      @media print {
        /* ── Hide all UI chrome ── */
        nav, .no-print, [data-no-print],
        button, input, textarea,
        .no-print { display: none !important; }

        /* ── Page setup ── */
        @page { size: A4 portrait; margin: 18mm 14mm 14mm 14mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body {
          background: #ffffff !important;
          color: #1a1a2e !important;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
          font-size: 10pt !important;
          line-height: 1.45;
          margin: 0; padding: 0;
        }

        /* ── Header bar (RadExperts branding) ── */
        main::before {
          content: '';
          display: block;
          height: 6px;
          background: linear-gradient(90deg, #E8B14F 0%, #c47d1a 50%, #E8B14F 100%);
          border-radius: 3px;
          margin-bottom: 18px;
        }

        /* ── Remove dark card backgrounds ── */
        div[style], section { background: transparent !important; border: none !important;
          box-shadow: none !important; backdrop-filter: none !important; border-radius: 0 !important; }

        /* ── Section separators ── */
        .space-y-6 > div { border-bottom: 1px solid #e8e8f0; margin-bottom: 12px; padding-bottom: 12px; page-break-inside: avoid; }

        /* ── Typography ── */
        h1 { font-size: 20pt !important; color: #1a1a2e !important; margin: 0 0 4px 0; font-weight: 900; }
        p  { color: #444 !important; }

        /* ── Avatar → hidden in print (replaced by name) ── */
        .w-20.h-20 { display: none !important; }

        /* ── KPI cards ── */
        .grid.grid-cols-3 div {
          border: 1.5px solid #e0e0ee !important;
          border-radius: 8px !important;
          background: #f8f8fd !important;
          padding: 8px !important;
        }
        .grid.grid-cols-3 p { color: #1a1a2e !important; }

        /* ── Section headers ── */
        p.text-\\[10px\\].font-black.uppercase {
          font-size: 7pt !important; letter-spacing: 0.15em;
          color: #b08020 !important; border-bottom: 1px solid #f0e0a0;
          padding-bottom: 4px; margin-bottom: 8px;
        }

        /* ── Key-value rows ── */
        .space-y-2\\.5 > div, .space-y-2 > div {
          border-bottom: 1px solid #f3f3f9;
          padding: 3px 0;
        }
        span.text-\\[10px\\].font-bold.uppercase { color: #888 !important; }
        span.text-\\[11px\\].font-black { color: #1a1a2e !important; }

        /* ── Badges ── */
        span.text-\\[9px\\].font-black.uppercase.tracking-widest {
          padding: 2px 6px !important; border-radius: 4px !important;
          font-size: 7pt !important; font-weight: 900 !important;
        }

        /* ── Status badge colours (preserve) ── */
        span[style*="4ade80"] { background: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important; }
        span[style*="f87171"] { background: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #fca5a5 !important; }
        span[style*="E8B14F"], span[style*="e8b14f"] { background: #fef3c7 !important; color: #92400e !important; border: 1px solid #fcd34d !important; }

        /* ── Timeline ── */
        .max-h-\\[640px\\] { max-height: none !important; overflow: visible !important; }
        .flex.gap-4.items-start { page-break-inside: avoid; }
        .w-8.h-8 { width: 22px !important; height: 22px !important; border-radius: 50% !important; }
        .w-px { background: #e0e0ee !important; }

        /* ── Purchases table ── */
        table { width: 100% !important; border-collapse: collapse !important; font-size: 8pt !important; }
        thead tr { background: #f8f8fd !important; border-bottom: 2px solid #e8e8f0 !important; }
        th { color: #888 !important; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; padding: 5px 6px !important; }
        td { color: #1a1a2e !important; padding: 4px 6px !important; border-bottom: 1px solid #f0f0f8 !important; }
        tr:nth-child(even) td { background: #fafafe !important; }

        /* ── Tags ── */
        .flex.flex-wrap.gap-1\\.5 span {
          background: #fef3c7 !important; color: #92400e !important;
          border: 1px solid #fcd34d !important; border-radius: 4px !important;
          font-size: 7pt !important;
        }

        /* ── Footer ── */
        main::after {
          content: 'RadExperts · Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}';
          display: block; margin-top: 20px; padding-top: 8px;
          border-top: 1px solid #e8e8f0;
          font-size: 7pt; color: #aaa; text-align: right;
        }

        /* ── Hide attachment upload section ── */
        div[style*="167,139,250"] { display: none !important; }

        /* ── Grid layout → stack for print ── */
        .xl\\:grid-cols-3 { display: block !important; }
        .xl\\:col-span-2 { margin-bottom: 12px; }
      }
    `;
    document.head.appendChild(s);
    setTimeout(() => {
      window.print();
      document.head.removeChild(s);
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 2500);
    }, 400);
  };

  // Build timeline
  const timeline: TimelineEvent[] = [];
  if (data) {
    const APPROVED = new Set(['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED']);
    (data.purchases || []).forEach((p: any) => {
      const ok = APPROVED.has((p.status||'').toUpperCase());
      timeline.push({ date: p.date, type: 'purchase', title: p.product || 'Compra', subtitle: `${RF(p.grossValue, p.currency)} · ${p.paymentType || 'Pagamento'} · ${p.status}`, color: ok ? '#4ade80' : '#f87171', icon: 'shopping_cart' });
    });
    if (data.ac?.created)          timeline.push({ date: data.ac.created,      type: 'ac',       title: 'Entrou no ActiveCampaign',           subtitle: data.ac.email, color: '#38bdf8', icon: 'person_add' });
    (data.ac?.tags || []).forEach((t: any) => t.created && timeline.push({ date: t.created, type: 'tag', title: `Tag: ${t.tagName}`, color: GOLD, icon: 'label' }));
    (data.ac?.lists || []).forEach((l: any) => l.created && timeline.push({ date: l.created, type: 'list', title: `Lista: ${l.name}`, subtitle: l.status === '1' ? 'Inscrito' : 'Cancelado', color: l.status === '1' ? '#4ade80' : '#f87171', icon: 'group' }));
    (data.ac?.automations || []).forEach((a: any) => a.entered && timeline.push({ date: a.entered, type: 'auto', title: `Automação: ${a.name}`, subtitle: a.completed ? 'Concluída' : 'Em andamento', color: '#818cf8', icon: 'alt_route' }));
    (data.ac?.deals || []).forEach((d: any) => d.created && timeline.push({ date: d.created, type: 'deal', title: `Deal: ${d.title || 'Sem título'}`, color: '#fb923c', icon: 'handshake' }));
    timeline.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }

  const ac        = data?.ac;
  const displayName = data?.name || data?.email || '';
  const showEmail   = data?.name && data.email !== data.name;
  const approvedCount = (data?.purchases || []).filter((p: any) =>
    ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'].includes((p.status||'').toUpperCase())
  ).length;

  return (
    <LoginWrapper>
      <div className="min-h-screen pb-24">
        <Navbar />
        <div className="h-[80px]" />
        <main className="px-3 sm:px-6 max-w-[1400px] mx-auto pt-4 sm:pt-10">

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-8 no-print">
            <button onClick={() => router.back()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>Voltar
            </button>
            {!loading && data && (
              <button
                onClick={handlePDF}
                disabled={pdfState !== 'idle'}
                className="no-print flex items-center gap-2.5 relative overflow-hidden"
                style={{
                  padding: '10px 22px',
                  borderRadius: 14,
                  fontWeight: 900,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  cursor: pdfState !== 'idle' ? 'default' : 'pointer',
                  border: `1.5px solid ${
                    pdfState === 'done' ? 'rgba(74,222,128,0.5)' :
                    pdfState === 'printing' ? 'rgba(232,177,79,0.25)' :
                    'rgba(232,177,79,0.4)'
                  }`,
                  background: pdfState === 'done'
                    ? 'linear-gradient(135deg, rgba(74,222,128,0.15) 0%, rgba(16,185,129,0.1) 100%)'
                    : 'linear-gradient(135deg, rgba(232,177,79,0.14) 0%, rgba(200,140,30,0.08) 100%)',
                  color: pdfState === 'done' ? '#4ade80' : GOLD,
                  boxShadow: pdfState === 'done'
                    ? '0 0 18px rgba(74,222,128,0.18)'
                    : '0 0 18px rgba(232,177,79,0.1)',
                  transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
                  minWidth: 148,
                  justifyContent: 'center',
                }}
                onMouseEnter={e => { if (pdfState === 'idle') (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 28px rgba(232,177,79,0.28)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = pdfState === 'done' ? '0 0 18px rgba(74,222,128,0.18)' : '0 0 18px rgba(232,177,79,0.1)'; }}
              >
                {/* Shimmer overlay */}
                {pdfState === 'idle' && (
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: 13,
                    background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.08) 50%, transparent 65%)',
                    backgroundSize: '250% 100%',
                    animation: 'pdfShimmer 2.8s ease-in-out infinite',
                    pointerEvents: 'none',
                  }} />
                )}
                {/* Icon */}
                {pdfState === 'printing' ? (
                  <span style={{
                    width: 17, height: 17, borderRadius: '50%',
                    border: '2px solid rgba(232,177,79,0.3)',
                    borderTopColor: GOLD,
                    display: 'inline-block',
                    animation: 'spin 0.75s linear infinite',
                    flexShrink: 0,
                  }} />
                ) : pdfState === 'done' ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check_circle</span>
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>picture_as_pdf</span>
                )}
                {pdfState === 'printing' ? 'Gerando...' : pdfState === 'done' ? 'Gerado!' : 'Salvar PDF'}
                <style>{`
                  @keyframes pdfShimmer { 0%,100%{background-position:100% 0} 50%{background-position:0% 0} }
                  @keyframes spin { to{transform:rotate(360deg)} }
                `}</style>
              </button>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-40 gap-6">
              <div className="w-14 h-14 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
              <div className="text-center">
                <p className="font-black text-white text-base mb-1">Montando o dossiê…</p>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: SILVER }}>
                  Buscando dados Hotmart + ActiveCampaign
                </p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="material-symbols-outlined text-3xl text-red-400 block mb-2">error</span>
              <p className="text-red-400 font-black text-sm">{error}</p>
            </div>
          )}

          {!loading && data && !data.error && (
            <div className="space-y-6">

              {/* ── HERO ──────────────────────────────────────────────────── */}
              <div style={card} className="p-8 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(232,177,79,0.06) 0%, transparent 60%)', borderRadius: 24 }} />
                <div className="relative z-10 flex flex-col md:flex-row items-start gap-6">
                  <InitialsAvatar name={displayName} email={data.email} />
                  <div className="flex-1">
                    <h1 className="font-headline font-black text-3xl md:text-4xl text-white tracking-tight leading-none mb-1">
                      {displayName}
                    </h1>
                    {/* Show email as subtitle only if it's different from displayName */}
                    {showEmail && (
                      <p className="text-sm font-bold mb-4" style={{ color: SILVER }}>{data.email}</p>
                    )}
                    {/* If name = email (no name found), show a note */}
                    {!data?.name && (
                      <p className="text-xs font-bold mb-3" style={{ color: 'rgba(251,146,60,0.8)' }}>
                        ⚠ Nome não encontrado no ActiveCampaign
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {data.phone && (
                        <span className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', color: SILVER }}>
                          <span className="material-symbols-outlined text-[14px]">phone</span>{data.phone}
                        </span>
                      )}
                      {ac?.score != null && (
                        <span className="flex items-center gap-1 text-[11px] font-black px-3 py-1.5 rounded-xl" style={{ background: 'rgba(232,177,79,0.1)', border: `1px solid rgba(232,177,79,0.3)`, color: GOLD }}>
                          <span className="material-symbols-outlined text-[14px]">star</span>Score AC: {ac.score}
                        </span>
                      )}
                      {ac && (
                        <span className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
                          AC #{ac.id}
                        </span>
                      )}
                    </div>
                    {ac?.created && (
                      <p className="text-[10px] font-bold mt-3" style={{ color: SILVER }}>
                        Entrou no AC: {DT(ac.created)}
                      </p>
                    )}
                  </div>
                  {/* KPIs */}
                  <div className="grid grid-cols-3 gap-3 flex-shrink-0 w-full md:w-auto">
                    {/* LTV card — special: shows breakdown for mixed currencies */}
                    <div className="text-center rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="material-symbols-outlined text-[20px] block mb-1" style={{ color: '#4ade80' }}>trending_up</span>
                      <p className="font-black text-lg leading-none" style={{ color: '#4ade80' }}>
                        {R(data.ltv || 0)}
                      </p>
                      {/* Extra currencies when no BRL conversion was available */}
                      {data.ltvByCurrency && Object.entries(data.ltvByCurrency as Record<string, number>)
                        .filter(([cur, val]) => cur !== 'BRL' && val > 0)
                        .map(([cur, val]) => (
                          <p key={cur} className="text-[9px] font-black mt-0.5" style={{ color: '#86efac' }}>
                            + {cur} {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        ))
                      }
                      <p className="text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>LTV Total</p>
                    </div>
                    {[
                      { label: 'Compras OK', value: String(approvedCount), color: GOLD, icon: 'shopping_cart' },
                      { label: 'Produtos', value: String(data.uniqueProducts?.length || 0), color: '#818cf8', icon: 'school' },
                    ].map(k => (
                      <div key={k.label} className="text-center rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span className="material-symbols-outlined text-[20px] block mb-1" style={{ color: k.color }}>{k.icon}</span>
                        <p className="font-black text-lg leading-none" style={{ color: k.color }}>{k.value}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: SILVER }}>{k.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── GRID: Timeline + Lateral ───────────────────────────── */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Timeline (2/3) */}
                <div className="xl:col-span-2" style={card}>
                  <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <span className="material-symbols-outlined text-sm">timeline</span>Jornada Completa
                      <span className="ml-auto text-[9px]" style={{ color: SILVER }}>{timeline.length} eventos</span>
                    </p>
                  </div>
                  <div className="p-6 max-h-[640px] overflow-y-auto space-y-1">
                    {timeline.length === 0 ? (
                      <p className="text-center py-12 text-[12px]" style={{ color: SILVER }}>Nenhum evento encontrado</p>
                    ) : timeline.map((ev, i) => (
                      <div key={i} className="flex gap-4 items-start group">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: `${ev.color}20`, border: `1px solid ${ev.color}50` }}>
                            <span className="material-symbols-outlined text-[14px]" style={{ color: ev.color }}>{ev.icon}</span>
                          </div>
                          {i < timeline.length - 1 && <div className="w-px h-4 mt-1" style={{ background: 'rgba(255,255,255,0.06)' }} />}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p className="font-black text-white text-sm leading-tight flex-1">{ev.title}</p>
                            <span className="text-[11px] font-bold flex-shrink-0" style={{ color: SILVER }}>{DT(ev.date)}</span>
                          </div>
                          {ev.subtitle && <p className="text-xs mt-0.5 font-medium" style={{ color: SILVER }}>{ev.subtitle}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lateral cards (1/3) */}
                <div className="flex flex-col gap-4">

                  {/* ── Buyer Persona ── */}
                  {data.buyerPersona && Object.values(data.buyerPersona).some(v => v != null) && (() => {
                    const bp = data.buyerPersona;
                    const rows = [
                      { label: 'Vendedor',         value: bp.vendedor },
                      { label: 'CPF',              value: bp.document },
                      { label: 'Telefone BP',      value: bp.phone },
                      { label: 'Pagamento',        value: bp.pagamento },
                      { label: 'Modelo',           value: bp.modelo },
                      { label: 'Valor',            value: bp.valor    != null ? R(bp.valor)   : null },
                      { label: 'Parcela',          value: bp.parcela  != null ? R(bp.parcela) : null },
                      { label: '1ª Parcela',       value: bp.primeira_parcela  ? D(bp.primeira_parcela)  : null },
                      { label: 'Últ. Pagamento',   value: bp.ultimo_pagamento  ? D(bp.ultimo_pagamento)  : null },
                      { label: 'Próx. Pagamento',  value: bp.proximo_pagamento ? D(bp.proximo_pagamento) : null },
                    ].filter(r => r.value);
                    return (
                      <div style={{ ...card, border: '1px solid rgba(232,177,79,0.2)' }} className="p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: GOLD }}>
                          <span className="material-symbols-outlined text-sm">manage_accounts</span>
                          Buyer Persona
                          {bp.em_dia === 'SIM' && (
                            <span className="ml-auto text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>✓ Em dia</span>
                          )}
                          {bp.em_dia && bp.em_dia !== 'SIM' && (
                            <span className="ml-auto text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>✗ {bp.em_dia}</span>
                          )}
                        </p>
                        <div className="space-y-2.5">
                          {rows.map(row => (
                            <div key={row.label} className="flex justify-between gap-2 items-baseline">
                              <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: SILVER }}>{row.label}</span>
                              <span className="text-[11px] font-black text-white text-right break-all">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* AC personal data */}
                  {ac && (
                    <div style={card} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: '#38bdf8' }}>
                        <span className="material-symbols-outlined text-sm">person</span>ActiveCampaign
                      </p>
                      <div className="space-y-2.5">
                        {[
                          { label: 'Nome',      value: `${ac.firstName || ''} ${ac.lastName || ''}`.trim() || '—' },
                          { label: 'Email',     value: ac.email || '—' },
                          { label: 'Telefone',  value: ac.phone || '—' },
                          { label: 'Desde',     value: D(ac.created) },
                        ].map(row => (
                          <div key={row.label} className="flex justify-between gap-2 items-baseline">
                            <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: SILVER }}>{row.label}</span>
                            <span className="text-[11px] font-black text-white text-right break-all">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {ac?.tags?.length > 0 && (
                    <div style={card} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: GOLD }}>
                        <span className="material-symbols-outlined text-sm">label</span>Tags ({ac.tags.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ac.tags.map((t: any, i: number) => (
                          <div key={i} className="group relative">
                            <span className="px-2 py-1 rounded-lg text-[10px] font-black cursor-default"
                              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.25)', color: GOLD }}>
                              {t.tagName}
                            </span>
                            {t.created && (
                              <span className="absolute -top-7 left-0 whitespace-nowrap text-[9px] font-bold px-2 py-0.5 rounded-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: '#0d1f33', border: '1px solid rgba(255,255,255,0.1)', color: SILVER }}>
                                {D(t.created)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lists */}
                  {ac?.lists?.length > 0 && (
                    <div style={card} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: '#818cf8' }}>
                        <span className="material-symbols-outlined text-sm">group</span>Listas AC
                      </p>
                      <div className="space-y-2">
                        {ac.lists.map((l: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-white leading-tight">{l.name}</span>
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-lg flex-shrink-0"
                              style={l.status === '1' ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80' } : { background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                              {l.status === '1' ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Automations */}
                  {ac?.automations?.length > 0 && (
                    <div style={card} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: '#818cf8' }}>
                        <span className="material-symbols-outlined text-sm">alt_route</span>Automações ({ac.automations.length})
                      </p>
                      <div className="space-y-2">
                        {ac.automations.map((a: any, i: number) => (
                          <div key={i} className="rounded-xl p-3" style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.12)' }}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-black text-white text-[11px] leading-tight">{a.name}</p>
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0"
                                style={a.completed ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80' } : { background: 'rgba(232,177,79,0.1)', color: GOLD }}>
                                {a.completed ? 'OK' : 'Ativo'}
                              </span>
                            </div>
                            <p className="text-[9px] mt-0.5" style={{ color: SILVER }}>{D(a.entered)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Produtos */}
                  {(data.uniqueProducts || []).length > 0 && (
                    <div style={card} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: GOLD }}>
                        <span className="material-symbols-outlined text-sm">school</span>Produtos
                      </p>
                      <div className="space-y-3">
                        {data.uniqueProducts.map((prod: string, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5" style={{ color: GOLD }}>menu_book</span>
                            <p className="text-sm font-black text-white leading-tight">{prod}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Arquivos Anexos ── */}
                  <div style={{ ...card, border: '1px solid rgba(167,139,250,0.2)' }} className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: '#a78bfa' }}>
                      <span className="material-symbols-outlined text-sm">attach_file</span>
                      Arquivos Anexos
                      <span className="ml-auto text-[9px]" style={{ color: SILVER }}>{attachments.length}</span>
                    </p>
                    <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      className="flex items-center justify-center gap-2 w-full mb-3 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      style={{ background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.28)',
                        color: '#a78bfa', cursor: 'pointer' }}>
                      <span className="material-symbols-outlined text-sm">{uploading ? 'progress_activity' : 'upload'}</span>
                      {uploading ? 'Enviando...' : 'Adicionar Arquivo'}
                    </button>
                    {uploadErr && <p className="text-[10px] mb-2" style={{ color: '#f87171' }}>{uploadErr}</p>}
                    {attachments.length === 0 && !uploading ? (
                      <p className="text-[11px] text-center py-4" style={{ color: SILVER }}>Nenhum arquivo anexado</p>
                    ) : (
                      <div className="space-y-2">
                        {attachments.map((a: any) => (
                          <div key={a.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                            style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
                            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14, color: '#a78bfa' }}>
                              {a.mimetype === 'application/pdf' ? 'picture_as_pdf' : 'image'}
                            </span>
                            <a href={`/api/alunos/attachments?id=${a.id}`} target="_blank" rel="noopener noreferrer"
                              className="flex-1 text-[10px] font-bold truncate"
                              style={{ color: '#a78bfa', textDecoration: 'none' }}>
                              {a.filename}
                            </a>
                            <span className="text-[9px] flex-shrink-0" style={{ color: SILVER }}>
                              {(a.size_bytes / 1024).toFixed(0)}KB
                            </span>
                            <button onClick={() => handleDeleteAttachment(a.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#f87171' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Histórico completo de compras ─────────────────────── */}
              <div style={{ ...card, padding: 0 }}>
                <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                    <span className="material-symbols-outlined text-sm">receipt_long</span>
                    Histórico Hotmart · {data.purchases?.length || 0} transações · Últimos 3 anos
                  </p>
                </div>
                {(data.purchases || []).length === 0 ? (
                  <div className="py-16 text-center">
                    <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: SILVER }}>receipt</span>
                    <p className="text-[12px] font-bold" style={{ color: SILVER }}>Nenhuma compra encontrada nos últimos 3 anos</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          {['Data','Produto','Moeda','Bruto','Líquido BRL','Pagamento','Status','Parcelamento','Tracking'].map(h => (
                            <th key={h} className="py-3 px-4 text-left text-[9px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: SILVER }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(data.purchases || []).map((p: any, i: number) => {
                          const ok = ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED'].includes((p.status||'').toUpperCase());
                          const netBRL = p.netBRL ?? p.convertedBRL ?? (p.currency === 'BRL' ? (p.netValue ?? p.grossValue) : null);
                          const hasTracking = p.utmSource || p.src || p.sck || p.utmCampaign;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td className="py-3 px-4 text-[10px] font-bold text-white whitespace-nowrap">{DT(p.date)}</td>
                              <td className="py-3 px-4 text-[11px] font-black text-white max-w-[200px]"><span className="block leading-tight">{p.product}</span></td>
                              <td className="py-3 px-4 text-[10px] font-black" style={{ color: SILVER }}>{p.currency}</td>
                              <td className="py-3 px-4 text-[11px] font-black text-white whitespace-nowrap">{RF(p.grossValue, p.currency)}</td>
                              <td className="py-3 px-4 text-[11px] font-black whitespace-nowrap" style={{ color: ok ? '#4ade80' : '#f87171' }}>{netBRL != null ? R(netBRL) : '—'}</td>
                              <td className="py-3 px-4 text-[10px] font-bold" style={{ color: SILVER }}>{p.paymentType || '—'}</td>
                              <td className="py-3 px-4"><StatusBadge status={p.status} /></td>
                              <td className="py-3 px-4 text-[10px]" style={{ color: SILVER }}>
                                {p.isSubscription ? `Sub · C${p.recurrencyNum||'?'}` : p.installments > 1 ? `${p.installments}x` : 'À vista'}
                              </td>
                              <td className="py-3 px-4">
                                {hasTracking ? (
                                  <div className="text-[9px] font-bold space-y-0.5" style={{ color: SILVER }}>
                                    {p.src         && <div>src: <span className="text-white">{p.src}</span></div>}
                                    {p.sck         && <div>sck: <span className="text-white">{p.sck}</span></div>}
                                    {p.utmSource   && <div>src: <span className="text-white">{p.utmSource}</span></div>}
                                    {p.utmMedium   && <div>md: <span className="text-white">{p.utmMedium}</span></div>}
                                    {p.utmCampaign && <div>cmp: <span className="text-white">{p.utmCampaign}</span></div>}
                                  </div>
                                ) : <span className="text-[10px]" style={{ color: SILVER }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {!loading && data?.error && (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-red-400 font-black">{data.error}</p>
            </div>
          )}
        </main>
      </div>
    </LoginWrapper>
  );
}
