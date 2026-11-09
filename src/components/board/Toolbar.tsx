'use client';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { ArrowDownUp, EyeOff, ListFilter, Plus, Search, UserRound, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Column, Filter, FilterOp, Profile, ViewSettings } from '@/lib/data/types';
import { useLang, type MsgKey } from '@/lib/i18n';
import { opsFor } from '@/lib/view';
import { Avatar, Button } from '../ui';

const OP_LABEL: Record<FilterOp, MsgKey> = {
  any_of: 'opAny', none_of: 'opNone', empty: 'opEmpty', not_empty: 'opNotEmpty', contains: 'opContains', gt: 'opGt', lt: 'opLt', before: 'opBefore', after: 'opAfter',
};

const field = 'h-8 min-w-0 rounded-sm border border-border-input bg-bg px-2 text-sm';

function ToolPop({ icon, label, active, count, children, width = 320 }: { icon: ReactNode; label: string; active: boolean; count?: number; children: ReactNode; width?: number }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" pressed={active} aria-label={count ? `${label} (${count})` : label}>
          {icon}<span className="hidden sm:inline">{label}</span>
          {!!count && <span className="rounded-pill bg-accent px-[6px] text-[11px] tabular-nums text-on-accent">{count}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label={label} sideOffset={6} collisionPadding={8} className="z-30 grid max-h-[70vh] gap-2 overflow-y-auto rounded-md border border-border bg-surface-raised p-3 shadow-pop" style={{ width: `min(${width}px, calc(100vw - 16px))` }}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function BoardToolbar({ columns, members, settings, onChange, query, onQuery, local, compact }: {
  columns: Column[]; members: Profile[]; settings: ViewSettings; onChange: (patch: Partial<ViewSettings>) => void;
  query: string; onQuery: (q: string) => void; local: boolean; compact?: boolean;
}) {
  const { t } = useLang();
  const filterable = columns.filter((c) => c.scope === 'item');
  const setFilter = (i: number, f: Filter | null) => {
    const next = [...settings.filters];
    if (f) next[i] = f; else next.splice(i, 1);
    onChange({ filters: next });
  };
  const anyActive = !!query || !!settings.personId || settings.filters.length > 0 || !!settings.sort || settings.hiddenColumnIds.length > 0;

  return (
    <>
      <label className="order-3 flex h-8 w-full items-center gap-2 rounded-sm border border-border-input bg-bg px-[10px] focus-within:border-focus sm:order-none sm:w-[200px]">
        <Search size={15} className="flex-none text-text-subtle" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('searchItems')} aria-label={t('searchItems')} className="w-full min-w-0 bg-transparent outline-none" />
      </label>

      <ToolPop icon={<UserRound size={16} />} label={t('person')} active={!!settings.personId} width={240}>
        <p className="text-sm font-semibold">{t('pickPerson')}</p>
        <ul className="grid gap-[2px]">
          {members.map((m) => (
            <li key={m.id}>
              <button type="button" aria-pressed={settings.personId === m.id} onClick={() => onChange({ personId: settings.personId === m.id ? null : m.id })}
                className={clsx('flex w-full items-center gap-2 rounded-xs px-2 py-[6px] text-sm', settings.personId === m.id ? 'bg-surface-selected text-accent' : 'hover:bg-surface-hover')}>
                <Avatar person={m} size={22} />{m.fullName}
              </button>
            </li>
          ))}
        </ul>
        {settings.personId && <button type="button" onClick={() => onChange({ personId: null })} className="text-start text-sm text-accent">{t('clearPerson')}</button>}
      </ToolPop>

      <ToolPop icon={<ListFilter size={16} />} label={t('filter')} active={settings.filters.length > 0} count={settings.filters.length} width={420}>
        {settings.filters.length === 0 && <p className="text-sm text-text-muted">{t('noFilters')}</p>}
        {settings.filters.map((f, i) => {
          const col = filterable.find((c) => c.id === f.columnId) ?? filterable[0];
          const ops = col ? opsFor(col) : [];
          const needsValue = !['empty', 'not_empty'].includes(f.op);
          const choices = col?.type === 'status' ? (col.settings.labels ?? []).map((l) => ({ id: l.id, name: l.name }))
            : col?.type === 'dropdown' ? (col.settings.options ?? []) : col?.type === 'people' ? members.map((m) => ({ id: m.id, name: m.fullName })) : null;
          return (
            <fieldset key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1 rounded-sm bg-surface p-2">
              <legend className="sr-only">{t('filter')} {i + 1}</legend>
              <select aria-label={t('filter')} className={field} value={col?.id} onChange={(e) => {
                const c = filterable.find((x) => x.id === e.target.value)!;
                setFilter(i, { columnId: c.id, op: opsFor(c)[0], values: [] });
              }}>
                {filterable.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <select aria-label="op" className={field} value={f.op} onChange={(e) => setFilter(i, { ...f, op: e.target.value as FilterOp })}>
                {ops.map((o) => <option key={o} value={o}>{t(OP_LABEL[o])}</option>)}
              </select>
              <button type="button" aria-label={t('removeFilter')} onClick={() => setFilter(i, null)} className="grid h-8 w-8 place-items-center rounded-sm text-text-muted hover:bg-surface-hover"><X size={15} /></button>
              {needsValue && (choices ? (
                <div className="col-span-3 flex flex-wrap gap-1">
                  {choices.map((ch) => {
                    const on = (f.values ?? []).includes(ch.id);
                    return (
                      <button key={ch.id} type="button" aria-pressed={on}
                        onClick={() => setFilter(i, { ...f, values: on ? (f.values ?? []).filter((x) => x !== ch.id) : [...(f.values ?? []), ch.id] })}
                        className={clsx('rounded-pill border px-2 py-[2px] text-xs', on ? 'border-accent bg-surface-selected text-accent' : 'border-border hover:bg-surface-hover')}>
                        {ch.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input aria-label={t('value')} placeholder={t('value')} className={clsx(field, 'col-span-3')}
                  type={col?.type === 'date' || col?.type === 'timeline' ? 'date' : col?.type === 'numbers' ? 'number' : 'text'}
                  value={f.values?.[0] ?? ''} onChange={(e) => setFilter(i, { ...f, values: [e.target.value] })} />
              ))}
            </fieldset>
          );
        })}
        {filterable.length > 0 && (
          <button type="button" className="inline-flex w-fit items-center gap-1 text-sm text-accent"
            onClick={() => {
              // status is what people filter by most, so a new condition starts there
              const c = filterable.find((x) => x.type === 'status') ?? filterable[0];
              onChange({ filters: [...settings.filters, { columnId: c.id, op: opsFor(c)[0], values: [] }] });
            }}>
            <Plus size={14} />{t('addFilter').replace('+ ', '')}
          </button>
        )}
      </ToolPop>

      {!compact && <>
      <ToolPop icon={<ArrowDownUp size={16} />} label={t('sort')} active={!!settings.sort} width={280}>
        <label className="grid gap-1 text-sm">{t('sortBy')}
          <select className={field} value={settings.sort?.columnId ?? ''} onChange={(e) => onChange({ sort: e.target.value ? { columnId: e.target.value, dir: settings.sort?.dir ?? 'asc' } : null })}>
            <option value="">{t('noSort')}</option>
            <option value="name">{t('name')}</option>
            {filterable.filter((c) => !['files', 'checkbox'].includes(c.type)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        {settings.sort && (
          <div className="flex gap-1" role="radiogroup" aria-label={t('sort')}>
            {(['asc', 'desc'] as const).map((dir) => (
              <button key={dir} type="button" role="radio" aria-checked={settings.sort?.dir === dir} onClick={() => onChange({ sort: { ...settings.sort!, dir } })}
                className={clsx('h-8 flex-1 rounded-sm text-sm', settings.sort?.dir === dir ? 'bg-accent text-on-accent' : 'bg-surface hover:bg-surface-hover')}>{t(dir)}</button>
            ))}
          </div>
        )}
      </ToolPop>

      <ToolPop icon={<EyeOff size={16} />} label={t('hide')} active={settings.hiddenColumnIds.length > 0} count={settings.hiddenColumnIds.length} width={240}>
        <ul className="grid gap-1">
          {filterable.map((c) => {
            const shown = !settings.hiddenColumnIds.includes(c.id);
            return (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shown} className="h-4 w-4 accent-[color:var(--c-accent)]"
                    onChange={() => onChange({ hiddenColumnIds: shown ? [...settings.hiddenColumnIds, c.id] : settings.hiddenColumnIds.filter((x) => x !== c.id) })} />
                  {c.title}
                </label>
              </li>
            );
          })}
        </ul>
        {settings.hiddenColumnIds.length > 0 && <button type="button" onClick={() => onChange({ hiddenColumnIds: [] })} className="text-start text-sm text-accent">{t('showAll')}</button>}
      </ToolPop>
      </>}

      {anyActive && (
        <Button variant="ghost" size="sm" onClick={() => { onQuery(''); onChange({ filters: [], personId: null, sort: null, hiddenColumnIds: [] }); }}>{t('clearFilters')}</Button>
      )}
      {local && anyActive && <span className="text-xs text-text-subtle">{t('unsavedView')}</span>}
    </>
  );
}
