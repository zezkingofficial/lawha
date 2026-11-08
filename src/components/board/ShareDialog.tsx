'use client';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { Globe, Lock, UserRound, UsersRound } from 'lucide-react';
import { useData } from '@/lib/data/context';
import type { Board, BoardBundle, BoardRole, Profile } from '@/lib/data/types';
import { useLang } from '@/lib/i18n';
import { Avatar, Button, useToast } from '../ui';

export function ShareButton({ bundle, members }: { bundle: BoardBundle; members: Profile[] }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const b = bundle.board;
  const admin = bundle.canAdmin;
  const run = async (f: () => Promise<void>) => { try { await f(); } catch (e) { toast({ tone: 'error', text: (e as Error).message }); } };
  const kinds: { k: Board['kind']; icon: React.ReactNode; label: string; help: string }[] = [
    { k: 'main', icon: <Globe size={16} />, label: t('kindMain'), help: t('kindMainHelp') },
    { k: 'shareable', icon: <UsersRound size={16} />, label: t('kindShareable'), help: t('kindShareableHelp') },
    { k: 'private', icon: <Lock size={16} />, label: t('kindPrivate'), help: t('kindPrivateHelp') },
  ];
  const onBoard = bundle.members.map((m) => ({ m, p: members.find((x) => x.id === m.userId) })).filter((x) => x.p) as { m: BoardBundle['members'][number]; p: Profile }[];
  const addable = members.filter((p) => !bundle.members.some((m) => m.userId === p.id) && (p.role !== 'guest' || b.kind === 'shareable'));

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="secondary"><UserRound size={16} /><span className="hidden sm:inline">{t('share')}</span></Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label={t('shareTitle')} sideOffset={6} collisionPadding={8} className="z-30 grid gap-3 rounded-md border border-border bg-surface-raised p-4 shadow-pop" style={{ width: 'min(380px, calc(100vw - 16px))' }}>
          <h2 className="text-md font-semibold">{t('shareTitle')}</h2>
          {!admin && <p className="text-xs text-text-muted">{t('onlyOwnerShares')}</p>}
          <div role="radiogroup" aria-label={t('shareTitle')} className="grid gap-1">
            {kinds.map(({ k, icon, label, help }) => (
              <button key={k} type="button" role="radio" aria-checked={b.kind === k} disabled={!admin} onClick={() => run(() => d.setBoardKind(b.id, k))}
                className={clsx('flex items-start gap-3 rounded-sm border p-2 text-start disabled:cursor-default', b.kind === k ? 'border-accent bg-surface-selected' : 'border-border hover:bg-surface-hover')}>
                <span className={b.kind === k ? 'text-accent' : 'text-text-muted'}>{icon}</span>
                <span className="grid"><span className="text-sm font-medium">{label}</span><span className="text-xs text-text-muted">{help}</span></span>
              </button>
            ))}
          </div>
          <h3 className="text-sm font-semibold">{t('boardMembers')}</h3>
          <ul className="grid gap-1">
            {onBoard.map(({ m, p }) => (
              <li key={p.id} className="flex items-center gap-2">
                <Avatar person={p} size={26} />
                <span className="flex-1 text-sm">{p.fullName}{p.role === 'guest' && <span className="ms-1 rounded-pill bg-surface-hover px-[6px] text-[11px] text-text-muted">{t('guestBadge')}</span>}</span>
                <select aria-label={`${p.fullName}`} disabled={!admin} value={m.role}
                  onChange={(e) => run(() => d.setBoardMember(b.id, p.id, e.target.value === 'remove' ? null : (e.target.value as BoardRole)))}
                  className="h-8 rounded-sm border border-border-input bg-bg px-1 text-sm">
                  <option value="owner">{t('roleOwner')}</option>
                  <option value="editor">{t('roleEditor')}</option>
                  <option value="viewer">{t('roleBoardViewer')}</option>
                  <option value="remove">{t('remove')}</option>
                </select>
              </li>
            ))}
          </ul>
          {admin && addable.length > 0 && (
            <label className="grid gap-1 text-sm">{t('addMember')}
              <select className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm" value="" onChange={(e) => e.target.value && run(() => d.setBoardMember(b.id, e.target.value, 'editor'))}>
                <option value="">—</option>
                {addable.map((p) => <option key={p.id} value={p.id}>{p.fullName}{p.role === 'guest' ? ` (${t('guestBadge')})` : ''}</option>)}
              </select>
            </label>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
