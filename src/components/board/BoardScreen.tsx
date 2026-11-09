'use client';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, Columns3, Ellipsis, FolderInput, GripVertical, LayoutGrid, MessageSquare, Palette, Plus, Table2, Trash2, Pencil, CalendarDays, Radio, CircleDot, Users, Calendar, Type, Hash, AlignRight, ListChecks, SquareCheck, Phone, GanttChart, Paperclip, Link2, Mail, Maximize2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useBoard, useData, useMe, useMembers } from '@/lib/data/context';
import { emptySettings } from '@/lib/data/seed';
import { CellError } from '@/lib/data/validate';
import { NotAllowed } from '@/lib/data/fake';
import type { BoardBundle, CellValue, Column, ColumnType, Group, Item, LabelColor, PeopleValue, Profile, StatusValue, NumbersValue, View, ViewSettings, ViewType } from '@/lib/data/types';
import { fmtDate, fmtNumber, labelBg, labelFg, todayISO } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { applyView, isFiltering } from '@/lib/view';
import { AvatarStack, BottomSheet, Button, IconButton, useIsPhone, useToast } from '../ui';
import { useQuickAdd } from '../QuickAdd';
import { AnyCell } from './cells';
import { CalendarView } from './CalendarView';
import { ItemPanel } from './ItemPanel';
import { ShareButton } from './ShareDialog';
import { BoardToolbar } from './Toolbar';

const VIEW_ICON: Record<ViewType, React.ReactNode> = { table: <Table2 size={15} />, kanban: <Columns3 size={15} />, calendar: <CalendarDays size={15} /> };

export function BoardScreen({ boardId }: { boardId: string }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const { data: bundle, loading } = useBoard(boardId);
  const { data: me } = useMe();
  const { data: members = [] } = useMembers();
  const { route, go } = useRouter();
  const openItem = (itemId: string) => go({ name: 'board', boardId, itemId });
  const [viewId, setViewId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<Record<string, Partial<ViewSettings>>>({});
  const newItemRef = useRef<HTMLInputElement | null>(null);
  const setCell = useCellSetter();
  const phone = useIsPhone();
  const quickAdd = useQuickAdd();
  useEffect(() => { setViewId(null); setQ(''); }, [boardId]);

  if (loading && !bundle) return <BoardSkeleton />;
  if (!bundle) {
    return (
      <div className="grid justify-items-center gap-3 py-16 text-center">
        <p className="text-md">{t('notFound')}</p>
        <Button variant="primary" onClick={() => go({ name: 'home' })}>{t('backHome')}</Button>
      </div>
    );
  }

  const canEdit = bundle.canEdit;
  const view: View = bundle.views.find((v) => v.id === viewId) ?? bundle.views.find((v) => v.isMain) ?? bundle.views[0]
    ?? { id: 'none', boardId, type: 'table', name: t('tableView'), settings: emptySettings(), ownerId: null, isMain: true, position: 'a0' };
  // people who cannot change a shared view still filter it; their changes stay in this tab only
  const canSaveView = view.ownerId ? view.ownerId === me?.id : canEdit;
  const settings: ViewSettings = { ...emptySettings(), ...view.settings, ...(local[view.id] ?? {}) };
  const changeSettings = (patch: Partial<ViewSettings>) => {
    if (canSaveView && view.id !== 'none') {
      d.updateView(view.id, { settings: patch }).catch((e) => toast({ tone: 'error', text: (e as Error).message }));
    } else {
      setLocal((l) => ({ ...l, [view.id]: { ...(l[view.id] ?? {}), ...patch } }));
    }
  };
  const itemCols = bundle.columns.filter((c) => c.scope === 'item');
  const topItems = bundle.items.filter((i) => i.parentItemId === null);
  const shown = applyView(topItems, itemCols, settings, { query: q });
  const filtering = isFiltering(settings, q);
  const visibleCols = itemCols.filter((c) => !settings.hiddenColumnIds.includes(c.id));
  const boardPeople = members.filter((m) => m.role !== 'guest' || bundle.members.some((bm) => bm.userId === m.id));

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <EditableTitle value={bundle.board.name} canEdit={canEdit} boardId={boardId} />
          {bundle.board.description && <p className="mt-[2px] line-clamp-1 text-sm text-text-muted sm:line-clamp-none">{bundle.board.description}</p>}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-pill bg-surface-selected px-2 py-[2px] text-xs font-medium text-accent sm:inline-flex" title={t('liveHelp')}>
            <Radio size={12} />{t('liveSync')}
          </span>
          {!canEdit && <span className="rounded-pill bg-surface-hover px-2 py-[2px] text-xs text-text-muted">{t('viewOnly')}</span>}
          <span aria-label={t('members')} className="hidden sm:inline"><AvatarStack people={boardPeople} /></span>
          <ShareButton bundle={bundle} members={members} />
        </div>
      </header>

      <ViewTabs bundle={bundle} active={view} onPick={(v) => setViewId(v.id)} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canEdit && (phone || view.type === 'table') && (
          <Button variant="primary" onClick={() => phone ? quickAdd({ boardId }) : setTimeout(() => newItemRef.current?.focus(), 0)}>
            <Plus size={16} />{t('add')} {bundle.board.itemNoun}
          </Button>
        )}
        <BoardToolbar columns={itemCols} members={boardPeople} settings={settings} onChange={changeSettings} query={q} onQuery={setQ} local={!canSaveView} compact={phone} />
        {canEdit && view.type === 'table' && !phone && <AddGroupButton boardId={boardId} />}
      </div>

      {view.type === 'table' && phone && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          {bundle.groups.length === 0 && <p className="text-text-muted">{t('emptyBoard')}</p>}
          {bundle.groups.map((g) => (
            <PhoneGroup key={g.id} group={g} bundle={bundle} items={shown.filter((i) => i.groupId === g.id)} members={members}
              canEdit={canEdit} filtering={filtering} onOpen={openItem} onAdd={() => quickAdd({ boardId, groupId: g.id })} />
          ))}
        </div>
      )}
      {view.type === 'table' && !phone && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
          {bundle.groups.length === 0 && <p className="text-text-muted">{t('emptyBoard')}</p>}
          {bundle.groups.map((g, gi) => (
            <GroupSection key={g.id} group={g} groups={bundle.groups} bundle={bundle} items={shown.filter((i) => i.groupId === g.id)}
              cols={visibleCols} filtering={filtering} sorted={!!settings.sort} members={members} me={me ?? null} canEdit={canEdit}
              addRef={gi === 0 ? newItemRef : undefined} onOpen={openItem} first={gi === 0} last={gi === bundle.groups.length - 1} />
          ))}
        </div>
      )}
      {view.type === 'kanban' && (
        <KanbanView bundle={bundle} items={shown} members={members} canEdit={canEdit} onOpen={openItem}
          statusColumnId={settings.kanbanColumnId} onStatusColumn={(id) => changeSettings({ kanbanColumnId: id })} />
      )}
      {view.type === 'calendar' && (
        <CalendarView bundle={bundle} items={shown} canEdit={canEdit} onOpen={openItem} onSet={setCell}
          dateColumnId={settings.dateColumnId} onDateColumn={(id) => changeSettings({ dateColumnId: id })} />
      )}
      {route.name === 'board' && route.itemId && (
        <ItemPanel bundle={bundle} itemId={route.itemId} canEdit={canEdit} onClose={() => go({ name: 'board', boardId })} />
      )}
    </div>
  );
}

