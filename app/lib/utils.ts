
export const R = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

export const RF = (v: number, currency: string = 'BRL') => {
  try {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: (currency || 'BRL').toUpperCase() 
    }).format(v ?? 0);
  } catch {
    return `${(currency || 'BRL').toUpperCase()} ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
};

export const N = (v: number) => new Intl.NumberFormat('pt-BR').format(v ?? 0);

export const P = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) + '%';

export const D = (iso: string | null) => {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const today = toYMD(new Date());
export const def30 = toYMD(new Date(Date.now() - 29 * 86400_000));

export type Preset = { label: string; from: string; to: string };
export const buildPresets = (): Preset[] => {
  const t = new Date();
  return [
    { label: 'Hoje',    from: toYMD(t),                                            to: toYMD(t) },
    { label: '7 dias',  from: toYMD(new Date(t.getTime() - 6  * 86400_000)),       to: toYMD(t) },
    { label: '30 dias', from: toYMD(new Date(t.getTime() - 29 * 86400_000)),       to: toYMD(t) },
  ];
};

export type ObjTab = 'GERAL' | 'VENDAS' | 'LEADS' | 'OUTROS';

export const PALETTE = {
  VENDAS: { bg: 'bg-violet-600',  text: 'text-violet-600',  light: 'bg-violet-50',  border: 'border-violet-200', hex: '#7c3aed' },
  LEADS:  { bg: 'bg-amber-500',   text: 'text-amber-600',   light: 'bg-amber-50',   border: 'border-amber-200',  hex: '#d97706' },
  OUTROS: { bg: 'bg-emerald-600', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200',hex: '#059669' },
};
