'use client';
import clsx from 'clsx';
import { CornerDownLeft, FileText, Paperclip, Pencil, Reply, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useActivity, useAssets, useData, useMe, useMembers, useUpdates } from '@/lib/data/context';
import { NotAllowed } from '@/lib/data/fake';
import { CellError } from '@/lib/data/validate';
import type { Asset, BoardBundle, Column, Item, NewFile, Profile, Update } from '@/lib/data/types';
import { readFile } from '@/lib/files';
import { useLang } from '@/lib/i18n';
import { Avatar, IconButton, useToast } from '../ui';
import { AnyCell } from './cells';

type Tab = 'updates' | 'details' | 'files' | 'activity';

export function ItemPanel({ bundle, itemId, onClose, canEdit }: { bundle: BoardBundle; itemId: string; onClose: () => void; canEdit: boolean }) {
  const { t } = useLang();
  const item = bundle.items.find((i) => i.id === itemId);
  const [tab, setTab] = useState<Tab>('updates');
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-radix-popper-content-wrapper]')) onClose(); };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [onClose]);

  const parent = item?.parentItemId ? bundle.items.find((i) => i.id === item.parentItemId) : null;
  const group = bundle.groups.find((g) => g.id === (parent ?? item)?.groupId);

  return (
    <div className="fixed inset-0 z-30" role="presentation">
      <button type="button" aria-label={t('close')} tabIndex={-1} className="absolute inset-0 hidden md:block" style={{ background: 'color-mix(in srgb, var(--c-text) 18%, transparent)' }} onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={item?.name ?? ''}
        className="absolute inset-y-0 end-0 flex w-full flex-col bg-bg shadow-panel md:w-panel"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {!item ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-text-muted">
            <div className="grid gap-3"><p>{t('notFound')}</p><button type="button" className="text-accent" onClick={onClose}>{t('close')}</button></div>
          </div>
        ) : (
          <>
            <header className="flex items-start gap-2 border-b border-border px-4 pb-3 pt-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-text-subtle">{bundle.board.name}{group ? ` › ${group.title}` : ''}{parent ? ` › ${parent.name}` : ''}</p>
                <ItemName item={item} canEdit={canEdit} />
              </div>
              <IconButton ref={closeRef} label={t('close')} onClick={onClose}><X size={18} /></IconButton>
            </header>
            <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-3">
              {(['updates', 'details', 'files', 'activity'] as Tab[]).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm', tab === k ? 'border-accent font-semibold' : 'border-transparent text-text-muted hover:text-text')}>
                  {t(k === 'updates' ? 'updates' : k === 'details' ? 'details' : k === 'files' ? 'files' : 'activity')}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {tab === 'updates' && <UpdatesTab item={item} canEdit={canEdit} />}
              {tab === 'details' && <DetailsTab item={item} bundle={bundle} canEdit={canEdit} />}
              {tab === 'files' && <FilesTab item={item} />}
              {tab === 'activity' && <ActivityTab item={item} bundle={bundle} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ItemName({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const d = useData();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <input autoFocus defaultValue={item.name} aria-label="name" dir="auto" className="mt-1 w-full rounded-sm border border-focus bg-bg px-1 text-lg font-semibold"
      onBlur={(e) => { setEditing(false); d.renameItem(item.id, e.target.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }} />;
  }
  return (
    <h2 className="mt-1 text-lg font-semibold" dir="auto">
      {canEdit ? <button type="button" className="rounded-xs text-start hover:bg-surface-hover" onClick={() => setEditing(true)}>{item.name}</button> : item.name}
    </h2>
  );
}

// ---------------------------------------------------------------- updates

function UpdatesTab({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const { t } = useLang();
  const { data: updates = [], loading } = useUpdates(item.boardId, item.id);
  const top = updates.filter((u) => !u.parentUpdateId);
  return (
    <div className="grid gap-4">
      {canEdit && <Composer item={item} />}
      {loading && !updates.length && <div className="h-16 animate-pulse rounded-md bg-surface-hover motion-reduce:animate-none" />}
      {!loading && !top.length && <p className="text-sm text-text-muted">{t('noUpdates')}</p>}
      {top.map((u) => <UpdateCard key={u.id} u={u} replies={updates.filter((r) => r.parentUpdateId === u.id).reverse()} item={item} canEdit={canEdit} />)}
    </div>
  );
}

// textarea with @mention suggestions; mentions are kept as ids next to the text
function Composer({ item, parentUpdateId, onDone, autoFocus }: { item: Item; parentUpdateId?: string; onDone?: () => void; autoFocus?: boolean }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const { data: members = [] } = useMembers();
  const [text, setText] = useState('');
  const [mentioned, setMentioned] = useState<Profile[]>([]);
  const [files, setFiles] = useState<NewFile[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // caret goes after an inserted mention right after React commits the new text,
  // before the next keystroke, so fast typing never lands in the wrong place
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);

  const suggestions = useMemo(() => query === null ? [] : members.filter((m) => m.fullName.startsWith(query)).slice(0, 6), [query, members]);

  const onChange = (v: string) => {
    setText(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
    setQuery(m ? m[1] : null);
    setHi(0);
  };
  const pick = (p: Profile) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]*)$/, `@${p.fullName} `);
    const next = before + text.slice(caret);
    setText(next);
    setMentioned((ms) => (ms.some((x) => x.id === p.id) ? ms : [...ms, p]));
    setQuery(null);
    pendingCaret.current = before.length;
  };
  const send = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    try {
      const ids = mentioned.filter((m) => text.includes(`@${m.fullName}`)).map((m) => m.id);
      await d.postUpdate(item.id, text, ids, { parentUpdateId, files });
      setText(''); setMentioned([]); setFiles([]);
      onDone?.();
    } catch (e) {
      toast({ tone: 'error', text: e instanceof NotAllowed ? t('viewOnlyError') : (e as Error).message === 'file too large' ? t('fileTooLarge') : (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-md border border-border-input bg-bg focus-within:border-focus">
      <textarea ref={ref} value={text} autoFocus={autoFocus} rows={parentUpdateId ? 2 : 3} dir="auto"
        placeholder={parentUpdateId ? t('reply') : t('writeUpdate')} aria-label={parentUpdateId ? t('reply') : t('writeUpdate')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (suggestions.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + suggestions.length) % suggestions.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[hi]); return; }
            if (e.key === 'Escape') { setQuery(null); return; }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
        }}
        className="block w-full resize-y rounded-md bg-transparent p-3 text-sm outline-none" />
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="mentions" className="absolute start-3 top-full z-10 mt-1 w-[220px] rounded-md border border-border bg-surface-raised p-1 shadow-pop">
          {suggestions.map((m, i) => (
            <li key={m.id}>
              <button type="button" role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                className={clsx('flex w-full items-center gap-2 rounded-xs px-2 py-[6px] text-sm', i === hi && 'bg-surface-hover')}>
                <Avatar person={m} size={22} />{m.fullName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1 px-3 pb-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1 rounded-xs bg-surface px-2 py-[2px] text-xs">
              <Paperclip size={12} /><span className="max-w-[160px] truncate" dir="auto">{f.name}</span>
              <button type="button" aria-label={`${t('clear')} ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 border-t border-border px-2 py-1">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-sm px-2 text-sm text-text-muted hover:bg-surface-hover" title={t('attach')}>
          <Paperclip size={15} /><span className="sr-only">{t('attach')}</span>
          <input type="file" multiple className="sr-only" onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = '';
            for (const f of list) {
              if (f.size > 2 * 1024 * 1024) { toast({ tone: 'error', text: `${f.name}: ${t('fileTooLarge')}` }); continue; }
              const nf = await readFile(f);
              setFiles((fs) => [...fs, nf]);
            }
          }} />
        </label>
        <span className="ms-auto hidden text-xs text-text-subtle sm:inline"><bdi dir="ltr">Ctrl ↵</bdi></span>
        <button type="button" onClick={send} disabled={busy || (!text.trim() && !files.length)}
          className="inline-flex h-8 items-center gap-1 rounded-sm bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50">
          <CornerDownLeft size={14} className="rtl:-scale-x-100" />{t('send')}
        </button>
      </div>
    </div>
  );
}

function useRelTime() {
  const { locale, t } = useLang();
  return (iso: string) => {
    const secs = (Date.parse(iso) - Date.now()) / 1000;
    if (Math.abs(secs) < 45) return t('justNow');
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
    let v = secs;
    for (let i = 0; i < steps.length; i++) {
      const [n, unit] = steps[i];
      if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
      v /= n;
    }
    return '';
  };
}

function MentionText({ text, members }: { text: string; members: Profile[] }) {
  const names = members.map((m) => m.fullName).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  return <>{text.split(re).map((part, i) => (re.test(part) && part.startsWith('@') ? <span key={i} className="rounded-xs bg-surface-selected px-[2px] font-medium text-accent">{part}</span> : part))}</>;
}

function UpdateCard({ u, replies, item, canEdit, isReply }: { u: Update; replies: Update[]; item: Item; canEdit: boolean; isReply?: boolean }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const rel = useRelTime();
  const { data: me } = useMe();
  const { data: members = [] } = useMembers();
  const { data: assets = [] } = useAssets(item.boardId, item.id);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const author = members.find((m) => m.id === u.authorId);
  const mine = me?.id === u.authorId;
  const files = assets.filter((a) => u.assetIds.includes(a.id));

  return (
    <article className={clsx('grid gap-2', !isReply && 'rounded-md border border-border p-3')}>
      <header className="flex items-center gap-2">
        {author && <Avatar person={author} size={isReply ? 24 : 30} />}
        <span className="text-sm font-semibold">{author?.fullName ?? '—'}</span>
        <time dateTime={u.createdAt} title={new Date(u.createdAt).toLocaleString()} className="text-xs text-text-subtle">{rel(u.createdAt)}{u.editedAt ? ` · ${t('edited')}` : ''}</time>
        {(mine || me?.role === 'admin') && (
          <span className="ms-auto flex">
            {mine && <IconButton small label={t('edit')} onClick={() => setEditing(true)}><Pencil size={14} /></IconButton>}
            <IconButton small label={t('deleteItem')} onClick={async () => {
              try { await d.deleteUpdate(u.id); } catch (e) { toast({ tone: 'error', text: (e as Error).message }); }
            }}><Trash2 size={14} /></IconButton>
          </span>
        )}
      </header>
      {editing ? (
        <form onSubmit={async (e) => { e.preventDefault(); await d.editUpdate(u.id, String(new FormData(e.currentTarget).get('b') ?? '')); setEditing(false); }} className="grid gap-2">
          <textarea name="b" autoFocus defaultValue={u.bodyText} dir="auto" rows={3} aria-label={t('edit')} className="w-full rounded-sm border border-focus bg-bg p-2 text-sm" />
          <div className="flex gap-2"><button type="submit" className="h-8 rounded-sm bg-accent px-3 text-sm text-on-accent">{t('save')}</button><button type="button" onClick={() => setEditing(false)} className="h-8 rounded-sm px-3 text-sm hover:bg-surface-hover">{t('cancel')}</button></div>
        </form>
      ) : (
        u.bodyText && <p className="whitespace-pre-wrap text-sm leading-[1.7]" dir="auto"><MentionText text={u.bodyText} members={members} /></p>
      )}
      {files.length > 0 && <FileGrid files={files} />}
      {!isReply && (
        <div className="grid gap-3 border-t border-border pt-2">
          {replies.map((r) => <UpdateCard key={r.id} u={r} replies={[]} item={item} canEdit={canEdit} isReply />)}
          {canEdit && (replying
            ? <Composer item={item} parentUpdateId={u.id} onDone={() => setReplying(false)} autoFocus />
            : <button type="button" onClick={() => setReplying(true)} className="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-accent"><Reply size={14} className="rtl:-scale-x-100" />{t('reply')}</button>)}
        </div>
      )}
    </article>
  );
}

function FileGrid({ files }: { files: Asset[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
      {files.map((a) => (
        <li key={a.id} className="overflow-hidden rounded-sm border border-border">
          {a.mimeType.startsWith('image/')
            ? <img src={a.url} alt={a.fileName} className="aspect-[4/3] w-full max-w-full object-cover" />
            : <div className="grid aspect-[4/3] place-items-center bg-surface"><FileText size={28} className="text-text-muted" /></div>}
          <p className="truncate px-2 py-1 text-xs" dir="auto" title={a.fileName}>{a.fileName}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- details, files, activity

function DetailsTab({ item, bundle, canEdit }: { item: Item; bundle: BoardBundle; canEdit: boolean }) {
  const { t } = useLang();
  const d = useData();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: members = [] } = useMembers();
  const cols = bundle.columns.filter((c) => c.scope === (item.parentItemId ? 'subitem' : 'item'));
  const doneIds = new Set(cols.flatMap((c) => (c.settings.labels ?? []).filter((l) => l.done).map((l) => l.id)));
  const set = async (c: Column, v: Parameters<typeof d.setCell>[2]) => {
    try { await d.setCell(item.id, c.id, v); }
    catch (e) { toast({ tone: 'error', text: e instanceof NotAllowed ? t('viewOnlyError') : e instanceof CellError ? t('invalidValue') : (e as Error).message }); }
  };
  return (
    <dl className="grid gap-2">
      {cols.map((c) => (
        <div key={c.id} className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
          <dt className="text-sm text-text-muted">{c.title}</dt>
          <dd className="flex min-h-[36px] overflow-hidden rounded-sm border border-border">
            <AnyCell item={item} column={c} members={members} me={me ?? null} canEdit={canEdit} doneIds={doneIds}
              onSet={(v) => set(c, v)} onInvalid={() => toast({ tone: 'error', text: t('invalidValue') })} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FilesTab({ item }: { item: Item }) {
  const { t } = useLang();
  const { data: assets = [] } = useAssets(item.boardId, item.id);
  if (!assets.length) return <p className="text-sm text-text-muted">{t('noFiles')}</p>;
  return <FileGrid files={assets} />;
}

function ActivityTab({ item, bundle }: { item: Item; bundle: BoardBundle }) {
  const { t } = useLang();
  const rel = useRelTime();
  const { data: rows = [] } = useActivity(item.boardId, item.id);
  const { data: members = [] } = useMembers();
  if (!rows.length) return <p className="text-sm text-text-muted">{t('noActivity')}</p>;
  const label: Record<string, string> = { item_created: t('aCreated'), name_changed: t('aName'), cell_changed: t('aCell'), item_moved: t('aMoved'), item_deleted: t('aDeleted'), item_restored: t('aRestored') };
  return (
    <ol className="grid gap-2">
      {rows.map((r) => {
        const who = members.find((m) => m.id === r.actorId);
        const col = bundle.columns.find((c) => c.id === r.columnId);
        return (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            {who && <Avatar person={who} size={22} />}
            <span className="font-medium">{who?.fullName ?? '—'}</span>
            <span className="text-text-muted">{label[r.action]}{col ? ` «${col.title}»` : ''}</span>
            <time className="ms-auto text-xs text-text-subtle" dateTime={r.createdAt}>{rel(r.createdAt)}</time>
          </li>
        );
      })}
    </ol>
  );
}
