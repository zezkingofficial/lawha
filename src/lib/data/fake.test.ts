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

describe('collaboration and personal views', () => {
  it('notifies a newly assigned person once, not the person assigning', async () => {
    const d = await signedIn('u-ahmed');
    await d.setCell('i-2', 'c-o-owner', { user_ids: ['u-sara', 'u-ahmed', 'u-mohamed'] });
    await d.signIn('u-mohamed');
    const n = (await d.notifications()).filter((x) => x.kind === 'assigned' && x.itemId === 'i-2');
    expect(n).toHaveLength(1);
    await d.signIn('u-ahmed');
    expect((await d.notifications()).some((x) => x.kind === 'assigned' && x.itemId === 'i-2')).toBe(false);
  });

  it('posts an update: mention for the mentioned, update for followers, nothing for the author', async () => {
    const d = await signedIn('u-sara');
    await d.postUpdate('i-3', '@أحمد تمام، هكلم العميل', ['u-ahmed', 'u-ahmed']);
    await d.signIn('u-ahmed');
    const forAhmed = (await d.notifications()).filter((x) => x.itemId === 'i-3' && x.updateId && x.updateId !== 'up-1');
    expect(forAhmed.map((x) => x.kind)).toEqual(['mention']);
    await d.signIn('u-mohamed');
    expect((await d.notifications()).filter((x) => x.itemId === 'i-3').map((x) => x.kind)).toEqual(['update']);
    await d.signIn('u-sara');
    expect((await d.notifications()).filter((x) => x.itemId === 'i-3')).toHaveLength(0);
  });

  it('marks notifications read', async () => {
    const d = await signedIn('u-ahmed');
    expect((await d.notifications()).filter((n) => !n.readAt).length).toBeGreaterThan(0);
    await d.markRead('all');
    expect((await d.notifications()).filter((n) => !n.readAt)).toHaveLength(0);
  });

  it('creates subitems and the subitem columns on first use', async () => {
    const d = await signedIn();
    const s = await d.createSubitem('i-2', 'تصميم البروفة');
    const b = (await d.getBoard('b-orders'))!;
    expect(b.items.find((i) => i.id === s.id)?.parentItemId).toBe('i-2');
    expect(b.columns.filter((c) => c.scope === 'subitem').length).toBe(3);
  });

  it('adds, renames and deletes a column, removing its values', async () => {
    const d = await signedIn();
    const c = await d.createColumn('b-orders', 'checkbox', 'تم الدفع');
    await d.setCell('i-1', c.id, { checked: true });
    await d.renameColumn(c.id, 'مدفوع');
    expect((await d.getBoard('b-orders'))!.columns.find((x) => x.id === c.id)?.title).toBe('مدفوع');
    await d.deleteColumn(c.id);
    const b = (await d.getBoard('b-orders'))!;
    expect(b.columns.some((x) => x.id === c.id)).toBe(false);
    expect(c.id in b.items.find((i) => i.id === 'i-1')!.vals).toBe(false);
  });

  it('validates the new column types', async () => {
    const d = await signedIn();
    await expect(d.setCell('i-1', 'c-o-phone', { phone: 'not a phone' })).rejects.toBeInstanceOf(CellError);
    await expect(d.setCell('i-1', 'c-o-type', { option_ids: ['nope'] })).rejects.toBeInstanceOf(CellError);
    const t = await d.createColumn('b-orders', 'timeline', 'مدة الإنتاج');
    await expect(d.setCell('i-1', t.id, { from: '2026-11-20', to: '2026-11-10' })).rejects.toBeInstanceOf(CellError);
    await d.setCell('i-1', t.id, { from: '2026-11-10', to: '2026-11-20' });
  });

  it('lists My Work for the signed-in person, including subitems, by date', async () => {
    const d = await signedIn('u-mohamed');
    const rows = await d.myWork();
    const ids = rows.map((r) => r.item.id);
    expect(ids).toEqual(expect.arrayContaining(['i-1', 'i-3', 'i-6', 'i-1-a', 'i-1-b', 'i-p-1']));
    expect(ids).not.toContain('i-2');
    const dated = rows.filter((r) => r.date).map((r) => r.date!);
    expect([...dated].sort()).toEqual(dated);
  });

  it('records activity for cell changes and keeps uploads on the item', async () => {
    const d = await signedIn();
    const f = await d.createColumn('b-orders', 'files', 'ملفات');
    await d.uploadToCell('i-1', f.id, { name: 'bruva.png', type: 'image/png', size: 10, dataUrl: 'data:image/png;base64,AA==' });
    await expect(d.uploadToCell('i-1', f.id, { name: 'big.pdf', type: 'application/pdf', size: 3 * 1024 * 1024, dataUrl: 'data:,' })).rejects.toThrow('file too large');
    expect((await d.assets('i-1')).map((a) => a.fileName)).toEqual(['bruva.png']);
    await d.setCell('i-1', 'c-o-status', { label_id: 'ready' });
    expect((await d.activity('i-1'))[0]).toMatchObject({ action: 'cell_changed', columnId: 'c-o-status', after: { label_id: 'ready' } });
  });
});
