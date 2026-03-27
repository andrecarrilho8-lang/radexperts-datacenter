import React from 'react';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';
const NAVY   = '#001a35';

const glossyBase: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 50%, rgba(0,10,30,0.65) 100%)',
  border: '1px solid rgba(255,255,255,0.12)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 16px 32px -8px rgba(0,0,0,0.5)',
};

export function MetricPill({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div style={{ ...glossyBase, borderRadius: 14, padding: small ? '12px 16px' : '16px 20px' }}>
      <p style={{ fontSize: small ? 11 : 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, color: accent ? GOLD : SILVER }}>
        {label}
      </p>
      <p style={{ fontWeight: 900, fontSize: small ? 24 : 32, lineHeight: 1, color: accent ? GOLD : '#fff', fontFamily: 'var(--font-jakarta)' }}>
        {value}
      </p>
    </div>
  );
}

export function MetricPillAmber({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div style={{ ...glossyBase, borderRadius: 14, padding: small ? '12px 16px' : '16px 20px' }}>
      <p style={{ fontSize: small ? 11 : 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, color: accent ? '#38bdf8' : SILVER }}>
        {label}
      </p>
      <p style={{ fontWeight: 900, fontSize: small ? 24 : 32, lineHeight: 1, color: accent ? '#38bdf8' : '#fff', fontFamily: 'var(--font-jakarta)' }}>
        {value}
      </p>
    </div>
  );
}

export function StatCard({ label, value, icon, color = 'slate', small = false }: { label: string; value: string; icon: string; color?: 'violet' | 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'orange'; small?: boolean }) {
  const accentColor = {
    violet:  '#a78bfa',
    emerald: '#22c55e',
    amber:   GOLD,
    blue:    '#38bdf8',
    rose:    '#ef4444',
    orange:  '#fb923c',
    slate:   SILVER,
  }[color] ?? SILVER;

  return (
    <div style={{ ...glossyBase, borderRadius: 18, padding: '16px 20px', transition: 'transform 0.2s, box-shadow 0.2s' }}
      className="group hover:scale-[1.01]">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${accentColor}18`,
          border: `1px solid ${accentColor}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }} className="group-hover:scale-110">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: accentColor }}>{icon}</span>
        </div>
        <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: SILVER }}>{label}</p>
      </div>
      <p style={{ fontWeight: 900, fontSize: small ? 20 : 28, lineHeight: 1, color: '#fff', fontFamily: 'var(--font-jakarta)' }}>
        {value}
      </p>
    </div>
  );
}
