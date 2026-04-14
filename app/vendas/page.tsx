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
import { EditManualStudentModal, type ManualStudentFields } from '@/components/dashboard/edit-manual-student-modal';

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

const CURRENCIES_PILLS = ['BRL','USD','ARS','COP','CLP','EUR','MXN','PEN'];
const VENDEDORES_LIST   = ['Nackson','Samuel','Alba','Pacheco','Ana'];

// ── Add Manual Sale Modal ───────────────────────────────────────────────────
function AddManualSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: (s: any) => void }) {
  type PayType = 'PIX_AVISTA' | 'PIX_CARTAO' | 'CREDIT_CARD' | 'PIX_MENSAL';
  const [courses, setCourses] = useState<string[]>([]);
  const [form, setForm] = useState({
    course_name:        '',
    name:               '',
    email:              '',
    phone:              '',
    cpf:                '',
    entry_date:         new Date().toISOString().slice(0, 10),
    first_payment_date: new Date().toISOString().slice(0, 10),
    payment_type:       'PIX_AVISTA' as PayType,
    currency:           'BRL',
    total_amount:       '',
    down_payment:       '',
    installments:       1,
    notes:              '',
    bp_vendedor:        '',
    bp_modelo:          '',
    bp_em_dia:          'Adimplente',
  });
  const [instDates, setInstDates] = useState<InstallmentDate[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch('/api/cursos').then(r => r.json()).then(d => {
      const names: string[] = (d.courses || []).map((c: any) => c.name).sort();
      setCourses(names);
      if (names.length > 0) setForm(f => ({ ...f, course_name: names[0] }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const needsDates = ['PIX_CARTAO', 'CREDIT_CARD', 'PIX_MENSAL'].includes(form.payment_type);
    if (!needsDates || form.installments < 1) { setInstDates([]); return; }
    // When there's a down_payment (entrada), Parcela 1 starts 30 days after entry_date
    const hasEntrada = (form.payment_type === 'PIX_CARTAO' || form.payment_type === 'PIX_MENSAL')
      && parseFloat(form.down_payment || '0') > 0;
    let startDate: Date;
    if (hasEntrada) {
      const [ey, em, ed] = form.entry_date.split('-').map(Number);
      // Use calendar month +1 instead of +30 days to avoid day overflow
      startDate = new Date(ey, em, ed, 12, 0, 0);
    } else {
      const [py, pm, pd] = form.first_payment_date.split('-').map(Number);
      startDate = new Date(py, pm - 1, pd, 12, 0, 0);
    }
    setInstDates(Array.from({ length: form.installments }, (_, i) => {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate(), 12, 0, 0);
      return { due_ms: d.getTime(), paid: false, paid_ms: null } as InstallmentDate;
    }));
  }, [form.installments, form.first_payment_date, form.payment_type, form.entry_date, form.down_payment]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const togglePaid = (idx: number) => {
    setInstDates(prev => prev.map((d, i) =>
      i !== idx ? d : { ...d, paid: !d.paid, paid_ms: !d.paid ? Date.now() : null }
    ));
  };

  const setInstDate = (idx: number, val: string) => {
    const [y, m, d] = val.split('-').map(Number);
    const ms = new Date(y, m - 1, d, 12, 0, 0).getTime();
    if (idx === 0) {
      // Cascade: recalculate all parcelas with +1 month each from Parcela 1
      setInstDates(prev => prev.map((dt, i) => ({
        ...dt,
        due_ms: new Date(y, m - 1 + i, d, 12, 0, 0).getTime(),
      })));
      // Sync first_payment_date so useEffect won't override cascade later
      const hasEnt = (form.payment_type === 'PIX_CARTAO' || form.payment_type === 'PIX_MENSAL')
        && parseFloat(form.down_payment || '0') > 0;
      if (!hasEnt) set('first_payment_date', val);
    } else {
      setInstDates(prev => prev.map((dt, i) => i !== idx ? dt : { ...dt, due_ms: ms }));
    }
  };


  const isPix     = form.payment_type === 'PIX_AVISTA';
  const isPixCard = form.payment_type === 'PIX_CARTAO';
  const isMensal  = form.payment_type === 'PIX_MENSAL';
  const totalAmt  = parseFloat(form.total_amount || '0');
  const downAmt   = (isPixCard || isMensal) ? parseFloat(form.down_payment || '0') : 0;
  const remaining = Math.max(0, totalAmt - downAmt);
  const instAmt   = form.installments > 0 ? remaining / form.installments : remaining;

  // Editable installment amount — auto-calculated but overridable
  const [manualInstAmt, setManualInstAmt] = useState('');
  useEffect(() => {
    if (instAmt > 0) setManualInstAmt(instAmt.toFixed(2));
    else setManualInstAmt('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.total_amount, form.down_payment, form.installments, form.payment_type]);
  const displayInstAmt = parseFloat(manualInstAmt || '0') || instAmt;

  const PAY_BTNS: { key: PayType; icon: string; label: string; col: string }[] = [
    { key: 'PIX_AVISTA',  icon: 'pix',              label: 'PIX a Vista',       col: GREEN     },
    { key: 'PIX_CARTAO',  icon: 'currency_exchange', label: 'PIX + Cartao',      col: '#38bdf8' },
    { key: 'CREDIT_CARD', icon: 'credit_card',       label: 'Cartao de Credito', col: GOLD      },
    { key: 'PIX_MENSAL',  icon: 'autorenew',         label: 'PIX Mensal',        col: '#c084fc' },
  ];

  const handleSave = async () => {
    if (!form.course_name) { setError('Selecione um curso'); return; }
    if (!form.name.trim() || !form.email.trim() || !form.total_amount) {
      setError('Preencha Nome, Email e Valor.'); return;
    }
    setSaving(true); setError('');
    try {
      const [ey, em, ed] = form.entry_date.split('-').map(Number);
      const entryTs = new Date(ey, em - 1, ed, 12, 0, 0).getTime();
      const dbPayType = isPix ? 'PIX' : isPixCard ? 'PIX_CARTAO' : form.payment_type === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX_MENSAL';
      const body = {
        course_name:        form.course_name,
        name:               form.name.trim().toUpperCase(),
        email:              form.email.trim().toLowerCase(),
        phone:              form.phone.trim(),
        document:           form.cpf.trim(),
        entry_date:         entryTs,
        payment_type:       dbPayType,
        currency:           form.currency,
        total_amount:       totalAmt,
        down_payment:       downAmt,
        installments:       isPix ? 1 : form.installments,
        installment_amount: isPix ? totalAmt : displayInstAmt,
        installment_dates:  isPix ? [{ due_ms: entryTs, paid: true, paid_ms: entryTs }] : instDates,
        notes:              form.notes.trim(),
        bp_vendedor:        form.bp_vendedor,
        bp_modelo:          form.bp_modelo,
        bp_em_dia:          isPix ? 'Quitado' : (form.bp_em_dia || 'Adimplente'),
        bp_valor:           form.total_amount,
        bp_pagamento:       isPix ? 'Pix' : isPixCard ? 'Pix + Cartao' : form.payment_type === 'CREDIT_CARD' ? 'Cartao' : 'Pix Mensal',
      };
      const res = await fetch('/api/alunos/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      onSaved(data.student);
      onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const GLASS: React.CSSProperties = {
    background: 'linear-gradient(160deg, rgba(0,22,55,0.97) 0%, rgba(0,12,35,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.08) inset',
    borderRadius: 28,
  };
  const INPUT: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: 'white', padding: '10px 14px', width: '100%', outline: 'none',
    fontSize: 13, fontWeight: 600, boxSizing: 'border-box',
  };
  const LABEL: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: SILVER,
    display: 'block', marginBottom: 6,
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.85)', backdropFilter: 'blur(12px)' }} />
      <div style={{ ...GLASS, position: 'relative', width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', padding: 32 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)' }}>
              <span className="material-symbols-outlined" style={{ color: GREEN, fontSize: 22 }}>person_add</span>
            </div>
            <div>
              <h2 style={{ color: 'white', fontWeight: 900, fontSize: 18, margin: 0 }}>Adicionar Venda Manual</h2>
              <p style={{ color: SILVER, fontSize: 11, margin: '3px 0 0', fontWeight: 700 }}>
                {form.course_name || 'Selecione o curso abaixo'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: SILVER, fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* CURSO */}
        <div style={{ marginBottom: 22, padding: '12px 16px', borderRadius: 14,
          background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)' }}>
          <label style={{ ...LABEL, color: GREEN }}>Curso *</label>
          <select value={form.course_name} onChange={e => set('course_name', e.target.value)}
            style={{ ...INPUT, cursor: 'pointer' }}>
            {courses.length === 0 && <option value="">Carregando...</option>}
            {courses.map(c => <option key={c} value={c} style={{ background: NAVY }}>{c}</option>)}
          </select>
        </div>

        {/* Row 1: Nome + Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={LABEL}>Nome *</label>
            <input style={INPUT} placeholder="Nome completo" value={form.name}
              onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Email *</label>
            <input style={INPUT} type="email" placeholder="email@exemplo.com" value={form.email}
              onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        {/* Row 2: Telefone + Data de Entrada */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={LABEL}>Telefone *</label>
            <input style={INPUT} placeholder="(11) 99999-9999" value={form.phone}
              onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Data de Entrada *</label>
            <input style={INPUT} type="date" value={form.entry_date}
              onChange={e => set('entry_date', e.target.value)} />
          </div>
        </div>


        {/* FORMA DE PAGAMENTO */}
        <label style={{ ...LABEL, marginBottom: 12 }}>Forma de Pagamento *</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          {PAY_BTNS.map(({ key, icon, label, col }) => (
            <button key={key} type="button"
              onClick={() => {
                const next: Record<string, any> = { payment_type: key, installments: 1 };
                if (key === 'PIX_MENSAL') {
                  const [ey, em, ed] = form.entry_date.split('-').map(Number);
                  const d = new Date(ey, em - 1, ed + 30);
                  next.first_payment_date = d.toISOString().slice(0, 10);
                }
                setForm(f => ({ ...f, ...next }));
              }}
              style={{
                padding: '10px 12px', borderRadius: 12, fontWeight: 800, fontSize: 11, cursor: 'pointer',
                background: form.payment_type === key ? `${col}22` : 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${form.payment_type === key ? col : 'rgba(255,255,255,0.1)'}`,
                color: form.payment_type === key ? col : SILVER,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* MOEDA */}
        <div style={{ marginBottom: 18 }}>
          <label style={LABEL}>Moeda *</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CURRENCIES_PILLS.map(c => (
              <button key={c} type="button" onClick={() => set('currency', c)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  background: form.currency === c ? 'rgba(232,177,79,0.18)' : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${form.currency === c ? GOLD : 'rgba(255,255,255,0.1)'}`,
                  color: form.currency === c ? GOLD : SILVER, transition: 'all 0.2s',
                }}>{c}
              </button>
            ))}
          </div>
        </div>

        {/* VALOR + PARCELAS em grid (igual ao AddStudentModal) */}
        <div style={{ display: 'grid',
          gridTemplateColumns: isPix ? '1fr' : (isPixCard || isMensal) ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr',
          gap: 14, marginBottom: 14 }}>
          <div>
            <label style={LABEL}>Valor Total ({form.currency}) *</label>
            <input style={INPUT} type="number" step="0.01" min="0" placeholder="997.00" value={form.total_amount}
              onChange={e => set('total_amount', e.target.value)} />
          </div>
          {(isPixCard || isMensal) && (
            <div>
              <label style={LABEL}>Entrada PIX ({form.currency})</label>
              <input style={INPUT} type="number" step="0.01" min="0" placeholder="0.00" value={form.down_payment}
                onChange={e => set('down_payment', e.target.value)} />
            </div>
          )}
          {!isPix && (<>
            <div>
              <label style={LABEL}>{isMensal ? 'Meses' : 'Parcelas'}</label>
              <select style={{ ...INPUT, cursor: 'pointer' }} value={form.installments}
                onChange={e => set('installments', parseInt(e.target.value))}>
                {Array.from({ length: isMensal ? 60 : 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n} style={{ background: NAVY, color: 'white' }}>{n}x</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>{isPixCard ? 'Parcela Cartao' : 'Valor/Parcela'}</label>
              <input
                style={{ ...INPUT, color: GOLD, fontWeight: 900 }}
                type="number" step="0.01" min="0"
                placeholder={instAmt > 0 ? instAmt.toFixed(2) : '--'}
                value={manualInstAmt}
                onChange={e => setManualInstAmt(e.target.value)}
              />
            </div>
          </>)}
        </div>

        {/* DATA DO 1o PAGAMENTO */}
        {!isPix && (
          <div style={{ marginBottom: 18 }}>
            <label style={LABEL}>Data do 1o pagamento *</label>
            <input style={{ ...INPUT, maxWidth: 220 }} type="date" value={form.first_payment_date}
              onChange={e => set('first_payment_date', e.target.value)} />
            <p style={{ fontSize: 10, color: SILVER, marginTop: 6, fontWeight: 600 }}>
              As demais parcelas serao calculadas mensalmente a partir desta data.
            </p>
          </div>
        )}

        {/* INSTALLMENT TRACKER */}
        {!isPix && instDates.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px 16px', marginBottom: 18 }}>
            <p style={{ ...LABEL, marginBottom: 12 }}>Parcelas geradas - marque as ja pagas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {instDates.map((d, i) => (
                <div key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                    transition: 'all 0.15s',
                    background: d.paid ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${d.paid ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                  {/* Checkbox */}
                  <div onClick={() => togglePaid(i)}
                    style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${d.paid ? GREEN : 'rgba(255,255,255,0.2)'}`,
                      background: d.paid ? GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', flexShrink: 0, cursor: 'pointer' }}>
                    {d.paid && <span className="material-symbols-outlined" style={{ fontSize: 12, color: NAVY }}>check</span>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: d.paid ? GREEN : SILVER, flexShrink: 0, minWidth: 56 }}>Parc. {i + 1}</span>
                  {/* Editable date */}
                  <input type="date"
                    value={new Date(d.due_ms).toISOString().slice(0, 10)}
                    onChange={e => setInstDate(i, e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)', color: d.paid ? GREEN : '#fff',
                      fontSize: 11, fontWeight: 700, outline: 'none', colorScheme: 'dark' }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 900, color: d.paid ? GREEN : GOLD, flexShrink: 0 }}>
                    {form.currency} {displayInstAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
            {(isPixCard || isMensal) && downAmt > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 10,
                fontSize: 11, fontWeight: 700, color: '#38bdf8', display: 'flex', justifyContent: 'space-between' }}>
                <span>Entrada PIX paga no ato</span>
                <span>{form.currency} {downAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )}

        {/* INFORMAÇÕES ADICIONAIS */}
        <div style={{ marginBottom: 18, padding: '14px 16px', borderRadius: 14,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: SILVER, marginBottom: 12, marginTop: 0 }}>Informações Adicionais (Planilha)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={LABEL}>Vendedor *</label>
              <select value={form.bp_vendedor} onChange={e => set('bp_vendedor', e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="" style={{ background: NAVY }}>— Selecione —</option>
                {VENDEDORES_LIST.map(v => (
                  <option key={v} value={v} style={{ background: NAVY }}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Modelo *</label>
              <input style={INPUT} placeholder="Recorrência, Assinatura, 1x…" value={form.bp_modelo}
                onChange={e => set('bp_modelo', e.target.value)} />
            </div>
            <div>
              <label style={LABEL}>Status *</label>
              <select value={form.bp_em_dia} onChange={e => set('bp_em_dia', e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="Adimplente" style={{ background: NAVY }}>Adimplente</option>
                <option value="Inadimplente" style={{ background: NAVY }}>Inadimplente</option>
                <option value="Quitado" style={{ background: NAVY }}>Quitado</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <label style={LABEL}>CPF / Documento</label>
              <input style={INPUT} placeholder="000.000.000-00" value={form.cpf || ''}
                onChange={e => set('cpf', e.target.value)} />
            </div>
          </div>
        </div>

        {/* OBSERVAÇÕES */}
        <div style={{ marginBottom: 22 }}>
          <label style={LABEL}>Observações</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Anotações extras..." rows={3}
            style={{ ...INPUT, resize: 'vertical' }} />
        </div>

        {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: '12px 0', borderRadius: 14, fontWeight: 800, fontSize: 13,
              cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: SILVER }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '12px 0', borderRadius: 14, fontWeight: 900, fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              background: 'rgba(74,222,128,0.15)', border: '1.5px solid rgba(74,222,128,0.4)', color: GREEN,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {saving ? 'progress_activity' : 'person_add'}
            </span>
            {saving ? 'Salvando...' : 'Adicionar Aluno'}
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
  const [editingManual, setEditingManual] = useState<any | null>(null);
  const [deletingManualId, setDeletingManualId] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

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
  }, [vendorFiltered, clientSearch]);

  const totalPages  = Math.max(1, Math.ceil(clientFiltered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows   = clientFiltered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const resetPage   = () => setPage(1);

  // colgroup widths: Data, Origem, Faturamento, Pagamento, Vendedor, Cliente, Curso
  // Cliente aumentado para 300px, Curso reduzido para 180px
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
                {/* Chips de Vendedor — clique filtra imediatamente */}
                {vendedorList.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => { setVendedorFilter(''); resetPage(); }}
                      className="px-3 py-2 text-[11px] font-black transition-all rounded-l-xl"
                      style={{
                        borderRadius: '10px 0 0 10px',
                        background: !vendedorFilter ? GOLD : 'transparent',
                        color: !vendedorFilter ? NAVY : SILVER,
                        border: `1px solid ${cardBorder}`,
                        borderRight: 'none',
                      }}>
                      Todos os Vendedores
                    </button>
                    {vendedorList.map((v, vi) => {
                      const isLast = vi === vendedorList.length - 1;
                      const isActive = vendedorFilter === v;
                      return (
                        <button key={v}
                          onClick={() => { setVendedorFilter(isActive ? '' : v); resetPage(); }}
                          className="px-3 py-2 text-[11px] font-black transition-all"
                          style={{
                            borderRadius: isLast ? '0 10px 10px 0' : 0,
                            background: isActive ? 'rgba(74,222,128,0.18)' : 'transparent',
                            color: isActive ? GREEN : SILVER,
                            border: `1px solid ${isActive ? GREEN + '55' : cardBorder}`,
                            borderLeft: 'none',
                          }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
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
                  {/* DATA */}        <col style={{ width: '90px'  }} />
                  {/* ORIGEM */}      <col style={{ width: '80px'  }} />
                  {/* FATURAMENTO */} <col style={{ width: '180px' }} />
                  {/* PAGAMENTO */}   <col style={{ width: '110px' }} />
                  {/* VENDEDOR */}    <col style={{ width: '115px' }} />
                  {/* CLIENTE */}     <col />
                  {/* CURSO */}       <col style={{ width: '420px' }} />
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
                      const entryTs = Number(s.entry_date);
                      const d = entryTs > 0 ? new Date(entryTs) : null;
                      const dateStr = d ? d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
                      const cur = (s.currency || 'BRL').toUpperCase();
                      // Faturamento real = entrada já paga + parcelas marcadas pagas
                      let instDatesArr: {paid: boolean; paid_ms: number|null}[] = [];
                      try {
                        const raw = typeof s.installment_dates === 'string' ? JSON.parse(s.installment_dates) : (s.installment_dates || []);
                        if (Array.isArray(raw)) instDatesArr = raw;
                      } catch {}
                      const paidCount    = instDatesArr.filter((x: any) => x.paid).length;
                      const instAmt      = Number(s.installment_amount) || Number(s.total_amount) || 0;
                      const downAmt      = Number(s.down_payment) || 0;
                      const isPix        = (s.payment_type || '').toUpperCase() === 'PIX';
                      // PIX à vista: total sempre pago; outros: entrada + pagas
                      const amt = isPix ? (Number(s.total_amount) || 0) : (downAmt + paidCount * instAmt);
                      // Pagamento detalhado
                      const ptRaw = (s.payment_type || '').toUpperCase();
                      let payLabel = 'Pix'; let payBg = 'rgba(34,197,94,0.12)'; let payColor = GREEN;
                      if (ptRaw === 'PIX_MENSAL')  { payLabel = 'Pix Mensal';   payBg = 'rgba(192,132,252,0.12)'; payColor = '#c084fc'; }
                      else if (ptRaw === 'PIX_CARTAO')  { payLabel = 'Pix + Cartão'; payBg = 'rgba(56,189,248,0.12)'; payColor = TEAL; }
                      else if (ptRaw === 'CREDIT_CARD') { payLabel = 'Cartão';       payBg = 'rgba(232,177,79,0.12)'; payColor = GOLD; }
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
                                {isPix ? 'À vista' : paidCount > 0 ? `${paidCount}/${s.installments}× pagas` : `0/${s.installments}× pagas`}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
                              style={{ background: payBg, border: `1px solid ${payColor}30`, color: payColor }}>
                              {payLabel}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {(() => { const v = s.vendedor || vendedorMap[(s.email||'').toLowerCase()]; return v
                              ? <span className="text-[11px] font-black uppercase" style={{ color:GREEN }}>{v}</span>
                              : <span className="text-[10px]" style={{ color:'rgba(255,255,255,0.2)' }}>—</span>; })()
                            }
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <button onClick={() => router.push(`/alunos/${emailToId(s.email)}`)}
                                className="text-sm font-black text-white uppercase hover:underline text-left"
                                style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}
                                onMouseEnter={e => (e.currentTarget.style.color=GOLD)}
                                onMouseLeave={e => (e.currentTarget.style.color='#fff')}>
                                {s.name}
                              </button>
                              <span className="text-[10px] font-bold" style={{ color:SILVER }}>{s.email}</span>
                              {/* Botões Editar / Excluir — só para vendas manuais */}
                              <div className="flex items-center gap-2 mt-1.5">
                                <button onClick={() => setEditingManual(s)}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all"
                                  style={{ background:'rgba(232,177,79,0.1)', border:'1px solid rgba(232,177,79,0.3)', color:GOLD, cursor:'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.background='rgba(232,177,79,0.2)'}
                                  onMouseLeave={e => e.currentTarget.style.background='rgba(232,177,79,0.1)'}>
                                  <span className="material-symbols-outlined" style={{ fontSize:11 }}>edit</span>Editar
                                </button>
                                <button onClick={() => setDeletingManualId(s.id)}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all"
                                  style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#f87171', cursor:'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,0.18)'}
                                  onMouseLeave={e => e.currentTarget.style.background='rgba(239,68,68,0.08)'}>
                                  <span className="material-symbols-outlined" style={{ fontSize:11 }}>delete</span>Excluir
                                </button>
                              </div>
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

      {/* Modal: Adicionar Venda */}
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

      {/* Modal: Editar Venda Manual */}
      {editingManual && typeof window !== 'undefined' && (() => {
        // Helper: coerce string/number timestamps to number safely
        const toMs = (v: any): number | null => {
          if (!v) return null;
          const n = Number(v);
          return isNaN(n) ? null : n;
        };

        // Parse installment_dates safely — DB may return JSON string or array
        let instDates: any[] = [];
        try {
          const raw = editingManual.installment_dates;
          const arr = Array.isArray(raw) ? raw
            : (typeof raw === 'string' && raw.trim().startsWith('[')) ? JSON.parse(raw)
            : [];
          // Also coerce due_ms/paid_ms in each installment to numbers
          instDates = arr.map((d: any) => ({
            due_ms:  Number(d.due_ms)  || 0,
            paid:    Boolean(d.paid),
            paid_ms: d.paid_ms ? Number(d.paid_ms) : null,
          }));
        } catch { instDates = []; }

        const studentData: ManualStudentFields = {
          manualId:             String(editingManual.id),
          email:                editingManual.email || '',
          name:                 editingManual.name || '',
          phone:                editingManual.phone || '',
          payment_type:         editingManual.payment_type || 'PIX',
          currency:             editingManual.currency || 'BRL',
          total_amount:         Number(editingManual.total_amount) || 0,
          down_payment:         Number(editingManual.down_payment) || 0,
          installments:         Number(editingManual.installments) || 1,
          installment_amount:   Number(editingManual.installment_amount) || 0,
          installment_dates:    instDates,
          notes:                editingManual.notes || '',
          vendedor:             editingManual.vendedor || '',
          bp_modelo:            editingManual.bp_modelo || '',
          bp_em_dia:            editingManual.bp_em_dia || 'Adimplente',
          bp_primeira_parcela:  toMs(editingManual.bp_primeira_parcela),
          bp_ultimo_pagamento:  toMs(editingManual.bp_ultimo_pagamento),
          bp_proximo_pagamento: toMs(editingManual.bp_proximo_pagamento),
          entry_date:           toMs(editingManual.entry_date) ?? Date.now(),
        };
        return (
          <EditManualStudentModal
            student={studentData}
            onClose={() => setEditingManual(null)}
            onSaved={(updated) => {
              setManualSales(prev => prev.map(s =>
                String(s.id) === String(editingManual.id) ? { ...s, ...updated, id: s.id } : s
              ));
              setEditingManual(null);
            }}
          />
        );
      })()}




      {/* Modal: Confirmar Exclusão */}
      {deletingManualId && typeof window !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,15,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { if (!deleteConfirming) setDeletingManualId(null); }} />
          <div style={{ position: 'relative', background: 'linear-gradient(160deg,rgba(0,22,55,0.98),rgba(0,12,35,0.99))',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 24, padding: 32, maxWidth: 400, width: '100%',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
              <div style={{ width:44, height:44, borderRadius:14, background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span className="material-symbols-outlined" style={{ color:'#f87171', fontSize:22 }}>delete_forever</span>
              </div>
              <div>
                <h2 style={{ color:'white', fontWeight:900, fontSize:17, margin:0 }}>Excluir Venda Manual</h2>
                <p style={{ color:SILVER, fontSize:11, margin:'3px 0 0', fontWeight:700 }}>Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p style={{ color:SILVER, fontSize:13, marginBottom:24 }}>
              Tem certeza que deseja excluir esta venda manual? O aluno será removido do curso e dos registros financeiros.
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setDeletingManualId(null)} disabled={deleteConfirming}
                style={{ flex:1, padding:'11px 0', borderRadius:14, fontWeight:800, fontSize:13, cursor:'pointer',
                  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:SILVER }}>
                Cancelar
              </button>
              <button disabled={deleteConfirming}
                onClick={async () => {
                  setDeleteConfirming(true);
                  try {
                    const r = await fetch(`/api/alunos/manual/${deletingManualId}`, { method: 'DELETE' });
                    if (r.ok) {
                      const deleted = manualSales.find(s => s.id === deletingManualId);
                      setManualSales(prev => prev.filter(s => s.id !== deletingManualId));
                      if (deleted) {
                        const amt = Number(deleted.total_amount) || 0;
                        const isBrl = (deleted.currency || 'BRL').toUpperCase() === 'BRL';
                        setManualBRL(prev => isBrl ? Math.max(0, prev - amt) : prev);
                        setManualLatam(prev => !isBrl ? Math.max(0, prev - amt) : prev);
                        setManualCount(prev => Math.max(0, prev - 1));
                      }
                      setDeletingManualId(null);
                    }
                  } finally { setDeleteConfirming(false); }
                }}
                style={{ flex:2, padding:'11px 0', borderRadius:14, fontWeight:900, fontSize:13,
                  cursor: deleteConfirming ? 'not-allowed' : 'pointer', opacity: deleteConfirming ? 0.7 : 1,
                  background:'rgba(239,68,68,0.15)', border:'1.5px solid rgba(239,68,68,0.5)', color:'#f87171',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>
                  {deleteConfirming ? 'progress_activity' : 'delete_forever'}
                </span>
                {deleteConfirming ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </LoginWrapper>

  );
}
