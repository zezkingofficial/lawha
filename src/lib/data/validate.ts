import type { CellValue, Column } from './types';

// Same checks as app.set_cell in schema.sql, so a bad value fails the same way
// in the fake layer and in Postgres.
export class CellError extends Error {}

export function validateCell(col: Column, value: CellValue | null): void {
  if (value === null) return;
  const v = value as Record<string, unknown>;
  switch (col.type) {
    case 'status': {
      if (typeof v.label_id !== 'string') throw new CellError('status value needs label_id');
      const ok = (col.settings.labels ?? []).some((l) => l.id === v.label_id);
      if (!ok) throw new CellError('unknown status label');
      return;
    }
    case 'people':
      if (!Array.isArray(v.user_ids) || !v.user_ids.every((x) => typeof x === 'string'))
        throw new CellError('people value needs user_ids[]');
      return;
    case 'date':
      if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(Date.parse(v.date)))
        throw new CellError('date value needs YYYY-MM-DD');
      return;
    case 'numbers':
      if (typeof v.number !== 'string' || v.number.trim() === '' || !isFinite(Number(v.number)))
        throw new CellError('numbers value needs a number');
      return;
    case 'text':
      if (typeof v.text !== 'string') throw new CellError('text value needs text');
      return;
  }
}

// Text used for search, mirrors app.items_before_write.
export function searchText(name: string, vals: Record<string, CellValue>): string {
  const parts = [name];
  for (const v of Object.values(vals)) {
    const r = v as Record<string, unknown>;
    if (typeof r.text === 'string') parts.push(r.text);
    if (typeof r.number === 'string') parts.push(r.number);
  }
  return parts.join(' ').toLowerCase();
}
