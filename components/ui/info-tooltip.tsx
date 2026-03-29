'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const GOLD = '#E8B14F';
const SILVER = '#A8B2C0';

interface InfoTooltipLine {
  emoji: string;
  label: string;
  value: string;
  color?: string;
}

interface InfoTooltipProps {
  lines: InfoTooltipLine[];
  /** Optional total line shown after a divider */
  total?: { label: string; value: string };
  /** Title inside the popup */
  title?: string;
  /** Trigger label, defaults to "Ver detalhamento" */
  triggerLabel?: string;
}

export function InfoTooltip({ lines, total, title = 'Detalhamento', triggerLabel = 'Ver detalhamento' }: InfoTooltipProps) {
  const [visible, setVisible]   = useState(false);
  const [pos,     setPos]       = useState({ x: 0, y: 0 });
  const triggerRef              = useRef<HTMLSpanElement>(null);
  const hideTimer               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left, y: rect.top - 8 });
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const tooltip = visible ? (
    <div
      style={{
        position:    'fixed',
        left:        pos.x,
        top:         pos.y,
        transform:   'translateY(-100%)',
        zIndex:      99999,
        minWidth:    264,
        background:  '#0d1f33',
        border:      '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding:     '12px 14px',
        boxShadow:   '0 8px 32px rgba(0,0,0,0.7)',
        pointerEvents: 'none',
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: GOLD, marginBottom: 8 }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: l.color || SILVER }}>{l.emoji} {l.label}</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: l.color || 'white' }}>{l.value}</span>
          </div>
        ))}
        {total && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#4ade80' }}>✓ {total.label}</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#4ade80' }}>{total.value}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help', fontSize: 10, fontWeight: 700, color: SILVER }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>info</span>
        {triggerLabel}
      </span>
      {typeof window !== 'undefined' && tooltip && createPortal(tooltip, document.body)}
    </>
  );
}
