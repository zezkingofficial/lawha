import { generateKeyBetween } from 'fractional-indexing';
import { makeSeed, DEFAULT_LABELS, type DB } from './seed';
import { validateCell } from './validate';
import type { Board, BoardBundle, CellValue, DataLayer, Group, Item, Place, Profile } from './types';

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
      commit([boardId]);
      return it;
    },
    async renameItem(itemId, name) {
      canEdit();
      const it = item(itemId);
      const clean = name.trim();
      if (!clean || clean === it.name) return;
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
      it.position = keyFor(it.boardId, place, itemId);
      it.groupId = place.groupId;
      it.updatedAt = now();
      commit([it.boardId]);
    },
    async deleteItem(itemId) {
      canEdit();
      const it = item(itemId);
      it.deletedAt = now();
      commit([it.boardId]);
    },
    async restoreItem(itemId) {
      canEdit();
      const it = item(itemId);
      it.deletedAt = null;
      commit([it.boardId]);
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

const KEY = 'lawha:db:v1';
const ME_KEY = 'lawha:me:v1';

export function browserPersist(): Persist {
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel('lawha'); } catch { channel = null; }
  return {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        const db = raw ? (JSON.parse(raw) as DB) : null;
        return { db: db && db.version === 1 ? db : null, me: localStorage.getItem(ME_KEY) };
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
