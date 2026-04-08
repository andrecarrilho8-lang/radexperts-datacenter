'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Constants ─────────────────────────────────────────────────────────────────
const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const CB     = 'rgba(255,255,255,0.08)';

// ── Payment method options ────────────────────────────────────────────────────
const PAYMENT_TYPES = [
  { value: 'PIX',         label: 'PIX à Vista',        icon: 'qr_code_2' },
  { value: 'PIX_MENSAL',  label: 'PIX Mensal',          icon: 'calendar_month' },
  { value: 'PIX_CARTAO',  label: 'PIX + Cartão',        icon: 'payments' },
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito',   icon: 'credit_card' },
];

const STATUS_OPTIONS = [
  { value: 'Adimplente',  label: '✓ Adimplente',  color: '#4ade80' },
  { value: 'Inadimplente',label: '✗ Inadimplente', color: '#f87171' },
  { value: 'Quitado',     label: '✔ Quitado',      color: '#38bdf8' },
];

const VENDEDOR_OPTIONS = [
  { value: '',        label: '— Selecione —' },
  { value: 'Nackson', label: 'Nackson' },
  { value: 'Samuel',  label: 'Samuel'  },
  { value: 'Alba',    label: 'Alba'    },
  { value: 'Pacheco', label: 'Pacheco' },
  { value: 'Ana',     label: 'Ana'     },
];

const CURRENCIES = ['BRL', 'USD', 'COP', 'BOB', 'MXN', 'ARS', 'CLP', 'PEN', 'UYU'];

// ── Types ─────────────────────────────────────────────────────────────────────
export type ManualStudentFields = {
  manualId: string;         // numeric id from manual_students.id
  email: string;
  name: string;
  phone?: string;
  payment_type?: string;
  currency?: string;
  total_amount?: number;
  down_payment?: number;
  installments?: number;
  installment_amount?: number;
  installment_dates?: InstallmentDate[];
  notes?: string;
  // buyer_profiles fields
  vendedor?: string;
  bp_modelo?: string;
  bp_pagamento?: string;
  bp_em_dia?: string;
  bp_primeira_parcela?: number | null;
  bp_ultimo_pagamento?: number | null;
  bp_proximo_pagamento?: number | null;
  entry_date?: number;   // epoch ms
};

type InstallmentDate = {
  due_ms: number;
  paid: boolean;
  paid_ms: number | null;
};

// ── Helper functions ──────────────────────────────────────────────────────────
function fmtInputDate(epochMs: number | null | undefined): string {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

function parseInputDate(val: string): number | null {
  if (!val) return null;
  const d = new Date(val + 'T12:00:00'); // noon UTC to avoid TZ issues
  return isNaN(d.getTime()) ? null : d.getTime();
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: SILVER }}>
      {children}
    </p>
  );
}

