'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '@/app/lib/context';
import { useDashboardData } from '@/app/lib/hooks';
import { R, RF, N, D } from '@/app/lib/utils';
import { slugify } from '@/app/lib/slug';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useRouter } from 'next/navigation';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const GREEN  = '#4ade80';
const TEAL   = '#38bdf8';

function emailToId(email: string): string {
  return btoa(email.toLowerCase().trim())
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const glossy: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 24px 48px -12px rgba(0,0,0,0.5)',
  borderRadius: 24,
  position: 'relative',
  overflow: 'hidden',
};

function PaymentBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  let label = method || '—'; let bg = 'rgba(255,255,255,0.08)'; let color = SILVER;
  if (m.includes('CREDIT') || m.includes('CARD')) { label = 'Cartão'; bg = 'rgba(56,189,248,0.12)'; color = TEAL; }
  else if (m.includes('PIX')) { label = 'Pix'; bg = 'rgba(34,197,94,0.12)'; color = GREEN; }
  else if (m.includes('BOLETO') || m.includes('BILLET')) { label = 'Boleto'; bg = 'rgba(232,177,79,0.12)'; color = GOLD; }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
      style={{ background: bg, border: `1px solid ${color}30`, color }}>{label}</span>
  );
}

function OriginBadge({ origin }: { origin: 'hotmart' | 'manual' }) {
  return origin === 'manual'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider" style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}>Manual</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider" style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.3)', color: GOLD }}>Hotmart</span>;
}

type InstallmentDate = { due_ms: number; paid: boolean; paid_ms: number | null };
const PAY_TYPES = [
  { key: 'PIX',         label: 'PIX',          icon: 'bolt',         color: TEAL   },
  { key: 'PIX_CARTAO',  label: 'PIX + Cartão',  icon: 'credit_card',  color: '#a78bfa' },
  { key: 'CREDIT_CARD', label: 'Cartão',         icon: 'credit_score', color: GOLD   },
  { key: 'PIX_MENSAL',  label: 'PIX Mensal',     icon: 'repeat',       color: GREEN  },
];
const CURRENCIES = ['BRL','USD','ARS','EUR','GBP','COP','MXN','PEN','CLP','BOB','PYG','UYU'];

