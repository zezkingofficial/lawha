'use client';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { Bell, CalendarCheck, House, LayoutGrid, LogOut, Menu as MenuIcon, Moon, Languages, Plus, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useBoards, useData, useMe, useMembers, useWorkspaces } from '@/lib/data/context';
import type { Profile, Workspace } from '@/lib/data/types';
import { useLang } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { Avatar, Button, IconButton } from '../ui';
import { BoardScreen } from '../board/BoardScreen';

// Top-level client app: picks the screen for the current route.
export function LawhaApp() {
  const { data: me, loading } = useMe();
  const { route } = useRouter();
  if (loading) return null;
  if (!me) return <SignIn />;
  return (
    <Shell me={me}>
      {route.name === 'board' ? <BoardScreen boardId={route.boardId} /> : <Home />}
    </Shell>
  );
}

function Shell({ me, children }: { me: Profile; children: ReactNode }) {
  const { t } = useLang();
  const [drawer, setDrawer] = useState(false);
  const { route } = useRouter();
  useEffect(() => setDrawer(false), [route]);
  return (
    <div className="flex min-h-full flex-col">
      <p className="border-b border-border bg-surface py-1 text-xs text-text-muted" style={{ paddingInline: 'max(16px, env(safe-area-inset-left, 0px))' }}>{t('demoNote')}</p>
      <TopBar me={me} onMenu={() => setDrawer(true)} />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden border-e border-border bg-sidebar lg:block">
          <Sidebar />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label={t('sidebarToggle')}>
            <button type="button" aria-label={t('closeMenu')} className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--c-text) 40%, transparent)" }} onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 start-0 w-[280px] max-w-[85vw] overflow-y-auto bg-sidebar shadow-panel" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex justify-end p-2"><IconButton label={t('closeMenu')} onClick={() => setDrawer(false)}><X size={18} /></IconButton></div>
              <Sidebar />
            </aside>
          </div>
        )}
        <main className="min-w-0 px-4 pb-10 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ me, onMenu }: { me: Profile; onMenu: () => void }) {
  const { t, lang, setLang } = useLang();
  const d = useData();
  const { go } = useRouter();
  const toggleTheme = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('lawha:theme', root.dataset.theme); } catch { /* ignore */ }
  };
  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-border bg-bg" style={{ paddingInline: 'max(16px, env(safe-area-inset-left, 0px))' }}>
      <IconButton label={t('sidebarToggle')} onClick={onMenu} className="lg:hidden"><MenuIcon size={18} /></IconButton>
      <button type="button" onClick={() => go({ name: 'home' })} className="flex items-center gap-2 rounded-sm">
        <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent font-bold text-on-accent" aria-hidden>ل</span>
        <span className="text-md font-semibold">{t('app')}</span>
      </button>
      <div className="mx-auto hidden h-8 w-full max-w-[360px] items-center gap-2 rounded-sm border border-border bg-surface px-[10px] text-text-subtle md:flex">
        <Search size={16} /><span className="text-sm">{t('search')}</span><span className="ms-auto rounded-xs border border-border-strong px-1 font-mono text-xs">{t('soon')}</span>
      </div>
      <div className="ms-auto flex items-center gap-[2px] md:ms-0">
        <IconButton label={t('inbox')} disabled title={t('soon')}><Bell size={18} /></IconButton>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button type="button" aria-label={me.fullName} className="rounded-pill"><Avatar person={me} size={30} /></button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content sideOffset={6} collisionPadding={8} className="z-30 min-w-[200px] rounded-md border border-border bg-surface-raised p-1 shadow-pop">
              <div className="px-2 py-2 text-sm font-semibold">{me.fullName}</div>
              <Dropdown.Separator className="my-1 h-px bg-border" />
              <Item onSelect={toggleTheme} icon={<Moon size={15} />}>{t('theme')}</Item>
              <Item onSelect={() => setLang(lang === 'ar' ? 'en' : 'ar')} icon={<Languages size={15} />}>{t('language')}</Item>
              <Item onSelect={() => d.signOut()} icon={<LogOut size={15} />}>{t('signOut')}</Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </header>
  );
}

function Item({ children, onSelect, icon }: { children: ReactNode; onSelect: () => void; icon: ReactNode }) {
  return (
    <Dropdown.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-[6px] text-sm outline-none data-[highlighted]:bg-surface-hover">
      {icon}{children}
    </Dropdown.Item>
  );
}

function Sidebar() {
  const { t } = useLang();
  const { data: account } = useAccountName();
  const { data: workspaces = [] } = useWorkspaces();
  const { route, go } = useRouter();
  return (
    <nav aria-label={t('boards')} className="flex flex-col gap-[2px] px-2 py-3">
      <div className="flex items-center gap-2 p-2 font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-xs text-xs" style={{ background: 'var(--c-label-brown)', color: 'var(--c-on-label)' }}>{account?.charAt(0)}</span>
        {account}
      </div>
      <NavButton active={route.name === 'home'} onClick={() => go({ name: 'home' })} icon={<House size={16} />}>{t('home')}</NavButton>
      <NavButton active={false} disabled icon={<CalendarCheck size={16} />} hint={t('soon')}>{t('myWork')}</NavButton>
      {workspaces.map((w) => <WorkspaceSection key={w.id} ws={w} />)}
    </nav>
  );
}

