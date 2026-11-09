'use client';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { AlarmClock, Bell, CalendarCheck, CalendarClock, CalendarDays, ChevronLeft, FolderPlus, UsersRound, House, LayoutGrid, LogOut, Menu as MenuIcon, Moon, Languages, Pencil, Plus, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useBoard, useBoards, useData, useMe, useMembers, useMyWork, useWorkspaces } from '@/lib/data/context';
import type { Board, Profile, StatusValue, Workspace } from '@/lib/data/types';
import { labelBg, todayISO } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { Avatar, Button, IconButton } from '../ui';
import { QuickAddProvider, useQuickAdd } from '../QuickAdd';
import { BoardScreen } from '../board/BoardScreen';
import { Inbox, MyWork, useUnreadCount } from '../personal';
import { AuthScreen } from '../auth';
import { Team } from '../team';

// Top-level client app: picks the screen for the current route.
export function LawhaApp() {
  const { data: me, loading } = useMe();
  const d = useData();
  const { route, go } = useRouter();
  // a signed-in person who opens an invitation link joins that company
  useEffect(() => {
    if (me && route.name === 'invite' && d.auth) d.auth.acceptInvite(route.token).catch(() => {}).finally(() => go({ name: 'home' }));
  }, [me, route, d, go]);
  if (loading) return null;
  if (!me) return d.auth ? <AuthScreen /> : <SignIn />;
  return (
    <Shell me={me}>
      {route.name === 'board' ? <BoardScreen boardId={route.boardId} />
        : route.name === 'mywork' ? <MyWork />
        : route.name === 'inbox' ? <Inbox />
        : route.name === 'team' ? <Team />
        : <Home />}
    </Shell>
  );
}

function Shell({ me, children }: { me: Profile; children: ReactNode }) {
  const { t } = useLang();
  const d = useData();
  const [drawer, setDrawer] = useState(false);
  const { route } = useRouter();
  useEffect(() => setDrawer(false), [route]);
  useEffect(() => { document.body.classList.add('has-tabbar'); return () => document.body.classList.remove('has-tabbar'); }, []);
  return (
    <QuickAddProvider>
    <div className="flex min-h-full flex-col">
      {!d.auth && <p className="border-b border-border bg-surface py-1 text-xs text-text-muted" style={{ paddingInline: 'max(16px, env(safe-area-inset-left, 0px))' }}>{t('demoNote')}</p>}
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
        <main className="min-w-0 px-4 pb-28 pt-4 sm:px-6 sm:pb-10 sm:pt-5">{children}</main>
      </div>
      <TabBar me={me} onMenu={() => setDrawer(true)} />
    </div>
    </QuickAddProvider>
  );
}

