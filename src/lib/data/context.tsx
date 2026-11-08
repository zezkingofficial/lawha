'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { browserPersist, createFakeLayer } from './fake';
import type { BoardBundle, DataLayer, Profile, Workspace, Board } from './types';

// Swap point: replica-backend replaces createFakeLayer(...) with the Supabase layer.
const Ctx = createContext<DataLayer | null>(null);

export function DataProvider({ children, layer }: { children: ReactNode; layer?: DataLayer }) {
  const [d, setD] = useState<DataLayer | null>(layer ?? null);
  useEffect(() => {
    if (!layer) setD(createFakeLayer(browserPersist()));
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
