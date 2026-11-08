'use client';
import { createContext, useContext, type ReactNode } from 'react';

// Screens navigate through this, not through next/navigation directly, so the
// same components run in the Next.js app and in the single-file demo build.
export type Route = { name: 'home' } | { name: 'board'; boardId: string } | { name: 'mywork' } | { name: 'inbox' };

interface RouterCtx { route: Route; go: (r: Route) => void }
const Ctx = createContext<RouterCtx | null>(null);

export function RouterProvider({ route, go, children }: RouterCtx & { children: ReactNode }) {
  return <Ctx.Provider value={{ route, go }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  const c = useContext(Ctx);
  if (!c) throw new Error('RouterProvider missing');
  return c;
}

export function routeToPath(r: Route): string {
  switch (r.name) {
    case 'board': return `/boards/${r.boardId}`;
    case 'mywork': return '/my-work';
    case 'inbox': return '/inbox';
    default: return '/';
  }
}

export function pathToRoute(path: string): Route {
  const m = path.match(/^\/boards\/([^/]+)/);
  if (m) return { name: 'board', boardId: decodeURIComponent(m[1]) };
  if (path.startsWith('/my-work')) return { name: 'mywork' };
  if (path.startsWith('/inbox')) return { name: 'inbox' };
  return { name: 'home' };
}
