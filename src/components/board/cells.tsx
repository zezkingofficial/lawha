'use client';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { Check, ExternalLink, FileText, Paperclip, Pencil, Plus, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CellValue, CheckboxValue, Column, LabelColor, StatusLabel, DateValue, DropdownValue, EmailValue, FilesValue, Item, LinkValue, NumbersValue, PeopleValue, PhoneValue, Profile, StatusValue, TextValue, TimelineValue } from '@/lib/data/types';
import { useAssets, useData } from '@/lib/data/context';
import { readFile } from '@/lib/files';
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
  const [editing, setEditing] = useState(false);
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
    <Pop label={editing ? t('labels') : column.title} trigger={pill} open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(false); }} width={editing ? 300 : 260}>
      {editing ? <LabelEditor column={column} onBack={() => setEditing(false)} /> : (
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
          <button type="button" onClick={() => setEditing(true)} className="col-span-2 flex items-center justify-center gap-1 border-t border-border pt-2 text-sm text-accent">
            <Pencil size={14} />{t('editLabels')}
          </button>
        </div>
      )}
    </Pop>
  );
}

const LABEL_COLORS: LabelColor[] = ['green', 'orange', 'red', 'blue', 'purple', 'teal', 'pink', 'navy', 'brown', 'grey', 'yellow', 'lime'];

