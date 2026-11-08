'use client';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { Check, Pencil, Plus, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CellValue, Column, DateValue, Item, NumbersValue, PeopleValue, Profile, StatusValue, TextValue } from '@/lib/data/types';
import { fmtDate, fmtNumber, labelBg, labelFg, todayISO } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { Avatar, AvatarStack } from '../ui';

export interface CellProps {
  item: Item;
  column: Column;
  members: Profile[];
  me: Profile | null;
  canEdit: boolean;
  onSet: (value: CellValue | null) => Promise<void>;
}

const popClass = 'z-30 rounded-md border border-border bg-surface-raised p-2 shadow-pop outline-none';

function Pop({ trigger, children, label, open, onOpenChange, width = 260 }: { trigger: ReactNode; children: ReactNode; label: string; open?: boolean; onOpenChange?: (o: boolean) => void; width?: number }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label={label} sideOffset={6} collisionPadding={8} className={popClass} style={{ width }}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------- status

export function StatusCell({ item, column, canEdit, onSet }: CellProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const labels = column.settings.labels ?? [];
  const v = item.vals[column.id] as StatusValue | undefined;
  const cur = labels.find((l) => l.id === v?.label_id);
  const color = cur?.color ?? 'empty';
  const pill = (
    <button
      type="button"
      disabled={!canEdit}
      aria-label={`${column.title}: ${cur?.name ?? '—'}`}
      className="h-full min-h-[35px] w-full text-sm font-medium transition-[filter] duration-fast hover:brightness-110 disabled:cursor-default"
      style={{ background: labelBg(color), color: labelFg(color) }}
    >
      {cur?.name ?? ''}
    </button>
  );
  if (!canEdit) return pill;
  return (
    <Pop label={column.title} trigger={pill} open={open} onOpenChange={setOpen}>
      <div className="grid grid-cols-2 gap-[6px]" onKeyDown={(e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= labels.length) { onSet({ label_id: labels[n - 1].id }); setOpen(false); }
      }}>
        {labels.map((l, i) => (
          <button
            key={l.id}
            type="button"
            autoFocus={l.id === cur?.id || (!cur && i === 0)}
            className="min-h-8 rounded-xs px-2 text-sm font-medium"
            style={{ background: labelBg(l.color), color: labelFg(l.color) }}
            onClick={() => { onSet({ label_id: l.id }); setOpen(false); }}
          >
            {l.name}
          </button>
        ))}
        {cur && (
          <button type="button" className="col-span-2 flex items-center justify-center gap-1 rounded-xs py-1 text-sm text-text-muted hover:bg-surface-hover" onClick={() => { onSet(null); setOpen(false); }}>
            <X size={14} />{t('clear')}
          </button>
        )}
        <button type="button" disabled title={t('soon')} className="col-span-2 flex items-center justify-center gap-1 border-t border-border pt-2 text-sm text-accent opacity-60">
          <Pencil size={14} />{t('editLabels')}
        </button>
      </div>
    </Pop>
  );
}

// ---------- people

export function PeopleCell({ item, column, members, me, canEdit, onSet }: CellProps) {
  const { t } = useLang();
  const v = item.vals[column.id] as PeopleValue | undefined;
  const ids = v?.user_ids ?? [];
  const people = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Profile[];
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onSet(next.length ? { user_ids: next } : null);
  };
  const face = (
    <button type="button" disabled={!canEdit} aria-label={`${column.title}: ${people.map((p) => p.fullName).join('، ') || t('unassigned')}`}
      className="group flex h-full min-h-[35px] w-full items-center justify-center disabled:cursor-default">
      {people.length ? <AvatarStack people={people} /> : (
        <span className="grid h-6 w-6 place-items-center rounded-pill border border-dashed border-border-strong text-text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <UserRound size={13} />
        </span>
      )}
    </button>
  );
  if (!canEdit) return face;
  return (
    <Pop label={column.title} trigger={face} width={240}>
      <ul className="grid gap-[2px]" role="listbox" aria-multiselectable="true">
        {members.filter((m) => m.role !== 'guest').map((m) => (
          <li key={m.id}>
            <button type="button" role="option" aria-selected={ids.includes(m.id)} onClick={() => toggle(m.id)}
              className="flex w-full items-center gap-2 rounded-xs px-2 py-[6px] text-sm hover:bg-surface-hover">
              <Avatar person={m} size={24} />
              <span className="flex-1 text-start">{m.fullName}</span>
              {ids.includes(m.id) && <Check size={16} className="text-accent" />}
            </button>
          </li>
        ))}
      </ul>
      {me && !ids.includes(me.id) && (
        <button type="button" onClick={() => toggle(me.id)} className="mt-1 w-full border-t border-border pt-2 text-sm text-accent">{t('assignMe')}</button>
      )}
    </Pop>
  );
}