function ViewTabs({ bundle, active, onPick }: { bundle: BoardBundle; active: View; onPick: (v: View) => void }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const [renaming, setRenaming] = useState<string | null>(null);
  const names: Record<ViewType, string> = { table: t('tableView'), kanban: t('kanbanView'), calendar: t('calendarView') };
  const add = async (type: ViewType) => {
    try { const v = await d.createView(bundle.board.id, type, names[type]); onPick(v); } catch (e) { toast({ tone: 'error', text: (e as Error).message }); }
  };
  return (
    <div className="mb-3 mt-4 flex items-end gap-1 overflow-x-auto border-b border-border">
      <div role="tablist" aria-label={t('viewMenu')} className="flex gap-1">
        {bundle.views.map((v) => {
          const canChange = v.ownerId ? true : bundle.canEdit;
          if (renaming === v.id) {
            return (
              <input key={v.id} autoFocus defaultValue={v.name} aria-label={t('viewName')} className="mb-1 h-8 w-[140px] rounded-sm border border-focus bg-bg px-2 text-sm"
                onBlur={(e) => { setRenaming(null); d.updateView(v.id, { name: e.target.value }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} />
            );
          }
          return (
            <div key={v.id} className={clsx('group/tab -mb-px flex items-center border-b-2', active.id === v.id ? 'border-accent' : 'border-transparent')}>
              <button type="button" role="tab" aria-selected={active.id === v.id} onClick={() => onPick(v)} onDoubleClick={() => canChange && setRenaming(v.id)}
                className={clsx('flex items-center gap-[6px] whitespace-nowrap px-3 py-2 text-sm', active.id === v.id ? 'font-semibold text-text' : 'text-text-muted hover:text-text')}>
                {VIEW_ICON[v.type]}{v.name}
              </button>
              {canChange && active.id === v.id && (
                <Dropdown.Root>
                  <Dropdown.Trigger asChild><IconButton small label={`${t('viewMenu')}: ${v.name}`} className="h-6 w-6"><Ellipsis size={14} /></IconButton></Dropdown.Trigger>
                  <Menu>
                    <MenuItem onSelect={() => setRenaming(v.id)} icon={<Pencil size={15} />}>{t('renameView')}</MenuItem>
                    {!v.isMain && <MenuItem danger onSelect={() => { d.deleteView(v.id); onPick(bundle.views.find((x) => x.isMain) ?? bundle.views[0]); }} icon={<Trash2 size={15} />}>{t('deleteView')}</MenuItem>}
                  </Menu>
                </Dropdown.Root>
              )}
            </div>
          );
        })}
      </div>
      <Dropdown.Root>
        <Dropdown.Trigger asChild><IconButton small label={t('addView')} className="mb-1"><Plus size={16} /></IconButton></Dropdown.Trigger>
        <Menu>
          {(['table', 'kanban', 'calendar'] as ViewType[]).map((ty) => <MenuItem key={ty} onSelect={() => add(ty)} icon={VIEW_ICON[ty]}>{names[ty]}</MenuItem>)}
        </Menu>
      </Dropdown.Root>
    </div>
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
  return <Button variant="ghost" onClick={() => d.createGroup(boardId, t('addGroup'))}><LayoutGrid size={16} /><span className="hidden sm:inline">{t('addGroup')}</span></Button>;
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
      toast({ tone: 'error', text: e instanceof NotAllowed ? t('viewOnlyError') : e instanceof CellError ? t('invalidValue') : String((e as Error).message) });
    }
  };
}

function gridTemplate(columns: Column[]): CSSProperties {
  return { gridTemplateColumns: `4px var(--name-col) ${columns.map((c) => `${c.width}px`).join(' ')} 44px` };
}

const GROUP_COLORS: LabelColor[] = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'pink', 'navy', 'brown', 'grey', 'yellow', 'lime'];

