import { searchText } from './data/validate';
import type { CellValue, Column, Filter, FilterOp, Item, ViewSettings } from './data/types';

// Filtering and sorting for a saved view. Pure, so the same rules can run in the
// browser now and move into a SQL query later without changing behaviour.

export function valueIds(v: CellValue | undefined): string[] {
  if (!v) return [];
  const r = v as Record<string, unknown>;
  if (typeof r.label_id === 'string') return [r.label_id];
  if (Array.isArray(r.user_ids)) return r.user_ids as string[];
  if (Array.isArray(r.option_ids)) return r.option_ids as string[];
  if (typeof r.checked === 'boolean') return [r.checked ? 'checked' : ''];
  return [];
}

function valueText(v: CellValue | undefined): string {
  if (!v) return '';
  const r = v as Record<string, unknown>;
  return String(r.text ?? r.number ?? r.phone ?? r.email ?? r.url ?? r.date ?? r.from ?? '');
}

function isEmpty(v: CellValue | undefined): boolean {
  if (!v) return true;
  const r = v as Record<string, unknown>;
  if (Array.isArray(r.user_ids)) return !r.user_ids.length;
  if (Array.isArray(r.option_ids)) return !r.option_ids.length;
  if (Array.isArray(r.asset_ids)) return !r.asset_ids.length;
  if (typeof r.checked === 'boolean') return !r.checked;
  return valueText(v) === '';
}

export function opsFor(col: Column): FilterOp[] {
  switch (col.type) {
    case 'status': case 'people': case 'dropdown': return ['any_of', 'none_of', 'empty', 'not_empty'];
    case 'numbers': return ['gt', 'lt', 'empty', 'not_empty'];
    case 'date': case 'timeline': return ['before', 'after', 'empty', 'not_empty'];
    case 'checkbox': case 'files': return ['not_empty', 'empty'];
    default: return ['contains', 'empty', 'not_empty'];
  }
}

export function matchFilter(it: Item, col: Column, f: Filter): boolean {
  const v = it.vals[col.id];
  const vals = f.values ?? [];
  switch (f.op) {
    case 'empty': return isEmpty(v);
    case 'not_empty': return !isEmpty(v);
    case 'any_of': return !vals.length || valueIds(v).some((x) => vals.includes(x)) || (vals.includes('') && isEmpty(v));
    case 'none_of': return !valueIds(v).some((x) => vals.includes(x));
    case 'contains': return !vals[0] || valueText(v).toLowerCase().includes(vals[0].toLowerCase());
    case 'gt': return vals[0] === undefined || vals[0] === '' ? true : !isEmpty(v) && Number(valueText(v)) > Number(vals[0]);
    case 'lt': return vals[0] === undefined || vals[0] === '' ? true : !isEmpty(v) && Number(valueText(v)) < Number(vals[0]);
    case 'before': return !vals[0] || (!isEmpty(v) && valueText(v) < vals[0]);
    case 'after': return !vals[0] || (!isEmpty(v) && valueText(v) > vals[0]);
  }
}

function sortKey(it: Item, col: Column | undefined): string | number {
  if (!col) return it.name;
  const v = it.vals[col.id];
  if (col.type === 'numbers') return isEmpty(v) ? Number.POSITIVE_INFINITY : Number(valueText(v));
  if (col.type === 'status') {
    const idx = (col.settings.labels ?? []).findIndex((l) => l.id === valueIds(v)[0]);
    return idx < 0 ? 999 : idx;
  }
  return isEmpty(v) ? '￿' : valueText(v) || valueIds(v).join(',');
}

export function applyView(items: Item[], columns: Column[], s: ViewSettings, opts: { query?: string } = {}): Item[] {
  const q = (opts.query ?? '').trim().toLowerCase();
  const peopleCols = columns.filter((c) => c.type === 'people');
  let out = items.filter((it) => {
    if (q && !searchText(it.name, it.vals).includes(q)) return false;
    if (s.personId && !peopleCols.some((c) => valueIds(it.vals[c.id]).includes(s.personId!))) return false;
    for (const f of s.filters) {
      const col = columns.find((c) => c.id === f.columnId);
      if (col && !matchFilter(it, col, f)) return false;
    }
    return true;
  });
  if (s.sort) {
    const col = s.sort.columnId === 'name' ? undefined : columns.find((c) => c.id === s.sort!.columnId);
    const dir = s.sort.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const ka = sortKey(a, col), kb = sortKey(b, col);
      // empty values stay last in both directions
      if (ka === Number.POSITIVE_INFINITY || ka === '￿' || ka === 999) return 1;
      if (kb === Number.POSITIVE_INFINITY || kb === '￿' || kb === 999) return -1;
      if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * dir;
      return String(ka).localeCompare(String(kb), 'ar') * dir;
    });
  }
  return out;
}

export const isFiltering = (s: ViewSettings, query: string) => !!query.trim() || !!s.personId || s.filters.length > 0;
