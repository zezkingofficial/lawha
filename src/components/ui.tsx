'use client';
import clsx from 'clsx';
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LabelColor, Profile } from '@/lib/data/types';
import { initial, labelBg, labelFg } from '@/lib/format';
import { useLang } from '@/lib/i18n';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; pressed?: boolean }>(
  function Button({ variant = 'secondary', size = 'md', pressed, className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={pressed}
        className={clsx(
          'inline-flex items-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' && 'h-[28px] px-3 text-sm',
          size === 'md' && 'h-8 px-3 text-base',
          size === 'lg' && 'h-10 px-4 text-md',
          variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-hover',
          variant === 'secondary' && 'border border-border-strong bg-bg text-text hover:bg-surface-hover',
          variant === 'ghost' && 'text-text hover:bg-surface-hover aria-pressed:bg-surface-selected aria-pressed:text-accent',
          variant === 'danger' && 'bg-danger text-on-accent',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; small?: boolean }>(
  function IconButton({ label, small, className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={clsx('inline-grid place-items-center', small ? 'h-7 w-7' : 'h-8 w-8', 'rounded-sm text-text-muted hover:bg-surface-hover hover:text-text', className)}
        {...rest}
      />
    );
  },
);

export function Avatar({ person, size = 24 }: { person: Pick<Profile, 'fullName' | 'color'>; size?: number }) {
  return (
    <span
      title={person.fullName}
      className="inline-grid flex-none place-items-center rounded-pill border-2 border-bg font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: labelBg(person.color), color: labelFg(person.color) }}
    >
      {initial(person.fullName)}
    </span>
  );
}

export function AvatarStack({ people, size = 24, max = 3 }: { people: Profile[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center [&>*+*]:-ms-[6px]">
      {shown.map((p) => <Avatar key={p.id} person={p} size={size} />)}
      {extra > 0 && (
        <span className="inline-grid place-items-center rounded-pill border-2 border-bg bg-surface-hover text-xs text-text-muted" style={{ width: size, height: size }}>
          <bdi dir="ltr">+{extra}</bdi>
        </span>
      )}
    </span>
  );
}

export function ColorDot({ color }: { color: LabelColor }) {
  return <span className="inline-block h-3 w-3 rounded-pill" style={{ background: labelBg(color) }} />;
}

// ---- phone layout

const PHONE = '(max-width: 639px)';

/** True on phone-width screens (under Tailwind's `sm`). */
export function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE).matches);
  useEffect(() => {
    const m = window.matchMedia(PHONE);
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

/** A sheet that slides up from the bottom on phones and sits centred on larger screens. */
export function BottomSheet({ open, onClose, title, children, footer, labelledBy }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; labelledBy?: string;
}) {
  const { t } = useLang();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus the field marked data-autofocus, else the sheet itself
    requestAnimationFrame(() => {
      const f = box.current?.querySelector<HTMLElement>('[data-autofocus]');
      (f ?? box.current)?.focus();
    });
    return () => { removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; opener?.focus?.(); };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[35]" role="presentation">
      <button type="button" aria-label={t('close')} tabIndex={-1} className="absolute inset-0 animate-[fade_150ms_ease-out]" style={{ background: 'color-mix(in srgb, var(--c-text) 40%, transparent)' }} onClick={onClose} />
      <section ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : typeof title === 'string' ? title : undefined} tabIndex={-1}
        className="sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-lg bg-bg shadow-pop outline-none sm:inset-x-4 sm:bottom-auto sm:top-[8vh] sm:max-h-[84vh] sm:rounded-lg">
        <div className="mx-auto mt-2 h-1 w-10 flex-none rounded-pill bg-border-strong sm:hidden" aria-hidden />
        <header className="flex flex-none items-center gap-2 px-4 pb-2 pt-2">
          <h2 id={labelledBy} className="min-w-0 flex-1 truncate text-md font-semibold">{title}</h2>
          <IconButton label={t('close')} onClick={onClose}><XIcon /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div className="flex-none border-t border-border px-4 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>{footer}</div>}
      </section>
    </div>,
    document.body,
  );
}

function XIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

/** A large tap target used for one-tap choices in sheets (status, people, dates). */
export function Chip({ selected, onClick, children, style, className, label }: {
  selected: boolean; onClick: () => void; children: ReactNode; style?: React.CSSProperties; className?: string; label?: string;
}) {
  return (
    <button type="button" aria-pressed={selected} aria-label={label} onClick={onClick} style={style}
      className={clsx('inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-shadow duration-fast',
        selected ? 'border-transparent shadow-[0_0_0_2px_var(--c-bg),0_0_0_4px_var(--c-text)]' : 'border-border-strong bg-bg hover:bg-surface-hover', className)}>
      {children}
    </button>
  );
}

// ---- toasts

interface ToastMsg { id: number; text: string; undo?: () => void; tone?: 'info' | 'error' }
const ToastCtx = createContext<(m: Omit<ToastMsg, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: Omit<ToastMsg, 'id'>) => {
    clearTimeout(timer.current);
    setMsg({ ...m, id: Date.now() });
    timer.current = setTimeout(() => setMsg(null), m.undo ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="toast-dock pointer-events-none fixed inset-x-0 z-40 grid justify-items-center px-4">
        {msg && (
          <div role={msg.tone === 'error' ? 'alert' : 'status'} className={clsx('pointer-events-auto flex items-center gap-4 rounded-md px-4 py-[10px] text-sm shadow-pop', msg.tone === 'error' ? 'bg-danger text-on-accent' : 'bg-text text-bg')}>
            <span>{msg.text}</span>
            {msg.undo && (
              <button type="button" className="font-bold underline" onClick={() => { msg.undo?.(); setMsg(null); }}>
                {t('undo')}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
