import { describe, expect, it } from 'vitest';
import { createFakeLayer, memoryPersist, NotAllowed } from './fake';
import { CellError } from './validate';

async function signedIn(user = 'u-ahmed') {
  const d = createFakeLayer(memoryPersist());
  await d.signIn(user);
  return d;
}

describe('fake data layer', () => {
  it('loads the seeded orders board in order', async () => {
    const d = await signedIn();
    const b = await d.getBoard('b-orders');
    expect(b?.groups.map((g) => g.id)).toEqual(['g-nov', 'g-ready']);
    expect(b?.items.filter((i) => i.groupId === 'g-nov').map((i) => i.id)).toEqual(['i-1', 'i-2', 'i-3', 'i-4']);
  });

  it('adds an item at the end of a group and notifies subscribers', async () => {
    const d = await signedIn();
    let calls = 0;
    d.subscribe('b-orders', () => calls++);
    const it = await d.createItem('b-orders', '  علب جديدة  ', { groupId: 'g-ready' });
    expect(it.name).toBe('علب جديدة');
    const b = await d.getBoard('b-orders');
    expect(b?.items.filter((i) => i.groupId === 'g-ready').at(-1)?.id).toBe(it.id);
    expect(calls).toBe(1);
  });

  it('writes one cell without touching the others', async () => {
    const d = await signedIn();
    await d.setCell('i-1', 'c-o-status', { label_id: 'done' });
    await d.setCell('i-1', 'c-o-date', null);
    const it = (await d.getBoard('b-orders'))!.items.find((i) => i.id === 'i-1')!;
    expect(it.vals['c-o-status']).toEqual({ label_id: 'done' });
    expect(it.vals['c-o-date']).toBeUndefined();
    expect(it.vals['c-o-qty']).toEqual({ number: '500' });
  });

  it('rejects bad cell values like the database does', async () => {
    const d = await signedIn();
    await expect(d.setCell('i-1', 'c-o-date', { date: '20/11/2026' })).rejects.toBeInstanceOf(CellError);
    await expect(d.setCell('i-1', 'c-o-qty', { number: 'خمسمية' })).rejects.toBeInstanceOf(CellError);
    await expect(d.setCell('i-1', 'c-o-status', { label_id: 'nope' })).rejects.toBeInstanceOf(CellError);
  });

  it('moves an item between groups and before a given item', async () => {
    const d = await signedIn();
    await d.moveItem('i-6', { groupId: 'g-nov', afterId: 'i-2' });
    const ids = (await d.getBoard('b-orders'))!.items.filter((i) => i.groupId === 'g-nov').map((i) => i.id);
    expect(ids).toEqual(['i-1', 'i-6', 'i-2', 'i-3', 'i-4']);
  });

  it('deletes and restores (undo)', async () => {
    const d = await signedIn();
    await d.deleteItem('i-2');
    expect((await d.getBoard('b-orders'))!.items.some((i) => i.id === 'i-2')).toBe(false);
    await d.restoreItem('i-2');
    expect((await d.getBoard('b-orders'))!.items.some((i) => i.id === 'i-2')).toBe(true);
  });

  it('blocks viewers from editing', async () => {
    const d = await signedIn('u-yousef');
    await expect(d.setCell('i-1', 'c-o-status', { label_id: 'done' })).rejects.toBeInstanceOf(NotAllowed);
    await expect(d.createItem('b-orders', 'x', { groupId: 'g-nov' })).rejects.toBeInstanceOf(NotAllowed);
  });

  it('creates a board with a group and default columns', async () => {
    const d = await signedIn();
    const b = await d.createBoard('ws-factory', 'الموردين');
    const bundle = await d.getBoard(b.id);
    expect(bundle?.groups).toHaveLength(1);
    expect(bundle?.columns.map((c) => c.type)).toEqual(['people', 'status', 'date']);
  });

  it('keeps data across reloads through the persistence backend', async () => {
    const p = memoryPersist();
    const d1 = createFakeLayer(p);
    await d1.signIn('u-ahmed');
    await d1.renameItem('i-1', 'اسم جديد');
    const d2 = createFakeLayer(p);
    expect((await d2.me())?.id).toBe('u-ahmed');
    expect((await d2.getBoard('b-orders'))!.items.find((i) => i.id === 'i-1')!.name).toBe('اسم جديد');
  });
});
