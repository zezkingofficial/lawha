'use client';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { ChevronDown, Columns3, Ellipsis, LayoutGrid, MessageSquare, Plus, Search, Table2, Trash2, UserRound, Pencil, CalendarDays, Radio } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useBoard, useData, useMe, useMembers } from '@/lib/data/context';
import { CellError, searchText } from '@/lib/data/validate';
import { NotAllowed } from '@/lib/data/fake';
import type { BoardBundle, CellValue, Column, Group, Item, PeopleValue, Profile, StatusValue, NumbersValue } from '@/lib/data/types';
import { fmtNumber, labelBg, labelFg } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { AvatarStack, Button, IconButton, useToast } from '../ui';
import { DateCell, NumbersCell, PeopleCell, StatusCell, TextCell, type CellProps } from './cells';

type View = 'table' | 'kanban';

export function BoardScreen({ boardId }: { boardId: string }) {
  const { t } = useLang();
  const { data: bundle, loading } = useBoard(boardId);
  const { data: me } = useMe();
  const { data: members = [] } = useMembers();
  const { go } = useRouter();
  const [view, setView] = useState<View>('table');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const newItemRef = useRef<HTMLInputElement | null>(null);

  if (loading && !bundle) return <BoardSkeleton />;
  if (!bundle) {
    return (
      <div className="grid justify-items-center gap-3 py-16 text-center">
        <p className="text-md">{t('notFound')}</p>
        <Button variant="primary" onClick={() => go({ name: 'home' })}>{t('backHome')}</Button>
      </div>
    );
  }

  const canEdit = !!me && me.role !== 'viewer';
  const query = q.trim().toLowerCase();
  const peopleCols = bundle.columns.filter((c) => c.type === 'people').map((c) => c.id);
  const visible = (it: Item) => {
    if (query && !searchText(it.name, it.vals).includes(query)) return false;
    if (mine && me && !peopleCols.some((cid) => ((it.vals[cid] as PeopleValue | undefined)?.user_ids ?? []).includes(me.id))) return false;
    return true;
  };
  const filtering = !!query || mine;
  const boardMembers = members.filter((m) => m.role !== 'guest');

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <EditableTitle value={bundle.board.name} canEdit={canEdit} boardId={boardId} />
          {bundle.board.description && <p className="mt-[2px] text-sm text-text-muted">{bundle.board.description}</p>}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-pill bg-surface-selected px-2 py-[2px] text-xs font-medium text-accent sm:inline-flex" title={t('liveHelp')}>
            <Radio size={12} />{t('liveSync')}
          </span>
          {!canEdit && <span className="rounded-pill bg-surface-hover px-2 py-[2px] text-xs text-text-muted">{t('viewOnly')}</span>}
          <span aria-label={t('members')}><AvatarStack people={boardMembers} /></span>
          <Button variant="secondary" disabled title={t('soon')}><UserRound size={16} /><span className="hidden sm:inline">{t('invite')}</span></Button>
        </div>
      </header>

      <div role="tablist" aria-label="views" className="mb-3 mt-4 flex gap-1 overflow-x-auto border-b border-border">
        <Tab active={view === 'table'} onClick={() => setView('table')} icon={<Table2 size={15} />}>{t('tableView')}</Tab>
        <Tab active={view === 'kanban'} onClick={() => setView('kanban')} icon={<Columns3 size={15} />}>{t('kanbanView')}</Tab>
        <Tab active={false} disabled icon={<CalendarDays size={15} />}>{t('calendarView')}</Tab>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="primary" onClick={() => { setView('table'); setTimeout(() => newItemRef.current?.focus(), 0); }}>
            <Plus size={16} />{t('newItem')} {bundle.board.itemNoun}
          </Button>
        )}
        <label className="order-3 flex h-8 w-full items-center gap-2 rounded-sm border border-border-input bg-bg px-[10px] focus-within:border-focus sm:order-none sm:w-[220px]">
          <Search size={15} className="flex-none text-text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchItems')} aria-label={t('searchItems')} className="w-full min-w-0 bg-transparent outline-none" />
        </label>
        <Button variant="ghost" pressed={mine} onClick={() => setMine((x) => !x)}><UserRound size={16} />{t('mine')}</Button>
        {filtering && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setMine(false); }}>{t('clearFilters')}</Button>}
        {canEdit && view === 'table' && <AddGroupButton boardId={boardId} />}
      </div>

      {view === 'table' ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
          {bundle.groups.length === 0 && <p className="text-text-muted">{t('emptyBoard')}</p>}
          {bundle.groups.map((g, gi) => (
            <GroupSection key={g.id} group={g} bundle={bundle} items={bundle.items.filter((i) => i.groupId === g.id && i.parentItemId === null)}
              visible={visible} filtering={filtering} members={members} me={me ?? null} canEdit={canEdit}
              addRef={gi === 0 ? newItemRef : undefined} />
          ))}
        </div>
      ) : (
        <KanbanView bundle={bundle} visible={visible} members={members} canEdit={canEdit} />
      )}
    </div>
  );
}

