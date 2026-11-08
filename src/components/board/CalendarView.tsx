'use client';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BoardBundle, CellValue, Column, Item, StatusValue } from '@/lib/data/types';
import { fmtDate, labelBg, todayISO } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { Button, IconButton } from '../ui';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };

// Items placed on a month grid by a date (or timeline start) column. Drag a chip
// to another day on desktop; on phones tap a day to list its items.
export function CalendarView({ bundle, items, dateColumnId, onDateColumn, canEdit, onOpen, onSet }: {
  bundle: BoardBundle; items: Item[]; dateColumnId?: string; onDateColumn: (id: string) => void; canEdit: boolean;
  onOpen: (id: string) => void; onSet: (item: Item, col: Column, v: CellValue | null) => void;
}) {
  const { t, lang, locale } = useLang();
  const dateCols = bundle.columns.filter((c) => c.scope === 'item' && (c.type === 'date' || c.type === 'timeline'));
  const col = dateCols.find((c) => c.id === dateColumnId) ?? dateCols[0];
  const status = bundle.columns.find((c) => c.scope === 'item' && c.type === 'status');
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [selected, setSelected] = useState<string | null>(today);
  const [over, setOver] = useState<string | null>(null);

  const weekStart = lang === 'ar' ? 6 : 1; // Saturday in the UAE week, Monday in English
  const days = useMemo(() => {
    const first = new Date(month + '-01T12:00:00');
    const offset = (first.getDay() - weekStart + 7) % 7;
    const start = addDays(month + '-01', -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month, weekStart]);
  const weekdayNames = useMemo(() => days.slice(0, 7).map((d) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(d + 'T12:00:00'))), [days, locale]);

  if (!col) return <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-text-muted">{t('noDateColumn')}</p>;

  const dayOf = (it: Item) => {
    const v = it.vals[col.id] as { date?: string; from?: string } | undefined;
    return v?.date ?? v?.from ?? null;
  };
  const byDay = new Map<string, Item[]>();
  for (const it of items) { const d = dayOf(it); if (d) byDay.set(d, [...(byDay.get(d) ?? []), it]); }
  const colorOf = (it: Item) => {
    const l = status && (status.settings.labels ?? []).find((x) => x.id === (it.vals[status.id] as StatusValue | undefined)?.label_id);
    return labelBg(l?.color ?? 'empty');
  };
  const moveTo = (it: Item, day: string) => {
    if (col.type === 'date') return onSet(it, col, { date: day });
    const v = it.vals[col.id] as { from: string; to: string } | undefined;
    if (!v) return onSet(it, col, { from: day, to: day });
    const span = Math.round((Date.parse(v.to) - Date.parse(v.from)) / 86400000);
    onSet(it, col, { from: day, to: addDays(day, span) });
  };
  const shift = (n: number) => { const d = new Date(month + '-01T12:00:00'); d.setMonth(d.getMonth() + n); setMonth(iso(d).slice(0, 7)); };
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(month + '-01T12:00:00'));
  const sel = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label={t('prevMonth')} onClick={() => shift(-1)}><ChevronRight size={18} className="ltr:rotate-180" /></IconButton>
        <h2 className="min-w-[140px] text-center text-md font-semibold">{title}</h2>
        <IconButton label={t('nextMonth')} onClick={() => shift(1)}><ChevronLeft size={18} className="ltr:rotate-180" /></IconButton>
        <Button variant="ghost" size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>{t('thisMonth')}</Button>
        {dateCols.length > 1 && (
          <label className="ms-auto flex items-center gap-2 text-sm text-text-muted">{t('dateColumn')}
            <select className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm" value={col.id} onChange={(e) => onDateColumn(e.target.value)}>
              {dateCols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
        )}
      </div>
      <div role="grid" aria-label={title} className="grid grid-cols-[repeat(7,minmax(0,1fr))] overflow-hidden rounded-md border border-border bg-bg">
        {weekdayNames.map((w, i) => <div key={i} role="columnheader" className="border-b border-border bg-surface py-1 text-center text-xs font-medium text-text-muted">{w}</div>)}
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          return (
            <div key={d} role="gridcell" aria-selected={selected === d}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(d); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const it = items.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (it) moveTo(it, d); }}
              className={clsx('min-h-[56px] min-w-0 overflow-hidden border-b border-s border-border p-1 sm:min-h-[104px]', !inMonth && 'bg-surface', over === d && 'outline outline-2 -outline-offset-2 outline-focus')}>
              <button type="button" onClick={() => setSelected(d)} aria-label={`${fmtDate(d, locale)}: ${list.length}`}
                className={clsx('mb-1 grid h-6 min-w-6 place-items-center rounded-pill px-1 text-xs tabular-nums',
                  d === today ? 'bg-accent font-semibold text-on-accent' : selected === d ? 'bg-surface-selected text-accent' : inMonth ? 'text-text' : 'text-text-subtle')}>
                {Number(d.slice(8))}
              </button>
              <div className="flex flex-wrap gap-[3px] sm:hidden">
                {list.slice(0, 4).map((it) => <span key={it.id} className="h-[6px] w-[6px] rounded-pill" style={{ background: colorOf(it) }} />)}
              </div>
              <ul className="hidden grid-cols-[minmax(0,1fr)] gap-[3px] sm:grid">
                {list.slice(0, 3).map((it) => (
                  <li key={it.id}>
                    <button type="button" draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)} onClick={() => onOpen(it.id)} title={it.name} dir="auto"
                      className="block w-full truncate rounded-xs border-s-[3px] bg-surface px-1 py-[1px] text-start text-xs hover:bg-surface-hover" style={{ borderInlineStartColor: colorOf(it) }}>
                      {it.name}
                    </button>
                  </li>
                ))}
                {list.length > 3 && <li><button type="button" onClick={() => setSelected(d)} className="text-xs text-accent">+{list.length - 3}</button></li>}
              </ul>
            </div>
          );
        })}
      </div>
      {selected && (
        <section aria-label={`${t('dayItems')} ${fmtDate(selected, locale)}`} className="rounded-md border border-border bg-bg p-3">
          <h3 className="mb-2 text-sm font-semibold">{t('dayItems')} {fmtDate(selected, locale)}</h3>
          {sel.length === 0 ? <p className="text-sm text-text-muted">{t('noItemsDay')}</p> : (
            <ul className="grid gap-1">
              {sel.map((it) => (
                <li key={it.id}>
                  <button type="button" onClick={() => onOpen(it.id)} className="flex w-full items-center gap-2 rounded-xs px-2 py-1 text-start text-sm hover:bg-surface-hover">
                    <span className="h-3 w-3 flex-none rounded-pill" style={{ background: colorOf(it) }} />
                    <span className="truncate" dir="auto">{it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
