'use client';
import clsx from 'clsx';
import { AtSign, BellOff, CheckCheck, MessageSquare, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAllBoards, useData, useMembers, useMyWork, useNotifications } from '@/lib/data/context';
import type { MyWorkRow, Notification } from '@/lib/data/types';
import { fmtDate, labelBg, labelFg, todayISO } from '@/lib/format';
import { useLang, type MsgKey } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { Avatar, Button } from './ui';

// ---------------------------------------------------------------- My Work (S19)

type Bucket = 'overdueGroup' | 'todayGroup' | 'weekGroup' | 'laterGroup' | 'noDateGroup' | 'doneGroup';

function bucketOf(r: MyWorkRow, today: string, week: string): Bucket {
  if (r.done) return 'doneGroup';
  if (!r.date) return 'noDateGroup';
  if (r.date < today) return 'overdueGroup';
  if (r.date === today) return 'todayGroup';
  if (r.date <= week) return 'weekGroup';
  return 'laterGroup';
}

export function MyWork() {
  const { t, locale } = useLang();
  const { go } = useRouter();
  const { data: rows = [], loading } = useMyWork();
  const [showDone, setShowDone] = useState(false);
  const today = todayISO(), week = todayISO(7);
  const order: Bucket[] = ['overdueGroup', 'todayGroup', 'weekGroup', 'laterGroup', 'noDateGroup', 'doneGroup'];
  const groups = order
    .filter((b) => b !== 'doneGroup' || showDone)
    .map((b) => ({ b, rows: rows.filter((r) => bucketOf(r, today, week) === b) }))
    .filter((g) => g.rows.length);

  return (
    <div className="mx-auto grid max-w-[900px] gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t('myWork')}</h1>
        <label className="ms-auto flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 accent-[color:var(--c-accent)]" />
          {t('showDone')}
        </label>
      </header>
      {loading && !rows.length && <div className="h-24 animate-pulse rounded-md bg-surface-hover motion-reduce:animate-none" />}
      {!loading && !groups.length && <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-text-muted">{t('myWorkEmpty')}</p>}
      {groups.map(({ b, rows: rs }) => (
        <section key={b} aria-label={t(b)}>
          <h2 className={clsx('mb-2 text-md font-semibold', b === 'overdueGroup' && 'text-danger')}>{t(b)} <span className="text-sm font-normal tabular-nums text-text-subtle">{rs.length}</span></h2>
          <ul className="overflow-hidden rounded-md border border-border bg-bg">
            {rs.map((r) => (
              <li key={r.item.id} className="border-b border-border last:border-b-0">
                <button type="button" onClick={() => go({ name: 'board', boardId: r.board.id, itemId: r.item.id })}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 text-start hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_160px_130px_90px]">
                  <span className="truncate text-sm font-medium" dir="auto">{r.item.name}</span>
                  <span className="order-3 truncate text-xs text-text-muted sm:order-none">{r.board.name}</span>
                  <span className="justify-self-end sm:justify-self-stretch">
                    {r.statusLabel && <span className="block rounded-xs px-2 py-[2px] text-center text-xs font-medium" style={{ background: labelBg(r.statusLabel.color), color: labelFg(r.statusLabel.color) }}>{r.statusLabel.name}</span>}
                  </span>
                  <span className={clsx('order-4 text-xs tabular-nums sm:order-none sm:text-end', b === 'overdueGroup' ? 'font-semibold text-danger' : 'text-text-muted')}>{r.date ? fmtDate(r.date, locale) : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Inbox (S20)

type Filter = 'all' | 'unread' | 'mention' | 'assigned';

export function Inbox() {
  const { t } = useLang();
  const d = useData();
  const { go } = useRouter();
  const { data: list = [], loading } = useNotifications();
  const { data: members = [] } = useMembers();
  const { data: boards = [] } = useAllBoards();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = list.filter((n) => filter === 'all' || (filter === 'unread' ? !n.readAt : n.kind === filter));
  const unread = list.filter((n) => !n.readAt).length;
  const verb: Record<Notification['kind'], MsgKey> = { mention: 'nMention', assigned: 'nAssigned', update: 'nUpdate' };
  const icon = { mention: <AtSign size={14} />, assigned: <UserPlus size={14} />, update: <MessageSquare size={14} /> };

  return (
    <div className="mx-auto grid max-w-[760px] gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t('inbox')}</h1>
        {unread > 0 && <Button variant="ghost" size="sm" className="ms-auto" onClick={() => d.markRead('all')}><CheckCheck size={15} />{t('markAllRead')}</Button>}
      </header>
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {(['all', 'unread', 'mention', 'assigned'] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={clsx('whitespace-nowrap rounded-pill px-3 py-1 text-sm', filter === f ? 'bg-accent text-on-accent' : 'bg-surface text-text-muted hover:bg-surface-hover')}>
            {t(f === 'all' ? 'all' : f === 'unread' ? 'unread' : f === 'mention' ? 'mentions' : 'assigned')}
            {f === 'unread' && unread > 0 && <span className="ms-1 tabular-nums">{unread}</span>}
          </button>
        ))}
      </div>
      {loading && !list.length && <div className="h-24 animate-pulse rounded-md bg-surface-hover motion-reduce:animate-none" />}
      {!loading && !shown.length && (
        <div className="grid justify-items-center gap-2 rounded-md border border-dashed border-border-strong p-8 text-center">
          <BellOff size={36} className="text-text-subtle" />
          <p className="text-text-muted">{t('inboxEmpty')}</p>
        </div>
      )}
      <ul className="grid gap-1">
        {shown.map((n) => {
          const actor = members.find((m) => m.id === n.actorId);
          const board = boards.find((b) => b.id === n.boardId);
          return (
            <li key={n.id}>
              <button type="button" onClick={() => { d.markRead([n.id]); go({ name: 'board', boardId: n.boardId, itemId: n.itemId }); }}
                className="grid w-full grid-cols-[8px_32px_minmax(0,1fr)] items-start gap-3 rounded-md p-3 text-start hover:bg-surface-hover">
                <span className={clsx('mt-3 h-2 w-2 rounded-pill', !n.readAt && 'bg-accent')} aria-label={n.readAt ? undefined : t('unread')} />
                {actor ? <Avatar person={actor} size={32} /> : <span />}
                <span className="grid gap-[2px]">
                  <span className="text-sm"><b>{actor?.fullName ?? '—'}</b> {t(verb[n.kind])} <ItemName boardId={n.boardId} itemId={n.itemId} /></span>
                  <span className="flex items-center gap-1 text-xs text-text-subtle">{icon[n.kind]}<RelTime iso={n.createdAt} /> · {board?.name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ItemName({ boardId, itemId }: { boardId: string; itemId: string }) {
  const d = useData();
  const [name, setName] = useState<string>('…');
  useEffect(() => { d.getBoard(boardId).then((b) => setName(b?.items.find((i) => i.id === itemId)?.name ?? '—')); }, [d, boardId, itemId]);
  return <b dir="auto">«{name}»</b>;
}

function RelTime({ iso }: { iso: string }) {
  const { locale, t } = useLang();
  const secs = (Date.parse(iso) - Date.now()) / 1000;
  if (Math.abs(secs) < 45) return <time dateTime={iso}>{t('justNow')}</time>;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let v = secs, out = '';
  for (const [n, unit] of steps) { if (Math.abs(v) < n) { out = rtf.format(Math.round(v), unit); break; } v /= n; }
  return <time dateTime={iso} title={new Date(iso).toLocaleString(locale)}>{out}</time>;
}

export function useUnreadCount() {
  const { data: list = [] } = useNotifications();
  return list.filter((n) => !n.readAt).length;
}