// ---------- date

export function DateCell({ item, column, canEdit, onSet, doneLabelIds }: CellProps & { doneLabelIds?: Set<string>; statusValue?: string }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const v = item.vals[column.id] as DateValue | undefined;
  const statusDone = Object.values(item.vals).some((x) => doneLabelIds?.has((x as StatusValue).label_id));
  const overdue = !!v && v.date < todayISO() && !statusDone;
  const face = (
    <button type="button" disabled={!canEdit}
      aria-label={`${column.title}: ${v ? fmtDate(v.date, locale) : '—'}${overdue ? ` (${t('overdue')})` : ''}`}
      className={clsx('group flex h-full min-h-[35px] w-full items-center justify-center text-sm tabular-nums disabled:cursor-default', overdue && 'font-semibold text-danger')}>
      {v ? fmtDate(v.date, locale) : <Plus size={14} className="text-text-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />}
    </button>
  );
  if (!canEdit) return face;
  const pick = (d: string | null) => { onSet(d ? { date: d } : null); setOpen(false); };
  return (
    <Pop label={column.title} trigger={face} open={open} onOpenChange={setOpen} width={240}>
      <div className="grid gap-2">
        <input type="date" aria-label={column.title} defaultValue={v?.date ?? ''} className="h-8 w-full rounded-sm border border-border-input bg-bg px-2"
          onChange={(e) => e.target.value && pick(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          <QuickPick onClick={() => pick(todayISO())}>{t('today')}</QuickPick>
          <QuickPick onClick={() => pick(todayISO(1))}>{t('tomorrow')}</QuickPick>
          <QuickPick onClick={() => pick(todayISO(7))}>{t('nextWeek')}</QuickPick>
          {v && <QuickPick onClick={() => pick(null)}>{t('clear')}</QuickPick>}
        </div>
      </div>
    </Pop>
  );
}

function QuickPick({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-xs bg-surface px-2 py-1 text-sm hover:bg-surface-hover">{children}</button>;
}

// ---------- text and numbers: edit in place

function InlineEditor({ initialValue, onCommit, onCancel, numeric, label }: { initialValue: string; onCommit: (v: string) => void; onCancel: () => void; numeric?: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      aria-label={label}
      defaultValue={initialValue}
      inputMode={numeric ? 'decimal' : undefined}
      dir={numeric ? 'ltr' : 'auto'}
      className="h-full w-full bg-bg px-2 text-sm outline outline-2 outline-focus"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={(e) => onCommit(e.target.value)}
    />
  );
}

export function TextCell({ item, column, canEdit, onSet }: CellProps) {
  const [editing, setEditing] = useState(false);
  const v = item.vals[column.id] as TextValue | undefined;
  if (editing) {
    return <InlineEditor label={column.title} initialValue={v?.text ?? ''} onCancel={() => setEditing(false)}
      onCommit={(s) => { setEditing(false); const c = s.trim(); if (c !== (v?.text ?? '')) onSet(c ? { text: c } : null); }} />;
  }
  return (
    <button type="button" disabled={!canEdit} onClick={() => setEditing(true)} title={v?.text}
      aria-label={`${column.title}: ${v?.text ?? '—'}`}
      className="h-full min-h-[35px] w-full truncate px-2 text-start text-sm disabled:cursor-default" dir="auto">
      {v?.text ?? ''}
    </button>
  );
}

export function NumbersCell({ item, column, canEdit, onSet, onInvalid }: CellProps & { onInvalid: () => void }) {
  const { locale } = useLang();
  const [editing, setEditing] = useState(false);
  const v = item.vals[column.id] as NumbersValue | undefined;
  const unit = column.settings.unit;
  if (editing) {
    return <InlineEditor numeric label={column.title} initialValue={v?.number ?? ''} onCancel={() => setEditing(false)}
      onCommit={(s) => {
        setEditing(false);
        const c = s.trim().replace(/,/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
        if (c === (v?.number ?? '')) return;
        if (c === '') { onSet(null); return; }
        if (!isFinite(Number(c))) { onInvalid(); return; }
        onSet({ number: c });
      }} />;
  }
  return (
    <button type="button" disabled={!canEdit} onClick={() => setEditing(true)}
      aria-label={`${column.title}: ${v ? fmtNumber(v.number, locale) : '—'}`}
      className="flex h-full min-h-[35px] w-full items-center justify-end gap-1 px-3 text-sm tabular-nums disabled:cursor-default">
      {v && <bdi>{fmtNumber(v.number, locale)}</bdi>}
      {v && unit && <span className="text-xs text-text-subtle">{unit}</span>}
    </button>
  );
}
