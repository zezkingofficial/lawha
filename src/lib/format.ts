import type { LabelColor } from './data/types';

export const labelBg = (c: LabelColor) => `var(--c-label-${c})`;
export const labelFg = (c: LabelColor) =>
  c === 'yellow' || c === 'lime' || c === 'empty' ? 'var(--c-on-label-dark)' : 'var(--c-on-label)';

export function fmtNumber(n: string | number, locale: string) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!isFinite(v)) return '';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
}

export function fmtDate(iso: string, locale: string) {
  // calendar date: format at noon UTC so no time zone can shift the day
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const initial = (name: string) => name.trim().charAt(0) || '?';
