'use client';
import { createContext, useContext, type ReactNode } from 'react';

// Screens navigate through this, not through next/navigation directly, so the
// same components run in the Next.js app and in the single-file demo build.
export type Route = { name: 'home' } | { name: 'board'; boardId: string; itemId?: string } | { name: 'mywork' } | { name: 'inbox' } | { name: 'team' } | { name: 'invite'; token: string };

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
    case 'board': return r.itemId ? `/boards/${r.boardId}/items/${r.itemId}` : `/boards/${r.boardId}`;
    case 'mywork': return '/my-work';
    case 'inbox': return '/inbox';
    case 'team': return '/team';
    case 'invite': return `/invite/${r.token}`;
    default: return '/';
  }
}

export function pathToRoute(path: string): Route {
  const m = path.match(/^\/boards\/([^/]+)(?:\/items\/([^/]+))?/);
  if (m) return { name: 'board', boardId: decodeURIComponent(m[1]), itemId: m[2] ? decodeURIComponent(m[2]) : undefined };
  if (path.startsWith('/my-work')) return { name: 'mywork' };
  if (path.startsWith('/inbox')) return { name: 'inbox' };
  if (path.startsWith('/team')) return { name: 'team' };
  const inv = path.match(/^\/invite\/([a-f0-9]+)/);
  if (inv) return { name: 'invite', token: inv[1] };
  return { name: 'home' };
}

// Demo build: a plain #name hash (letters, digits, hyphens only)
export function routeToHash(r: Route): string {
  if (r.name === 'board') return r.itemId ? `#board-${r.boardId}--item-${r.itemId}` : `#board-${r.boardId}`;
  if (r.name === 'mywork') return '#my-work';
  if (r.name === 'inbox') return '#inbox';
  if (r.name === 'team') return '#team';
  if (r.name === 'invite') return `#invite-${r.token}`;
  return '#home';
}

export function hashToRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const m = h.match(/^board-(.+?)(?:--item-(.+))?$/);
  if (m) return { name: 'board', boardId: m[1], itemId: m[2] };
  if (h === 'my-work') return { name: 'mywork' };
  if (h === 'inbox') return { name: 'inbox' };
  if (h === 'team') return { name: 'team' };
  if (h.startsWith('invite-')) return { name: 'invite', token: h.slice(7) };
  return { name: 'home' };
}
