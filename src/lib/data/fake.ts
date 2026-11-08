import { generateKeyBetween } from 'fractional-indexing';
import { makeSeed, DEFAULT_LABELS, DB_VERSION, type DB } from './seed';
import { validateCell } from './validate';
import type { ActivityEntry, Asset, Board, BoardBundle, CellValue, Column, ColumnType, DataLayer, Group, Item, MyWorkRow, NewFile, NotificationKind, Place, Profile, StatusValue, Update } from './types';

// In-browser stand-in for Supabase, used until replica-backend. Same function
// signatures as the real layer. Data lives in localStorage; changes reach other
// tabs through BroadcastChannel, which stands in for Supabase Realtime.

export interface Persist {
  load(): { db: DB | null; me: string | null };
  save(db: DB, me: string | null): void;
  onRemote(cb: () => void): () => void;
  broadcast(boardIds: string[]): void;
}

export class NotAllowed extends Error {}

const byPos = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function createFakeLayer(persist: Persist): DataLayer {
  const loaded = persist.load();
  let db: DB = loaded.db ?? makeSeed();
  let meId: string | null = loaded.me;
  const subs = new Map<string, Set<() => void>>();
  const allSubs = new Set<() => void>();

  const notify = (boardIds: string[]) => {
    for (const id of boardIds) subs.get(id)?.forEach((f) => f());
    allSubs.forEach((f) => f());
  };
  const commit = (boardIds: string[]) => {
    persist.save(db, meId);
    persist.broadcast(boardIds);
    notify(boardIds);
  };
  persist.onRemote(() => {
    const fresh = persist.load();
    if (fresh.db) db = fresh.db;
    notify([...subs.keys()]);
  });

  const me = () => db.members.find((m) => m.id === meId) ?? null;
  const canEdit = () => {
    const m = me();
    if (!m) throw new NotAllowed('not signed in');
    if (m.role === 'viewer') throw new NotAllowed('view only');
  };
  const item = (id: string) => {
    const it = db.items.find((i) => i.id === id);
    if (!it) throw new Error('item not found');
    return it;
  };
  const now = () => new Date().toISOString();

  // ---- bookkeeping the database triggers do (app.items_after_write, app.update_notify, app.assignee_notify)
  const log = (it: Item, action: ActivityEntry['action'], columnId: string | null = null, before: unknown = null, after: unknown = null) => {
    db.activity.push({ id: uid(), boardId: it.boardId, itemId: it.id, actorId: meId, action, columnId, before, after, createdAt: now() });
    if (db.activity.length > 2000) db.activity.splice(0, db.activity.length - 2000);
  };
  const follow = (userId: string | null, itemId: string) => {
    if (userId && !db.subscriptions.some((x) => x.userId === userId && x.itemId === itemId)) db.subscriptions.push({ userId, itemId });
  };
  const notifyUser = (userId: string, kind: NotificationKind, it: Item, updateId: string | null = null) => {
    if (userId === meId) return;
    db.notifications.push({ id: uid(), userId, kind, actorId: meId, boardId: it.boardId, itemId: it.id, updateId, readAt: null, createdAt: now() });
  };
  const MAX_FILE = 2 * 1024 * 1024; // demo only: browser storage is small. Supabase Storage allows 100 MB.
  const saveFile = (boardId: string, itemId: string | null, updateId: string | null, f: NewFile): Asset => {
    if (f.size > MAX_FILE) throw new Error('file too large');
    const a: Asset = { id: uid(), boardId, itemId, updateId, fileName: f.name.slice(0, 200), mimeType: f.type || 'application/octet-stream', sizeBytes: f.size, url: f.dataUrl, uploadedBy: meId, createdAt: now() };
    db.assets.push(a);
    return a;
  };
  const defaultSettings = (type: ColumnType): Column['settings'] =>
    type === 'status' ? { labels: DEFAULT_LABELS } : type === 'dropdown' ? { options: [] } : {};
  const defaultWidth = (type: ColumnType) =>
    ({ people: 120, status: 150, date: 120, numbers: 120, checkbox: 90, phone: 160, timeline: 170, files: 120, dropdown: 150, link: 180, email: 200, text: 200, long_text: 220 })[type];

  // position between neighbours in a group (fractional key: one row written per move)
  const keyFor = (boardId: string, place: Place, ignoreId?: string) => {
    const siblings = db.items
      .filter((i) => i.boardId === boardId && i.groupId === place.groupId && !i.deletedAt && i.parentItemId === null && i.id !== ignoreId)
      .sort(byPos);
    if (place.beforeId) {
      const idx = siblings.findIndex((s) => s.id === place.beforeId);
      return generateKeyBetween(siblings[idx]?.position ?? null, siblings[idx + 1]?.position ?? null);
    }
    if (place.afterId) {
      const idx = siblings.findIndex((s) => s.id === place.afterId);
      return generateKeyBetween(siblings[idx - 1]?.position ?? null, siblings[idx]?.position ?? null);
    }
    return generateKeyBetween(siblings.at(-1)?.position ?? null, null);
  };

  return {
    async me() { return me(); },
    async signIn(userId) {
      const m = db.members.find((x) => x.id === userId);
      if (!m) throw new Error('unknown user');
      meId = userId;
      persist.save(db, meId);
      allSubs.forEach((f) => f());
      return m;
    },
    async signOut() { meId = null; persist.save(db, meId); allSubs.forEach((f) => f()); },
    async members() { return db.members; },
    async account() { return db.account; },

    async workspaces() { return [...db.workspaces].sort(byPos); },
    async boards(workspaceId) { return db.boards.filter((b) => b.workspaceId === workspaceId && !b.deletedAt).sort(byPos); },
    async getBoard(boardId): Promise<BoardBundle | null> {
      const board = db.boards.find((b) => b.id === boardId && !b.deletedAt);
      if (!board) return null;
      return {
        board,
        groups: db.groups.filter((g) => g.boardId === boardId && !g.deletedAt).sort(byPos),
        columns: db.columns.filter((c) => c.boardId === boardId).sort(byPos),
        items: db.items.filter((i) => i.boardId === boardId && !i.deletedAt).sort(byPos),
        updateCounts: db.updates.reduce<Record<string, number>>((m, u) => { if (u.boardId === boardId) m[u.itemId] = (m[u.itemId] ?? 0) + 1; return m; }, {}),
      };
    },
    async createBoard(workspaceId, name) {
      canEdit();
      const last = db.boards.filter((b) => b.workspaceId === workspaceId).sort(byPos).at(-1);
      const b: Board = {
        id: uid(), accountId: db.account.id, workspaceId, name: name.trim() || 'لوحة جديدة', description: '',
        kind: 'main', itemNoun: 'عنصر', position: generateKeyBetween(last?.position ?? null, null), createdBy: meId, deletedAt: null,
      };
      db.boards.push(b);
      db.groups.push({ id: uid(), boardId: b.id, title: 'مجموعة جديدة', color: 'blue', position: generateKeyBetween(null, null), deletedAt: null });
      const k0 = generateKeyBetween(null, null);
      const k1b = generateKeyBetween(k0, null);
      const k2b = generateKeyBetween(k1b, null);
      db.columns.push(
        { id: uid(), boardId: b.id, scope: 'item', title: 'المسؤول', type: 'people', settings: {}, position: k0, width: 120 },
        { id: uid(), boardId: b.id, scope: 'item', title: 'الحالة', type: 'status', settings: { labels: DEFAULT_LABELS }, position: k1b, width: 150 },
        { id: uid(), boardId: b.id, scope: 'item', title: 'التاريخ', type: 'date', settings: {}, position: k2b, width: 120 },
      );
      commit([b.id]);
      return b;
    },
    async renameBoard(boardId, name) {
      canEdit();
      const b = db.boards.find((x) => x.id === boardId);
      if (!b || !name.trim()) return;
      b.name = name.trim();
      commit([boardId]);
    },

    async createGroup(boardId, title) {
      canEdit();
      const first = db.groups.filter((g) => g.boardId === boardId && !g.deletedAt).sort(byPos)[0];
      const colors: Group['color'][] = ['purple', 'teal', 'orange', 'pink', 'navy', 'brown'];
      const g: Group = {
        id: uid(), boardId, title: title.trim() || 'مجموعة جديدة',
        color: colors[db.groups.length % colors.length], position: generateKeyBetween(null, first?.position ?? null), deletedAt: null,
      };
      db.groups.push(g);
      commit([boardId]);
      return g;
    },
    async renameGroup(groupId, title) {
      canEdit();
      const g = db.groups.find((x) => x.id === groupId);
      if (!g || !title.trim()) return;
      g.title = title.trim();
      commit([g.boardId]);
    },
    async deleteGroup(groupId) {
      canEdit();
      const g = db.groups.find((x) => x.id === groupId);
      if (!g) return;
      g.deletedAt = now();
      commit([g.boardId]);
    },
    async restoreGroup(groupId) {
      canEdit();
      const g = db.groups.find((x) => x.id === groupId);
      if (!g) return;
      g.deletedAt = null;
      commit([g.boardId]);
    },

    async createItem(boardId, name, place) {
      canEdit();
      const clean = name.trim();
      if (!clean) throw new Error('name required');
      if (clean.length > 500) throw new Error('name too long');
      const it: Item = {
        id: uid(), boardId, groupId: place.groupId, parentItemId: null, name: clean, vals: {},
        position: keyFor(boardId, place), createdBy: meId, deletedAt: null, createdAt: now(), updatedAt: now(),
      };
      db.items.push(it);
      log(it, 'item_created', null, null, it.name);
      follow(meId, it.id);
      commit([boardId]);
      return it;
    },
    async renameItem(itemId, name) {
      canEdit();
      const it = item(itemId);
      const clean = name.trim();
      if (!clean || clean === it.name) return;
      log(it, 'name_changed', null, it.name, clean.slice(0, 500));
      it.name = clean.slice(0, 500);
      it.updatedAt = now();
      commit([it.boardId]);
    },
    async setCell(itemId, columnId, value: CellValue | null) {
      canEdit();
      const it = item(itemId);
      const col = db.columns.find((c) => c.id === columnId && c.boardId === it.boardId);
      if (!col) throw new Error('column not found');
      validateCell(col, value);
      const before = it.vals[columnId] ?? null;
      if (col.type === 'people') {
        const was = new Set(((before as { user_ids?: string[] } | null)?.user_ids) ?? []);
        for (const u of ((value as { user_ids?: string[] } | null)?.user_ids) ?? []) {
          if (!was.has(u)) { notifyUser(u, 'assigned', it); follow(u, it.id); }
        }
      }
      log(it, 'cell_changed', columnId, before, value);
      // one key only: other cells on the same item are untouched
      const vals = { ...it.vals };
      if (value === null) delete vals[columnId];
      else vals[columnId] = value;
      it.vals = vals;
      it.updatedAt = now();
      commit([it.boardId]);
      return it;
    },
    async moveItem(itemId, place) {
      canEdit();
      const it = item(itemId);
      if (it.groupId !== place.groupId) log(it, 'item_moved', null, it.groupId, place.groupId);
      it.position = keyFor(it.boardId, place, itemId);
      it.groupId = place.groupId;
      it.updatedAt = now();
      commit([it.boardId]);
    },
    async deleteItem(itemId) {
      canEdit();
      const it = item(itemId);
      it.deletedAt = now();
      log(it, 'item_deleted');
      commit([it.boardId]);
    },
    async restoreItem(itemId) {
      canEdit();
      const it = item(itemId);
      it.deletedAt = null;
      log(it, 'item_restored');
      commit([it.boardId]);
    },

    // ---- columns
    async createColumn(boardId, type, title, scope = 'item') {
      canEdit();
      const last = db.columns.filter((c) => c.boardId === boardId && c.scope === scope).sort(byPos).at(-1);
      const c: Column = { id: uid(), boardId, scope, title: title.trim().slice(0, 120) || type, type, settings: defaultSettings(type), position: generateKeyBetween(last?.position ?? null, null), width: defaultWidth(type) };
      db.columns.push(c);
      commit([boardId]);
      return c;
    },
    async renameColumn(columnId, title) {
      canEdit();
      const c = db.columns.find((x) => x.id === columnId);
      if (!c || !title.trim()) return;
      c.title = title.trim().slice(0, 120);
      commit([c.boardId]);
    },
    async deleteColumn(columnId) {
      canEdit();
      const c = db.columns.find((x) => x.id === columnId);
      if (!c) return;
      db.columns = db.columns.filter((x) => x.id !== columnId);
      for (const it of db.items) if (it.boardId === c.boardId && columnId in it.vals) { const v = { ...it.vals }; delete v[columnId]; it.vals = v; }
      commit([c.boardId]);
    },
    async updateColumnSettings(columnId, settings) {
      canEdit();
      const c = db.columns.find((x) => x.id === columnId);
      if (!c) return;
      c.settings = { ...c.settings, ...settings };
      commit([c.boardId]);
    },

    // ---- subitems
    async createSubitem(parentItemId, name) {
      canEdit();
      const parent = item(parentItemId);
      const clean = name.trim();
      if (!clean) throw new Error('name required');
      if (!db.columns.some((c) => c.boardId === parent.boardId && c.scope === 'subitem')) {
        const k0 = generateKeyBetween(null, null), k1 = generateKeyBetween(k0, null), k2 = generateKeyBetween(k1, null);
        db.columns.push(
          { id: uid(), boardId: parent.boardId, scope: 'subitem', title: 'المسؤول', type: 'people', settings: {}, position: k0, width: 120 },
          { id: uid(), boardId: parent.boardId, scope: 'subitem', title: 'الحالة', type: 'status', settings: { labels: DEFAULT_LABELS }, position: k1, width: 150 },
          { id: uid(), boardId: parent.boardId, scope: 'subitem', title: 'التاريخ', type: 'date', settings: {}, position: k2, width: 120 },
        );
      }
      const last = db.items.filter((i) => i.parentItemId === parentItemId && !i.deletedAt).sort(byPos).at(-1);
      const it: Item = { id: uid(), boardId: parent.boardId, groupId: null, parentItemId, name: clean.slice(0, 500), vals: {}, position: generateKeyBetween(last?.position ?? null, null), createdBy: meId, deletedAt: null, createdAt: now(), updatedAt: now() };
      db.items.push(it);
      log(it, 'item_created', null, null, it.name);
      follow(meId, it.id);
      commit([parent.boardId]);
      return it;
    },

    // ---- item card
    async updates(itemId) {
      return db.updates.filter((u) => u.itemId === itemId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async postUpdate(itemId, bodyText, mentionedUserIds, opts = {}) {
      const m = me();
      if (!m) throw new NotAllowed('not signed in');
      if (m.role === 'viewer') throw new NotAllowed('view only');
      const it = item(itemId);
      const text = bodyText.trim();
      if (!text && !opts.files?.length) throw new Error('empty update');
      const u: Update = { id: uid(), boardId: it.boardId, itemId, parentUpdateId: opts.parentUpdateId ?? null, authorId: meId, bodyText: text.slice(0, 10000), mentionedUserIds: [], assetIds: [], createdAt: now(), editedAt: null };
      u.assetIds = (opts.files ?? []).map((f) => saveFile(it.boardId, itemId, u.id, f).id);
      const members = new Set(db.members.map((x) => x.id));
      u.mentionedUserIds = [...new Set(mentionedUserIds)].filter((x) => members.has(x));
      db.updates.push(u);
      // mentioned people get "mention"; everyone else following the item gets "update"; never the author, never twice
      for (const x of u.mentionedUserIds) notifyUser(x, 'mention', it, u.id);
      for (const s2 of db.subscriptions.filter((x) => x.itemId === itemId)) {
        if (!u.mentionedUserIds.includes(s2.userId)) notifyUser(s2.userId, 'update', it, u.id);
      }
      follow(meId, itemId);
      commit([it.boardId]);
      return u;
    },
    async editUpdate(updateId, bodyText) {
      const u = db.updates.find((x) => x.id === updateId);
      if (!u || u.authorId !== meId) throw new NotAllowed('only the author can edit');
      u.bodyText = bodyText.trim().slice(0, 10000);
      u.editedAt = now();
      commit([u.boardId]);
    },
    async deleteUpdate(updateId) {
      const u = db.updates.find((x) => x.id === updateId);
      if (!u) return;
      if (u.authorId !== meId && me()?.role !== 'admin') throw new NotAllowed('only the author can delete');
      const ids = new Set([updateId, ...db.updates.filter((x) => x.parentUpdateId === updateId).map((x) => x.id)]);
      db.updates = db.updates.filter((x) => !ids.has(x.id));
      db.assets = db.assets.filter((a) => !a.updateId || !ids.has(a.updateId));
      db.notifications = db.notifications.filter((n) => !n.updateId || !ids.has(n.updateId));
      commit([u.boardId]);
    },
    async assets(itemId) {
      return db.assets.filter((a) => a.itemId === itemId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async uploadToCell(itemId, columnId, file) {
      canEdit();
      const it = item(itemId);
      const col = db.columns.find((c) => c.id === columnId && c.boardId === it.boardId && c.type === 'files');
      if (!col) throw new Error('not a files column');
      const a = saveFile(it.boardId, itemId, null, file);
      const ids = ((it.vals[columnId] as { asset_ids?: string[] } | undefined)?.asset_ids) ?? [];
      it.vals = { ...it.vals, [columnId]: { asset_ids: [...ids, a.id] } };
      log(it, 'cell_changed', columnId, { asset_ids: ids }, it.vals[columnId]);
      commit([it.boardId]);
      return a;
    },
    async activity(itemId) {
      return db.activity.filter((a) => a.itemId === itemId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100);
    },

    // ---- personal
    async notifications() {
      return db.notifications.filter((n) => n.userId === meId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async markRead(ids) {
      const t = now();
      for (const n of db.notifications) if (n.userId === meId && !n.readAt && (ids === 'all' || ids.includes(n.id))) n.readAt = t;
      persist.save(db, meId);
      persist.broadcast([]);
      notify([]);
    },
    async myWork(): Promise<MyWorkRow[]> {
      if (!meId) return [];
      const rows: MyWorkRow[] = [];
      for (const it of db.items) {
        if (it.deletedAt) continue;
        const board = db.boards.find((b) => b.id === it.boardId && !b.deletedAt);
        if (!board) continue;
        if (it.groupId && db.groups.find((g) => g.id === it.groupId)?.deletedAt) continue;
        const cols = db.columns.filter((c) => c.boardId === it.boardId && c.scope === (it.parentItemId ? 'subitem' : 'item'));
        const mine = cols.some((c) => c.type === 'people' && (((it.vals[c.id] as { user_ids?: string[] } | undefined)?.user_ids) ?? []).includes(meId!));
        if (!mine) continue;
        const dateCol = cols.find((c) => c.type === 'date' && it.vals[c.id]);
        const statusCol = cols.find((c) => c.type === 'status');
        const label = statusCol ? (statusCol.settings.labels ?? []).find((l) => l.id === (it.vals[statusCol.id] as StatusValue | undefined)?.label_id) ?? null : null;
        rows.push({ item: it, board, date: dateCol ? (it.vals[dateCol.id] as { date: string }).date : null, statusLabel: label, done: !!label?.done });
      }
      return rows.sort((a, b) => (a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1);
    },

    subscribe(boardId, onChange) {
      if (!subs.has(boardId)) subs.set(boardId, new Set());
      subs.get(boardId)!.add(onChange);
      return () => { subs.get(boardId)?.delete(onChange); };
    },
    subscribeAll(onChange) {
      allSubs.add(onChange);
      return () => { allSubs.delete(onChange); };
    },
  };
}

// ---- persistence backends

const KEY = 'lawha:db:v2';
const ME_KEY = 'lawha:me:v1';

export function browserPersist(): Persist {
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel('lawha'); } catch { channel = null; }
  return {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        const db = raw ? (JSON.parse(raw) as DB) : null;
        return { db: db && db.version === DB_VERSION ? db : null, me: localStorage.getItem(ME_KEY) };
      } catch {
        return { db: null, me: null };
      }
    },
    save(db, me) {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
        if (me) localStorage.setItem(ME_KEY, me); else localStorage.removeItem(ME_KEY);
      } catch { /* storage blocked: keep working in memory */ }
    },
    onRemote(cb) {
      // Two signals for the same thing: the storage event fires in every other
      // tab when localStorage changes, BroadcastChannel covers browsers that
      // batch storage events. Reloading twice is harmless.
      const h = () => cb();
      const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
      channel?.addEventListener('message', h);
      try { addEventListener('storage', onStorage); } catch { /* no window */ }
      return () => {
        channel?.removeEventListener('message', h);
        try { removeEventListener('storage', onStorage); } catch { /* ignore */ }
      };
    },
    broadcast(boardIds) {
      try { channel?.postMessage({ type: 'changed', boardIds }); } catch { /* ignore */ }
    },
  };
}

export function memoryPersist(initial?: DB, me: string | null = null): Persist {
  let state = { db: initial ?? null, me };
  return {
    load: () => ({ db: state.db ? (JSON.parse(JSON.stringify(state.db)) as DB) : null, me: state.me }),
    save: (db, m) => { state = { db: JSON.parse(JSON.stringify(db)), me: m }; },
    onRemote: () => () => {},
    broadcast: () => {},
  };
}

export type { Profile };
