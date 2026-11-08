'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { browserPersist, createFakeLayer } from './fake';
import { createSupabaseLayer } from './supabase';
import type { ActivityEntry, Asset, BoardBundle, DataLayer, MyWorkRow, Notification, Profile, Update, Workspace, Board } from './types';

// Swap point: the Supabase layer when configured, the demo layer otherwise.
const Ctx = createContext<DataLayer | null>(null);

// One layer (and one Supabase client) per page: React's strict mode mounts twice in
// development, and two auth clients sharing one session can race on token refresh.
let shared: DataLayer | null = null;
function sharedLayer(): DataLayer {
  if (shared) return shared;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  shared = url && key ? createSupabaseLayer(createClient(url, key)) : createFakeLayer(browserPersist());
  return shared;
}

export function DataProvider({ children, layer }: { children: ReactNode; layer?: DataLayer }) {
  const [d, setD] = useState<DataLayer | null>(layer ?? null);
  useEffect(() => {
    if (layer) return;
    setD(sharedLayer());
  }, [layer]);
  if (!d) return null;
  return <Ctx.Provider value={d}>{children}</Ctx.Provider>;
}

export function useData(): DataLayer {
  const d = useContext(Ctx);
  if (!d) throw new Error('DataProvider missing');
  return d;
}

function useLive<T>(load: (d: DataLayer) => Promise<T>, subscribe: (d: DataLayer, cb: () => void) => () => void, deps: unknown[]) {
  const d = useData();
  const [state, setState] = useState<{ data: T | undefined; loading: boolean }>({ data: undefined, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => load(d).then((data) => setState({ data, loading: false })), [d, ...deps]);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    run();
    return subscribe(d, run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return state;
}

export const useMe = () => useLive<Profile | null>((d) => d.me(), (d, cb) => d.subscribeAll(cb), []);
export const useMembers = () => useLive<Profile[]>((d) => d.members(), (d, cb) => d.subscribeAll(cb), []);
export const useWorkspaces = () => useLive<Workspace[]>((d) => d.workspaces(), (d, cb) => d.subscribeAll(cb), []);
export const useBoards = (workspaceId: string) =>
  useLive<Board[]>((d) => d.boards(workspaceId), (d, cb) => d.subscribeAll(cb), [workspaceId]);
export const useBoard = (boardId: string) =>
  useLive<BoardBundle | null>((d) => d.getBoard(boardId), (d, cb) => d.subscribe(boardId, cb), [boardId]);
export const useUpdates = (boardId: string, itemId: string) =>
  useLive<Update[]>((d) => d.updates(itemId), (d, cb) => d.subscribe(boardId, cb), [boardId, itemId]);
export const useAssets = (boardId: string, itemId: string) =>
  useLive<Asset[]>((d) => d.assets(itemId), (d, cb) => d.subscribe(boardId, cb), [boardId, itemId]);
export const useActivity = (boardId: string, itemId: string) =>
  useLive<ActivityEntry[]>((d) => d.activity(itemId), (d, cb) => d.subscribe(boardId, cb), [boardId, itemId]);
export const useNotifications = () => useLive<Notification[]>((d) => d.notifications(), (d, cb) => d.subscribeAll(cb), []);
export const useMyWork = () => useLive<MyWorkRow[]>((d) => d.myWork(), (d, cb) => d.subscribeAll(cb), []);
export const useAllBoards = () =>
  useLive<Board[]>(async (d) => (await Promise.all((await d.workspaces()).map((w) => d.boards(w.id)))).flat(), (d, cb) => d.subscribeAll(cb), []);
