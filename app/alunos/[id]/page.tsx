'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { Navbar } from '@/components/dashboard/navbar';
import { EditManualStudentModal, type ManualStudentFields } from '@/components/dashboard/edit-manual-student-modal';

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
  const [acTags,      setAcTags]      = useState<{ name: string; date: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadErr,   setUploadErr]   = useState('');
  const [editTarget,  setEditTarget]  = useState<ManualStudentFields | null>(null);
  const [quitando,    setQuitando]    = useState<Set<string>>(new Set());

  const handleQuitar = async (ms: any, di: number) => {
    const key = `${ms.id}-${di}`;
    setQuitando(prev => new Set(prev).add(key));
    try {
      await fetch('/api/alunos/manual/pay-installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:            ms.email,
          manualStudentId:  ms.id,
          installmentIndex: di,
        }),
      });
      // Silent reload — just refresh data without loading skeleton
      const res = await fetch(`/api/alunos/${id}`);
      const refreshed = await res.json();
      setData(refreshed);
    } catch {
      // non-fatal — UI stays as-is
    } finally {
      setQuitando(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

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

  // Load Active Campaign tags
  useEffect(() => {
    if (!data?.email) return;
    fetch(`/api/leads/contact-by-email?email=${encodeURIComponent(data.email)}`)
      .then(r => r.json())
      .then(d => setAcTags(d.tags || []))
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
  ).length + (data?.manualStudents?.length || 0);

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

                  {/* ── Buyer Persona / Manual Status ── */}
                  {data.buyerPersona && Object.values(data.buyerPersona).some(v => v != null) && (() => {
                    const bp  = data.buyerPersona;
                    const ms  = (data.manualStudents || [])[0]; // primary manual record

                    // ── Effective status: same hierarchy as cursos/page.tsx effectiveStatusFor ──
                    // Priority: installment_dates (ground truth) > bp_em_dia fallback
                    let effectiveStatus: 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO' = 'ADIMPLENTE';
                    const instDates: any[] = ms?.installment_dates || [];
                    if (instDates.length > 0) {
                      const allPaid = instDates.every((d: any) => d.paid);
                      if (allPaid) {
                        effectiveStatus = 'QUITADO';
                      } else {
                        const GRACE_15 = 15 * 24 * 60 * 60 * 1000;
                        const hasOverdue = instDates.some((d: any) => !d.paid && Number(d.due_ms) + GRACE_15 < Date.now());
                        if (hasOverdue) effectiveStatus = 'INADIMPLENTE';
                        // else stays ADIMPLENTE
                      }
                    } else if (bp.em_dia) {
                      // No installment_dates: fall back to bp_em_dia
                      const up = (bp.em_dia || '').toUpperCase().trim();
                      if (up === 'QUITADO') effectiveStatus = 'QUITADO';
                      else if (up === 'NÃO' || up === 'NAO' || up === 'INADIMPLENTE') effectiveStatus = 'INADIMPLENTE';
                      else if (up === 'SIM' || up === 'ADIMPLENTE') effectiveStatus = 'ADIMPLENTE';
                    }

                    const isOk   = effectiveStatus === 'ADIMPLENTE';
                    const isNok  = effectiveStatus === 'INADIMPLENTE';
                    const isQuit = effectiveStatus === 'QUITADO';

                    // Only show Modelo and Observações (notes from manual_students)
                    const rows = [
                      { label: 'Modelo',      value: bp.modelo },
                      { label: 'Observações', value: ms?.notes },
                    ].filter(r => r.value);

                    return (
                      <div style={{ ...card, border: '1px solid rgba(232,177,79,0.2)' }} className="p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: GOLD }}>
                          <span className="material-symbols-outlined text-sm">manage_accounts</span>
                          Status
                          {isOk   && <span className="text-[8px] font-black px-2 py-0.5 rounded-full ml-2" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>✓ Adimplente</span>}
                          {isNok  && <span className="text-[8px] font-black px-2 py-0.5 rounded-full ml-2" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>✗ Inadimplente</span>}
                          {isQuit && <span className="text-[8px] font-black px-2 py-0.5 rounded-full ml-2" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>✔ Quitado</span>}
                          {!isOk && !isNok && !isQuit && bp.em_dia && (
                            <span className="text-[8px] font-black px-2 py-0.5 rounded-full ml-2" style={{ background: 'rgba(255,255,255,0.08)', color: SILVER }}>· {bp.em_dia}</span>
                          )}
                          {/* Edit button — only when a manual_student record exists */}
                          {ms && (
                            <button
                              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all no-print"
                              style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD, cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.2)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,177,79,0.1)')}
                              onClick={() => setEditTarget({
                                manualId:            ms.id,
                                email:               data.email,
                                name:                ms.name || data.name || '',
                                phone:               ms.phone || data.phone || '',
                                payment_type:        ms.payment_type,
                                currency:            ms.currency,
                                total_amount:        ms.total_amount,
                                down_payment:        ms.down_payment,
                                installments:        ms.installments,
                                installment_amount:  ms.installment_amount,
                                installment_dates:   ms.installment_dates,
                                notes:               ms.notes,
                                entry_date:          ms.entry_date,
                                vendedor:            bp.vendedor,
                                bp_modelo:           bp.modelo,
                                bp_em_dia:           bp.em_dia || 'Adimplente',
                                bp_primeira_parcela:  bp.primeira_parcela  ? new Date(bp.primeira_parcela).getTime()  : null,
                                bp_ultimo_pagamento:  bp.ultimo_pagamento  ? new Date(bp.ultimo_pagamento).getTime()  : null,
                                bp_proximo_pagamento: bp.proximo_pagamento ? new Date(bp.proximo_pagamento).getTime() : null,
                              })}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                              Editar
                            </button>
                          )}
                        </p>
                        {rows.length > 0 && (
                          <div className="space-y-2.5">
                            {rows.map(row => (
                              <div key={row.label} className="flex justify-between gap-2 items-baseline">
                                <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: SILVER }}>{row.label}</span>
                                <span className="text-[11px] font-black text-white text-right break-all">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Pagamentos Manuais ── */}
                  {(data.manualStudents || []).filter((ms: any) => ms.payment_type && ms.total_amount > 0).length > 0 && (
                    <div style={{ ...card, border: '1px solid rgba(56,189,248,0.18)' }} className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: '#38bdf8' }}>
                        <span className="material-symbols-outlined text-sm">payments</span>
                        Pagamentos Manuais
                      </p>
                      {(data.manualStudents || []).filter((ms: any) => ms.total_amount > 0).map((ms: any, msi: number) => {
                        const dates: any[]  = ms.installment_dates || [];
                        const isPix         = ms.payment_type === 'PIX' || ms.payment_type === 'PIX_AVISTA';
                        const paidCount     = dates.filter((d: any) => d.paid).length;
                        const totalPaid     = isPix
                          ? (dates[0]?.paid ? Number(ms.total_amount) : 0)
                          : paidCount * Number(ms.installment_amount || 0);
                        const fmtA = (v: number) => RF(v, ms.currency || 'BRL');
                        const statusColor = paidCount === dates.length && dates.length > 0 ? '#4ade80' : '#38bdf8';

                        return (
                          <div key={ms.id || msi} className={msi > 0 ? 'mt-5 pt-5' : ''} style={msi > 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}>
                            {/* Course name */}
                            <p className="text-[9px] font-bold uppercase tracking-widest mb-2 truncate" style={{ color: SILVER }}>
                              {ms.course_name}
                            </p>
                            {/* Type + Total */}
                            <div className="flex justify-between items-baseline mb-1.5">
                              <span className="text-[10px] font-black" style={{ color: '#38bdf8' }}>
                                {isPix ? 'PIX à Vista' : `PIX Mensal · ${ms.installments}x`}
                              </span>
                              <span className="text-[12px] font-black text-white">{fmtA(Number(ms.total_amount))}</span>
                            </div>
                            {/* Paid progress */}
                            {!isPix && (
                              <div className="flex justify-between items-baseline mb-3">
                                <span className="text-[9px] font-bold uppercase" style={{ color: SILVER }}>
                                  {paidCount}/{dates.length} pagas
                                </span>
                                <span className="text-[11px] font-black" style={{ color: statusColor }}>{fmtA(totalPaid)}</span>
                              </div>
                            )}
                            {/* Progress bar */}
                            {!isPix && dates.length > 0 && (
                              <div className="w-full rounded-full mb-3" style={{ height: 4, background: 'rgba(255,255,255,0.07)' }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${(paidCount / dates.length) * 100}%`, background: statusColor }} />
                              </div>
                            )}
                            {/* Installment list */}
                            {!isPix && dates.length > 0 && (
                              <div className="space-y-1.5">
                                {dates.map((d: any, di: number) => {
                                  const key = `${ms.id}-${di}`;
                                  const isLoading = quitando.has(key);
                                  const due = new Date(Number(d.due_ms));
                                  return (
                                    <div key={di} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                                      style={{ background: d.paid ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${d.paid ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.06)'}` }}>
                                      <span className="material-symbols-outlined text-[13px] flex-shrink-0" style={{ color: d.paid ? '#4ade80' : SILVER }}>
                                        {d.paid ? 'check_circle' : 'radio_button_unchecked'}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[9px] font-black" style={{ color: d.paid ? '#4ade80' : 'white' }}>
                                          P{di + 1}
                                        </span>
                                        <span className="text-[9px] ml-1.5" style={{ color: SILVER }}>
                                          {due.toLocaleDateString('pt-BR')}
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-black flex-shrink-0" style={{ color: d.paid ? '#4ade80' : 'white' }}>
                                        {fmtA(Number(ms.installment_amount || 0))}
                                      </span>
                                      {!d.paid && (
                                        <button
                                          disabled={isLoading}
                                          onClick={() => handleQuitar(ms, di)}
                                          className="text-[8px] font-black px-1.5 py-0.5 rounded-lg flex-shrink-0 transition-all"
                                          style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: isLoading ? 'wait' : 'pointer' }}
                                        >
                                          {isLoading ? '…' : 'Quitar'}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* PIX à vista single row */}
                            {isPix && (
                              <div className="flex items-center gap-2 rounded-xl px-2.5 py-2"
                                style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.18)' }}>
                                <span className="material-symbols-outlined text-[14px]" style={{ color: '#4ade80' }}>check_circle</span>
                                <span className="text-[10px] font-black text-white flex-1">PIX Pago</span>
                                <span className="text-[11px] font-black" style={{ color: '#4ade80' }}>{fmtA(Number(ms.total_amount))}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

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

              {/* ── Active Campaign Tags ─────────────────────────────── */}
              {acTags.length > 0 && (
                <div style={{ ...card, padding: 0 }}>
                  <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: '#a78bfa' }}>
                      <span className="material-symbols-outlined text-sm">tag</span>
                      Tags Active Campaign · {acTags.length} interações
                    </p>
                  </div>
                  <div style={{ padding: '24px 28px' }}>
                    {/* Timeline */}
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0,
                        width: 1, background: 'rgba(167,139,250,0.15)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {acTags.map((tag, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                              background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 3, background: '#a78bfa' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 11, fontWeight: 900, color: '#fff',
                                letterSpacing: '0.03em' }}>{tag.name}</span>
                              {tag.date && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: SILVER,
                                  marginLeft: 10, letterSpacing: '0.08em' }}>
                                  {new Date(tag.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Compras Manuais ────────────────────────────────── */}
              {(() => {
                const msFiltered = (data.manualStudents || []).filter((ms: any) => Number(ms.total_amount) > 0);
                if (msFiltered.length === 0) return null;
                function ptLabel(pt: string) {
                  const p = (pt || '').toUpperCase();
                  if (p === 'PIX' || p === 'PIX_AVISTA') return 'PIX à Vista';
                  if (p === 'PIX_CARTAO')  return 'PIX + Cartão';
                  if (p === 'CREDIT_CARD') return 'Cartão de Crédito';
                  if (p === 'PIX_MENSAL')  return 'PIX Mensal';
                  return pt || 'PIX';
                }
                function msEffectiveStatus(ms: any): 'ADIMPLENTE' | 'INADIMPLENTE' | 'QUITADO' {
                  const dates: any[] = ms.installment_dates || [];
                  if (dates.length > 0) {
                    if (dates.every((d: any) => d.paid)) return 'QUITADO';
                    const GRACE = 15 * 24 * 60 * 60 * 1000;
                    if (dates.some((d: any) => !d.paid && Number(d.due_ms) + GRACE < Date.now())) return 'INADIMPLENTE';
                    return 'ADIMPLENTE';
                  }
                  const bp = data.buyerPersona;
                  const up = ((bp?.em_dia) || '').toUpperCase().trim();
                  if (up === 'QUITADO') return 'QUITADO';
                  if (up === 'NÃO' || up === 'NAO' || up === 'INADIMPLENTE') return 'INADIMPLENTE';
                  return 'ADIMPLENTE';
                }
                const GREEN_CARD = 'rgba(74,222,128,0.12)';
                const RED_CARD   = 'rgba(239,68,68,0.12)';
                const BLUE_CARD  = 'rgba(56,189,248,0.12)';
                return (
                  <div style={{ ...card, padding: 0 }}>
                    <div className="px-7 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        Compras · {msFiltered.length} {msFiltered.length === 1 ? 'registro' : 'registros'}
                        <span className="ml-auto text-[9px]" style={{ color: SILVER }}>
                          Total: {R(msFiltered.reduce((s: number, ms: any) => s + (Number(ms.total_amount) || 0), 0))}
                        </span>
                      </p>
                    </div>
                    <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      {msFiltered.map((ms: any, idx: number) => {
                        const st = msEffectiveStatus(ms);
                        const isOk   = st === 'ADIMPLENTE';
                        const isNok  = st === 'INADIMPLENTE';
                        const isQuit = st === 'QUITADO';
                        const stBg    = isOk ? GREEN_CARD : isQuit ? BLUE_CARD : RED_CARD;
                        const stColor = isOk ? '#4ade80' : isQuit ? '#38bdf8' : '#f87171';
                        const stLabel = isOk ? '● Adimplente' : isQuit ? '✔ Quitado' : '✗ Inadimplente';
                        const stBorder= isOk ? 'rgba(74,222,128,0.3)' : isQuit ? 'rgba(56,189,248,0.3)' : 'rgba(239,68,68,0.3)';

                        const ptRaw   = ms.payment_type || 'PIX';
                        const ptUp    = ptRaw.toUpperCase();
                        const hasDp   = (ms.down_payment || 0) > 0 && (ptUp === 'PIX_CARTAO' || ptUp === 'PIX_MENSAL');
                        const dates: any[] = ms.installment_dates || [];
                        const paidCount    = dates.filter((d: any) => d.paid).length;

                        // Filter CPF from notes
                        const obs = (ms.notes || '').split('\n')
                          .filter((l: string) => !l.trim().toUpperCase().startsWith('CPF:'))
                          .join('\n').trim();

                        return (
                          <div key={idx} className="px-7 py-5">
                            {/* Row 1: course + status badge + total */}
                            <div className="flex flex-wrap items-center gap-3 mb-3">
                              <span className="font-black text-white text-[13px] leading-tight flex-1">{ms.course_name || '—'}</span>
                              <span className="text-[9px] font-black px-2.5 py-1 rounded-full" style={{ background: stBg, color: stColor, border: `1px solid ${stBorder}` }}>{stLabel}</span>
                              <span className="font-black text-[14px]" style={{ color: '#4ade80' }}>{R(Number(ms.total_amount) || 0)}</span>
                            </div>

                            {/* Row 2: payment meta */}
                            <div className="flex flex-wrap gap-4 mb-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Forma</span>
                                <span className="text-[11px] font-black text-white">{ptLabel(ptRaw)}</span>
                              </div>
                              {ms.entry_date && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Entrada em</span>
                                  <span className="text-[11px] font-black text-white">{new Date(Number(ms.entry_date)).toLocaleDateString('pt-BR')}</span>
                                </div>
                              )}
                              {hasDp && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Entrada</span>
                                  <span className="text-[11px] font-black text-white">{R(Number(ms.down_payment))}</span>
                                </div>
                              )}
                              {ms.installments > 1 && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Parcelas</span>
                                  <span className="text-[11px] font-black text-white">{ms.installments}× {R(Number(ms.installment_amount))}</span>
                                </div>
                              )}
                              {dates.length > 0 && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Pagas</span>
                                  <span className="text-[11px] font-black" style={{ color: paidCount === dates.length ? '#4ade80' : GOLD }}>{paidCount}/{dates.length}</span>
                                </div>
                              )}
                              {data.buyerPersona?.modelo && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SILVER }}>Modelo</span>
                                  <span className="text-[11px] font-black text-white">{data.buyerPersona.modelo}</span>
                                </div>
                              )}
                            </div>

                            {/* Grid de parcelas */}
                            {dates.length > 0 && (
                              <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                                {dates.map((d: any, di: number) => {
                                  const now  = Date.now();
                                  const due  = Number(d.due_ms);
                                  const GRACE = 15 * 24 * 60 * 60 * 1000;
                                  const overdue   = !d.paid && due + GRACE < now;
                                  const upcoming  = !d.paid && due > now;
                                  const grace     = !d.paid && !overdue && !upcoming; // within 15d grace
                                  const bg      = d.paid ? 'rgba(74,222,128,0.08)' : overdue ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)';
                                  const border  = d.paid ? 'rgba(74,222,128,0.25)' : overdue ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)';
                                  const icon    = d.paid ? 'check_circle' : overdue ? 'error' : grace ? 'schedule' : 'pending';
                                  const iconClr = d.paid ? '#4ade80'     : overdue ? '#f87171' : GOLD;
                                  return (
                                    <div key={di} className="rounded-xl p-2.5" style={{ background: bg, border: `1px solid ${border}` }}>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <span className="material-symbols-outlined text-[13px]" style={{ color: iconClr }}>{icon}</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: iconClr }}>
                                          Parcela {di + 1}
                                        </span>
                                      </div>
                                      <p className="text-[10px] font-bold text-white">
                                        Venc: {due > 0 ? new Date(due).toLocaleDateString('pt-BR') : '—'}
                                      </p>
                                      {d.paid && d.paid_ms && (
                                        <p className="text-[9px] font-bold" style={{ color: '#4ade80' }}>
                                          ✓ {new Date(Number(d.paid_ms)).toLocaleDateString('pt-BR')}
                                        </p>
                                      )}
                                      {!d.paid && overdue && (
                                        <p className="text-[9px] font-bold" style={{ color: '#f87171' }}>
                                          {Math.floor((now - due) / 86_400_000)}d atraso
                                        </p>
                                      )}
                                      {/* ── Chip Quitar (parcelas em atraso) ── */}
                                      {!d.paid && overdue && (() => {
                                        const key = `${ms.id}-${di}`;
                                        const isQ = quitando.has(key);
                                        return (
                                          <button
                                            onClick={() => !isQ && handleQuitar(ms, di)}
                                            disabled={isQ}
                                            style={{
                                              marginTop: 6,
                                              display: 'flex', alignItems: 'center', gap: 4,
                                              fontSize: 11, fontWeight: 900, padding: '4px 10px',
                                              borderRadius: 20, cursor: isQ ? 'default' : 'pointer',
                                              border: `1px solid ${isQ ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.3)'}`,
                                              background: isQ ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.12)',
                                              color: '#4ade80',
                                              textTransform: 'uppercase', letterSpacing: '0.05em',
                                              transition: 'all 0.2s',
                                            }}
                                          >
                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                                              {isQ ? 'hourglass_empty' : 'check_circle'}
                                            </span>
                                            {isQ ? 'Salvando...' : 'Quitar'}
                                          </button>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Observações */}
                            {obs && (
                              <p className="text-[10px] font-medium leading-relaxed mt-1" style={{ color: SILVER }}>
                                <span className="font-black text-[9px] uppercase tracking-widest mr-2" style={{ color: SILVER }}>Obs:</span>{obs}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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

      {/* ── Edit Manual Student Modal ──────────────────────────────── */}
      {editTarget && (
        <EditManualStudentModal
          student={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            // Merge updated fields back into local data state
            setData((prev: any) => {
              if (!prev) return prev;
              // Update manualStudents[0]
              const ms = (prev.manualStudents || [])[0];
              const newMs = ms ? { ...ms, ...updated } : ms;
              const newManualStudents = newMs
                ? [newMs, ...(prev.manualStudents || []).slice(1)]
                : prev.manualStudents;

              // Update buyerPersona
              const bp = prev.buyerPersona || {};
              const newBp = {
                ...bp,
                vendedor:           updated.vendedor            ?? bp.vendedor,
                modelo:             updated.bp_modelo           ?? bp.modelo,
                pagamento:          updated.payment_type        ?? bp.pagamento,
                em_dia:             updated.bp_em_dia           ?? bp.em_dia,
                primeira_parcela:   updated.bp_primeira_parcela != null
                  ? new Date(updated.bp_primeira_parcela).toISOString()
                  : bp.primeira_parcela,
                ultimo_pagamento:   updated.bp_ultimo_pagamento != null
                  ? new Date(updated.bp_ultimo_pagamento).toISOString()
                  : bp.ultimo_pagamento,
                proximo_pagamento:  updated.bp_proximo_pagamento != null
                  ? new Date(updated.bp_proximo_pagamento).toISOString()
                  : bp.proximo_pagamento,
              };

              return { ...prev, manualStudents: newManualStudents, buyerPersona: newBp };
            });
          }}
        />
      )}
    </LoginWrapper>
  );
}
