import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { generateKeyBetween } from 'fractional-indexing';
import { DEFAULT_LABELS, emptySettings } from './seed';
import { NotAllowed } from './fake';
import { CellError } from './validate';
import type {
  Account, ActivityEntry, Asset, AuthApi, Board, BoardBundle, BoardMember, CellValue, Column, ColumnType, DataLayer, Group, Invite,
  Item, MyWorkRow, NewFile, Notification, Place, Profile, Role, StatusValue, Update, View, ViewSettings, Workspace,
} from './types';

// The real data layer: same interface as the demo layer, backed by Supabase
// (Postgres with the row level security in supabase/migrations, Auth, Storage, Realtime).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const board = (r: Row): Board => ({ id: r.id, accountId: r.account_id, workspaceId: r.workspace_id, name: r.name, description: r.description ?? '', kind: r.kind, itemNoun: r.item_noun ?? 'عنصر', position: r.position, createdBy: r.created_by, deletedAt: r.deleted_at });
const group = (r: Row): Group => ({ id: r.id, boardId: r.board_id, title: r.title, color: r.color, position: r.position, deletedAt: r.deleted_at });
const column = (r: Row): Column => ({ id: r.id, boardId: r.board_id, scope: r.scope, title: r.title, type: r.type, settings: r.settings ?? {}, position: r.position, width: r.width });
const item = (r: Row): Item => ({ id: r.id, boardId: r.board_id, groupId: r.group_id, parentItemId: r.parent_item_id, name: r.name, vals: r.vals ?? {}, position: r.position, createdBy: r.created_by, deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at });
const view = (r: Row): View => ({ id: r.id, boardId: r.board_id, type: r.type, name: r.name, settings: { ...emptySettings(), ...(r.settings ?? {}) }, ownerId: r.owner_id, isMain: r.is_main, position: r.position });
const workspace = (r: Row): Workspace => ({ id: r.id, accountId: r.account_id, name: r.name, kind: r.kind, position: r.position });
const byPos = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

const CELL_ERRORS = /status value|people value|date|timeline|numbers|checkbox|dropdown|phone|email|link|files value|text value|invalid input syntax/i;

