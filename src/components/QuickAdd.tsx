'use client';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAllBoards, useBoard, useData, useMe, useMembers } from '@/lib/data/context';
import { NotAllowed } from '@/lib/data/fake';
import { CellError, validateCell } from '@/lib/data/validate';
import type { BoardBundle, CellValue, Column, Profile } from '@/lib/data/types';
import { fmtDate, labelBg, labelFg, todayISO } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { Avatar, BottomSheet, Button, Chip, useToast } from './ui';

// One sheet for adding an item from anywhere: a name plus the few fields people
// fill most (status, who, when, amounts), each a tap instead of a cell editor.

interface Target { boardId?: string; groupId?: string }
const Ctx = createContext<(t?: Target) => void>(() => {});
export const useQuickAdd = () => useContext(Ctx);
const LAST = 'lawha:lastAddBoard';

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t?: Target) => setTarget(t ?? {}), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {target && <QuickAddSheet target={target} onClose={() => setTarget(null)} />}
    </Ctx.Provider>
  );
}

const digits = (s: string) => s.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬]/g, '').replace('٫', '.');

function QuickAddSheet({ target, onClose }: { target: Target; onClose: () => void }) {
  const { t } = useLang();
  const { route } = useRouter();
  const { data: me } = useMe();
  const { data: boards = [], loading } = useAllBoards();
  const [boardId, setBoardId] = useState<string | undefined>(target.boardId);
  const titleId = useId();

  // pick a board: the one asked for, the one on screen, the last one used, else the first
  useEffect(() => {
    if (boardId || !boards.length) return;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST); } catch { /* ignore */ }
    const here = route.name === 'board' ? route.boardId : null;
    const pick = [here, last].find((id) => id && boards.some((b) => b.id === id)) ?? boards[0].id;
    setBoardId(pick);
  }, [boards, boardId, route]);

  const canAddAnywhere = me && me.role !== 'viewer';
  return (
    <BottomSheet open onClose={onClose} title={t('quickAdd')} labelledBy={titleId}>
      {!loading && (!boards.length || !canAddAnywhere) && <p className="py-6 text-center text-text-muted">{t('noEditBoards')}</p>}
      {boardId && canAddAnywhere && (
        <QuickAddForm key={boardId} boardId={boardId} boards={boards} onBoard={setBoardId} groupId={target.boardId === boardId ? target.groupId : undefined} onDone={onClose} />
      )}
    </BottomSheet>
  );
}

function QuickAddForm({ boardId, boards, onBoard, groupId: askedGroup, onDone }: {
  boardId: string; boards: { id: string; name: string }[]; onBoard: (id: string) => void; groupId?: string; onDone: () => void;
}) {
  const { data: bundle } = useBoard(boardId);
  const { data: members = [] } = useMembers();
  const { data: me } = useMe();
  if (!bundle || !me) return <div className="h-48 animate-pulse rounded-md bg-surface-hover motion-reduce:animate-none" />;
  return <Form bundle={bundle} members={members} me={me} boards={boards} onBoard={onBoard} askedGroup={askedGroup} onDone={onDone} />;
}

type Vals = Record<string, string | string[]>;