// S09: rename, recolour, mark as done, add and delete labels. Deleting a label
// clears it from every item (the data layer does that), so no value points nowhere.
function LabelEditor({ column, onBack }: { column: Column; onBack: () => void }) {
  const { t } = useLang();
  const d = useData();
  const labels = column.settings.labels ?? [];
  const [picking, setPicking] = useState<string | null>(null);
  const save = (next: StatusLabel[]) => d.updateColumnSettings(column.id, { labels: next });
  const patch = (id: string, p: Partial<StatusLabel>) => save(labels.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1">
        {labels.map((l) => (
          <li key={l.id} className="grid gap-1">
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`${t('groupColor')}: ${l.name}`} onClick={() => setPicking(picking === l.id ? null : l.id)}
                className="h-7 w-7 flex-none rounded-xs" style={{ background: labelBg(l.color) }} />
              <input defaultValue={l.name} aria-label={t('labelName')} className="h-7 min-w-0 flex-1 rounded-xs border border-border-input bg-bg px-2 text-sm"
                onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== l.name) patch(l.id, { name: n.slice(0, 40) }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <label className="flex flex-none items-center gap-1 text-xs text-text-muted" title={t('doneLabel')}>
                <input type="checkbox" checked={l.done} onChange={(e) => patch(l.id, { done: e.target.checked })} className="h-4 w-4 accent-[color:var(--c-accent)]" />
                <Check size={12} />
              </label>
              <button type="button" aria-label={`${t('deleteLabel')}: ${l.name}`} disabled={labels.length <= 1} onClick={() => save(labels.filter((x) => x.id !== l.id))}
                className="grid h-7 w-7 flex-none place-items-center rounded-xs text-text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-40"><X size={14} /></button>
            </div>
            {picking === l.id && (
              <div className="grid grid-cols-6 gap-1 ps-8">
                {LABEL_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => { patch(l.id, { color: c }); setPicking(null); }}
                    className={clsx('h-6 w-6 rounded-pill', l.color === c && 'ring-2 ring-text')} style={{ background: labelBg(c) }} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <button type="button" disabled={labels.length >= 40} className="text-start text-sm text-accent disabled:opacity-50" onClick={() => {
        const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now());
        save([...labels, { id, name: t('labelName'), color: LABEL_COLORS[labels.length % LABEL_COLORS.length], done: false }]);
      }}>{t('addLabel')}</button>
      <p className="text-xs text-text-subtle"><Check size={11} className="inline" /> = {t('doneLabel')}</p>
      <button type="button" onClick={onBack} className="border-t border-border pt-2 text-sm text-text-muted hover:text-text">{t('back')}</button>
    </div>
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

// ---------- long text

export function LongTextCell({ item, column, canEdit, onSet }: CellProps) {
  const { t } = useLang();
  const v = item.vals[column.id] as TextValue | undefined;
  const [draft, setDraft] = useState(v?.text ?? '');
  const face = (
    <button type="button" disabled={!canEdit} title={v?.text} aria-label={`${column.title}: ${v?.text ?? '—'}`}
      className="h-full min-h-[35px] w-full truncate px-2 text-start text-sm disabled:cursor-default" dir="auto">
      {v?.text?.split('\n')[0] ?? ''}
    </button>
  );
  if (!canEdit) return face;
  return (
    <Pop label={column.title} trigger={face} width={320} onOpenChange={(o) => {
      if (o) setDraft(v?.text ?? '');
      else if (draft.trim() !== (v?.text ?? '')) onSet(draft.trim() ? { text: draft.trim() } : null);
    }}>
      <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={column.title} dir="auto" rows={7}
        className="w-full resize-y rounded-sm border border-border-input bg-bg p-2 text-sm" />
    </Pop>
  );
}

// ---------- dropdown

export function DropdownCell({ item, column, canEdit, onSet }: CellProps) {
  const { t } = useLang();
  const d = useData();
  const [newName, setNewName] = useState('');
  const options = column.settings.options ?? [];
  const v = item.vals[column.id] as DropdownValue | undefined;
  const ids = v?.option_ids ?? [];
  const chosen = options.filter((o) => ids.includes(o.id));
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onSet(next.length ? { option_ids: next } : null);
  };
  const face = (
    <button type="button" disabled={!canEdit} aria-label={`${column.title}: ${chosen.map((o) => o.name).join('، ') || '—'}`}
      className="flex h-full min-h-[35px] w-full items-center justify-center gap-1 overflow-hidden px-1 disabled:cursor-default">
      {chosen.map((o) => <span key={o.id} className="truncate rounded-xs bg-surface-hover px-[6px] py-[1px] text-xs">{o.name}</span>)}
    </button>
  );
  if (!canEdit) return face;
  const addOption = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now());
    await d.updateColumnSettings(column.id, { options: [...options, { id, name }] });
    setNewName('');
    await d.setCell(item.id, column.id, { option_ids: [...ids, id] });
  };
  return (
    <Pop label={column.title} trigger={face} width={240}>
      <ul className="grid max-h-[240px] gap-[2px] overflow-y-auto" role="listbox" aria-multiselectable="true">
        {options.map((o) => (
          <li key={o.id}>
            <button type="button" role="option" aria-selected={ids.includes(o.id)} onClick={() => toggle(o.id)}
              className="flex w-full items-center gap-2 rounded-xs px-2 py-[6px] text-sm hover:bg-surface-hover">
              <span className="flex-1 text-start">{o.name}</span>
              {ids.includes(o.id) && <Check size={16} className="text-accent" />}
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-1 flex gap-1 border-t border-border pt-2" onSubmit={(e) => { e.preventDefault(); addOption(); }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('newOption')} aria-label={t('newOption')}
          className="h-8 min-w-0 flex-1 rounded-sm border border-border-input bg-bg px-2 text-sm" />
        <button type="submit" className="rounded-sm px-2 text-sm text-accent hover:bg-surface-hover">{t('addOption')}</button>
      </form>
    </Pop>
  );
}

// ---------- checkbox

export function CheckboxCell({ item, column, canEdit, onSet }: CellProps) {
  const v = item.vals[column.id] as CheckboxValue | undefined;
  return (
    <label className="flex h-full min-h-[35px] w-full cursor-pointer items-center justify-center">
      <input type="checkbox" checked={!!v?.checked} disabled={!canEdit} aria-label={column.title}
        onChange={(e) => onSet(e.target.checked ? { checked: true } : null)} className="h-4 w-4 accent-[color:var(--c-accent)]" />
    </label>
  );
}

// ---------- phone / email: edit in place

export function PhoneCell({ item, column, canEdit, onSet, onInvalid }: CellProps & { onInvalid: () => void }) {
  const [editing, setEditing] = useState(false);
  const v = item.vals[column.id] as PhoneValue | undefined;
  if (editing) {
    return <InlineEditor numeric label={column.title} initialValue={v?.phone ?? ''} onCancel={() => setEditing(false)}
      onCommit={(s) => {
        setEditing(false);
        const c = s.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
        if (c === (v?.phone ?? '')) return;
        if (!c) { onSet(null); return; }
        if (!/^\+?[0-9 ()-]{6,20}$/.test(c)) { onInvalid(); return; }
        onSet({ phone: c });
      }} />;
  }
  const digits = v?.phone.replace(/\D/g, '');
  return (
    <div className="group flex h-full min-h-[35px] w-full items-center justify-center gap-1 px-1">
      <button type="button" disabled={!canEdit} onClick={() => setEditing(true)} aria-label={`${column.title}: ${v?.phone ?? '—'}`}
        className="h-full min-h-[35px] min-w-0 flex-1 truncate text-sm tabular-nums disabled:cursor-default"><bdi dir="ltr">{v?.phone ?? ''}</bdi></button>
      {digits && (
        <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${v?.phone}`} title="WhatsApp"
          className="flex-none rounded-xs px-1 text-xs font-semibold text-success hover:bg-surface-hover">WA</a>
      )}
    </div>
  );
}

export function EmailCell({ item, column, canEdit, onSet, onInvalid }: CellProps & { onInvalid: () => void }) {
  const [editing, setEditing] = useState(false);
  const v = item.vals[column.id] as EmailValue | undefined;
  if (editing) {
    return <InlineEditor numeric label={column.title} initialValue={v?.email ?? ''} onCancel={() => setEditing(false)}
      onCommit={(s) => {
        setEditing(false);
        const c = s.trim();
        if (c === (v?.email ?? '')) return;
        if (!c) { onSet(null); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { onInvalid(); return; }
        onSet({ email: c });
      }} />;
  }
  return (
    <button type="button" disabled={!canEdit} onClick={() => setEditing(true)} aria-label={`${column.title}: ${v?.email ?? '—'}`}
      className="h-full min-h-[35px] w-full truncate px-2 text-sm disabled:cursor-default"><bdi dir="ltr">{v?.email ?? ''}</bdi></button>
  );
}

// ---------- link

export function LinkCell({ item, column, canEdit, onSet, onInvalid }: CellProps & { onInvalid: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const v = item.vals[column.id] as LinkValue | undefined;
  const shown = v ? (v.label || v.url.replace(/^https?:\/\//, '')) : '';
  const face = (
    <button type="button" disabled={!canEdit} aria-label={`${column.title}: ${shown || '—'}`}
      className="h-full min-h-[35px] min-w-0 flex-1 truncate px-2 text-sm text-accent disabled:cursor-default" dir="auto">{shown}</button>
  );
  return (
    <div className="flex h-full w-full min-w-0 items-center">
      {canEdit ? (
        <Pop label={column.title} trigger={face} open={open} onOpenChange={setOpen} width={280}>
          <form className="grid gap-2" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const url = String(f.get('url') ?? '').trim();
            const label = String(f.get('label') ?? '').trim();
            if (!url) { onSet(null); setOpen(false); return; }
            const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
            if (!/^https?:\/\/\S+\.\S+/.test(full)) { onInvalid(); return; }
            onSet(label ? { url: full, label } : { url: full });
            setOpen(false);
          }}>
            <input name="url" autoFocus defaultValue={v?.url ?? ''} dir="ltr" placeholder="https://" aria-label="URL" className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm" />
            <input name="label" defaultValue={v?.label ?? ''} placeholder={t('urlLabel')} aria-label={t('urlLabel')} className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm" />
            <button type="submit" className="h-8 rounded-sm bg-accent text-sm text-on-accent">{t('save')}</button>
          </form>
        </Pop>
      ) : face}
      {v && <a href={v.url} target="_blank" rel="noreferrer" aria-label={t('openLink')} className="flex-none px-1 text-text-subtle hover:text-accent"><ExternalLink size={14} /></a>}
    </div>
  );
}

// ---------- timeline

export function TimelineCell({ item, column, canEdit, onSet, onInvalid }: CellProps & { onInvalid: () => void }) {
  const { t, locale } = useLang();
  const v = item.vals[column.id] as TimelineValue | undefined;
  const today = todayISO();
  const pct = v ? Math.max(0, Math.min(100, ((Date.parse(today) - Date.parse(v.from)) / Math.max(1, Date.parse(v.to) - Date.parse(v.from))) * 100)) : 0;
  const face = (
    <button type="button" disabled={!canEdit} aria-label={`${column.title}: ${v ? `${fmtDate(v.from, locale)} – ${fmtDate(v.to, locale)}` : '—'}`}
      className="group flex h-full min-h-[35px] w-full items-center justify-center px-2 disabled:cursor-default">
      {v ? (
        <span className="relative flex h-6 w-full items-center justify-center overflow-hidden rounded-pill bg-label-empty text-xs font-medium text-on-label-dark">
          <span className="absolute inset-y-0 start-0 bg-accent" style={{ width: `${pct}%` }} />
          <span className="relative tabular-nums mix-blend-normal" style={{ color: pct > 50 ? 'var(--c-on-accent)' : undefined }}>{fmtDate(v.from, locale)} – {fmtDate(v.to, locale)}</span>
        </span>
      ) : <Plus size={14} className="text-text-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />}
    </button>
  );
  if (!canEdit) return face;
  return (
    <Pop label={column.title} trigger={face} width={260}>
      <form className="grid gap-2" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const from = String(f.get('from') ?? ''), to = String(f.get('to') ?? '');
        if (!from && !to) { onSet(null); return; }
        if (!from || !to || from > to) { onInvalid(); return; }
        onSet({ from, to });
      }}>
        <label className="grid gap-1 text-sm">{t('from')}<input name="from" type="date" defaultValue={v?.from} className="h-8 rounded-sm border border-border-input bg-bg px-2" /></label>
        <label className="grid gap-1 text-sm">{t('to')}<input name="to" type="date" defaultValue={v?.to} className="h-8 rounded-sm border border-border-input bg-bg px-2" /></label>
        <div className="flex gap-2">
          <button type="submit" className="h-8 flex-1 rounded-sm bg-accent text-sm text-on-accent">{t('save')}</button>
          {v && <button type="button" onClick={() => onSet(null)} className="h-8 rounded-sm px-3 text-sm hover:bg-surface-hover">{t('clear')}</button>}
        </div>
      </form>
    </Pop>
  );
}

// ---------- files

export function FilesCell({ item, column, canEdit }: CellProps) {
  const { t } = useLang();
  const d = useData();
  const { data: assets = [] } = useAssets(item.boardId, item.id);
  const [err, setErr] = useState('');
  const v = item.vals[column.id] as FilesValue | undefined;
  const mine = assets.filter((a) => v?.asset_ids.includes(a.id));
  const face = (
    <button type="button" aria-label={`${column.title}: ${mine.length}`} className="group flex h-full min-h-[35px] w-full items-center justify-center gap-1">
      {mine.length ? (<><Paperclip size={14} className="text-text-muted" /><span className="text-sm tabular-nums">{mine.length}</span></>)
        : <Plus size={14} className="text-text-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />}
    </button>
  );
  return (
    <Pop label={column.title} trigger={face} width={280}>
      <ul className="grid max-h-[220px] gap-1 overflow-y-auto">
        {mine.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            {a.mimeType.startsWith('image/') ? <img src={a.url} alt={a.fileName} className="h-9 w-9 rounded-xs object-cover" /> : <FileText size={18} className="text-text-muted" />}
            <span className="min-w-0 flex-1 truncate" dir="auto">{a.fileName}</span>
            <span className="text-xs text-text-subtle tabular-nums">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
          </li>
        ))}
        {!mine.length && <li className="text-sm text-text-muted">{t('noFiles')}</li>}
      </ul>
      {canEdit && (
        <label className="mt-2 flex h-8 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-border-strong text-sm text-accent hover:bg-surface-hover">
          <Paperclip size={14} />{t('upload')}
          <input type="file" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setErr('');
            try { await d.uploadToCell(item.id, column.id, await readFile(f)); }
            catch (x) { setErr((x as Error).message === 'file too large' ? t('fileTooLarge') : (x as Error).message); }
          }} />
        </label>
      )}
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </Pop>
  );
}

// ---------- one entry point for every column type

export function AnyCell(props: CellProps & { doneIds: Set<string>; onInvalid: () => void }) {
  const { column, doneIds, onInvalid, ...rest } = props;
  const p = { ...rest, column };
  switch (column.type) {
    case 'status': return <StatusCell {...p} />;
    case 'people': return <PeopleCell {...p} />;
    case 'date': return <DateCell {...p} doneLabelIds={doneIds} />;
    case 'text': return <TextCell {...p} />;
    case 'numbers': return <NumbersCell {...p} onInvalid={onInvalid} />;
    case 'long_text': return <LongTextCell {...p} />;
    case 'dropdown': return <DropdownCell {...p} />;
    case 'checkbox': return <CheckboxCell {...p} />;
    case 'phone': return <PhoneCell {...p} onInvalid={onInvalid} />;
    case 'email': return <EmailCell {...p} onInvalid={onInvalid} />;
    case 'link': return <LinkCell {...p} onInvalid={onInvalid} />;
    case 'timeline': return <TimelineCell {...p} onInvalid={onInvalid} />;
    case 'files': return <FilesCell {...p} />;
  }
}