function Tab({ active, children, icon, onClick, disabled }: { active: boolean; children: React.ReactNode; icon: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="tab" aria-selected={active} disabled={disabled} onClick={onClick}
      className={clsx('-mb-px flex items-center gap-[6px] whitespace-nowrap border-b-2 px-3 py-2 text-sm disabled:opacity-50',
        active ? 'border-accent font-semibold text-text' : 'border-transparent text-text-muted hover:text-text')}>
      {icon}{children}
    </button>
  );
}

function EditableTitle({ value, canEdit, boardId }: { value: string; canEdit: boolean; boardId: string }) {
  const d = useData();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input autoFocus defaultValue={value} aria-label="board name" className="w-full rounded-sm border border-focus bg-bg px-1 text-xl font-bold"
        onBlur={(e) => { setEditing(false); d.renameBoard(boardId, e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }} />
    );
  }
  return (
    <h1 className="text-balance text-xl font-bold">
      {canEdit ? <button type="button" onClick={() => setEditing(true)} className="rounded-sm text-start hover:bg-surface-hover">{value}</button> : value}
    </h1>
  );
}

function AddGroupButton({ boardId }: { boardId: string }) {
  const { t } = useLang();
  const d = useData();
  return <Button variant="ghost" onClick={() => d.createGroup(boardId, t('addGroup'))}><LayoutGrid size={16} />{t('addGroup')}</Button>;
}

// ---------------------------------------------------------------- table

function useCellSetter() {
  const d = useData();
  const toast = useToast();
  const { t } = useLang();
  return async (item: Item, column: Column, value: CellValue | null) => {
    try {
      await d.setCell(item.id, column.id, value);
    } catch (e) {
      toast({ tone: 'error', text: e instanceof NotAllowed ? t('viewOnlyError') : e instanceof CellError ? t('invalidNumber') : String((e as Error).message) });
    }
  };
}

function gridTemplate(columns: Column[]): CSSProperties {
  return { gridTemplateColumns: `4px var(--name-col) ${columns.map((c) => `${c.width}px`).join(' ')}` };
}