function Form({ bundle, members, me, boards, onBoard, askedGroup, onDone }: {
  bundle: BoardBundle; members: Profile[]; me: Profile; boards: { id: string; name: string }[]; onBoard: (id: string) => void; askedGroup?: string; onDone: () => void;
}) {
  const { t, locale } = useLang();
  const d = useData();
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const cols = bundle.columns.filter((c) => c.scope === 'item');
  const status = cols.find((c) => c.type === 'status');
  const people = cols.find((c) => c.type === 'people');
  const date = cols.find((c) => c.type === 'date');
  const nums = cols.filter((c) => c.type === 'numbers').slice(0, 2);
  const extra = cols.filter((c) => ['text', 'long_text', 'phone', 'email', 'link', 'dropdown'].includes(c.type));
  const boardPeople = useMemo(() => {
    const list = members.filter((m) => m.role !== 'guest' || bundle.members.some((bm) => bm.userId === m.id));
    return [me, ...list.filter((m) => m.id !== me.id)];
  }, [members, bundle.members, me]);

  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(askedGroup ?? bundle.groups[0]?.id);
  const [vals, setVals] = useState<Vals>({});
  const [more, setMore] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the board loads after the sheet opens, so focus the name here rather than in the sheet
  useEffect(() => { nameRef.current?.focus(); }, []);
  const set = (id: string, v: string | string[] | undefined) => { setBad(null); setVals((x) => { const n = { ...x }; if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete n[id]; else n[id] = v; return n; }); };

  if (!bundle.canEdit) return <p className="py-6 text-center text-text-muted">{t('viewOnly')}</p>;

  const toValue = (c: Column, v: string | string[]): CellValue => {
    switch (c.type) {
      case 'status': return { label_id: v as string };
      case 'people': return { user_ids: v as string[] };
      case 'date': return { date: v as string };
      case 'numbers': return { number: digits(v as string) };
      case 'phone': return { phone: digits(v as string) };
      case 'email': return { email: (v as string).trim() };
      case 'link': return { url: (v as string).trim() };
      case 'dropdown': return { option_ids: v as string[] };
      default: return { text: v as string };
    }
  };

  const submit = async (next: boolean) => {
    if (!name.trim() || busy) { nameRef.current?.focus(); return; }
    const writes: [Column, CellValue][] = [];
    for (const c of cols) {
      const v = vals[c.id];
      if (v === undefined) continue;
      const cv = toValue(c, v);
      try { validateCell(c, cv); } catch { setBad(c.id); if (extra.includes(c)) setMore(true); toast({ tone: 'error', text: `${c.title}: ${t('fixValue')}` }); return; }
      writes.push([c, cv]);
    }
    setBusy(true);
    try {
      const item = await d.createItem(bundle.board.id, name.trim(), { groupId: groupId ?? bundle.groups[0]?.id ?? '' });
      for (const [c, cv] of writes) await d.setCell(item.id, c.id, cv);
      try { localStorage.setItem(LAST, bundle.board.id); } catch { /* ignore */ }
      toast({ text: `${t('added')}: ${item.name}`, undo: () => d.deleteItem(item.id) });
      if (next) { setName(''); setVals((v) => (status && v[status.id] ? { [status.id]: v[status.id] } : {})); nameRef.current?.focus(); }
      else onDone();
    } catch (e) {
      toast({ tone: 'error', text: e instanceof NotAllowed ? t('viewOnlyError') : e instanceof CellError ? t('invalidValue') : (e as Error).message });
    } finally { setBusy(false); }
  };

  const today = todayISO(), tomorrow = todayISO(1), week = todayISO(7);
  const dateVal = date ? (vals[date.id] as string | undefined) : undefined;
  const field = (c: Column) => clsx('h-11 w-full rounded-md border bg-bg px-3 text-base outline-none focus:border-focus', bad === c.id ? 'border-danger' : 'border-border-input');

  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <div className="grid gap-2">
        <label className="sr-only" htmlFor="qa-name">{t('name')}</label>
        <input id="qa-name" ref={nameRef} data-autofocus value={name} onChange={(e) => setName(e.target.value)} dir="auto" autoComplete="off" enterKeyHint="done"
          placeholder={`${t('namePh')}: ${bundle.board.itemNoun}`} className="h-12 w-full rounded-md border border-border-input bg-bg px-3 text-md font-medium outline-none focus:border-focus" />
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <SelectPill label={t('boardLabel')} value={bundle.board.id} onChange={onBoard} options={boards.map((b) => ({ id: b.id, name: b.name }))} />
          {bundle.groups.length > 1 && (
            <SelectPill label={t('groupLabel')} value={groupId ?? ''} onChange={setGroupId} options={bundle.groups.map((g) => ({ id: g.id, name: g.title, color: labelBg(g.color) }))} />
          )}
        </div>
      </div>

      {status && (
        <Section title={status.title}>
          {(status.settings.labels ?? []).map((l) => {
            const on = vals[status.id] === l.id;
            return (
              <Chip key={l.id} selected={on} onClick={() => set(status.id, on ? undefined : l.id)} style={{ background: labelBg(l.color), color: labelFg(l.color) }}>
                {on && <Check size={15} />}{l.name}
              </Chip>
            );
          })}
        </Section>
      )}

      {people && (
        <Section title={people.title}>
          {boardPeople.map((p) => {
            const list = (vals[people.id] as string[] | undefined) ?? [];
            const on = list.includes(p.id);
            return (
              <Chip key={p.id} selected={on} onClick={() => set(people.id, on ? list.filter((x) => x !== p.id) : [...list, p.id])} className="ps-1">
                <Avatar person={p} size={30} />{p.id === me.id ? t('me') : p.fullName.split(' ')[0]}
              </Chip>
            );
          })}
        </Section>
      )}

      {date && (
        <Section title={date.title}>
          <Chip selected={dateVal === today} onClick={() => set(date.id, dateVal === today ? undefined : today)}>{t('today')}</Chip>
          <Chip selected={dateVal === tomorrow} onClick={() => set(date.id, dateVal === tomorrow ? undefined : tomorrow)}>{t('tomorrow')}</Chip>
          <Chip selected={dateVal === week} onClick={() => set(date.id, dateVal === week ? undefined : week)}>{t('nextWeek')}</Chip>
          <label className={clsx('relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-pill border px-4 text-sm font-medium',
            dateVal && ![today, tomorrow, week].includes(dateVal) ? 'border-transparent bg-surface-selected text-accent shadow-[0_0_0_2px_var(--c-bg),0_0_0_4px_var(--c-text)]' : 'border-border-strong')}>
            <span className="tabular-nums">{dateVal && ![today, tomorrow, week].includes(dateVal) ? fmtDate(dateVal, locale) : t('otherDate')}</span>
            <input type="date" aria-label={`${date.title}: ${t('otherDate')}`} value={dateVal ?? ''} onChange={(e) => set(date.id, e.target.value || undefined)}
              className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </Section>
      )}

      {nums.length > 0 && (
        <div className={clsx('grid gap-3', nums.length > 1 && 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
          {nums.map((c) => (
            <label key={c.id} className="grid min-w-0 gap-1">
              <span className="text-sm font-semibold text-text-muted">{c.title}</span>
              <span className={clsx('flex h-11 min-w-0 items-center gap-2 rounded-md border bg-bg px-3 focus-within:border-focus', bad === c.id ? 'border-danger' : 'border-border-input')}>
                <input inputMode="decimal" dir="ltr" value={(vals[c.id] as string) ?? ''} onChange={(e) => set(c.id, e.target.value)} className="h-full w-0 min-w-0 flex-1 bg-transparent text-start text-base tabular-nums outline-none" />
                {c.settings.unit && <span className="flex-none text-sm text-text-subtle">{c.settings.unit}</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      {extra.length > 0 && (
        <div className="grid gap-3">
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex items-center gap-1 justify-self-start text-sm font-medium text-accent">
            <ChevronDown size={16} className={clsx('transition-transform duration-base', more && 'rotate-180')} />{more ? t('lessFields') : t('moreFields')}
          </button>
          {more && extra.map((c) => c.type === 'dropdown' ? (
            <Section key={c.id} title={c.title}>
              {(c.settings.options ?? []).map((o) => {
                const list = (vals[c.id] as string[] | undefined) ?? [];
                const on = list.includes(o.id);
                return <Chip key={o.id} selected={on} onClick={() => set(c.id, on ? list.filter((x) => x !== o.id) : [...list, o.id])}>{on && <Check size={15} />}{o.name}</Chip>;
              })}
            </Section>
          ) : (
            <label key={c.id} className="grid gap-1">
              <span className="text-sm font-semibold text-text-muted">{c.title}</span>
              {c.type === 'long_text'
                ? <textarea dir="auto" rows={3} value={(vals[c.id] as string) ?? ''} onChange={(e) => set(c.id, e.target.value)} className={clsx(field(c), 'h-auto py-2')} />
                : <input dir={c.type === 'text' ? 'auto' : 'ltr'} value={(vals[c.id] as string) ?? ''} onChange={(e) => set(c.id, e.target.value)} className={clsx(field(c), c.type !== 'text' && 'text-start')}
                    type={c.type === 'email' ? 'email' : c.type === 'link' ? 'url' : c.type === 'phone' ? 'tel' : 'text'} inputMode={c.type === 'phone' ? 'tel' : undefined} />}
            </label>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-border bg-bg px-4 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <Button type="submit" variant="primary" size="lg" className="flex-1 justify-center" disabled={busy}>{t('add')}</Button>
        <Button variant="secondary" size="lg" className="justify-center" disabled={busy} onClick={() => submit(true)}>{t('addAndNext')}</Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold text-text-muted">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function SelectPill({ label, value, onChange, options }: { label: string; value: string; onChange: (id: string) => void; options: { id: string; name: string; color?: string }[] }) {
  const cur = options.find((o) => o.id === value);
  return (
    <label className="relative inline-flex h-8 max-w-full items-center gap-1 rounded-pill bg-surface px-3 hover:bg-surface-hover">
      <span className="text-text-subtle">{label}:</span>
      {cur?.color && <span className="h-[10px] w-[10px] flex-none rounded-pill" style={{ background: cur.color }} />}
      <span className="truncate font-medium text-text">{cur?.name}</span>
      <ChevronDown size={14} className="flex-none" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