// ── Add Manual Sale Modal ───────────────────────────────────────────────────
function AddManualSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: (s: any) => void }) {
  const [courses, setCourses]     = useState<string[]>([]);
  const [course,  setCourse]      = useState('');
  const [name,    setName]        = useState('');
  const [email,   setEmail]       = useState('');
  const [phone,   setPhone]       = useState('');
  const [payType, setPayType]     = useState('PIX');
  const [currency, setCurrency]   = useState('BRL');
  const [totalAmt, setTotalAmt]   = useState('');
  const [downPay,  setDownPay]    = useState('0');
  const [insts,    setInsts]      = useState(1);
  const [entryDate,setEntryDate]  = useState(() => new Date().toISOString().slice(0,10));
  const [notes,   setNotes]       = useState('');
  const [instDates,setInstDates]  = useState<InstallmentDate[]>([]);
  const [saving,  setSaving]      = useState(false);
  const [error,   setError]       = useState('');

  const isPix   = payType === 'PIX';
  const instAmt = (!isPix && insts > 0 && Number(totalAmt) > 0)
    ? ((Number(totalAmt) - Number(downPay || 0)) / insts) : 0;

  useEffect(() => {
    fetch('/api/cursos').then(r => r.json()).then(d => {
      const names: string[] = (d.courses || []).map((c: any) => c.name).sort();
      setCourses(names);
      if (names.length > 0) setCourse(names[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isPix) { setInstDates([]); return; }
    const entry = entryDate ? new Date(entryDate).getTime() : Date.now();
    setInstDates(() => {
      const next: InstallmentDate[] = [];
      for (let i = 0; i < insts; i++) {
        next.push({ due_ms: entry + (i + 1) * 30 * 86400000, paid: false, paid_ms: null });
      }
      return next;
    });
  }, [insts, isPix, entryDate]);

  const handleSave = async () => {
    if (!course) { setError('Selecione um curso'); return; }
    if (!name.trim() || !email.trim()) { setError('Nome e email são obrigatórios'); return; }
    if (!totalAmt || Number(totalAmt) <= 0) { setError('Informe o valor'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/alunos/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_name: course, name: name.trim(), email: email.trim().toLowerCase(),
          phone: phone.trim() || '', entry_date: new Date(entryDate).getTime(),
          payment_type: payType, currency, total_amount: Number(totalAmt),
          down_payment: Number(downPay) || 0, installments: isPix ? 1 : insts,
          installment_amount: isPix ? Number(totalAmt) : instAmt,
          installment_dates: instDates, notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      onSaved(data.student);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'white', outline: 'none', boxSizing: 'border-box',
  };
  const LabelBox = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: SILVER, marginBottom: 6 }}>{children}</label>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.9)', backdropFilter: 'blur(14px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 560, borderRadius: 24,
        background: 'linear-gradient(160deg, rgba(8,15,30,0.98) 0%, rgba(4,10,20,0.99) 100%)',
        border: '1px solid rgba(167,139,250,0.25)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(167,139,250,0.08)',
        padding: 32, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ color: '#a78bfa', fontSize: 20 }}>add_shopping_cart</span>
          </div>
          <div>
            <h3 style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: 0 }}>Adicionar Venda Manual</h3>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, marginTop: 2 }}>Registrar venda fora da Hotmart</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: SILVER, cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Curso */}
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 12 }}>Curso</p>
        <div style={{ marginBottom: 16 }}>
          <LabelBox>Selecionar Curso</LabelBox>
          <select value={course} onChange={e => setCourse(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {courses.length === 0 && <option value="">Carregando...</option>}
            {courses.map(c => <option key={c} value={c} style={{ background: NAVY }}>{c}</option>)}
          </select>
        </div>

        {/* Dados Pessoais */}
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: TEAL, marginBottom: 12, marginTop: 20 }}>Dados Pessoais</p>
        {[
          { label: 'Nome Completo *', val: name, set: setName, icon: 'person', ph: 'Nome do aluno' },
          { label: 'Email *', val: email, set: setEmail, icon: 'email', ph: 'email@exemplo.com' },
          { label: 'Telefone', val: phone, set: setPhone, icon: 'phone', ph: '(11) 99999-9999' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <LabelBox>{f.label}</LabelBox>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>{f.icon}</span>
              <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                style={{ ...inputStyle, paddingLeft: 34 }} />
            </div>
          </div>
        ))}

        {/* Pagamento */}
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: GOLD, marginBottom: 12, marginTop: 20 }}>Pagamento</p>

        {/* Data entrada */}
        <div style={{ marginBottom: 14 }}>
          <LabelBox>Data da Venda</LabelBox>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Pay type */}
        <div style={{ marginBottom: 14 }}>
          <LabelBox>Forma de Pagamento</LabelBox>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {PAY_TYPES.map(pt => (
              <button key={pt.key} type="button" onClick={() => setPayType(pt.key)} style={{
                padding: '10px 6px', borderRadius: 12, fontWeight: 900, fontSize: 10, cursor: 'pointer',
                background: payType === pt.key ? `${pt.color}18` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${payType === pt.key ? pt.color : 'rgba(255,255,255,0.1)'}`,
                color: payType === pt.key ? pt.color : SILVER, transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{pt.icon}</span>
                <span style={{ textAlign: 'center', lineHeight: 1.2 }}>{pt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Moeda + Valor */}
        <div style={{ display: 'grid', gridTemplateColumns: isPix ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <LabelBox>Moeda</LabelBox>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {CURRENCIES.map(c => <option key={c} value={c} style={{ background: NAVY }}>{c}</option>)}
            </select>
          </div>
          <div>
            <LabelBox>Valor Total</LabelBox>
            <input value={totalAmt} onChange={e => setTotalAmt(e.target.value)} placeholder="Ex: 2500" style={inputStyle} />
          </div>
          {!isPix && (
            <div>
              <LabelBox>Entrada</LabelBox>
              <input value={downPay} onChange={e => setDownPay(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          )}
        </div>

        {/* Parcelas */}
        {!isPix && (
          <div style={{ marginBottom: 14 }}>
            <LabelBox>Parcelas — <span style={{ color: GOLD }}>{insts}× de {currency === 'BRL' ? `R$ ${instAmt.toFixed(2)}` : `${instAmt.toFixed(2)} ${currency}`}</span></LabelBox>
            <input type="range" min={1} max={60} value={insts} onChange={e => setInsts(Number(e.target.value))} style={{ width: '100%', accentColor: GOLD }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: SILVER, marginTop: 4 }}>
              <span>1×</span><span>60×</span>
            </div>
          </div>
        )}

        {/* Observações */}
        <div style={{ marginBottom: 16 }}>
          <LabelBox>Observações</LabelBox>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações extras..." style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
        </div>

        {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 800, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 900, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, background: 'rgba(167,139,250,0.12)', border: '1.5px solid rgba(167,139,250,0.4)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{saving ? 'progress_activity' : 'save'}</span>
            {saving ? 'Salvando...' : 'Registrar Venda'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

export default function VendasPage() {
  const { dateFrom, dateTo } = useDashboard();
  const router = useRouter();
  const data = useDashboardData();

  const [selectedProductTags, setSelectedProductTags] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [clientSearch,  setClientSearch]  = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage]         = useState(1);
  const [originFilter, setOriginFilter] = useState<'all' | 'hotmart' | 'manual'>('all');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [showAddModal, setShowAddModal]  = useState(false);

  // Vendedor map: email.toLowerCase() → vendedor name
  const [vendedorMap,   setVendedorMap]   = useState<Record<string, string>>({});
  const [vendedorList,  setVendedorList]  = useState<string[]>([]);

  // Manual sales state
  const [manualSales, setManualSales]       = useState<any[]>([]);
  const [manualBRL,   setManualBRL]         = useState(0);
  const [manualLatam, setManualLatam]       = useState(0);
  const [manualCount, setManualCount]       = useState(0);
  const [manualLoading, setManualLoading]   = useState(false);

  const fromMs = useMemo(() => new Date(dateFrom).getTime(), [dateFrom]);
  const toMs   = useMemo(() => new Date(dateTo).getTime() + 86399999, [dateTo]);

  // Load manual sales whenever date changes
  const loadManualSales = useCallback(async () => {
    setManualLoading(true);
    try {
      const res = await fetch(`/api/vendas/manual?from=${fromMs}&to=${toMs}`);
      const d = await res.json();
      if (d.ok) {
        setManualSales(d.sales || []);
        setManualBRL(d.brlTotal || 0);
        setManualLatam(d.latamTotal || 0);
        setManualCount(d.count || 0);
      }
    } catch {}
    finally { setManualLoading(false); }
  }, [fromMs, toMs]);

  useEffect(() => { loadManualSales(); }, [loadManualSales]);

  // Load vendedor map once
  useEffect(() => {
    fetch('/api/alunos/vendedores').then(r => r.json()).then(d => {
      if (d.ok) { setVendedorMap(d.map || {}); setVendedorList(d.vendedores || []); }
    }).catch(() => {});
  }, []);

  // Hotmart calcs
  const productFiltered = useMemo(() =>
    (data.hotmartSales || []).filter((s: any) =>
      selectedProductTags.length === 0 || selectedProductTags.includes(s.product?.name)
    ), [data.hotmartSales, selectedProductTags]);

  const brlSales  = productFiltered.filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') === 'BRL');
  const intlSales = productFiltered.filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') !== 'BRL');

  const getBrlNet = (s: any): number => {
    const net = s.purchase?.producer_net;
    if (net != null) return net;
    return Math.max(0, (s.purchase?.price?.value ?? 0) - (s.purchase?.hotmart_fee?.total ?? 0));
  };
  const getIntlNetBRL = (s: any): number => {
    if (s.purchase?.producer_net_brl != null) return s.purchase.producer_net_brl;
    const pct = s.purchase?.hotmart_fee?.percentage ?? 0;
    return (s.purchase?.price?.converted_value || 0) * (1 - pct / 100);
  };

  const brlNetRevenue   = brlSales.reduce((acc: number, s: any) => acc + getBrlNet(s), 0);
  const brlGrossRevenue = brlSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.value ?? 0), 0);
  const brlHotmartFees  = brlSales.reduce((acc: number, s: any) => acc + (s.purchase?.hotmart_fee?.total ?? 0), 0);
  const brlCoProducerFees = brlSales.reduce((acc: number, s: any) => {
    const net = s.purchase?.producer_net; const gross = s.purchase?.price?.value ?? 0;
    const fee = s.purchase?.hotmart_fee?.total ?? 0;
    return acc + (net != null ? Math.max(0, gross - fee - net) : 0);
  }, 0);
  const intlNetBRL = intlSales.reduce((acc: number, s: any) => acc + getIntlNetBRL(s), 0);
  const intlGrossBRL = intlSales.reduce((acc: number, s: any) => acc + (s.purchase?.price?.converted_value || 0), 0);
  const intlHotmartFeesBRL = intlSales.reduce((acc: number, s: any) => {
    const feePct = s.purchase?.hotmart_fee?.percentage ?? 0;
    return acc + (s.purchase?.price?.converted_value || 0) * (feePct / 100);
  }, 0);
  const intlCoProducerFeesBRL = Math.max(0, intlGrossBRL - intlHotmartFeesBRL - intlNetBRL);

  // Combined totals
  const totalHotmart = brlNetRevenue + intlNetBRL;
  const totalManual  = manualBRL + manualLatam;
  const totalCombined = totalHotmart + totalManual;

  // Build combined sale rows for table
  const hotmartRows = useMemo(() =>
    productFiltered.map((s: any) => ({ ...s, _origin: 'hotmart' as const })),
    [productFiltered]);

  const manualRows = useMemo(() =>
    manualSales.map((s: any) => ({ ...s, _origin: 'manual' as const })),
    [manualSales]);

  const allRows = useMemo(() => {
    const combined = [...hotmartRows, ...manualRows];
    combined.sort((a, b) => {
      const aDate = a._origin === 'hotmart' ? new Date(a.purchase.order_date).getTime() : a.entry_date;
      const bDate = b._origin === 'hotmart' ? new Date(b.purchase.order_date).getTime() : b.entry_date;
      return bDate - aDate;
    });
    return combined;
  }, [hotmartRows, manualRows]);

  const originFiltered = useMemo(() => {
    if (originFilter === 'hotmart') return allRows.filter(r => r._origin === 'hotmart');
    if (originFilter === 'manual')  return allRows.filter(r => r._origin === 'manual');
    return allRows;
  }, [allRows, originFilter]);

  const vendorFiltered = useMemo(() => {
    if (!vendedorFilter) return originFiltered;
    return originFiltered.filter((s: any) => {
      const email = s._origin === 'hotmart' ? (s.buyer?.email || '').toLowerCase() : (s.email || '').toLowerCase();
      // Hotmart: lookup in vendedorMap; Manual: uses vendedor field from buyer_profiles join
      const v = s._origin === 'hotmart'
        ? (vendedorMap[email] || '')
        : (s.vendedor || vendedorMap[email] || '');
      return v.toLowerCase().includes(vendedorFilter.toLowerCase());
    });
  }, [originFiltered, vendedorFilter, vendedorMap]);

  const clientFiltered = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return vendorFiltered;
    return vendorFiltered.filter((s: any) => {
      const name  = s._origin === 'hotmart' ? (s.buyer?.name || '') : (s.name || '');
      const email = s._origin === 'hotmart' ? (s.buyer?.email || '') : (s.email || '');
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [originFiltered, clientSearch]);

  const totalPages  = Math.max(1, Math.ceil(clientFiltered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows   = clientFiltered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const resetPage   = () => setPage(1);

  // Products & intl currencies (Hotmart only)
  const uniqueProducts: string[] = useMemo(() => {
    const map: Record<string, number> = {};
    (data.hotmartSales || []).forEach((s: any) => {
      const name = s.product?.name; if (!name) return;
      const t = new Date(s.purchase?.order_date || 0).getTime();
      if (!map[name] || t > map[name]) map[name] = t;
    });
    return Object.entries(map).sort(([,a],[,b]) => b - a).map(([n]) => n);
  }, [data.hotmartSales]);

  const currentRevenueByCurrency: Record<string, number> = {};
  productFiltered.forEach((s: any) => {
    const cur = s.purchase?.price?.currency_code || 'BRL';
    currentRevenueByCurrency[cur] = (currentRevenueByCurrency[cur] || 0) + (s.purchase?.price?.value ?? 0);
  });

  const CURRENCY_TO_COUNTRY: Record<string, string> = {
    BRL:'BR',COP:'CO',BOB:'BO',MXN:'MX',ARS:'AR',CLP:'CL',PEN:'PE',UYU:'UY',PYG:'PY',
  };
  const getFlagImg = (iso: string, size = 18) => !iso ? null : (
    <img src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/flags/4x3/${iso.toLowerCase()}.svg`}
      width={size} height={Math.round(size * 0.75)} alt={iso}
      style={{ borderRadius: 3, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }} />
  );

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: '—', time: '' };
    const d = new Date(dateStr);
    return { date: d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}),
             time: d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) };
  };
  const cardBorder = 'rgba(255,255,255,0.08)';
  const pageRange = () => {
    const delta = 2; const range: number[] = [];
    for (let i = Math.max(1,currentPage-delta); i <= Math.min(totalPages,currentPage+delta); i++) range.push(i);
    return range;
  };

  return (
    <LoginWrapper>
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none',
        background:'linear-gradient(160deg,rgba(0,12,40,0.58) 0%,rgba(0,22,60,0.48) 100%)' }} />
      <div className="min-h-screen pb-20" style={{ position:'relative', zIndex:1 }}>
        <Navbar />
        <div className="h-[146px]" />
        <main className="px-3 sm:px-6 max-w-[1600px] mx-auto pt-6 sm:pt-10">

          {/* Header */}
          <div className="flex flex-wrap items-center gap-4 mb-6 sm:mb-8">
            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(167,139,250,0.12)', border:'1px solid rgba(167,139,250,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ color:'#a78bfa', fontSize:22 }}>point_of_sale</span>
            </div>
            <div className="w-px h-8 hidden sm:block" style={{ background:'rgba(255,255,255,0.12)' }} />
            <div>
              <h2 className="font-headline font-black text-2xl sm:text-3xl text-white leading-none">Gestão de Vendas</h2>
              <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color:SILVER }}>
                Período: {D(dateFrom)} → {D(dateTo)}
              </p>
            </div>
            {/* Add Manual Sale Button */}
            <button onClick={() => setShowAddModal(true)}
              className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ background:'rgba(167,139,250,0.12)', border:'1px solid rgba(167,139,250,0.3)', color:'#a78bfa' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(167,139,250,0.2)'; e.currentTarget.style.borderColor='rgba(167,139,250,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(167,139,250,0.12)'; e.currentTarget.style.borderColor='rgba(167,139,250,0.3)'; }}>
              <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
              Adicionar Venda Manual
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

            {/* Hotmart BRL + LATAM */}
            <div style={{ ...glossy, padding:'28px 32px' }} className="lg:col-span-2">
              <div className="absolute inset-0 pointer-events-none" style={{ background:'linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 40%)', borderRadius:24 }} />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined" style={{ color:GOLD, fontSize:20 }}>payments</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color:GOLD }}>Hotmart · Faturamento BRL</p>
                  </div>
                  <p className="font-headline font-black text-3xl sm:text-5xl text-white tracking-tighter leading-none mb-1">{R(brlNetRevenue)}</p>
                  <InfoTooltip title="Detalhamento BRL" triggerLabel="Ver breakdown" lines={[
                    { emoji:'🟡', label:'Bruto', value:R(brlGrossRevenue) },
                    ...(brlHotmartFees>0?[{emoji:'🔴',label:'Taxas Hotmart',value:`− ${R(brlHotmartFees)}`,color:'#f87171'}]:[]),
                    ...(brlCoProducerFees>0?[{emoji:'🟠',label:'Co-produtores',value:`− ${R(brlCoProducerFees)}`,color:'#fb923c'}]:[]),
                  ]} total={{ label:'Líquido', value:R(brlNetRevenue) }} />
                </div>
                <div className="hidden md:block w-px h-16" style={{ background:'rgba(255,255,255,0.1)' }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined" style={{ color:TEAL, fontSize:20 }}>currency_exchange</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color:TEAL }}>Hotmart · Internacional</p>
                  </div>
                  <p className="font-headline font-black text-4xl text-white tracking-tighter leading-none">{R(intlNetBRL)}</p>
                  <InfoTooltip title="Detalhamento Internacional" triggerLabel="Ver breakdown" lines={[
                    { emoji:'🟡', label:'Bruto', value:R(intlGrossBRL) },
                    ...(intlHotmartFeesBRL>0?[{emoji:'🔴',label:'Taxas',value:`− ${R(intlHotmartFeesBRL)}`,color:'#f87171'}]:[]),
                    ...(intlCoProducerFeesBRL>0.01?[{emoji:'🟠',label:'Co-produtores',value:`− ${R(intlCoProducerFeesBRL)}`,color:'#fb923c'}]:[]),
                  ]} total={{ label:'Líquido', value:R(intlNetBRL) }} />
                </div>
                <div className="flex flex-col items-end gap-0 min-w-[140px]" style={{ borderLeft:'1px solid rgba(255,255,255,0.08)', paddingLeft:28 }}>
                  <div className="flex items-center gap-2 mb-2 self-start">
                    <span className="material-symbols-outlined text-[18px]" style={{ color:GREEN }}>shopping_cart</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color:GREEN }}>Hotmart</p>
                  </div>
                  <p className="font-headline font-black leading-none self-start" style={{ fontSize:56, color:'white', lineHeight:1 }}>{N(brlSales.length)}</p>
                  <p className="text-[12px] font-black self-start" style={{ color:SILVER }}>BRL</p>
                  {intlSales.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 self-start px-2.5 py-1.5 rounded-lg" style={{ background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.2)' }}>
                      <span className="material-symbols-outlined text-[13px]" style={{ color:TEAL }}>public</span>
                      <p className="text-[11px] font-black" style={{ color:TEAL }}>+{intlSales.length} intl</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Vendas Manuais KPI */}
            <div style={{ ...glossy, padding:'24px 28px' }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background:'linear-gradient(180deg,rgba(167,139,250,0.06) 0%,transparent 50%)', borderRadius:24 }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined" style={{ color:'#a78bfa', fontSize:18 }}>receipt_long</span>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color:'#a78bfa' }}>Vendas Manuais</p>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:SILVER }}>BRL</p>
                    <p className="font-headline font-black text-2xl text-white">{manualLoading ? '...' : R(manualBRL)}</p>
                  </div>
                  {manualLatam > 0 && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:SILVER }}>LATAM (valor original)</p>
                      <p className="font-headline font-black text-xl" style={{ color:TEAL }}>{manualLoading ? '...' : R(manualLatam)}</p>
                    </div>
                  )}
                  <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:12 }}>
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Total combinado</p>
                    </div>
                    <p className="font-headline font-black text-3xl mt-1" style={{ color:GREEN }}>{R(totalCombined)}</p>
                    <p className="text-[9px] font-bold mt-1" style={{ color:SILVER }}>{manualCount} vendas manuais · {N(brlSales.length + intlSales.length)} Hotmart</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filtro por Produto */}
          {uniqueProducts.length > 0 && (
            <div className="rounded-[24px] p-6 mb-8 relative overflow-hidden"
              style={{ background:'linear-gradient(135deg,rgba(232,177,79,0.07) 0%,rgba(255,255,255,0.03) 60%,rgba(232,177,79,0.04) 100%)',
                border:'1px solid rgba(232,177,79,0.18)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
                boxShadow:'0 4px 32px rgba(0,0,0,0.25),inset 0 1px 0 rgba(232,177,79,0.12)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color:SILVER }}>
                <span className="material-symbols-outlined text-sm" style={{ color:GOLD }}>filter_alt</span>Filtrar por Produto
              </p>
              <div className="flex flex-wrap gap-2">
                {uniqueProducts.filter(p => p.toLowerCase().includes(productSearch.toLowerCase())).map(p => {
                  const isSelected = selectedProductTags.includes(p);
                  return (
                    <button key={p} onClick={() => { setSelectedProductTags(prev => isSelected ? prev.filter(t => t !== p) : [...prev, p]); resetPage(); }}
                      className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                      style={isSelected ? { background:GOLD, color:NAVY, border:`1px solid ${GOLD}` } : { background:'rgba(255,255,255,0.06)', border:`1px solid ${cardBorder}`, color:SILVER }}>
                      {p}
                    </button>
                  );
                })}
                {selectedProductTags.length > 0 && (
                  <button onClick={() => { setSelectedProductTags([]); resetPage(); }}
                    className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider"
                    style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444' }}>
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tabela combinada */}
          <div className="rounded-[28px] overflow-hidden mb-12" style={{ ...glossy, padding:0 }}>
            {/* Toolbar */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-3" style={{ borderBottom:`1px solid ${cardBorder}` }}>
              <div>
                <p className="font-black text-white text-base">Todas as Vendas</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color:SILVER }}>
                  {clientFiltered.length} transações no período
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Filtro vendedor */}
                {vendedorList.length > 0 && (
                  <select value={vendedorFilter} onChange={e => { setVendedorFilter(e.target.value); resetPage(); }}
                    className="py-2 px-3 rounded-xl text-[11px] font-black outline-none"
                    style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${vendedorFilter ? GREEN+'66' : cardBorder}`, color: vendedorFilter ? GREEN : SILVER, cursor:'pointer' }}>
                    <option value="" style={{ background:NAVY }}>Todos os Vendedores</option>
                    {vendedorList.map(v => <option key={v} value={v} style={{ background:NAVY }}>{v}</option>)}
                  </select>
                )}
                {/* Filtro origem */}
                <div className="flex items-center gap-1 rounded-xl overflow-hidden" style={{ border:`1px solid ${cardBorder}` }}>
                  {(['all','hotmart','manual'] as const).map(o => (
                    <button key={o} onClick={() => { setOriginFilter(o); resetPage(); }}
                      className="px-3 py-2 text-[11px] font-black transition-all"
                      style={originFilter === o ? { background:GOLD, color:NAVY } : { background:'transparent', color:SILVER }}>
                      {o === 'all' ? 'Todos' : o === 'hotmart' ? 'Hotmart' : 'Manual'}
                    </button>
                  ))}
                </div>
                {/* Busca */}
                <div className="relative">
                  <span className="material-symbols-outlined text-[16px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:SILVER }}>person_search</span>
                  <input type="text" placeholder="Buscar cliente..." value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); resetPage(); }}
                    className="pl-9 pr-8 py-2.5 rounded-xl text-[12px] font-bold outline-none"
                    style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${clientSearch?'rgba(232,177,79,0.4)':cardBorder}`, color:'white', width:200 }} />
                  {clientSearch && (
                    <button onClick={() => { setClientSearch(''); resetPage(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color:SILVER }}>
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  )}
                </div>
                {/* Itens por página */}
                <div className="flex items-center gap-1.5 rounded-xl overflow-hidden" style={{ border:`1px solid ${cardBorder}` }}>
                  {PAGE_SIZE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => { setPageSize(opt); resetPage(); }}
                      className="px-3 py-2 text-[11px] font-black transition-all"
                      style={pageSize === opt ? { background:GOLD, color:NAVY } : { background:'transparent', color:SILVER }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ tableLayout:'fixed', borderCollapse:'collapse' }}>
                <colgroup>
                  <col style={{ width:'110px' }} />
                  <col style={{ width:'90px' }} />
                  <col style={{ width:'160px' }} />
                  <col style={{ width:'140px' }} />
                  <col style={{ width:'120px' }} />
                  <col style={{ width:'260px' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${cardBorder}` }}>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Data</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Origem</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-right" style={{ color:SILVER }}>Faturamento</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Pagamento</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Vendedor</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Cliente</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest" style={{ color:SILVER }}>Curso</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((s: any, idx: number) => {
                    if (s._origin === 'hotmart') {
                      const dt = formatDateTime(s.purchase.order_date);
                      const paymentMethod = s.purchase?.payment?.type || s.purchase?.payment_type || '';
                      const installTotal  = s.purchase?.payment?.installments_number || 1;
                      const installCurrent = s.purchase?.recurrency_number || null;
                      const isSubscription = s.purchase?.is_subscription === true;
                      const grossValue = s.purchase?.price?.value ?? 0;
                      const currency   = s.purchase?.price?.currency_code || 'BRL';
                      const hotmartFee = s.purchase?.hotmart_fee?.total ?? 0;
                      const producerNet = s.purchase?.producer_net ?? s.purchase?.commission?.value ?? null;
                      const netValue   = producerNet !== null ? (producerNet as number) : Math.max(0, grossValue - hotmartFee);
                      const fmt = (v: number) => currency !== 'BRL' ? RF(v, currency) : R(v);
                      let installLabel = isSubscription ? (installCurrent ? `Ass. Ciclo ${installCurrent}` : 'Assinatura') : installTotal > 1 ? `${installTotal}× parc.` : 'À vista';
                      let installColor = isSubscription ? TEAL : installTotal > 1 ? '#818cf8' : '#86efac';
                      return (
                        <tr key={`h-${idx}`} style={{ background: idx%2===0?'transparent':'rgba(255,255,255,0.02)', borderBottom:`1px solid ${cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background='rgba(232,177,79,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background=idx%2===0?'transparent':'rgba(255,255,255,0.02)')}>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-white">{dt.date}</span>
                              <span className="text-[10px] font-bold mt-0.5" style={{ color:SILVER }}>{dt.time}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4"><OriginBadge origin="hotmart" /></td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-headline font-black text-xl" style={{ color:GREEN }}>{fmt(netValue)}</span>
                              {currency !== 'BRL' && <span className="text-[10px]" style={{ color:SILVER }}>≈ {R(s.purchase?.producer_net_brl ?? s.purchase?.price?.converted_value ?? 0)}</span>}
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background:`${installColor}18`, color:installColor }}>{installLabel}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4"><PaymentBadge method={paymentMethod} /></td>
                          <td className="py-3 px-4">
                            {(() => { const v = vendedorMap[(s.buyer?.email||'').toLowerCase()]; return v
                              ? <span className="text-[11px] font-black uppercase" style={{ color:GREEN }}>{v}</span>
                              : <span className="text-[10px]" style={{ color:'rgba(255,255,255,0.2)' }}>—</span>; })()
                            }
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <button onClick={() => router.push(`/alunos/${emailToId(s.buyer.email)}`)}
                                className="text-sm font-black text-white uppercase hover:underline text-left"
                                style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}
                                onMouseEnter={e => (e.currentTarget.style.color=GOLD)}
                                onMouseLeave={e => (e.currentTarget.style.color='#fff')}>
                                {s.buyer.name}
                              </button>
                              <span className="text-[10px] font-bold" style={{ color:SILVER }}>{s.buyer.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <button onClick={() => router.push(`/cursos/${slugify(s.product.name)}`)}
                              className="rounded-xl px-3 py-2 text-left flex items-center gap-2 transition-all group w-full"
                              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor=`${GOLD}55`; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; }}>
                              <span className="material-symbols-outlined text-[14px]" style={{ color:GOLD }}>school</span>
                              <p className="font-black text-[11px] text-white uppercase leading-snug flex-1 line-clamp-2">{s.product.name}</p>
                            </button>
                          </td>
                        </tr>
                      );
                    } else {
                      // Manual row
                      const d = new Date(s.entry_date);
                      const dateStr = d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
                      const cur = (s.currency || 'BRL').toUpperCase();
                      const amt = Number(s.total_amount) || 0;
                      return (
                        <tr key={`m-${s.id}`} style={{ background: idx%2===0?'transparent':'rgba(255,255,255,0.02)', borderBottom:`1px solid ${cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background='rgba(167,139,250,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background=idx%2===0?'transparent':'rgba(255,255,255,0.02)')}>
                          <td className="py-3 px-4">
                            <span className="text-sm font-black text-white">{dateStr}</span>
                          </td>
                          <td className="py-3 px-4"><OriginBadge origin="manual" /></td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-headline font-black text-xl" style={{ color:GREEN }}>
                                {cur === 'BRL' ? R(amt) : `${RF(amt, cur)}`}
                              </span>
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-md" style={{ background:'rgba(167,139,250,0.12)', color:'#a78bfa' }}>
                                {s.installments > 1 ? `${s.installments}× parc.` : 'À vista'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4"><PaymentBadge method={s.payment_type || 'PIX'} /></td>
                          <td className="py-3 px-4">
                            {(() => { const v = s.vendedor || vendedorMap[(s.email||'').toLowerCase()]; return v
                              ? <span className="text-[11px] font-black uppercase" style={{ color:GREEN }}>{v}</span>
                              : <span className="text-[10px]" style={{ color:'rgba(255,255,255,0.2)' }}>—</span>; })()
                            }
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-white uppercase">{s.name}</span>
                              <span className="text-[10px] font-bold" style={{ color:SILVER }}>{s.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <button onClick={() => router.push(`/cursos/${slugify(s.course_name)}`)}
                              className="rounded-xl px-3 py-2 text-left flex items-center gap-2 transition-all w-full"
                              style={{ background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.15)', cursor:'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(167,139,250,0.35)'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(167,139,250,0.15)'; }}>
                              <span className="material-symbols-outlined text-[14px]" style={{ color:'#a78bfa' }}>school</span>
                              <p className="font-black text-[11px] uppercase leading-snug flex-1 line-clamp-2" style={{ color:'#a78bfa' }}>{s.course_name}</p>
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  })}
                  {clientFiltered.length === 0 && (
                    <tr><td colSpan={6} className="py-16 text-center font-bold uppercase text-[11px] tracking-widest" style={{ color:SILVER }}>
                      {clientSearch ? `Nenhum cliente encontrado para "${clientSearch}"` : 'Nenhuma venda encontrada no período'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4" style={{ borderTop:`1px solid ${cardBorder}` }}>
                <p className="text-[11px] font-bold" style={{ color:SILVER }}>Página {currentPage} de {totalPages} · {clientFiltered.length} vendas</p>
                <div className="flex items-center gap-1">
                  {[{icon:'first_page',fn:()=>setPage(1),dis:currentPage===1},{icon:'chevron_left',fn:()=>setPage(p=>Math.max(1,p-1)),dis:currentPage===1}].map(b=>(
                    <button key={b.icon} onClick={b.fn} disabled={b.dis} className="w-8 h-8 rounded-lg flex items-center justify-center font-black transition-all disabled:opacity-30" style={{ background:'rgba(255,255,255,0.05)', color:SILVER }}>
                      <span className="material-symbols-outlined text-[16px]">{b.icon}</span>
                    </button>
                  ))}
                  {pageRange().map(p => (
                    <button key={p} onClick={() => setPage(p)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-black transition-all"
                      style={p===currentPage ? { background:GOLD, color:NAVY } : { background:'rgba(255,255,255,0.05)', color:SILVER }}>{p}</button>
                  ))}
                  {[{icon:'chevron_right',fn:()=>setPage(p=>Math.min(totalPages,p+1)),dis:currentPage===totalPages},{icon:'last_page',fn:()=>setPage(totalPages),dis:currentPage===totalPages}].map(b=>(
                    <button key={b.icon} onClick={b.fn} disabled={b.dis} className="w-8 h-8 rounded-lg flex items-center justify-center font-black transition-all disabled:opacity-30" style={{ background:'rgba(255,255,255,0.05)', color:SILVER }}>
                      <span className="material-symbols-outlined text-[16px]">{b.icon}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal */}
      {showAddModal && typeof window !== 'undefined' && (
        <AddManualSaleModal
          onClose={() => setShowAddModal(false)}
          onSaved={(student) => {
            setManualSales(prev => [{ ...student, _origin: 'manual' }, ...prev]);
            setManualBRL(prev => prev + ((student.currency || 'BRL') === 'BRL' ? Number(student.total_amount) : 0));
            setManualLatam(prev => prev + ((student.currency || 'BRL') !== 'BRL' ? Number(student.total_amount) : 0));
            setManualCount(prev => prev + 1);
            setShowAddModal(false);
          }}
        />
      )}
    </LoginWrapper>
  );
}
