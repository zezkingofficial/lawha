import type { CellValue, Column } from './types';

// Same checks as app.set_cell in schema.sql, so a bad value fails the same way
// in the fake layer and in Postgres.
export class CellError extends Error {}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

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
    case 'long_text':
      if (typeof v.text !== 'string') throw new CellError('text value needs text');
      if (col.type === 'text' && v.text.length > 2000) throw new CellError('text too long');
      return;
    case 'dropdown': {
      if (!Array.isArray(v.option_ids)) throw new CellError('dropdown value needs option_ids[]');
      const known = new Set((col.settings.options ?? []).map((o) => o.id));
      if (!v.option_ids.every((x) => typeof x === 'string' && known.has(x))) throw new CellError('unknown dropdown option');
      return;
    }
    case 'checkbox':
      if (typeof v.checked !== 'boolean') throw new CellError('checkbox value needs checked');
      return;
    case 'phone':
      if (typeof v.phone !== 'string' || !/^\+?[0-9 ()-]{6,20}$/.test(v.phone)) throw new CellError('phone number looks wrong');
      return;
    case 'timeline':
      if (typeof v.from !== 'string' || typeof v.to !== 'string' || !ISO.test(v.from) || !ISO.test(v.to)) throw new CellError('timeline needs from and to dates');
      if (v.from > v.to) throw new CellError('timeline from after to');
      return;
    case 'files':
      if (!Array.isArray(v.asset_ids)) throw new CellError('files value needs asset_ids[]');
      return;
    case 'link':
      if (typeof v.url !== 'string' || !/^https?:\/\/\S+\.\S+/.test(v.url)) throw new CellError('link must start with http:// or https://');
      return;
    case 'email':
      if (typeof v.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) throw new CellError('email looks wrong');
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
    if (typeof r.phone === 'string') parts.push(r.phone);
    if (typeof r.email === 'string') parts.push(r.email);
  }
  return parts.join(' ').toLowerCase();
}
