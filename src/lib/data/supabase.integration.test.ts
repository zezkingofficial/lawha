// Runs against the real Supabase project (not part of `npm test`).
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npx vitest run -c vitest.integration.config.ts
// Creates clearly named test companies; they stay isolated from real data by RLS.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseLayer } from './supabase';
import { NotAllowed } from './fake';
import { CellError } from './validate';
import type { DataLayer } from './types';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
const run = Date.now().toString(36);
const mail = (who: string) => `test-${who}-${run}@lawha-test.dev`;
const PASS = 'Test-password-' + run;

function layer(): DataLayer {
  return createSupabaseLayer(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

const A = layer(); // owner of company 1
const B = layer(); // another company
const C = layer(); // invited member of company 1
const G = layer(); // invited guest on one board

let ordersId = '';
let groupId = '';
let statusCol = '';
let itemId = '';

describe('real backend', () => {
  beforeAll(async () => {
    expect(await A.auth!.signUp({ fullName: 'اختبار أحمد', company: `شركة اختبار ${run}`, email: mail('a'), password: PASS })).toBe('signed_in');
    expect(await B.auth!.signUp({ fullName: 'Other Owner', company: `Other test ${run}`, email: mail('b'), password: PASS })).toBe('signed_in');
  }, 60000);

  it('a new company gets a workspace, the orders board and views', async () => {
    const ws = await A.workspaces();
    expect(ws).toHaveLength(1);
    const boards = await A.boards(ws[0].id);
    expect(boards.map((b) => b.name)).toEqual(expect.arrayContaining(['طلبات العملاء', 'خط الإنتاج']));
    const orders = (await A.getBoard(boards.find((b) => b.name === 'طلبات العملاء')!.id))!;
    ordersId = orders.board.id;
    groupId = orders.groups[0].id;
    statusCol = orders.columns.find((c) => c.type === 'status')!.id;
    expect(orders.columns.filter((c) => c.scope === 'item')).toHaveLength(7);
    expect(orders.views.map((v) => v.type)).toEqual(['table', 'kanban', 'calendar']);
    expect(orders.canEdit && orders.canAdmin).toBe(true);
  });

  it('adds an item, writes a cell, rejects a bad value', async () => {
    itemId = (await A.createItem(ordersId, 'علب عطور تجربة', { groupId })).id;
    await A.setCell(itemId, statusCol, { label_id: 'prod' });
    const b = (await A.getBoard(ordersId))!;
    expect(b.items.find((i) => i.id === itemId)!.vals[statusCol]).toEqual({ label_id: 'prod' });
    const date = b.columns.find((c) => c.type === 'date')!.id;
    await expect(A.setCell(itemId, date, { date: '20/11/2026' })).rejects.toBeInstanceOf(CellError);
  });

  it('another company sees nothing of company 1', async () => {
    expect(await B.getBoard(ordersId)).toBeNull();
    expect((await B.members()).map((m) => m.fullName)).not.toContain('اختبار أحمد');
    await expect(B.setCell(itemId, statusCol, { label_id: 'done' })).rejects.toBeTruthy();
    const still = (await A.getBoard(ordersId))!.items.find((i) => i.id === itemId)!;
    expect(still.vals[statusCol]).toEqual({ label_id: 'prod' });
  });

  it('an invitation link brings a teammate in, only for the invited email', async () => {
    const inv = await A.auth!.createInvite(mail('c'), 'member');
    await expect(B.auth!.acceptInvite(inv.token)).rejects.toThrow(/different email/);
    expect((await C.auth!.previewInvite(inv.token))?.accountName).toBe(`شركة اختبار ${run}`);
    expect(await C.auth!.signUp({ fullName: 'اختبار سارة', company: '', email: mail('c'), password: PASS, inviteToken: inv.token })).toBe('signed_in');
    expect((await C.getBoard(ordersId))?.board.id).toBe(ordersId);
    expect((await A.members()).map((m) => m.fullName).sort()).toEqual(['اختبار أحمد', 'اختبار سارة'].sort());
  }, 30000);

  it('a mention reaches the mentioned person', async () => {
    const sara = (await A.members()).find((m) => m.fullName === 'اختبار سارة')!;
    await A.postUpdate(itemId, '@اختبار سارة جاهز للمراجعة', [sara.id]);
    const n = await C.notifications();
    expect(n.some((x) => x.kind === 'mention' && x.itemId === itemId)).toBe(true);
  });

  it('a change by one person arrives live for another', async () => {
    let fired = false;
    const stop = C.subscribe(ordersId, () => { fired = true; });
    await new Promise((r) => setTimeout(r, 2500)); // let the channel join
    fired = false;
    await A.renameItem(itemId, 'علب عطور تجربة ٢');
    for (let i = 0; i < 40 && !fired; i++) await new Promise((r) => setTimeout(r, 250));
    stop();
    expect(fired).toBe(true);
  }, 30000);

  it('uploads a file to a files column and serves it through a signed link', async () => {
    const col = await A.createColumn(ordersId, 'files', 'ملفات');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const a = await A.uploadToCell(itemId, col.id, { name: 'bruva.png', type: 'image/png', size: 68, dataUrl: png });
    const res = await fetch(a.url);
    expect(res.status).toBe(200);
    expect((await B.assets(itemId))).toHaveLength(0);
  }, 30000);

  it('a guest sees only the board they were invited to', async () => {
    const inv = await A.auth!.createInvite(mail('g'), 'guest', ordersId);
    await G.auth!.signUp({ fullName: 'Guest client', company: '', email: mail('g'), password: PASS, inviteToken: inv.token });
    const ws = await G.workspaces();
    expect(ws).toHaveLength(1);
    expect((await G.boards(ws[0].id)).map((b) => b.id)).toEqual([ordersId]);
    await expect(G.createBoard(ws[0].id, 'x')).rejects.toBeTruthy();
  }, 30000);

  it('viewers cannot edit', async () => {
    const sara = (await A.members()).find((m) => m.fullName === 'اختبار سارة')!;
    await A.auth!.setRole(sara.id, 'viewer');
    const C2 = layer();
    await C2.auth!.signIn(mail('c'), PASS);
    await expect(C2.setCell(itemId, statusCol, { label_id: 'done' })).rejects.toBeInstanceOf(NotAllowed);
  }, 30000);
});