function GroupSection({ group, bundle, items, visible, filtering, members, me, canEdit, addRef }: {
  group: Group; bundle: BoardBundle; items: Item[]; visible: (i: Item) => boolean; filtering: boolean;
  members: Profile[]; me: Profile | null; canEdit: boolean; addRef?: React.Ref<HTMLInputElement>;
}) {
  const { t, locale } = useLang();
  const d = useData();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const shown = items.filter(visible);
  const cols = bundle.columns.filter((c) => c.scope === 'item');
  const doneIds = useMemo(() => new Set(cols.flatMap((c) => (c.settings.labels ?? []).filter((l) => l.done).map((l) => l.id))), [cols]);
  const style = { ...gridTemplate(cols), '--g': labelBg(group.color) } as CSSProperties;
  const minWidth = `calc(var(--name-col) + ${4 + cols.reduce((s, c) => s + c.width, 0)}px)`;

  const removeGroup = async () => {
    await d.deleteGroup(group.id);
    toast({ text: `${t('deleted')}: ${group.title}`, undo: () => d.restoreGroup(group.id) });
  };

  return (
    <section aria-label={group.title} style={{ '--g': labelBg(group.color) } as CSSProperties}>
      <div className="flex h-10 items-center gap-2">
        <IconButton label={collapsed ? t('expand') : t('collapse')} onClick={() => setCollapsed((c) => !c)} className="!text-[color:var(--g)]">
          <ChevronDown size={16} className={clsx('transition-transform duration-base', collapsed && 'rotate-90 rtl:-rotate-90')} />
        </IconButton>
        {renaming ? (
          <input autoFocus defaultValue={group.title} aria-label={t('renameGroup')} className="rounded-sm border border-focus bg-bg px-1 text-lg font-semibold"
            onBlur={(e) => { setRenaming(false); d.renameGroup(group.id, e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : (
          <h2 className="text-lg font-semibold" style={{ color: 'var(--g)' }}>{group.title}</h2>
        )}
        <span className="text-sm tabular-nums text-text-subtle">{shown.length} {t('items')}</span>
        {canEdit && (
          <Dropdown.Root>
            <Dropdown.Trigger asChild><IconButton label={t('groupMenu')}><Ellipsis size={16} /></IconButton></Dropdown.Trigger>
            <Menu>
              <MenuItem onSelect={() => setRenaming(true)} icon={<Pencil size={15} />}>{t('renameGroup')}</MenuItem>
              <MenuItem danger onSelect={removeGroup} icon={<Trash2 size={15} />}>{t('deleteGroup')}</MenuItem>
            </Menu>
          </Dropdown.Root>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto rounded-md">
          <div role="grid" aria-label={group.title} aria-rowcount={shown.length + 1}
            className="grid overflow-clip rounded-md border border-border bg-bg [--name-col:180px] sm:[--name-col:320px]" style={{ ...style, minWidth }}>
            <div role="row" className="contents">
              <div className="sticky start-0 z-[1] bg-[color:var(--g)]" />
              <HeadCell start>{t('item')}</HeadCell>
              {cols.map((c) => <HeadCell key={c.id}>{c.title}</HeadCell>)}
            </div>

            {shown.map((it) => (
              <ItemRow key={it.id} item={it} cols={cols} members={members} me={me} canEdit={canEdit} doneIds={doneIds} />
            ))}

            {shown.length === 0 && (
              <div role="row" className="contents">
                <div className="sticky start-0 z-[1] bg-[color:var(--g)]" />
                <div className="col-[2/-1] flex min-h-row items-center border-b border-border px-3 text-sm text-text-muted">
                  {filtering ? t('emptyFilter') : t('emptyGroup')}
                </div>
              </div>
            )}

            {canEdit && (
              <div role="row" className="contents">
                <div className="sticky start-0 z-[1] bg-[color:var(--g)] opacity-50" />
                <div className="col-[2/-1] flex min-h-row items-center border-b border-border px-3">
                  <AddItemInput boardId={bundle.board.id} groupId={group.id} placeholder={`${t('addItem')} ${bundle.board.itemNoun}`} inputRef={addRef} />
                </div>
              </div>
            )}

            <div role="row" className="contents">
              <div />
              <div className="sticky start-[4px] z-[1] min-h-row border-s border-border bg-bg" />
              {cols.map((c) => (
                <div key={c.id} className="flex min-h-row items-center justify-center border-s border-border px-2">
                  {c.type === 'numbers' && <SumCell col={c} items={shown} locale={locale} />}
                  {c.type === 'status' && <StatusDist col={c} items={shown} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function HeadCell({ children, start }: { children: React.ReactNode; start?: boolean }) {
  return (
    <div role="columnheader" className={clsx('flex min-h-row items-center border-b border-s border-border px-2 text-xs font-medium text-text-muted', start ? 'sticky start-[4px] z-[1] justify-start bg-bg ps-3' : 'justify-center')}>
      {children}
    </div>
  );
}

function SumCell({ col, items, locale }: { col: Column; items: Item[]; locale: string }) {
  const sum = items.reduce((s, i) => s + Number((i.vals[col.id] as NumbersValue | undefined)?.number ?? 0), 0);
  return (
    <span className="ms-auto text-sm font-semibold tabular-nums" title="sum">
      <bdi>{fmtNumber(sum, locale)}</bdi> {col.settings.unit && <span className="text-xs font-normal text-text-subtle">{col.settings.unit}</span>}
    </span>
  );
}

function StatusDist({ col, items }: { col: Column; items: Item[] }) {
  const labels = col.settings.labels ?? [];
  const counts = labels.map((l) => ({ l, n: items.filter((i) => (i.vals[col.id] as StatusValue | undefined)?.label_id === l.id).length })).filter((x) => x.n);
  if (!counts.length) return null;
  return (
    <div className="flex h-[22px] w-[90%] overflow-hidden rounded-xs" aria-label={counts.map((c) => `${c.l.name} ${c.n}`).join('، ')}>
      {counts.map(({ l, n }) => <span key={l.id} title={`${l.name}: ${n}`} style={{ flex: n, background: labelBg(l.color) }} />)}
    </div>
  );
}

function ItemRow({ item, cols, members, me, canEdit, doneIds }: { item: Item; cols: Column[]; members: Profile[]; me: Profile | null; canEdit: boolean; doneIds: Set<string> }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const setCell = useCellSetter();
  const [renaming, setRenaming] = useState(false);

  const remove = async () => {
    await d.deleteItem(item.id);
    toast({ text: `${t('deleted')}: ${item.name}`, undo: () => d.restoreItem(item.id) });
  };

  return (
    <div role="row" className="group/row contents">
      <div className="sticky start-0 z-[1] bg-[color:var(--g)]" />
      <div role="gridcell" className="sticky start-[4px] z-[1] flex min-h-row min-w-0 items-center gap-2 border-b border-s border-border bg-bg pe-1 ps-3 text-sm group-hover/row:bg-surface-hover">
        {renaming ? (
          <input autoFocus defaultValue={item.name} aria-label={t('rename')} dir="auto" className="h-7 w-full rounded-xs border border-focus bg-bg px-1"
            onBlur={(e) => { setRenaming(false); d.renameItem(item.id, e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : (
          <button type="button" disabled={!canEdit} onClick={() => setRenaming(true)} dir="auto" title={item.name}
            className="min-w-0 flex-1 truncate text-start disabled:cursor-default">{item.name}</button>
        )}
        <span className="hidden flex-none items-center gap-[2px] text-xs text-text-subtle sm:flex" title={t('updates')}><MessageSquare size={14} /></span>
        {canEdit && (
          <Dropdown.Root>
            <Dropdown.Trigger asChild>
              <IconButton label={`${t('itemMenu')}: ${item.name}`} small className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"><Ellipsis size={15} /></IconButton>
            </Dropdown.Trigger>
            <Menu>
              <MenuItem onSelect={() => setRenaming(true)} icon={<Pencil size={15} />}>{t('rename')}</MenuItem>
              <MenuItem danger onSelect={remove} icon={<Trash2 size={15} />}>{t('deleteItem')}</MenuItem>
            </Menu>
          </Dropdown.Root>
        )}
      </div>
      {cols.map((c) => {
        const props: CellProps = { item, column: c, members, me, canEdit, onSet: (v) => setCell(item, c, v) };
        return (
          <div key={c.id} role="gridcell" className={clsx('flex min-h-row min-w-0 items-stretch border-b border-s border-border', c.type !== 'status' && 'group-hover/row:bg-surface-hover')}>
            {c.type === 'status' && <StatusCell {...props} />}
            {c.type === 'people' && <PeopleCell {...props} />}
            {c.type === 'date' && <DateCell {...props} doneLabelIds={doneIds} />}
            {c.type === 'text' && <TextCell {...props} />}
            {c.type === 'numbers' && <NumbersCell {...props} onInvalid={() => toast({ tone: 'error', text: t('invalidNumber') })} />}
          </div>
        );
      })}
    </div>
  );
}

function AddItemInput({ boardId, groupId, placeholder, inputRef }: { boardId: string; groupId: string; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  const d = useData();
  const toast = useToast();
  const [v, setV] = useState('');
  return (
    <input ref={inputRef} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      className="w-full bg-transparent text-sm outline-none placeholder:text-text-subtle"
      onKeyDown={async (e) => {
        if (e.key === 'Enter' && v.trim()) {
          try { await d.createItem(boardId, v, { groupId }); setV(''); } catch (err) { toast({ tone: 'error', text: (err as Error).message }); }
        }
        if (e.key === 'Escape') setV('');
      }} />
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content sideOffset={4} collisionPadding={8} className="z-30 min-w-[180px] rounded-md border border-border bg-surface-raised p-1 shadow-pop">
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

function MenuItem({ children, onSelect, icon, danger }: { children: React.ReactNode; onSelect: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <Dropdown.Item onSelect={onSelect} className={clsx('flex cursor-pointer items-center gap-2 rounded-xs px-2 py-[6px] text-sm outline-none data-[highlighted]:bg-surface-hover', danger && 'text-danger')}>
      {icon}{children}
    </Dropdown.Item>
  );
}

// ---------------------------------------------------------------- kanban

function KanbanView({ bundle, visible, members, canEdit }: { bundle: BoardBundle; visible: (i: Item) => boolean; members: Profile[]; canEdit: boolean }) {
  const { t, locale } = useLang();
  const setCell = useCellSetter();
  const status = bundle.columns.find((c) => c.type === 'status');
  const people = bundle.columns.find((c) => c.type === 'people');
  const date = bundle.columns.find((c) => c.type === 'date');
  const [over, setOver] = useState<string | null>(null);
  if (!status) return <p className="text-text-muted">—</p>;
  const labels = status.settings.labels ?? [];
  const items = bundle.items.filter((i) => i.parentItemId === null && visible(i));
  const lanes = [...labels.map((l) => ({ id: l.id, name: l.name, color: l.color })), { id: '', name: '—', color: 'empty' as const }];

  return (
    <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {lanes.map((lane) => {
        const cards = items.filter((i) => ((i.vals[status.id] as StatusValue | undefined)?.label_id ?? '') === lane.id);
        if (lane.id === '' && cards.length === 0) return null;
        return (
          <section key={lane.id || 'none'} aria-label={lane.name}
            className={clsx('flex min-h-[200px] flex-col rounded-md bg-surface', over === lane.id && 'outline outline-2 outline-focus')}
            onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(lane.id); } }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault(); setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              const it = bundle.items.find((x) => x.id === id);
              if (it) setCell(it, status, lane.id ? { label_id: lane.id } : null);
            }}>
            <header className="flex justify-between rounded-t-md px-3 py-[10px] text-sm font-semibold" style={{ background: labelBg(lane.color), color: labelFg(lane.color) }}>
              <span>{lane.name}</span><span className="tabular-nums">{cards.length}</span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {cards.length === 0 && <div className="rounded-md border-[1.5px] border-dashed border-border-strong p-5 text-center text-sm text-text-subtle">{t('dropHere')}</div>}
              {cards.map((it) => {
                const who = ((people && (it.vals[people.id] as PeopleValue | undefined)?.user_ids) || []).map((id) => members.find((m) => m.id === id)).filter(Boolean) as Profile[];
                const dv = date && (it.vals[date.id] as { date: string } | undefined)?.date;
                return (
                  <article key={it.id} draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
                    className={clsx('flex flex-col gap-2 rounded-md bg-surface-raised p-3 text-sm shadow-card', canEdit && 'cursor-grab active:cursor-grabbing')}>
                    <span className="font-semibold" dir="auto">{it.name}</span>
                    <div className="flex items-center justify-between text-text-muted">
                      <span className="tabular-nums">{dv ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(dv + 'T12:00:00Z')) : ''}</span>
                      <AvatarStack people={who} />
                    </div>
                    {canEdit && (
                      <label className="flex items-center gap-2 text-xs text-text-muted">
                        <span>{t('moveTo')}</span>
                        <select aria-label={`${t('moveTo')}: ${it.name}`} className="h-7 flex-1 rounded-xs border border-border bg-bg px-1 text-xs"
                          value={(it.vals[status.id] as StatusValue | undefined)?.label_id ?? ''}
                          onChange={(e) => setCell(it, status, e.target.value ? { label_id: e.target.value } : null)}>
                          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          <option value="">—</option>
                        </select>
                      </label>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardSkeleton() {
  const { t } = useLang();
  return (
    <div aria-label={t('loading')} className="grid gap-3">
      <div className="h-7 w-48 animate-pulse rounded-xs bg-surface-hover motion-reduce:animate-none" />
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-xs bg-surface-hover motion-reduce:animate-none" style={{ width: `${90 - i * 5}%` }} />)}
    </div>
  );
}
