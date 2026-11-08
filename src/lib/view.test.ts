import { describe, expect, it } from 'vitest';
import { makeSeed, emptySettings } from './data/seed';
import { applyView } from './view';

const db = makeSeed();
const cols = db.columns.filter((c) => c.boardId === 'b-orders' && c.scope === 'item');
const items = db.items.filter((i) => i.boardId === 'b-orders' && i.parentItemId === null);
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('applyView', () => {
  it('filters by status any-of and none-of', () => {
    expect(ids(applyView(items, cols, { ...emptySettings(), filters: [{ columnId: 'c-o-status', op: 'any_of', values: ['stuck', 'done'] }] }))).toEqual(['i-3', 'i-6']);
    expect(ids(applyView(items, cols, { ...emptySettings(), filters: [{ columnId: 'c-o-status', op: 'none_of', values: ['done'] }] }))).not.toContain('i-6');
  });

  it('filters by person, number and date, and combines filters with AND', () => {
    const s = { ...emptySettings(), personId: 'u-mohamed', filters: [{ columnId: 'c-o-qty', op: 'gt' as const, values: ['400'] }] };
    expect(ids(applyView(items, cols, s))).toEqual(['i-1', 'i-6']);
    expect(ids(applyView(items, cols, { ...emptySettings(), filters: [{ columnId: 'c-o-date', op: 'before', values: ['2026-11-06'] }] }))).toEqual(['i-3', 'i-6']);
  });

  it('finds empty values', () => {
    expect(ids(applyView(items, cols, { ...emptySettings(), filters: [{ columnId: 'c-o-phone', op: 'empty' }] }))).toEqual(['i-2', 'i-4', 'i-5', 'i-6']);
  });

  it('sorts by number both ways and by status order', () => {
    expect(ids(applyView(items, cols, { ...emptySettings(), sort: { columnId: 'c-o-value', dir: 'desc' } }))[0]).toBe('i-4');
    expect(ids(applyView(items, cols, { ...emptySettings(), sort: { columnId: 'c-o-value', dir: 'asc' } }))[0]).toBe('i-6');
    expect(ids(applyView(items, cols, { ...emptySettings(), sort: { columnId: 'c-o-status', dir: 'asc' } }))[0]).toBe('i-4'); // quote is the first label
  });

  it('applies search together with filters', () => {
    expect(ids(applyView(items, cols, emptySettings(), { query: 'علب' })).length).toBe(4);
  });
});
