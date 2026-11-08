'use client';
import clsx from 'clsx';
import { createContext, forwardRef, useCallback, useContext, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
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
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-40 grid justify-items-center px-4" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
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