function Field({ children, span = 1 }: { children: React.ReactNode; span?: number }) {
  return (
    <div style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${CB}`,
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  outline: 'none',
  boxSizing: 'border-box',
};

function Input({ label, value, onChange, type = 'text', placeholder = '', disabled = false }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
        onFocus={e => (e.target.style.borderColor = `${GOLD}80`)}
        onBlur={e  => (e.target.style.borderColor = CB)}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
        onFocus={e => (e.target.style.borderColor = `${GOLD}80`)}
        onBlur={e  => (e.target.style.borderColor = CB)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: NAVY }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── InstallmentTracker ────────────────────────────────────────────────────────
function InstallmentTracker({
  installments,
  dates,
  installmentAmount,
  onDatesChange,
}: {
  installments: number;
  dates: InstallmentDate[];
  installmentAmount: number;
  onDatesChange: (d: InstallmentDate[]) => void;
}) {
  // Sync length with installments count
  const normalised: InstallmentDate[] = Array.from({ length: installments }, (_, i) => {
    const existing = dates[i];
    if (existing) return existing;
    // Default next monthly date
    const base = dates[i - 1]?.due_ms || Date.now();
    return { due_ms: base + 30 * 86_400_000, paid: false, paid_ms: null };
  });

  function toggle(i: number) {
    const next = normalised.map((d, idx) => {
      if (idx !== i) return d;
      const paid = !d.paid;
      return { ...d, paid, paid_ms: paid ? Date.now() : null };
    });
    onDatesChange(next);
  }

  function setDue(i: number, val: string) {
    const ms = parseInputDate(val);
    if (!ms) return;
    const next = normalised.map((d, idx) => idx === i ? { ...d, due_ms: ms } : d);
    onDatesChange(next);
  }

  const paidCount = normalised.filter(d => d.paid).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>Rastreador de Parcelas</Label>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
          {paidCount}/{installments} pagas
        </span>
      </div>
      <div className="flex flex-col gap-1.5" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {normalised.map((d, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: d.paid ? 'rgba(74,222,128,0.07)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${d.paid ? 'rgba(74,222,128,0.25)' : CB}`,
              transition: 'all 0.15s',
            }}>
            {/* Paid toggle */}
            <button
              type="button"
              onClick={() => toggle(i)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: d.paid ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${d.paid ? '#4ade80' : CB}`,
                color: d.paid ? '#4ade80' : SILVER,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 12,
              }}>
              {d.paid ? '✓' : ''}
            </button>
            {/* Installment label */}
            <span className="text-[11px] font-black flex-shrink-0" style={{ color: d.paid ? '#4ade80' : SILVER, minWidth: 52 }}>
              Parc. {i + 1}
            </span>
            {/* Due date */}
            <input
              type="date"
              value={fmtInputDate(d.due_ms)}
              onChange={e => setDue(i, e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${CB}`,
                color: d.paid ? '#4ade80' : '#fff',
                fontSize: 11,
                fontWeight: 700,
                outline: 'none',
              }}
              onFocus={e => (e.target.style.borderColor = `${GOLD}80`)}
              onBlur={e  => (e.target.style.borderColor = CB)}
            />
            {/* Amount */}
            <span className="text-[11px] font-black flex-shrink-0" style={{ color: GOLD, minWidth: 76, textAlign: 'right' }}>
              {fmtBRL(installmentAmount || 0)}
            </span>
            {/* Paid date */}
            {d.paid && d.paid_ms && (
              <span className="text-[9px] font-bold flex-shrink-0" style={{ color: '#86efac', minWidth: 60, textAlign: 'right' }}>
                pago {new Date(d.paid_ms).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function EditManualStudentModal({
  student,
  onClose,
  onSaved,
}: {
  student: ManualStudentFields;
  onClose: () => void;
  onSaved: (updated: Partial<ManualStudentFields>) => void;
}) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [name,        setName]        = useState(student.name || '');
  const [phone,       setPhone]       = useState(student.phone || '');
  const [paymentType, setPaymentType] = useState(student.payment_type || 'PIX');
  const [currency,    setCurrency]    = useState(student.currency || 'BRL');
  const [totalAmount, setTotalAmount] = useState(String(student.total_amount ?? ''));
  const [downPayment, setDownPayment] = useState(String(student.down_payment ?? ''));
  const [installments,setInstallments]= useState(String(student.installments ?? 1));
  const [instAmount,  setInstAmount]  = useState(String(student.installment_amount ?? ''));
  const [instDates,   setInstDates]   = useState<InstallmentDate[]>(student.installment_dates || []);
  const [notes,       setNotes]       = useState(student.notes || '');
  const [entryDate,   setEntryDate]   = useState(fmtInputDate(student.entry_date));
  // BP fields
  const [vendedor,    setVendedor]    = useState(student.vendedor || '');
  const [modelo,      setModelo]      = useState(student.bp_modelo || '');
  const [status,      setStatus]      = useState(student.bp_em_dia || 'Adimplente');
  const [primParcela, setPrimParcela] = useState(fmtInputDate(student.bp_primeira_parcela));
  const [ultPagto,    setUltPagto]    = useState(fmtInputDate(student.bp_ultimo_pagamento));
  const [proxPagto,   setProxPagto]   = useState(fmtInputDate(student.bp_proximo_pagamento));

  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');

  const instCount = Math.max(1, Math.min(60, parseInt(installments) || 1));
  const isPix    = paymentType === 'PIX' || paymentType === 'PIX_AVISTA';
  const isParc   = !isPix && instCount > 1;

  // Auto-derive installment_amount when total + installments change
  useEffect(() => {
    const total = parseFloat(totalAmount.replace(',', '.'));
    const down  = parseFloat(downPayment.replace(',', '.')) || 0;
    if (!isNaN(total) && instCount > 0 && !isPix) {
      const perInst = (total - down) / instCount;
      setInstAmount(perInst > 0 ? perInst.toFixed(2) : '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount, downPayment, installments, paymentType]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const totalVal = parseFloat(totalAmount.replace(',', '.')) || 0;
      const downVal  = parseFloat(downPayment.replace(',', '.')) || 0;
      const instAmt  = parseFloat(instAmount.replace(',', '.'))  || 0;

      // 1. Update manual_students
      const manualPayload: Record<string, unknown> = {
        name:              name.trim().toUpperCase(),
        phone:             phone.trim(),
        payment_type:      paymentType,
        currency,
        total_amount:      totalVal,
        down_payment:      downVal,
        installments:      instCount,
        installment_amount:instAmt,
        installment_dates: isParc ? instDates.slice(0, instCount) : [],
        notes:             notes.trim(),
        entry_date:        parseInputDate(entryDate) ?? student.entry_date,
      };

      const r1 = await fetch(`/api/alunos/manual/${student.manualId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualPayload),
      });
      if (!r1.ok) {
        const d = await r1.json().catch(() => ({}));
        throw new Error(d.error || `Erro manual PUT: ${r1.status}`);
      }

      // 2. Update buyer_profiles (PATCH)
      const bpPayload: Record<string, unknown> = {
        vendedor:           vendedor.trim() || null,
        bp_modelo:          modelo.trim()   || null,
        bp_pagamento:       paymentType,
        bp_em_dia:          status,
        bp_primeira_parcela:parseInputDate(primParcela),
        bp_ultimo_pagamento:parseInputDate(ultPagto),
        bp_proximo_pagamento:parseInputDate(proxPagto),
      };

      const r2 = await fetch(`/api/alunos/bp-patch?email=${encodeURIComponent(student.email)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bpPayload),
      });
      if (!r2.ok) {
        const d = await r2.json().catch(() => ({}));
        throw new Error(d.error || `Erro BP PATCH: ${r2.status}`);
      }

      onSaved({
        name:                name.trim().toUpperCase(),
        phone:               phone.trim(),
        payment_type:        paymentType,
        currency,
        total_amount:        totalVal,
        down_payment:        downVal,
        installments:        instCount,
        installment_amount:  instAmt,
        installment_dates:   isParc ? instDates.slice(0, instCount) : [],
        notes:               notes.trim(),
        vendedor:            vendedor.trim(),
        bp_modelo:           modelo.trim(),
        bp_em_dia:           status,
        bp_primeira_parcela: parseInputDate(primParcela),
        bp_ultimo_pagamento: parseInputDate(ultPagto),
        bp_proximo_pagamento:parseInputDate(proxPagto),
      });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [
    name, phone, paymentType, currency, totalAmount, downPayment,
    installments, instAmount, instCount, instDates, notes, entryDate,
    vendedor, modelo, status, primParcela, ultPagto, proxPagto,
    isParc, student.manualId, student.email, student.entry_date,
    onSaved, onClose,
  ]);

  const sectionHeader = (icon: string, label: string, color = GOLD) => (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</p>
      <div className="flex-1 h-px" style={{ background: `${color}20` }} />
    </div>
  );

  return createPortal((
    <div
      className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,5,20,0.88)', backdropFilter: 'blur(16px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-2xl flex flex-col rounded-t-[32px] sm:rounded-[32px] overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 50%, rgba(0,10,30,0.85) 100%)',
          border: `1px solid ${CB}`,
          backdropFilter: 'blur(24px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
          maxHeight: '92vh',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="px-7 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: `1px solid ${CB}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(232,177,79,0.12)', border: '1px solid rgba(232,177,79,0.3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: GOLD }}>edit_note</span>
            </div>
            <div>
              <p className="font-black text-white text-base leading-tight">Editar Aluno Manual</p>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: SILVER }}>
                {student.email}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${CB}`, color: SILVER }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = SILVER)}>
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-7 space-y-8">

          {/* ── Dados Pessoais ── */}
          <section>
            {sectionHeader('person', 'Dados Pessoais')}
            <div className="grid grid-cols-2 gap-4">
              <Field span={2}>
                <Input label="Nome" value={name} onChange={setName} placeholder="NOME COMPLETO" />
              </Field>
              <Field>
                <Input label="Telefone" value={phone} onChange={setPhone} placeholder="+55 11 99999-9999" type="tel" />
              </Field>
              <Field>
                <Input label="Data de Entrada" value={entryDate} onChange={setEntryDate} type="date" />
              </Field>
            </div>
          </section>

          {/* ── Pagamento ── */}
          <section>
            {sectionHeader('payments', 'Pagamento', '#38bdf8')}

            {/* Payment method toggle buttons */}
            <div className="mb-4">
              <Label>Forma de Pagamento</Label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_TYPES.map(pt => {
                  const active = paymentType === pt.value;
                  return (
                    <button key={pt.value} type="button"
                      onClick={() => setPaymentType(pt.value)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition-all"
                      style={{
                        background: active ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1.5px solid ${active ? 'rgba(56,189,248,0.6)' : CB}`,
                        color: active ? '#38bdf8' : SILVER,
                      }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{pt.icon}</span>
                      {pt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Currency */}
              <Field>
                <Select label="Moeda" value={currency} onChange={setCurrency}
                  options={CURRENCIES.map(c => ({ value: c, label: c }))} />
              </Field>

              {/* Total Amount */}
              <Field>
                <Input label="Valor Total" value={totalAmount} onChange={setTotalAmount}
                  type="number" placeholder="0.00" />
              </Field>

              {/* PIX + Cartão: down payment */}
              {(paymentType === 'PIX_CARTAO') && (
                <Field>
                  <Input label="Entrada PIX" value={downPayment} onChange={setDownPayment}
                    type="number" placeholder="0.00" />
                </Field>
              )}

              {/* Installments — not for PIX à Vista */}
              {!isPix && (
                <>
                  <Field>
                    <Input label="Nº de Parcelas" value={installments}
                      onChange={v => setInstallments(v)} type="number" placeholder="1" />
                  </Field>
                  <Field>
                    <Input label="Valor da Parcela" value={instAmount}
                      onChange={setInstAmount} type="number" placeholder="Auto" />
                  </Field>
                </>
              )}
            </div>

            {/* Installment tracker — shown when parcelado */}
            {isParc && instCount > 0 && (
              <div className="mt-4">
                <InstallmentTracker
                  installments={instCount}
                  dates={instDates}
                  installmentAmount={parseFloat(instAmount.replace(',', '.')) || 0}
                  onDatesChange={setInstDates}
                />
              </div>
            )}
          </section>

          {/* ── Buyer Persona ── */}
          <section>
            {sectionHeader('manage_accounts', 'Buyer Persona')}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Select label="Vendedor" value={vendedor} onChange={setVendedor} options={VENDEDOR_OPTIONS} />
              </Field>
              <Field>
                <Input label="Modelo" value={modelo} onChange={setModelo} placeholder="ex: Presencial, Online…" />
              </Field>
              <Field span={2}>
                <Select label="Status de Pagamento" value={status} onChange={setStatus}
                  options={STATUS_OPTIONS} />
              </Field>
              <Field>
                <Input label="1ª Parcela" value={primParcela} onChange={setPrimParcela} type="date" />
              </Field>
              <Field>
                <Input label="Último Pagamento" value={ultPagto} onChange={setUltPagto} type="date" />
              </Field>
              <Field span={2}>
                <Input label="Próximo Pagamento" value={proxPagto} onChange={setProxPagto} type="date" />
              </Field>
            </div>
          </section>

          {/* ── Observações ── */}
          <section>
            {sectionHeader('notes', 'Observações')}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observações internas…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => (e.target.style.borderColor = `${GOLD}80`)}
              onBlur={e  => (e.target.style.borderColor = CB)}
            />
          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="px-7 py-5 flex items-center justify-between gap-3 flex-shrink-0"
          style={{ borderTop: `1px solid ${CB}`, background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex-1">
            {error && (
              <p className="text-[11px] font-bold" style={{ color: '#f87171' }}>
                ⚠ {error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{ color: SILVER }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = SILVER)}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              style={{
                background: saving
                  ? 'rgba(232,177,79,0.15)'
                  : `linear-gradient(135deg, ${GOLD}, #c8922a)`,
                color: saving ? GOLD : NAVY,
                boxShadow: saving ? 'none' : '0 4px 20px rgba(232,177,79,0.35)',
                opacity: saving ? 0.8 : 1,
                cursor: saving ? 'default' : 'pointer',
              }}>
              {saving ? (
                <>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(232,177,79,0.3)', borderTopColor: GOLD, display: 'inline-block', animation: 'spin 0.75s linear infinite' }} />
                  Salvando…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  Salvar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ), document.body);
}