// Phone only: the four places people go most, plus one big button to add.
function TabBar({ me, onMenu }: { me: Profile; onMenu: () => void }) {
  const { t } = useLang();
  const { route, go } = useRouter();
  const quickAdd = useQuickAdd();
  const unread = useUnreadCount();
  const canAdd = me.role !== 'viewer';
  return (
    <nav aria-label={t('sidebarToggle')} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-bg sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <TabButton active={route.name === 'home'} onClick={() => go({ name: 'home' })} icon={<House size={22} />} label={t('homeTab')} />
      <TabButton active={route.name === 'mywork'} onClick={() => go({ name: 'mywork' })} icon={<CalendarCheck size={22} />} label={t('myWork')} />
      <div className="grid place-items-center">
        {canAdd && (
          <button type="button" onClick={() => quickAdd()} aria-label={t('quickAdd')}
            className="-mt-5 grid h-14 w-14 place-items-center rounded-pill bg-accent text-on-accent shadow-pop active:scale-95">
            <Plus size={28} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <TabButton active={route.name === 'inbox'} onClick={() => go({ name: 'inbox' })} label={t('inbox')}
        icon={<span className="relative"><Bell size={22} />{unread > 0 && <span className="absolute -end-2 -top-1 grid h-4 min-w-4 place-items-center rounded-pill bg-danger px-[3px] text-[10px] font-semibold tabular-nums text-on-accent">{unread}</span>}</span>} />
      <TabButton active={false} onClick={onMenu} icon={<MenuIcon size={22} />} label={t('menuTab')} />
    </nav>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={clsx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-text-muted')}>
      {icon}<span>{label}</span>
    </button>
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
      <IconButton label={t('sidebarToggle')} onClick={onMenu} className="hidden sm:inline-grid lg:hidden"><MenuIcon size={18} /></IconButton>
      <button type="button" onClick={() => go({ name: 'home' })} className="flex items-center gap-2 rounded-sm">
        <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent font-bold text-on-accent" aria-hidden>ل</span>
        <span className="text-md font-semibold">{t('app')}</span>
      </button>
      <div className="mx-auto hidden h-8 w-full max-w-[360px] items-center gap-2 rounded-sm border border-border bg-surface px-[10px] text-text-subtle md:flex">
        <Search size={16} /><span className="text-sm">{t('search')}</span><span className="ms-auto rounded-xs border border-border-strong px-1 font-mono text-xs">{t('soon')}</span>
      </div>
      <div className="ms-auto flex items-center gap-[2px] md:ms-0">
        <span className="hidden sm:contents"><BellButton /></span>
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
      <NavButton active={route.name === 'mywork'} onClick={() => go({ name: 'mywork' })} icon={<CalendarCheck size={16} />}>{t('myWork')}</NavButton>
      <NavButton active={route.name === 'inbox'} onClick={() => go({ name: 'inbox' })} icon={<Bell size={16} />} hint={<UnreadBadge />}>{t('inbox')}</NavButton>
      <NavButton active={route.name === 'team'} onClick={() => go({ name: 'team' })} icon={<UsersRound size={16} />}>{t('team')}</NavButton>
      {workspaces.map((w) => <WorkspaceSection key={w.id} ws={w} />)}
      <NewWorkspace />
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
  const [renaming, setRenaming] = useState(false);
  const canEdit = me && me.role !== 'viewer' && me.role !== 'guest';
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between ps-[10px] text-xs text-text-subtle">
        {renaming ? (
          <input autoFocus defaultValue={ws.name} aria-label={t('renameWorkspace')} className="h-7 w-full rounded-xs border border-focus bg-bg px-1 text-sm text-text"
            onBlur={(e) => { setRenaming(false); d.renameWorkspace(ws.id, e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : canEdit ? (
          <button type="button" onDoubleClick={() => setRenaming(true)} title={t('renameWorkspace')} className="truncate text-start">{ws.name}</button>
        ) : <span>{ws.name}</span>}
        {canEdit && !renaming && <IconButton small label={`${t('renameWorkspace')}: ${ws.name}`} onClick={() => setRenaming(true)} className="ms-auto"><Pencil size={12} /></IconButton>}
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

function NavButton({ children, active, onClick, icon, disabled, hint }: { children: ReactNode; active: boolean; onClick?: () => void; icon: ReactNode; disabled?: boolean; hint?: ReactNode }) {
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
  const { t, locale } = useLang();
  const { go } = useRouter();
  const { data: me } = useMe();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: rows = [] } = useMyWork();
  const today = todayISO(), week = todayISO(7);
  const open = rows.filter((r) => !r.done);
  const overdue = open.filter((r) => r.date && r.date < today).length;
  const dueToday = open.filter((r) => r.date === today).length;
  const soon = open.filter((r) => r.date && r.date > today && r.date <= week).length;
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return (
    <div className="mx-auto grid max-w-[960px] gap-6">
      <div>
        <p className="text-sm text-text-muted">{dayName}</p>
        <h1 className="text-xl font-bold">{t('welcome')}، {me?.fullName.split(' ')[0]}</h1>
      </div>

      <section aria-labelledby="needs-you" className="grid gap-2">
        <h2 id="needs-you" className="text-md font-semibold">{t('needsYou')}</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile n={overdue} label={t('overdueGroup')} tone={overdue ? 'danger' : 'calm'} icon={<AlarmClock size={18} />} onClick={() => go({ name: 'mywork' })} />
          <StatTile n={dueToday} label={t('todayGroup')} tone={dueToday ? 'accent' : 'calm'} icon={<CalendarClock size={18} />} onClick={() => go({ name: 'mywork' })} />
          <StatTile n={soon} label={t('weekGroup')} tone="calm" icon={<CalendarDays size={18} />} onClick={() => go({ name: 'mywork' })} />
        </div>
        {!overdue && !dueToday && <p className="text-sm text-text-muted">{t('allClear')}</p>}
      </section>

      {workspaces.map((w) => <HomeBoards key={w.id} ws={w} />)}
    </div>
  );
}

function StatTile({ n, label, tone, icon, onClick }: { n: number; label: string; tone: 'danger' | 'accent' | 'calm'; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${n}`}
      className={clsx('grid gap-1 rounded-lg border p-3 text-start transition-colors duration-fast sm:p-4',
        tone === 'danger' ? 'border-transparent bg-danger text-on-accent' : tone === 'accent' ? 'border-transparent bg-accent text-on-accent' : 'border-border bg-bg hover:bg-surface-hover')}>
      <span className={clsx(tone === 'calm' && 'text-text-muted')}>{icon}</span>
      <span className="text-[26px] font-bold leading-none tabular-nums">{n}</span>
      <span className={clsx('truncate text-xs sm:text-sm', tone === 'calm' ? 'text-text-muted' : 'opacity-90')}>{label}</span>
    </button>
  );
}

function HomeBoards({ ws }: { ws: Workspace }) {
  const { data: boards = [] } = useBoards(ws.id);
  if (!boards.length) return null;
  return (
    <section aria-label={ws.name}>
      <h2 className="mb-2 text-md font-semibold">{ws.name}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
        {boards.map((b) => <BoardSummary key={b.id} board={b} />)}
      </div>
    </section>
  );
}

// One board at a glance: how many items, how they split by status, how many are late.
function BoardSummary({ board }: { board: Board }) {
  const { t } = useLang();
  const { go } = useRouter();
  const { data: bundle } = useBoard(board.id);
  const items = bundle?.items.filter((i) => i.parentItemId === null) ?? [];
  const status = bundle?.columns.find((c) => c.scope === 'item' && c.type === 'status');
  const date = bundle?.columns.find((c) => c.scope === 'item' && c.type === 'date');
  const labels = status?.settings.labels ?? [];
  const labelOf = (id?: string) => labels.find((l) => l.id === id);
  const counts = labels.map((l) => ({ l, n: items.filter((i) => (status && (i.vals[status.id] as StatusValue | undefined)?.label_id) === l.id).length })).filter((x) => x.n);
  const none = items.length - counts.reduce((s, c) => s + c.n, 0);
  const today = todayISO();
  const late = date ? items.filter((i) => {
    const dv = (i.vals[date.id] as { date?: string } | undefined)?.date;
    return dv && dv < today && !(status && labelOf((i.vals[status.id] as StatusValue | undefined)?.label_id)?.done);
  }).length : 0;
  return (
    <button type="button" onClick={() => go({ name: 'board', boardId: board.id })} aria-label={`${t('openBoard')}: ${board.name}`}
      className="grid gap-3 rounded-lg border border-border bg-bg p-4 text-start hover:border-border-strong hover:shadow-card">
      <span className="flex items-center gap-2">
        <LayoutGrid size={18} className="flex-none text-accent" />
        <span className="min-w-0 flex-1 truncate font-semibold">{board.name}</span>
        <ChevronLeft size={16} className="flex-none text-text-subtle ltr:rotate-180" />
      </span>
      {!bundle ? <span className="h-10 animate-pulse rounded-sm bg-surface-hover motion-reduce:animate-none" /> : (
        <>
          <span className="flex items-baseline gap-2 text-sm">
            <span className="text-xl font-bold tabular-nums">{items.length}</span>
            <span className="text-text-muted">{board.itemNoun || t('itemsWord')}</span>
            {late > 0 && <span className="ms-auto rounded-pill bg-danger px-2 py-[1px] text-xs font-semibold tabular-nums text-on-accent">{late} {t('overdueShort')}</span>}
          </span>
          {items.length > 0 ? (
            <>
              <span className="flex h-2 overflow-hidden rounded-pill bg-surface-hover" aria-hidden>
                {counts.map(({ l, n }) => <span key={l.id} style={{ flex: n, background: labelBg(l.color) }} />)}
                {none > 0 && <span style={{ flex: none }} />}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                {counts.map(({ l, n }) => (
                  <span key={l.id} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-pill" style={{ background: labelBg(l.color) }} />{l.name} <b className="font-semibold tabular-nums text-text">{n}</b></span>
                ))}
              </span>
            </>
          ) : <span className="text-sm text-text-subtle">{t('nothingYet')}</span>}
        </>
      )}
    </button>
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

function UnreadBadge() {
  const n = useUnreadCount();
  if (!n) return null;
  return <span className="rounded-pill bg-danger px-[6px] text-[11px] font-semibold tabular-nums text-on-accent">{n}</span>;
}

function BellButton() {
  const { t } = useLang();
  const { go } = useRouter();
  const n = useUnreadCount();
  return (
    <IconButton label={n ? `${t('inbox')}: ${n} ${t('unread')}` : t('inbox')} onClick={() => go({ name: 'inbox' })} className="relative">
      <Bell size={18} />
      {n > 0 && <span className="absolute end-[2px] top-[2px] grid h-4 min-w-4 place-items-center rounded-pill bg-danger px-[3px] text-[10px] font-semibold tabular-nums text-on-accent">{n}</span>}
    </IconButton>
  );
}

function NewWorkspace() {
  const { t } = useLang();
  const d = useData();
  const { data: me } = useMe();
  const [adding, setAdding] = useState(false);
  if (!me || me.role === 'viewer' || me.role === 'guest') return null;
  if (adding) {
    return (
      <form className="mt-3 px-2" onSubmit={async (e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get('name') ?? '');
        setAdding(false);
        if (name.trim()) await d.createWorkspace(name);
      }}>
        <input name="name" autoFocus aria-label={t('workspaceName')} placeholder={t('workspaceName')} onBlur={() => setAdding(false)}
          className="h-8 w-full rounded-sm border border-focus bg-bg px-2 text-sm" />
      </form>
    );
  }
  return (
    <button type="button" onClick={() => setAdding(true)} className="mt-4 flex h-8 items-center gap-2 rounded-sm px-[10px] text-sm text-text-muted hover:bg-surface-hover">
      <FolderPlus size={16} />{t('newWorkspace')}
    </button>
  );
}