function fail(e: { message: string; code?: string } | null): never | void {
  if (!e) return;
  if (e.code === '42501' || /row-level security|permission denied|not allowed|not editable|only the board owner|no edit access/i.test(e.message)) throw new NotAllowed(e.message);
  if (CELL_ERRORS.test(e.message)) throw new CellError(e.message);
  throw new Error(e.message);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function createSupabaseLayer(sb: SupabaseClient): DataLayer {
  type Ctx = { userId: string; accountId: string | null; role: Role; profile: Profile };
  let ctx: Ctx | null = null;
  let ctxPromise: Promise<Ctx | null> | null = null;
  const allSubs = new Set<() => void>();

  const loadCtx = async (): Promise<Ctx | null> => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (ctx = null);
    const userId = session.user.id;
    const [{ data: p }, { data: m }] = await Promise.all([
      sb.from('profiles').select('id, full_name, color').eq('id', userId).maybeSingle(),
      sb.from('account_members').select('account_id, role').eq('user_id', userId).order('created_at').limit(1).maybeSingle(),
    ]);
    const role = (m?.role ?? 'member') as Role;
    ctx = { userId, accountId: m?.account_id ?? null, role, profile: { id: userId, fullName: p?.full_name ?? session.user.email ?? '', color: p?.color ?? 'teal', role } };
    return ctx;
  };
  const getCtx = async () => { if (!ctx) ctxPromise ??= loadCtx().finally(() => { ctxPromise = null; }); return ctx ?? (await ctxPromise); };
  const need = async () => {
    const c = await getCtx();
    if (!c) throw new NotAllowed('not signed in');
    if (!c.accountId) throw new NotAllowed('no company yet');
    return c as { userId: string; accountId: string; role: Role; profile: Profile };
  };
  sb.auth.onAuthStateChange(() => { ctx = null; setTimeout(() => allSubs.forEach((f) => f()), 0); });

  const access = (c: { userId: string; role: Role }, b: Row, members: BoardMember[]) => {
    const mine = members.find((m) => m.userId === c.userId)?.role ?? null;
    const canEdit = c.role !== 'viewer' && (mine ?? 'editor') !== 'viewer';
    const canAdmin = c.role === 'admin' || mine === 'owner' || b.created_by === c.userId;
    return { canEdit, canAdmin };
  };
  const signedUrls = async (rows: Row[]): Promise<Asset[]> => {
    if (!rows.length) return [];
    const { data } = await sb.storage.from('assets').createSignedUrls(rows.map((r) => r.storage_path), 3600);
    return rows.map((r, i) => ({ id: r.id, boardId: r.board_id, itemId: r.item_id, updateId: r.update_id, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes, url: data?.[i]?.signedUrl ?? '', uploadedBy: r.uploaded_by, createdAt: r.created_at }));
  };
  const upload = async (c: { userId: string; accountId: string }, boardId: string, f: NewFile, link: { itemId?: string; updateId?: string }) => {
    if (f.size > 100 * 1024 * 1024) throw new Error('file too large');
    const safe = f.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-120) || 'file';
    const path = `${c.accountId}/${boardId}/${uid()}-${safe}`;
    const up = await sb.storage.from('assets').upload(path, dataUrlToBlob(f.dataUrl), { contentType: f.type || undefined, upsert: false });
    fail(up.error);
    const { data, error } = await sb.from('assets').insert({
      account_id: c.accountId, board_id: boardId, item_id: link.itemId ?? null, update_id: link.updateId ?? null,
      storage_path: path, file_name: f.name.slice(0, 200), mime_type: f.type || 'application/octet-stream', size_bytes: f.size, uploaded_by: c.userId,
    }).select('*').single();
    fail(error);
    return (await signedUrls([data!]))[0];
  };
  const siblingsKey = async (boardId: string, place: Place, ignoreId?: string) => {
    const { data, error } = await sb.from('items').select('id, position').eq('board_id', boardId).eq('group_id', place.groupId)
      .is('parent_item_id', null).is('deleted_at', null).order('position');
    fail(error);
    const sib = (data ?? []).filter((s) => s.id !== ignoreId);
    if (place.beforeId) { const i = sib.findIndex((s) => s.id === place.beforeId); return generateKeyBetween(sib[i]?.position ?? null, sib[i + 1]?.position ?? null); }
    if (place.afterId) { const i = sib.findIndex((s) => s.id === place.afterId); return generateKeyBetween(sib[i - 1]?.position ?? null, sib[i]?.position ?? null); }
    return generateKeyBetween(sib.at(-1)?.position ?? null, null);
  };
  const lastPos = async (table: string, match: Record<string, string | null>) => {
    let q = sb.from(table).select('position').order('position', { ascending: false }).limit(1);
    for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v);
    const { data } = await q;
    return (data?.[0] as Row | undefined)?.position ?? null;
  };

  const auth: AuthApi = {
    async signUp({ fullName, company, email, password, inviteToken }) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      fail(error);
      if (!data.session) return 'check_email';
      if (inviteToken) await auth.acceptInvite(inviteToken);
      else { const r = await sb.rpc('bootstrap_account', { p_company: company }); fail(r.error); }
      ctx = null;
      allSubs.forEach((f) => f());
      return 'signed_in';
    },
    async signIn(email, password, inviteToken) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
      if (inviteToken) await auth.acceptInvite(inviteToken);
      ctx = null;
      allSubs.forEach((f) => f());
    },
    async sendReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: typeof location !== 'undefined' ? location.origin : undefined });
      fail(error);
    },
    async signOut() { await sb.auth.signOut(); ctx = null; allSubs.forEach((f) => f()); },
    async previewInvite(token) {
      const { data, error } = await sb.rpc('invitation_preview', { p_token: token });
      fail(error);
      const r = (data as Row[] | null)?.[0];
      return r ? { accountName: r.account_name, role: r.role, email: r.email, expired: r.expired, used: r.used } : null;
    },
    async acceptInvite(token) {
      const r = await sb.rpc('accept_invitation', { p_token: token });
      fail(r.error);
      ctx = null;
      allSubs.forEach((f) => f());
    },
    async needsCompany() { const c = await getCtx(); return !!c && !c.accountId; },
    async createCompany(name) { const r = await sb.rpc('bootstrap_account', { p_company: name }); fail(r.error); ctx = null; allSubs.forEach((f) => f()); },
    async invites() {
      const c = await need();
      const { data, error } = await sb.from('invitations').select('*').eq('account_id', c.accountId).is('accepted_at', null).order('created_at', { ascending: false });
      fail(error);
      return (data ?? []).map((r): Invite => ({ id: r.id, email: r.email, role: r.role, token: r.token, boardId: r.board_id, expiresAt: r.expires_at, acceptedAt: r.accepted_at }));
    },
    async createInvite(email, role, boardId) {
      const c = await need();
      const { data, error } = await sb.from('invitations').insert({ account_id: c.accountId, email: email.trim().toLowerCase(), role, board_id: boardId ?? null, invited_by: c.userId }).select('*').single();
      fail(error);
      return { id: data!.id, email: data!.email, role: data!.role, token: data!.token, boardId: data!.board_id, expiresAt: data!.expires_at, acceptedAt: null };
    },
    async revokeInvite(id) { const { error } = await sb.from('invitations').delete().eq('id', id); fail(error); },
    async setRole(userId, role) {
      const c = await need();
      const { error } = await sb.from('account_members').update({ role }).eq('account_id', c.accountId).eq('user_id', userId);
      fail(error); allSubs.forEach((f) => f());
    },
    async removeMember(userId) {
      const c = await need();
      if (userId === c.userId) throw new Error('you cannot remove yourself');
      const { error } = await sb.from('account_members').delete().eq('account_id', c.accountId).eq('user_id', userId);
      fail(error); allSubs.forEach((f) => f());
    },
  };

  const layer: DataLayer = {
    auth,
    async me() { const c = await getCtx(); return c?.accountId ? c.profile : null; },
    async signIn() { throw new Error('use auth.signIn'); },
    async signOut() { await auth.signOut(); },
    async members() {
      const { data, error } = await sb.rpc('account_people');
      fail(error);
      return ((data as Row[]) ?? []).map((r): Profile => ({ id: r.id, fullName: r.full_name, color: r.color, role: r.role }));
    },
    async account(): Promise<Account> {
      const c = await need();
      const { data } = await sb.from('accounts').select('id, name').eq('id', c.accountId).single();
      return { id: data!.id, name: data!.name };
    },

    async workspaces() {
      const { data, error } = await sb.from('workspaces').select('*').order('position');
      fail(error);
      return (data ?? []).map(workspace);
    },
    async boards(workspaceId) {
      const { data, error } = await sb.from('boards').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('position');
      fail(error);
      return (data ?? []).map(board);
    },
    async getBoard(boardId): Promise<BoardBundle | null> {
      const c = await need();
      const { data: b } = await sb.from('boards').select('*').eq('id', boardId).is('deleted_at', null).maybeSingle();
      if (!b) return null;
      const [g, cols, its, vs, ms, ups] = await Promise.all([
        sb.from('groups').select('*').eq('board_id', boardId).is('deleted_at', null).order('position'),
        sb.from('columns').select('*').eq('board_id', boardId).order('position'),
        sb.from('items').select('*').eq('board_id', boardId).is('deleted_at', null).order('position').limit(10000),
        sb.from('views').select('*').eq('board_id', boardId).order('position'),
        sb.from('board_members').select('*').eq('board_id', boardId),
        sb.from('updates').select('item_id').eq('board_id', boardId),
      ]);
      for (const r of [g, cols, its, vs, ms, ups]) fail(r.error);
      const members: BoardMember[] = (ms.data ?? []).map((m) => ({ boardId: m.board_id, userId: m.user_id, role: m.role }));
      const updateCounts: Record<string, number> = {};
      for (const u of ups.data ?? []) updateCounts[u.item_id] = (updateCounts[u.item_id] ?? 0) + 1;
      return {
        board: board(b), groups: (g.data ?? []).map(group), columns: (cols.data ?? []).map(column), items: (its.data ?? []).map(item),
        views: (vs.data ?? []).map(view), members, updateCounts, ...access(c, b, members),
      };
    },
    async createBoard(workspaceId, name) {
      const { data, error } = await sb.rpc('create_board', { p_workspace: workspaceId, p_name: name });
      fail(error);
      return board(data as Row);
    },
    async renameBoard(boardId, name) { if (!name.trim()) return; const { error } = await sb.from('boards').update({ name: name.trim() }).eq('id', boardId); fail(error); },
    async createWorkspace(name) {
      const c = await need();
      const pos = await lastPos('workspaces', { account_id: c.accountId });
      const { data, error } = await sb.from('workspaces').insert({ account_id: c.accountId, name: name.trim() || 'مساحة جديدة', created_by: c.userId, position: generateKeyBetween(pos, null) }).select('*').single();
      fail(error); allSubs.forEach((f) => f());
      return workspace(data!);
    },
    async renameWorkspace(id, name) { if (!name.trim()) return; const { error } = await sb.from('workspaces').update({ name: name.trim() }).eq('id', id); fail(error); allSubs.forEach((f) => f()); },

    async setBoardKind(boardId, kind) { const { error } = await sb.from('boards').update({ kind }).eq('id', boardId); fail(error); },
    async setBoardMember(boardId, userId, role) {
      if (role) { const { error } = await sb.from('board_members').upsert({ board_id: boardId, user_id: userId, role }); fail(error); }
      else { const { error } = await sb.from('board_members').delete().eq('board_id', boardId).eq('user_id', userId); fail(error); }
    },

    async createView(boardId, type, name) {
      const c = await need();
      const bundle = await layer.getBoard(boardId);
      const pos = await lastPos('views', { board_id: boardId });
      const { data, error } = await sb.from('views').insert({
        account_id: c.accountId, board_id: boardId, type, name: name.trim() || type, settings: emptySettings(),
        owner_id: bundle?.canEdit ? null : c.userId, position: generateKeyBetween(pos, null),
      }).select('*').single();
      fail(error);
      return view(data!);
    },
    async updateView(viewId, patch) {
      const upd: Row = {};
      if (patch.name?.trim()) upd.name = patch.name.trim();
      if (patch.settings) {
        const { data } = await sb.from('views').select('settings').eq('id', viewId).single();
        upd.settings = { ...emptySettings(), ...(data?.settings ?? {}), ...patch.settings } as ViewSettings;
      }
      const { error, count } = await sb.from('views').update(upd, { count: 'exact' }).eq('id', viewId);
      fail(error);
      if (count === 0) throw new NotAllowed('cannot change this view');
    },
    async deleteView(viewId) { const { error } = await sb.from('views').delete().eq('id', viewId); fail(error); },

    async createGroup(boardId, title) {
      const c = await need();
      const { data: first } = await sb.from('groups').select('position').eq('board_id', boardId).is('deleted_at', null).order('position').limit(1);
      const colors: Group['color'][] = ['purple', 'teal', 'orange', 'pink', 'navy', 'brown'];
      const { data, error } = await sb.from('groups').insert({
        account_id: c.accountId, board_id: boardId, title: title.trim() || 'مجموعة جديدة', color: colors[Math.floor(Math.random() * colors.length)],
        position: generateKeyBetween(null, first?.[0]?.position ?? null),
      }).select('*').single();
      fail(error);
      return group(data!);
    },
    async renameGroup(id, title) { if (!title.trim()) return; const { error } = await sb.from('groups').update({ title: title.trim() }).eq('id', id); fail(error); },
    async deleteGroup(id) { const { error } = await sb.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', id); fail(error); },
    async restoreGroup(id) { const { error } = await sb.from('groups').update({ deleted_at: null }).eq('id', id); fail(error); },
    async moveGroup(id, dir) {
      const { data: g } = await sb.from('groups').select('board_id').eq('id', id).single();
      const { data: list } = await sb.from('groups').select('id, position').eq('board_id', g!.board_id).is('deleted_at', null).order('position');
      const l = list ?? [];
      const i = l.findIndex((x) => x.id === id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= l.length) return;
      const [a, b] = dir === 'up' ? [l[j - 1], l[j]] : [l[j], l[j + 1]];
      const { error } = await sb.from('groups').update({ position: generateKeyBetween(a?.position ?? null, b?.position ?? null) }).eq('id', id);
      fail(error);
    },
    async setGroupColor(id, color) { const { error } = await sb.from('groups').update({ color }).eq('id', id); fail(error); },

    async createItem(boardId, name, place) {
      const c = await need();
      const clean = name.trim();
      if (!clean) throw new Error('name required');
      const { data, error } = await sb.from('items').insert({
        account_id: c.accountId, board_id: boardId, group_id: place.groupId, name: clean.slice(0, 500), created_by: c.userId,
        position: await siblingsKey(boardId, place),
      }).select('*').single();
      fail(error);
      return item(data!);
    },
    async renameItem(id, name) { if (!name.trim()) return; const { error } = await sb.from('items').update({ name: name.trim().slice(0, 500) }).eq('id', id); fail(error); },
    async setCell(itemId, columnId, value) {
      const { data, error } = await sb.rpc('set_cell', { p_item: itemId, p_column: columnId, p_value: value });
      fail(error);
      return item(data as Row);
    },
    async moveItem(id, place) {
      const { data: it } = await sb.from('items').select('board_id').eq('id', id).single();
      const position = await siblingsKey(it!.board_id, place, id);
      const { error } = await sb.from('items').update({ group_id: place.groupId, position }).eq('id', id);
      fail(error);
    },
    async deleteItem(id) { const { error } = await sb.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', id); fail(error); },
    async restoreItem(id) { const { error } = await sb.from('items').update({ deleted_at: null }).eq('id', id); fail(error); },

    async createColumn(boardId, type: ColumnType, title, scope = 'item') {
      const c = await need();
      const pos = await lastPos('columns', { board_id: boardId, scope });
      const width = ({ people: 120, status: 150, date: 120, numbers: 120, checkbox: 90, phone: 160, timeline: 170, files: 120, dropdown: 150, link: 180, email: 200, text: 200, long_text: 220 } as Record<ColumnType, number>)[type];
      const settings = type === 'status' ? { labels: DEFAULT_LABELS } : type === 'dropdown' ? { options: [] } : {};
      const { data, error } = await sb.from('columns').insert({ account_id: c.accountId, board_id: boardId, scope, title: title.trim() || type, type, settings, width, position: generateKeyBetween(pos, null) }).select('*').single();
      fail(error);
      return column(data!);
    },
    async renameColumn(id, title) { if (!title.trim()) return; const { error } = await sb.from('columns').update({ title: title.trim() }).eq('id', id); fail(error); },
    async deleteColumn(id) { const { error } = await sb.from('columns').delete().eq('id', id); fail(error); },
    async updateColumnSettings(id, settings) { const { error } = await sb.rpc('update_column_settings', { p_column: id, p_settings: settings }); fail(error); },

    async createSubitem(parentItemId, name) {
      const c = await need();
      const { data: parent } = await sb.from('items').select('board_id').eq('id', parentItemId).single();
      const boardId = parent!.board_id;
      const { count } = await sb.from('columns').select('id', { count: 'exact', head: true }).eq('board_id', boardId).eq('scope', 'subitem');
      if (!count) {
        const { error } = await sb.from('columns').insert([
          { account_id: c.accountId, board_id: boardId, scope: 'subitem', title: 'المسؤول', type: 'people', settings: {}, position: 'a0', width: 120 },
          { account_id: c.accountId, board_id: boardId, scope: 'subitem', title: 'الحالة', type: 'status', settings: { labels: DEFAULT_LABELS }, position: 'a1', width: 150 },
          { account_id: c.accountId, board_id: boardId, scope: 'subitem', title: 'التاريخ', type: 'date', settings: {}, position: 'a2', width: 120 },
        ]);
        fail(error);
      }
      const pos = await lastPos('items', { parent_item_id: parentItemId });
      const { data, error } = await sb.from('items').insert({ account_id: c.accountId, board_id: boardId, parent_item_id: parentItemId, group_id: null, name: name.trim().slice(0, 500), created_by: c.userId, position: generateKeyBetween(pos, null) }).select('*').single();
      fail(error);
      return item(data!);
    },

    async updates(itemId) {
      const [u, a] = await Promise.all([
        sb.from('updates').select('*').eq('item_id', itemId).order('created_at', { ascending: false }),
        sb.from('assets').select('id, update_id').eq('item_id', itemId).not('update_id', 'is', null),
      ]);
      fail(u.error);
      return (u.data ?? []).map((r): Update => ({
        id: r.id, boardId: r.board_id, itemId: r.item_id, parentUpdateId: r.parent_update_id, authorId: r.author_id, bodyText: r.body_text ?? '',
        mentionedUserIds: r.mentioned_user_ids ?? [], assetIds: (a.data ?? []).filter((x) => x.update_id === r.id).map((x) => x.id), createdAt: r.created_at, editedAt: r.edited_at,
      }));
    },
    async postUpdate(itemId, bodyText, mentionedUserIds, opts = {}) {
      const c = await need();
      const { data: it } = await sb.from('items').select('board_id').eq('id', itemId).single();
      const text = bodyText.trim();
      if (!text && !opts.files?.length) throw new Error('empty update');
      const { data, error } = await sb.from('updates').insert({
        account_id: c.accountId, board_id: it!.board_id, item_id: itemId, parent_update_id: opts.parentUpdateId ?? null, author_id: c.userId,
        body: { text }, body_text: text.slice(0, 10000), mentioned_user_ids: [...new Set(mentionedUserIds)],
      }).select('*').single();
      fail(error);
      const assetIds: string[] = [];
      for (const f of opts.files ?? []) assetIds.push((await upload(c, it!.board_id, f, { itemId, updateId: data!.id })).id);
      return { id: data!.id, boardId: data!.board_id, itemId, parentUpdateId: data!.parent_update_id, authorId: c.userId, bodyText: data!.body_text, mentionedUserIds: data!.mentioned_user_ids, assetIds, createdAt: data!.created_at, editedAt: null };
    },
    async editUpdate(id, bodyText) {
      const t = bodyText.trim();
      const { error } = await sb.from('updates').update({ body: { text: t }, body_text: t, edited_at: new Date().toISOString() }).eq('id', id);
      fail(error);
    },
    async deleteUpdate(id) { const { error } = await sb.from('updates').delete().eq('id', id); fail(error); },
    async assets(itemId) {
      const { data, error } = await sb.from('assets').select('*').eq('item_id', itemId).order('created_at', { ascending: false });
      fail(error);
      return signedUrls(data ?? []);
    },
    async uploadToCell(itemId, columnId, file) {
      const c = await need();
      const { data: it } = await sb.from('items').select('board_id, vals').eq('id', itemId).single();
      const a = await upload(c, it!.board_id, file, { itemId });
      const ids = ((it!.vals?.[columnId] as { asset_ids?: string[] } | undefined)?.asset_ids) ?? [];
      await layer.setCell(itemId, columnId, { asset_ids: [...ids, a.id] });
      return a;
    },
    async activity(itemId) {
      const { data, error } = await sb.from('activity_log').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(100);
      fail(error);
      return (data ?? []).map((r): ActivityEntry => ({ id: String(r.id), boardId: r.board_id, itemId: r.item_id, actorId: r.actor_id, action: r.action, columnId: r.column_id, before: r.before, after: r.after, createdAt: r.created_at }));
    },

    async notifications() {
      const c = await getCtx();
      if (!c) return [];
      const { data, error } = await sb.from('notifications').select('*').eq('user_id', c.userId).order('created_at', { ascending: false }).limit(200);
      fail(error);
      return (data ?? []).map((r): Notification => ({ id: r.id, userId: r.user_id, kind: r.kind, actorId: r.actor_id, boardId: r.board_id, itemId: r.item_id, updateId: r.update_id, readAt: r.read_at, createdAt: r.created_at }));
    },
    async markRead(ids) {
      const c = await need();
      let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', c.userId).is('read_at', null);
      if (ids !== 'all') q = q.in('id', ids);
      const { error } = await q;
      fail(error);
      allSubs.forEach((f) => f());
    },
    async myWork(): Promise<MyWorkRow[]> {
      const c = await getCtx();
      if (!c?.accountId) return [];
      const { data: mine } = await sb.from('item_assignees').select('item_id').eq('user_id', c.userId);
      const ids = [...new Set((mine ?? []).map((r) => r.item_id))];
      if (!ids.length) return [];
      const { data: its } = await sb.from('items').select('*').in('id', ids).is('deleted_at', null);
      const boardIds = [...new Set((its ?? []).map((r) => r.board_id))];
      const [{ data: bs }, { data: cs }, { data: gs }] = await Promise.all([
        sb.from('boards').select('*').in('id', boardIds).is('deleted_at', null),
        sb.from('columns').select('*').in('board_id', boardIds),
        sb.from('groups').select('id, deleted_at').in('board_id', boardIds),
      ]);
      const rows: MyWorkRow[] = [];
      for (const r of its ?? []) {
        const b = (bs ?? []).find((x) => x.id === r.board_id);
        if (!b) continue;
        if (r.group_id && (gs ?? []).find((g) => g.id === r.group_id)?.deleted_at) continue;
        const it = item(r);
        const cols = (cs ?? []).map(column).filter((x) => x.boardId === it.boardId && x.scope === (it.parentItemId ? 'subitem' : 'item')).sort(byPos);
        const dateCol = cols.find((x) => x.type === 'date' && it.vals[x.id]);
        const statusCol = cols.find((x) => x.type === 'status');
        const label = statusCol ? (statusCol.settings.labels ?? []).find((l) => l.id === (it.vals[statusCol.id] as StatusValue | undefined)?.label_id) ?? null : null;
        rows.push({ item: it, board: board(b), date: dateCol ? (it.vals[dateCol.id] as { date: string }).date : null, statusLabel: label, done: !!label?.done });
      }
      return rows.sort((a, b) => ((a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1));
    },

    subscribe(boardId, onChange) {
      // one channel per open board; RLS decides which rows each person receives
      let t: ReturnType<typeof setTimeout> | undefined;
      const ping = () => { clearTimeout(t); t = setTimeout(onChange, 120); };
      let ch: RealtimeChannel = sb.channel(`board:${boardId}:${uid()}`);
      for (const table of ['items', 'groups', 'columns', 'views', 'updates', 'board_members']) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `board_id=eq.${boardId}` }, ping);
      }
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` }, ping);
      // make sure the socket carries this person's token so RLS filters what they receive
      sb.auth.getSession().then(({ data }) => {
        if (data.session) sb.realtime.setAuth(data.session.access_token);
        ch.subscribe((status) => { if (status === 'SUBSCRIBED') ping(); }); // refetch after (re)connecting
      });
      return () => { clearTimeout(t); sb.removeChannel(ch); };
    },
    subscribeAll(onChange) {
      allSubs.add(onChange);
      let ch: RealtimeChannel | null = null;
      getCtx().then((c) => {
        if (!c || !allSubs.has(onChange)) return;
        ch = sb.channel(`me:${c.userId}:${uid()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${c.userId}` }, () => onChange())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => onChange())
          .subscribe();
      });
      return () => { allSubs.delete(onChange); if (ch) sb.removeChannel(ch); };
    },
  };
  return layer;
}
