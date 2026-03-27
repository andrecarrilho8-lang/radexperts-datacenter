import React from 'react';

const GOLD   = '#E8B14F';
const SILVER = '#A8B2C0';

// ~60% de transparência nos boxes internos
const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,10,30,0.35) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px -4px rgba(0,0,0,0.3)',
};

export function MetricPill({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: small ? '12px 16px' : '16px 20px' }}>
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
    <div style={{ ...cardStyle, borderRadius: 14, padding: small ? '12px 16px' : '16px 20px' }}>
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
    <div style={{ ...cardStyle, borderRadius: 18, padding: '14px 16px', transition: 'transform 0.2s' }}
      className="group hover:scale-[1.01]">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: `${accentColor}14`,
          border: `1px solid ${accentColor}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }} className="group-hover:scale-110">
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: accentColor }}>{icon}</span>
        </div>
        <p style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: SILVER }}>{label}</p>
      </div>
      <p style={{ fontWeight: 900, fontSize: small ? 18 : 26, lineHeight: 1, color: '#fff', fontFamily: 'var(--font-jakarta)' }}>
        {value}
      </p>
    </div>
  );
}
