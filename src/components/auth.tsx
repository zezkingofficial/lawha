'use client';
import clsx from 'clsx';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '@/lib/data/context';
import type { InvitePreview, Role } from '@/lib/data/types';
import { useLang, type MsgKey } from '@/lib/i18n';
import { useRouter } from '@/lib/router';
import { Button } from './ui';

const field = 'h-10 w-full rounded-sm border border-border-input bg-bg px-3 text-base focus:border-focus';
export const roleKey = (r: Role): MsgKey => (r === 'admin' ? 'roleAdmin' : r === 'member' ? 'roleMember' : r === 'viewer' ? 'roleViewer' : 'roleGuest');

function Card({ children }: { children: ReactNode }) {
  const { t } = useLang();
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="grid w-full max-w-[420px] gap-5 rounded-lg border border-border bg-bg p-6 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-accent text-lg font-bold text-on-accent" aria-hidden>ل</span>
          <span className="text-lg font-semibold">{t('app')}</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1 text-sm font-medium">{label}{children}{hint && <span className="text-xs font-normal text-text-subtle">{hint}</span>}</label>;
}

// Sign in, sign up, or join through an invitation link. Only used with real accounts.
export function AuthScreen() {
  const { t } = useLang();
  const d = useData();
  const { route, go } = useRouter();
  const auth = d.auth!;
  const token = route.name === 'invite' ? route.token : undefined;
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(token ? 'up' : 'in');
  const [invite, setInvite] = useState<InvitePreview | null | 'bad'>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [needsCompany, setNeedsCompany] = useState(false);

  useEffect(() => { auth.needsCompany().then(setNeedsCompany); }, [auth]);
  useEffect(() => {
    if (!token) return;
    auth.previewInvite(token).then((p) => setInvite(!p || p.used || p.expired ? 'bad' : p)).catch(() => setInvite('bad'));
  }, [auth, token]);

  const run = (f: (fd: FormData) => Promise<void>) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try { await f(new FormData(e.currentTarget)); }
    catch (err) {
      const m = (err as Error).message;
      setMsg({ tone: 'error', text: /invalid login/i.test(m) ? t('wrongLogin') : m });
    } finally { setBusy(false); }
  };
  const after = () => { if (token) go({ name: 'home' }); };

  if (needsCompany && !token) {
    return (
      <Card>
        <div><h1 className="text-lg font-semibold">{t('needCompanyTitle')}</h1><p className="mt-1 text-sm text-text-muted">{t('needCompanyHelp')}</p></div>
        <form className="grid gap-3" onSubmit={run(async (fd) => { await auth.createCompany(String(fd.get('company'))); })}>
          <Field label={t('company')}><input name="company" required autoFocus className={field} /></Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="justify-center">{busy ? t('working') : t('createCompany')}</Button>
          {msg && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
        </form>
        <button type="button" onClick={() => auth.signOut()} className="text-sm text-text-muted">{t('signOut')}</button>
      </Card>
    );
  }

  const inviteOk = invite && invite !== 'bad' ? invite : null;
  return (
    <Card>
      {token && invite === 'bad' && <p role="alert" className="rounded-sm bg-surface p-3 text-sm text-danger">{t('inviteBad')}</p>}
      {inviteOk && (
        <div className="rounded-sm bg-surface-selected p-3 text-sm">
          <p className="font-semibold">{t('joinTitle')} {inviteOk.accountName}</p>
          <p className="text-text-muted">{t('joinAs')} {t(roleKey(inviteOk.role))} · {t('inviteFor')} <bdi dir="ltr">{inviteOk.email}</bdi></p>
        </div>
      )}
      <h1 className="text-lg font-semibold">{mode === 'up' ? (inviteOk ? t('signUp') : t('signUpTitle')) : mode === 'reset' ? t('forgot') : t('signInTitle2')}</h1>

      {mode === 'in' && (
        <form className="grid gap-3" onSubmit={run(async (fd) => { await auth.signIn(String(fd.get('email')), String(fd.get('password')), inviteOk ? token : undefined); after(); })}>
          <Field label={t('email')}><input name="email" type="email" required autoComplete="email" dir="ltr" defaultValue={inviteOk?.email} className={field} /></Field>
          <Field label={t('password')}><input name="password" type="password" required autoComplete="current-password" dir="ltr" className={field} /></Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="justify-center">{busy ? t('working') : t('signIn')}</Button>
          <button type="button" onClick={() => { setMode('reset'); setMsg(null); }} className="justify-self-start text-sm text-accent">{t('forgot')}</button>
        </form>
      )}
      {mode === 'up' && (
        <form className="grid gap-3" onSubmit={run(async (fd) => {
          const r = await auth.signUp({ fullName: String(fd.get('name')), company: String(fd.get('company') ?? ''), email: String(fd.get('email')), password: String(fd.get('password')), inviteToken: inviteOk ? token : undefined });
          if (r === 'check_email') setMsg({ tone: 'info', text: t('checkEmail') }); else after();
        })}>
          <Field label={t('fullName')}><input name="name" required autoComplete="name" className={field} /></Field>
          {!inviteOk && <Field label={t('company')}><input name="company" required autoComplete="organization" className={field} /></Field>}
          <Field label={t('email')}><input name="email" type="email" required autoComplete="email" dir="ltr" defaultValue={inviteOk?.email} readOnly={!!inviteOk} className={clsx(field, inviteOk && 'bg-surface')} /></Field>
          <Field label={t('password')} hint={t('passwordHint')}><input name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className={field} /></Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy || invite === 'bad'} className="justify-center">{busy ? t('working') : t('signUp')}</Button>
        </form>
      )}
      {mode === 'reset' && (
        <form className="grid gap-3" onSubmit={run(async (fd) => { await auth.sendReset(String(fd.get('email'))); setMsg({ tone: 'info', text: t('resetSent') }); })}>
          <Field label={t('email')}><input name="email" type="email" required dir="ltr" className={field} /></Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="justify-center">{busy ? t('working') : t('send')}</Button>
        </form>
      )}
      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={clsx('text-sm', msg.tone === 'error' ? 'text-danger' : 'text-success')}>{msg.text}</p>}
      <p className="text-sm text-text-muted">
        {mode === 'in' ? t('noAccount') : t('haveAccount')}{' '}
        <button type="button" className="font-medium text-accent" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>{mode === 'in' ? t('signUp') : t('signIn')}</button>
      </p>
    </Card>
  );
}