// drag payload for rows (HTML drag on desktop; the row menu covers touch and keyboard)
const ROW_MIME = 'application/x-lawha-item';

function GroupSection({ group, groups, bundle, items, cols, filtering, sorted, members, me, canEdit, addRef, onOpen, first, last }: {
  group: Group; groups: Group[]; bundle: BoardBundle; items: Item[]; cols: Column[]; filtering: boolean; sorted: boolean;
  members: Profile[]; me: Profile | null; canEdit: boolean; addRef?: React.Ref<HTMLInputElement>; onOpen: (id: string) => void; first: boolean; last: boolean;
}) {
  const { t, locale } = useLang();
  const d = useData();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const shown = items;
  const allCols = bundle.columns.filter((c) => c.scope === 'item');
  const doneIds = useMemo(() => new Set(allCols.flatMap((c) => (c.settings.labels ?? []).filter((l) => l.done).map((l) => l.id))), [allCols]);
  const style = { ...gridTemplate(cols), '--g': labelBg(group.color) } as CSSProperties;
  const minWidth = `calc(var(--name-col) + ${4 + 44 + cols.reduce((s, c) => s + c.width, 0)}px)`;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleSub = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const subCols = bundle.columns.filter((c) => c.scope === 'subitem');
  const dragEnabled = canEdit && !sorted;

  const removeGroup = async () => {
    await d.deleteGroup(group.id);
    toast({ text: `${t('deleted')}: ${group.title}`, undo: () => d.restoreGroup(group.id) });
  };
  const dropRow = async (e: React.DragEvent, beforeItemId: string | null) => {
    const id = e.dataTransfer.getData(ROW_MIME);
    setDropOn(null);
    if (!id || id === beforeItemId) return;
    e.preventDefault();
    await d.moveItem(id, beforeItemId ? { groupId: group.id, afterId: beforeItemId } : { groupId: group.id });
  };
  const dragOver = (e: React.DragEvent, key: string) => {
    if (!dragEnabled || !e.dataTransfer.types.includes(ROW_MIME)) return;
    e.preventDefault();
    setDropOn(key);
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
              {!first && <MenuItem onSelect={() => d.moveGroup(group.id, 'up')} icon={<ArrowUp size={15} />}>{t('moveUp')}</MenuItem>}
              {!last && <MenuItem onSelect={() => d.moveGroup(group.id, 'down')} icon={<ArrowDown size={15} />}>{t('moveDown')}</MenuItem>}
              <Dropdown.Sub>
                <Dropdown.SubTrigger className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-[6px] text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=open]:bg-surface-hover">
                  <Palette size={15} />{t('groupColor')}
                </Dropdown.SubTrigger>
                <Dropdown.Portal>
                  <Dropdown.SubContent sideOffset={4} collisionPadding={8} className="z-30 grid grid-cols-4 gap-1 rounded-md border border-border bg-surface-raised p-2 shadow-pop">
                    {GROUP_COLORS.map((c) => (
                      <Dropdown.Item key={c} onSelect={() => d.setGroupColor(group.id, c)} aria-label={c}
                        className={clsx('h-7 w-7 cursor-pointer rounded-pill outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-focus', group.color === c && 'ring-2 ring-text')}
                        style={{ background: labelBg(c) }} />
                    ))}
                  </Dropdown.SubContent>
                </Dropdown.Portal>
              </Dropdown.Sub>
              <MenuItem danger onSelect={removeGroup} icon={<Trash2 size={15} />}>{t('deleteGroup')}</MenuItem>
            </Menu>
          </Dropdown.Root>
        )}
        {canEdit && sorted && <span className="text-xs text-text-subtle">{t('sortedNoDrag')}</span>}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto rounded-md">
          <div role="grid" aria-label={group.title} aria-rowcount={shown.length + 1}
            className="grid overflow-clip rounded-md border border-border bg-bg [--name-col:180px] sm:[--name-col:320px]" style={{ ...style, minWidth }}>
            <div role="row" className="contents">
              <div className="sticky start-0 z-[1] bg-[color:var(--g)]" />
              <HeadCell start>{t('item')}</HeadCell>
              {cols.map((c) => <ColumnHeader key={c.id} column={c} canEdit={canEdit} />)}
              <div className="flex min-h-row items-center justify-center border-b border-s border-border">
                {canEdit && <AddColumnButton boardId={bundle.board.id} scope="item" />}
              </div>
            </div>

            {shown.map((it) => {
              const subs = bundle.items.filter((i) => i.parentItemId === it.id);
              return (
                <Fragment key={it.id}>
                  <ItemRow item={it} cols={cols} members={members} me={me} canEdit={canEdit} doneIds={doneIds} groups={groups}
                    subCount={subs.length} subOpen={open.has(it.id)} onToggleSub={() => toggleSub(it.id)}
                    updates={bundle.updateCounts[it.id] ?? 0} onOpen={onOpen} draggable={dragEnabled}
                    dropping={dropOn === it.id} onDragOverRow={(e) => dragOver(e, it.id)} onDropRow={(e) => dropRow(e, it.id)} onDragLeaveRow={() => setDropOn(null)} />
                  {open.has(it.id) && (
                    <div role="row" className="contents">
                      <div className="sticky start-0 z-[1] bg-[color:var(--g)] opacity-40" />
                      <div className="col-[2/-1] border-b border-s border-border bg-surface py-2 pe-2 ps-8">
                        <div className="sticky start-[36px] w-fit max-w-[calc(100vw-48px)] overflow-x-auto">
                          <SubitemsTable parent={it} subs={subs} cols={subCols} bundle={bundle} members={members} me={me} canEdit={canEdit} onOpen={onOpen} />
                        </div>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}

            {shown.length === 0 && (
              <div role="row" className="contents">
                <div className="sticky start-0 z-[1] bg-[color:var(--g)]" />
                <div className={clsx('col-[2/-1] flex min-h-row items-center border-b border-border px-3 text-sm text-text-muted', dropOn === 'end' && 'bg-surface-selected')}
                  onDragOver={(e) => dragOver(e, 'end')} onDragLeave={() => setDropOn(null)} onDrop={(e) => dropRow(e, null)}>
                  {filtering ? t('emptyFilter') : t('emptyGroup')}
                </div>
              </div>
            )}

            {canEdit && (
              <div role="row" className="contents">
                <div className="sticky start-0 z-[1] bg-[color:var(--g)] opacity-50" />
                <div className={clsx('col-[2/-1] flex min-h-row items-center border-b border-border px-3', dropOn === 'end' && 'bg-surface-selected')}
                  onDragOver={(e) => dragOver(e, 'end')} onDragLeave={() => setDropOn(null)} onDrop={(e) => dropRow(e, null)}>
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
              <div className="border-s border-border" />
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

function ItemRow({ item, cols, members, me, canEdit, doneIds, subCount, subOpen, onToggleSub, updates, onOpen, groups, draggable, dropping, onDragOverRow, onDropRow, onDragLeaveRow }: {
  item: Item; cols: Column[]; members: Profile[]; me: Profile | null; canEdit: boolean; doneIds: Set<string>;
  subCount: number; subOpen: boolean; onToggleSub: () => void; updates: number; onOpen: (id: string) => void;
  groups: Group[]; draggable: boolean; dropping: boolean;
  onDragOverRow: (e: React.DragEvent) => void; onDropRow: (e: React.DragEvent) => void; onDragLeaveRow: () => void;
}) {
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
      <div role="gridcell" onDragOver={onDragOverRow} onDrop={onDropRow} onDragLeave={onDragLeaveRow}
        className={clsx('sticky start-[4px] z-[1] flex min-h-row min-w-0 items-center gap-1 border-b border-s border-border bg-bg pe-1 ps-1 text-sm group-hover/row:bg-surface-hover',
          dropping && 'shadow-[inset_0_2px_0_var(--c-accent)]')}>
        {draggable && (
          <span draggable aria-hidden title={t('dragToMove')} onDragStart={(e) => { e.dataTransfer.setData(ROW_MIME, item.id); e.dataTransfer.effectAllowed = 'move'; }}
            className="hidden h-7 w-4 flex-none cursor-grab place-items-center text-text-subtle opacity-0 group-hover/row:opacity-100 sm:grid">
            <GripVertical size={14} />
          </span>
        )}
        <IconButton small label={subOpen ? t('hideSubitems') : t('showSubitems')} onClick={onToggleSub} aria-expanded={subOpen}
          className={clsx('flex-none', !subCount && !subOpen && 'opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100')}>
          <ChevronLeft size={15} className={clsx('transition-transform duration-base ltr:rotate-180', subOpen && '-rotate-90 ltr:rotate-90')} />
        </IconButton>
        {renaming ? (
          <input autoFocus defaultValue={item.name} aria-label={t('rename')} dir="auto" className="h-7 w-full rounded-xs border border-focus bg-bg px-1"
            onBlur={(e) => { setRenaming(false); d.renameItem(item.id, e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : (
          <button type="button" onClick={() => onOpen(item.id)} onDoubleClick={() => canEdit && setRenaming(true)} dir="auto" title={item.name}
            className="min-w-0 flex-1 truncate text-start hover:underline">{item.name}</button>
        )}
        {subCount > 0 && <span className="flex-none rounded-pill bg-surface-hover px-[6px] text-xs tabular-nums text-text-muted" title={t('subitems')}>{subCount}</span>}
        <button type="button" onClick={() => onOpen(item.id)} aria-label={`${t('updates')}: ${updates}`}
          className={clsx('hidden flex-none items-center gap-[2px] rounded-xs px-1 text-xs sm:flex', updates ? 'text-accent' : 'text-text-subtle hover:text-text')}>
          <MessageSquare size={14} />{updates > 0 && <span className="tabular-nums">{updates}</span>}
        </button>
        {canEdit && (
          <Dropdown.Root>
            <Dropdown.Trigger asChild>
              <IconButton label={`${t('itemMenu')}: ${item.name}`} small className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"><Ellipsis size={15} /></IconButton>
            </Dropdown.Trigger>
            <Menu>
              <MenuItem onSelect={() => onOpen(item.id)} icon={<Maximize2 size={15} />}>{t('openItem')}</MenuItem>
              <MenuItem onSelect={() => setRenaming(true)} icon={<Pencil size={15} />}>{t('rename')}</MenuItem>
              {groups.length > 1 && (
                <Dropdown.Sub>
                  <Dropdown.SubTrigger className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-[6px] text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=open]:bg-surface-hover">
                    <FolderInput size={15} />{t('moveToGroup')}
                  </Dropdown.SubTrigger>
                  <Dropdown.Portal>
                    <Dropdown.SubContent sideOffset={4} collisionPadding={8} className="z-30 min-w-[180px] rounded-md border border-border bg-surface-raised p-1 shadow-pop">
                      {groups.filter((g) => g.id !== item.groupId).map((g) => (
                        <MenuItem key={g.id} onSelect={() => d.moveItem(item.id, { groupId: g.id })} icon={<span className="h-3 w-3 rounded-pill" style={{ background: labelBg(g.color) }} />}>{g.title}</MenuItem>
                      ))}
                    </Dropdown.SubContent>
                  </Dropdown.Portal>
                </Dropdown.Sub>
              )}
              <MenuItem danger onSelect={remove} icon={<Trash2 size={15} />}>{t('deleteItem')}</MenuItem>
            </Menu>
          </Dropdown.Root>
        )}
      </div>
      {cols.map((c) => (
        <div key={c.id} role="gridcell" className={clsx('flex min-h-row min-w-0 items-stretch border-b border-s border-border', c.type !== 'status' && 'group-hover/row:bg-surface-hover')}>
          <AnyCell item={item} column={c} members={members} me={me} canEdit={canEdit} doneIds={doneIds}
            onSet={(v) => setCell(item, c, v)} onInvalid={() => toast({ tone: 'error', text: t('invalidValue') })} />
        </div>
      ))}
      <div className="border-b border-s border-border group-hover/row:bg-surface-hover" />
    </div>
  );
}

function SubitemsTable({ parent, subs, cols, bundle, members, me, canEdit, onOpen }: {
  parent: Item; subs: Item[]; cols: Column[]; bundle: BoardBundle; members: Profile[]; me: Profile | null; canEdit: boolean; onOpen: (id: string) => void;
}) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const setCell = useCellSetter();
  const [v, setV] = useState('');
  const doneIds = new Set(cols.flatMap((c) => (c.settings.labels ?? []).filter((l) => l.done).map((l) => l.id)));
  const tpl = { gridTemplateColumns: `minmax(160px, 260px) ${cols.map((c) => `${c.width}px`).join(' ')} 44px` };
  return (
    <div role="grid" aria-label={`${t('subitems')}: ${parent.name}`} className="inline-grid overflow-clip rounded-sm border border-border bg-bg" style={tpl}>
      <div role="row" className="contents">
        <div role="columnheader" className="flex min-h-[32px] items-center border-b border-border px-3 text-xs font-medium text-text-muted">{t('subitems')}</div>
        {cols.map((c) => <ColumnHeader key={c.id} column={c} canEdit={canEdit} compact />)}
        <div className="flex items-center justify-center border-b border-s border-border">{canEdit && <AddColumnButton boardId={bundle.board.id} scope="subitem" />}</div>
      </div>
      {subs.map((s) => (
        <div role="row" key={s.id} className="group/row contents">
          <div role="gridcell" className="flex min-h-[34px] min-w-0 items-center border-b border-border px-3 text-sm group-hover/row:bg-surface-hover">
            <button type="button" onClick={() => onOpen(s.id)} dir="auto" title={s.name} className="min-w-0 flex-1 truncate text-start hover:underline">{s.name}</button>
            {canEdit && (
              <IconButton small label={`${t('deleteItem')}: ${s.name}`} className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                onClick={async () => { await d.deleteItem(s.id); toast({ text: `${t('deleted')}: ${s.name}`, undo: () => d.restoreItem(s.id) }); }}>
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
          {cols.map((c) => (
            <div key={c.id} role="gridcell" className="flex min-h-[34px] min-w-0 items-stretch border-b border-s border-border">
              <AnyCell item={s} column={c} members={members} me={me} canEdit={canEdit} doneIds={doneIds}
                onSet={(val) => setCell(s, c, val)} onInvalid={() => toast({ tone: 'error', text: t('invalidValue') })} />
            </div>
          ))}
          <div className="border-b border-s border-border" />
        </div>
      ))}
      {canEdit && (
        <div role="row" className="contents">
          <div className="col-[1/-1] flex min-h-[34px] items-center px-3">
            <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('addSubitem')} aria-label={t('addSubitem')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-text-subtle"
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && v.trim()) {
                  try { await d.createSubitem(parent.id, v); setV(''); } catch (err) { toast({ tone: 'error', text: (err as Error).message }); }
                }
              }} />
          </div>
        </div>
      )}
    </div>
  );
}

const COLUMN_TYPES: { type: ColumnType; ar: string; en: string; icon: React.ReactNode }[] = [
  { type: 'status', ar: 'حالة', en: 'Status', icon: <CircleDot size={16} /> },
  { type: 'people', ar: 'أشخاص', en: 'People', icon: <Users size={16} /> },
  { type: 'date', ar: 'تاريخ', en: 'Date', icon: <Calendar size={16} /> },
  { type: 'timeline', ar: 'مدة زمنية', en: 'Timeline', icon: <GanttChart size={16} /> },
  { type: 'text', ar: 'نص', en: 'Text', icon: <Type size={16} /> },
  { type: 'long_text', ar: 'نص طويل', en: 'Long text', icon: <AlignRight size={16} /> },
  { type: 'numbers', ar: 'أرقام', en: 'Numbers', icon: <Hash size={16} /> },
  { type: 'dropdown', ar: 'قائمة اختيارات', en: 'Dropdown', icon: <ListChecks size={16} /> },
  { type: 'checkbox', ar: 'علامة صح', en: 'Checkbox', icon: <SquareCheck size={16} /> },
  { type: 'phone', ar: 'تليفون', en: 'Phone', icon: <Phone size={16} /> },
  { type: 'email', ar: 'إيميل', en: 'Email', icon: <Mail size={16} /> },
  { type: 'link', ar: 'رابط', en: 'Link', icon: <Link2 size={16} /> },
  { type: 'files', ar: 'ملفات', en: 'Files', icon: <Paperclip size={16} /> },
];

function AddColumnButton({ boardId, scope }: { boardId: string; scope: 'item' | 'subitem' }) {
  const { t, lang } = useLang();
  const d = useData();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild><IconButton small label={t('addColumn')}><Plus size={16} /></IconButton></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label={t('addColumn')} sideOffset={6} collisionPadding={8} className="z-30 w-[300px] rounded-md border border-border bg-surface-raised p-2 shadow-pop">
          <p className="px-1 pb-2 text-sm font-semibold">{t('addColumn')}</p>
          <ul className="grid grid-cols-2 gap-1">
            {COLUMN_TYPES.map((c) => (
              <li key={c.type}>
                <button type="button" onClick={async () => { setOpen(false); await d.createColumn(boardId, c.type, lang === 'ar' ? c.ar : c.en, scope); }}
                  className="flex w-full items-center gap-2 rounded-xs px-2 py-[6px] text-start text-sm hover:bg-surface-hover">
                  <span className="text-accent">{c.icon}</span>{lang === 'ar' ? c.ar : c.en}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ColumnHeader({ column, canEdit, compact }: { column: Column; canEdit: boolean; compact?: boolean }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cls = clsx('group/col flex items-center justify-center gap-1 border-b border-s border-border px-2 text-xs font-medium text-text-muted', compact ? 'min-h-[32px]' : 'min-h-row');
  if (renaming) {
    return (
      <div role="columnheader" className={cls}>
        <input autoFocus defaultValue={column.title} aria-label={t('renameColumn')} className="h-7 w-full rounded-xs border border-focus bg-bg px-1 text-center"
          onBlur={(e) => { setRenaming(false); d.renameColumn(column.id, e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
      </div>
    );
  }
  return (
    <div role="columnheader" className={cls}>
      <span className="truncate" title={column.title}>{column.title}</span>
      {canEdit && (
        <Dropdown.Root onOpenChange={(o) => { if (!o) setConfirming(false); }}>
          <Dropdown.Trigger asChild>
            <IconButton small label={`${t('columnMenu')}: ${column.title}`} className="h-6 w-6 flex-none opacity-0 focus-visible:opacity-100 group-hover/col:opacity-100 data-[state=open]:opacity-100"><Ellipsis size={14} /></IconButton>
          </Dropdown.Trigger>
          <Menu>
            <MenuItem onSelect={() => setRenaming(true)} icon={<Pencil size={15} />}>{t('renameColumn')}</MenuItem>
            {!confirming ? (
              <Dropdown.Item onSelect={(e) => { e.preventDefault(); setConfirming(true); }} className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-[6px] text-sm text-danger outline-none data-[highlighted]:bg-surface-hover">
                <Trash2 size={15} />{t('deleteColumn')}
              </Dropdown.Item>
            ) : (
              <div className="grid gap-2 p-2">
                <p className="max-w-[220px] text-xs text-text-muted">{t('deleteColumnConfirm')}</p>
                <MenuItem danger onSelect={async () => { await d.deleteColumn(column.id); toast({ text: `${t('columnDeleted')}: ${column.title}` }); }} icon={<Trash2 size={15} />}>{t('confirmDelete')}</MenuItem>
              </div>
            )}
          </Menu>
        </Dropdown.Root>
      )}
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

// ---------------------------------------------------------------- phone list
// On a phone the wide table becomes a list of cards: the name, its status, who and
// when. Everything else is one tap away in the item card.

function PhoneGroup({ group, bundle, items, members, canEdit, filtering, onOpen, onAdd }: {
  group: Group; bundle: BoardBundle; items: Item[]; members: Profile[]; canEdit: boolean; filtering: boolean; onOpen: (id: string) => void; onAdd: () => void;
}) {
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const doneIds = useMemo(() => new Set(bundle.columns.flatMap((c) => (c.settings.labels ?? []).filter((l) => l.done).map((l) => l.id))), [bundle.columns]);
  return (
    <section aria-label={group.title} style={{ '--g': labelBg(group.color) } as CSSProperties}>
      <button type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}
        className="mb-2 flex w-full items-center gap-2 py-1 text-start">
        <ChevronDown size={18} className={clsx('flex-none text-[color:var(--g)] transition-transform duration-base', collapsed && 'rotate-90 rtl:-rotate-90')} />
        <h2 className="min-w-0 truncate text-md font-semibold" style={{ color: 'var(--g)' }}>{group.title}</h2>
        <span className="rounded-pill bg-surface-hover px-2 text-xs tabular-nums text-text-muted">{items.length}</span>
      </button>
      {!collapsed && (
        <ul className="grid gap-2">
          {items.map((it) => <PhoneCard key={it.id} item={it} bundle={bundle} members={members} canEdit={canEdit} doneIds={doneIds} onOpen={onOpen} />)}
          {items.length === 0 && <li className="rounded-md border border-dashed border-border-strong p-4 text-center text-sm text-text-muted">{filtering ? t('emptyFilter') : t('emptyGroup')}</li>}
          {canEdit && (
            <li>
              <button type="button" onClick={onAdd} className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-text-muted hover:bg-surface-hover">
                <Plus size={16} />{t('addHere')}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function PhoneCard({ item, bundle, members, canEdit, doneIds, onOpen }: {
  item: Item; bundle: BoardBundle; members: Profile[]; canEdit: boolean; doneIds: Set<string>; onOpen: (id: string) => void;
}) {
  const { t, locale } = useLang();
  const setCell = useCellSetter();
  const [picking, setPicking] = useState(false);
  const cols = bundle.columns.filter((c) => c.scope === 'item');
  const status = cols.find((c) => c.type === 'status');
  const people = cols.find((c) => c.type === 'people');
  const date = cols.find((c) => c.type === 'date');
  const num = cols.find((c) => c.type === 'numbers');
  const label = status && (status.settings.labels ?? []).find((l) => l.id === (item.vals[status.id] as StatusValue | undefined)?.label_id);
  const who = ((people && (item.vals[people.id] as PeopleValue | undefined)?.user_ids) || []).map((id) => members.find((m) => m.id === id)).filter(Boolean) as Profile[];
  const dv = date && (item.vals[date.id] as { date?: string } | undefined)?.date;
  const late = !!dv && dv < todayISO() && !(label && doneIds.has(label.id));
  const nv = num && (item.vals[num.id] as NumbersValue | undefined)?.number;
  const subs = bundle.items.filter((i) => i.parentItemId === item.id).length;
  const updates = bundle.updateCounts[item.id] ?? 0;
  return (
    <li className="flex overflow-hidden rounded-md border border-border bg-bg">
      <span className="w-1 flex-none bg-[color:var(--g)]" aria-hidden />
      <button type="button" onClick={() => onOpen(item.id)} className="grid min-w-0 flex-1 content-start gap-2 p-3 text-start active:bg-surface-hover">
        <span className="line-clamp-2 font-medium" dir="auto">{item.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          {dv && <span className={clsx('inline-flex items-center gap-1 tabular-nums', late && 'font-semibold text-danger')}><Calendar size={13} />{fmtDate(dv, locale)}{late && ` · ${t('overdue')}`}</span>}
          {nv && <span className="tabular-nums"><bdi>{fmtNumber(nv, locale)}</bdi> {num?.settings.unit}</span>}
          {subs > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={13} />{subs}</span>}
          {updates > 0 && <span className="inline-flex items-center gap-1 text-accent"><MessageSquare size={13} />{updates}</span>}
        </span>
      </button>
      <div className="flex flex-none flex-col items-end justify-between gap-2 py-3 pe-3">
        {status && (
          <button type="button" disabled={!canEdit} onClick={() => setPicking(true)} aria-label={`${t('changeStatus')}: ${label?.name ?? t('noStatus')}`}
            className="h-8 min-w-[92px] max-w-[130px] truncate rounded-sm px-2 text-xs font-semibold disabled:cursor-default"
            style={{ background: labelBg(label?.color ?? 'empty'), color: labelFg(label?.color ?? 'empty') }}>
            {label?.name ?? '—'}
          </button>
        )}
        {who.length > 0 && <AvatarStack people={who} size={24} />}
      </div>
      {status && (
        <BottomSheet open={picking} onClose={() => setPicking(false)} title={`${t('changeStatus')}: ${item.name}`}>
          <ul className="grid gap-2">
            {(status.settings.labels ?? []).map((l) => (
              <li key={l.id}>
                <button type="button" aria-pressed={label?.id === l.id} onClick={() => { setPicking(false); setCell(item, status, { label_id: l.id }); }}
                  className={clsx('h-12 w-full rounded-md text-md font-semibold', label?.id === l.id && 'shadow-[0_0_0_2px_var(--c-bg),0_0_0_4px_var(--c-text)]')}
                  style={{ background: labelBg(l.color), color: labelFg(l.color) }}>{l.name}</button>
              </li>
            ))}
            {label && (
              <li><button type="button" onClick={() => { setPicking(false); setCell(item, status, null); }} className="h-11 w-full rounded-md border border-border-strong text-sm">{t('clear')}</button></li>
            )}
          </ul>
        </BottomSheet>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- kanban

function KanbanView({ bundle, items: shownItems, members, canEdit, onOpen, statusColumnId, onStatusColumn }: {
  bundle: BoardBundle; items: Item[]; members: Profile[]; canEdit: boolean; onOpen: (id: string) => void;
  statusColumnId?: string; onStatusColumn: (id: string) => void;
}) {
  const { t, locale } = useLang();
  const setCell = useCellSetter();
  const statusCols = bundle.columns.filter((c) => c.scope === 'item' && c.type === 'status');
  const status = statusCols.find((c) => c.id === statusColumnId) ?? statusCols[0];
  const people = bundle.columns.find((c) => c.type === 'people');
  const date = bundle.columns.find((c) => c.type === 'date');
  const [over, setOver] = useState<string | null>(null);
  if (!status) return <p className="text-text-muted">—</p>;
  const labels = status.settings.labels ?? [];
  const items = shownItems;
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
                    <button type="button" onClick={() => onOpen(it.id)} className="text-start font-semibold hover:underline" dir="auto">{it.name}</button>
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