function useAccountName() {
  const d = useData();
  const [name, setName] = useState<string>();
  useEffect(() => { d.account().then((a) => setName(a.name)); }, [d]);
  return { data: name };
}

function WorkspaceSection({ ws }: { ws: Workspace }) {
  const { t } = useLang();
  const d = useData();
  const { data: me } = useMe();
  const { data: boards = [] } = useBoards(ws.id);
  const { route, go } = useRouter();
  const [adding, setAdding] = useState(false);
  const canEdit = me && me.role !== 'viewer';
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between ps-[10px] text-xs text-text-subtle">
        <span>{ws.name}</span>
        {canEdit && <IconButton label={`${t('newBoard')}: ${ws.name}`} small onClick={() => setAdding(true)}><Plus size={14} /></IconButton>}
      </div>
      {boards.map((b) => (
        <NavButton key={b.id} active={route.name === 'board' && route.boardId === b.id} onClick={() => go({ name: 'board', boardId: b.id })} icon={<LayoutGrid size={16} />}>
          {b.name}
        </NavButton>
      ))}
      {adding && (
        <form className="px-2 py-1" onSubmit={async (e) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get('name') as string;
          setAdding(false);
          if (name?.trim()) { const b = await d.createBoard(ws.id, name); go({ name: 'board', boardId: b.id }); }
        }}>
          <input name="name" autoFocus aria-label={t('boardNamePrompt')} placeholder={t('boardNamePrompt')} onBlur={() => setAdding(false)}
            className="h-8 w-full rounded-sm border border-focus bg-bg px-2 text-sm" />
        </form>
      )}
    </div>
  );
}

function NavButton({ children, active, onClick, icon, disabled, hint }: { children: ReactNode; active: boolean; onClick?: () => void; icon: ReactNode; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-current={active ? 'page' : undefined}
      className={clsx('flex h-8 w-full items-center gap-[10px] rounded-sm px-[10px] text-start text-sm disabled:opacity-60',
        active ? 'bg-surface-selected font-semibold text-accent' : 'hover:bg-surface-hover')}>
      <span className={active ? 'text-accent' : 'text-text-muted'}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-text-subtle">{hint}</span>}
    </button>
  );
}

function Home() {
  const { t } = useLang();
  const { data: me } = useMe();
  const { data: workspaces = [] } = useWorkspaces();
  return (
    <div className="mx-auto grid max-w-[900px] gap-6">
      <div>
        <h1 className="text-xl font-bold">{t('welcome')}، {me?.fullName}</h1>
        <p className="text-text-muted">{t('homeHelp')}</p>
      </div>
      {workspaces.map((w) => <HomeBoards key={w.id} ws={w} />)}
    </div>
  );
}

function HomeBoards({ ws }: { ws: Workspace }) {
  const { data: boards = [] } = useBoards(ws.id);
  const { go } = useRouter();
  return (
    <section>
      <h2 className="mb-2 text-md font-semibold">{ws.name}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {boards.map((b) => (
          <button key={b.id} type="button" onClick={() => go({ name: 'board', boardId: b.id })}
            className="grid gap-1 rounded-lg border border-border bg-bg p-4 text-start hover:border-border-strong hover:shadow-card">
            <LayoutGrid size={18} className="text-accent" />
            <span className="font-semibold">{b.name}</span>
            <span className="line-clamp-2 text-sm text-text-muted">{b.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SignIn() {
  const { t } = useLang();
  const d = useData();
  const { data: members = [] } = useMembers();
  const roleName = (r: Profile['role']) => t(r === 'admin' ? 'roleAdmin' : r === 'member' ? 'roleMember' : r === 'viewer' ? 'roleViewer' : 'roleGuest');
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="grid w-full max-w-[400px] gap-5 rounded-lg border border-border bg-bg p-6 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-accent text-lg font-bold text-on-accent" aria-hidden>ل</span>
          <span className="text-lg font-semibold">{t('app')}</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold">{t('signInTitle')}</h1>
          <p className="mt-1 text-sm text-text-muted">{t('signInHelp')}</p>
        </div>
        <ul className="grid gap-2">
          {members.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => d.signIn(m.id)}
                className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-start hover:border-accent hover:bg-surface-selected">
                <Avatar person={m} size={36} />
                <span className="flex-1 font-medium">{m.fullName}</span>
                <span className="text-sm text-text-muted">{roleName(m.role)}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => { try { localStorage.removeItem('lawha:db:v1'); } catch { /* ignore */ } location.reload(); }}>
          ↺ reset demo data
        </Button>
      </div>
    </main>
  );
}
