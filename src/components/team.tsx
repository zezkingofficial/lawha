'use client';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useData, useMe, useMembers } from '@/lib/data/context';
import type { Invite, Role } from '@/lib/data/types';
import { fmtDate } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { routeToHash, routeToPath } from '@/lib/router';
import { Avatar, Button, IconButton, useToast } from './ui';
import { roleKey } from './auth';

const ROLES: Role[] = ['admin', 'member', 'viewer', 'guest'];

function inviteLink(token: string) {
  if (typeof location === 'undefined') return '';
  return location.pathname.endsWith('.html') || location.hash
    ? `${location.origin}${location.pathname}${routeToHash({ name: 'invite', token })}`
    : `${location.origin}${routeToPath({ name: 'invite', token })}`;
}

// S24: people in the company, their roles, and invitation links (shared on WhatsApp or anywhere)
export function Team() {
  const { t, locale } = useLang();
  const d = useData();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: people = [] } = useMembers();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [made, setMade] = useState<Invite | null>(null);
  const admin = me?.role === 'admin' && !!d.auth;
  const reload = useCallback(() => { if (admin) d.auth!.invites().then(setInvites).catch(() => {}); }, [admin, d]);
  useEffect(reload, [reload]);
  const run = async (f: () => Promise<void>) => { try { await f(); } catch (e) { toast({ tone: 'error', text: (e as Error).message }); } };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ text: t('copied') }); }
    catch { window.prompt?.(t('copyLink'), text); }
  };

  return (
    <div className="mx-auto grid max-w-[760px] gap-6">
      <h1 className="text-xl font-bold">{t('team')}</h1>
      {!d.auth && <p className="rounded-sm bg-surface p-3 text-sm text-text-muted">{t('demoTeam')}</p>}

      {admin && (
        <section className="grid gap-3 rounded-lg border border-border bg-bg p-4">
          <h2 className="text-md font-semibold">{t('invitePeople')}</h2>
          <p className="text-sm text-text-muted">{t('inviteHelp')}</p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            run(async () => { const inv = await d.auth!.createInvite(String(f.get('email')), String(f.get('role')) as Role); setMade(inv); form.reset(); reload(); });
          }}>
            <label className="grid min-w-[220px] flex-1 gap-1 text-sm">{t('email')}
              <input name="email" type="email" required dir="ltr" className="h-9 rounded-sm border border-border-input bg-bg px-2" />
            </label>
            <label className="grid gap-1 text-sm">{t('role')}
              <select name="role" defaultValue="member" className="h-9 rounded-sm border border-border-input bg-bg px-2">
                {ROLES.map((r) => <option key={r} value={r}>{t(roleKey(r))}</option>)}
              </select>
            </label>
            <Button type="submit" variant="primary" className="h-9"><Link2 size={16} />{t('createLink')}</Button>
          </form>
          {made && (
            <div className="grid gap-2 rounded-sm bg-surface-selected p-3">
              <p className="break-all text-xs" dir="ltr">{inviteLink(made.token)}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => copy(inviteLink(made.token))}><Copy size={14} />{t('copyLink')}</Button>
                <a className="inline-flex h-7 items-center gap-2 rounded-sm bg-success px-3 text-sm font-medium text-on-accent" target="_blank" rel="noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(inviteLink(made.token))}`}>{t('sendWhatsApp')}</a>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-md font-semibold">{t('people')} <span className="text-sm font-normal text-text-subtle">{people.length}</span></h2>
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-bg">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar person={p} size={30} />
              <span className="flex-1 text-sm font-medium">{p.fullName} {p.id === me?.id && <span className="text-text-subtle">{t('you2')}</span>}</span>
              {admin && p.id !== me?.id ? (
                <>
                  <select aria-label={`${t('role')}: ${p.fullName}`} value={p.role} onChange={(e) => run(() => d.auth!.setRole(p.id, e.target.value as Role))}
                    className="h-8 rounded-sm border border-border-input bg-bg px-1 text-sm">
                    {ROLES.map((r) => <option key={r} value={r}>{t(roleKey(r))}</option>)}
                  </select>
                  <IconButton small label={`${t('removePerson')}: ${p.fullName}`} onClick={() => run(() => d.auth!.removeMember(p.id))}><Trash2 size={14} /></IconButton>
                </>
              ) : <span className="text-sm text-text-muted">{t(roleKey(p.role))}</span>}
            </li>
          ))}
        </ul>
      </section>

      {admin && invites.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-md font-semibold">{t('pending')}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-bg">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <bdi dir="ltr" className="flex-1">{i.email}</bdi>
                <span className="text-text-muted">{t(roleKey(i.role))} · {t('expires')} {fmtDate(i.expiresAt.slice(0, 10), locale)}</span>
                <IconButton small label={t('copyLink')} onClick={() => copy(inviteLink(i.token))}><Copy size={14} /></IconButton>
                <IconButton small label={`${t('revoke')}: ${i.email}`} onClick={() => run(async () => { await d.auth!.revokeInvite(i.id); reload(); })}><Trash2 size={14} /></IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
