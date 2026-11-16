'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, CARD_SHADOW, GRADIENT, POP_SHADOW, POST_STATUS, colorFor } from '@/lib/design';
import type { PostStatus } from '@/lib/types';
import { cn, initials } from '@/lib/utils';

function useOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

/** Card surface used across the design. */
export function Card({ className, style, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl bg-white', className)} style={{ boxShadow: CARD_SHADOW, ...style }} {...rest}>
      {children}
    </div>
  );
}

/** Dropdown ("hs" in the design): trigger + floating white panel. */
export function Dropdown({
  trigger,
  children,
  align = 'left',
  width,
  up,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number | string;
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={cn('absolute z-50 overflow-hidden', up ? 'bottom-full mb-1.5' : 'mt-1.5')}
          style={{
            [align === 'right' ? 'right' : 'left']: 0,
            width: width ?? 'auto',
            minWidth: 180,
            background: '#fff',
            border: '1px solid #EEF2F6',
            borderRadius: 16,
            boxShadow: POP_SHADOW,
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  active,
  onClick,
  icon,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
      style={{
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: danger ? C.red : active ? C.blue : C.slate,
        background: active ? C.blueTint : 'transparent',
      }}
    >
      {icon && <span style={{ color: danger ? C.red : active ? C.blue : C.faint, display: 'flex', alignItems: 'center' }}>{icon}</span>}
      <span className="flex-1">{children}</span>
      {active && <Check size={13} strokeWidth={2.5} style={{ color: C.blue, flexShrink: 0 }} />}
    </button>
  );
}

export const MenuDivider = () => <div style={{ height: 1, background: C.page, margin: '3px 0' }} />;

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 600, color: C.faint2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

/** Custom select ("Lw" in the design). */
export function SelectMenu<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const current = options.find((o) => o.value === value);
  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 transition-colors disabled:opacity-60"
        style={{
          padding: '10px 14px',
          fontSize: 13,
          color: current ? C.ink : C.faint,
          background: '#fff',
          border: open ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.08)' : '0 1px 2px rgba(15,23,42,0.04)',
          textAlign: 'left',
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.icon && <span style={{ color: C.muted, display: 'flex' }}>{current.icon}</span>}
          <span className="truncate">{current ? current.label : placeholder ?? 'Select…'}</span>
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          style={{ color: C.faint2, flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open && (
        <div
          className="absolute z-50 max-h-72 overflow-y-auto"
          style={{
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #EEF2F6',
            borderRadius: 14,
            boxShadow: POP_SHADOW,
            padding: '4px 0',
          }}
        >
          {options.map((o) => (
            <MenuItem
              key={o.value}
              active={o.value === value}
              icon={o.icon}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  );
}

/** Toggle switch ("X2" in the design). */
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="relative flex-shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{ width: 40, height: 22, background: value ? C.blue : C.border2 }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white transition-transform"
        style={{ width: 18, height: 18, left: 0, transform: value ? 'translateX(20px)' : 'translateX(2px)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
      />
    </button>
  );
}

/** Initials avatar tinted by color ("Nn"); shows the photo when available. */
export function Avatar({ name, src, size = 36, color, square }: { name: string; src?: string | null; size?: number; color?: string; square?: boolean }) {
  const tint = color ?? colorFor(name);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className={cn('flex-shrink-0 object-cover', square ? 'rounded-xl' : 'rounded-full')}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn('flex flex-shrink-0 items-center justify-center', square ? 'rounded-xl' : 'rounded-full')}
      style={{ width: size, height: size, background: `${tint}15` }}
    >
      <span style={{ fontSize: size * 0.31, fontWeight: 700, color: tint }}>{initials(name) || '?'}</span>
    </div>
  );
}

/** Brand-gradient initials avatar (current user / workspace). */
export function GradientAvatar({ name, size = 32, src, rounded = 'full' }: { name: string; size?: number; src?: string | null; rounded?: 'full' | 'xl' | '2xl' }) {
  const r = rounded === 'full' ? 'rounded-full' : rounded === 'xl' ? 'rounded-xl' : 'rounded-2xl';
  if (src) return <img src={src} alt={name} referrerPolicy="no-referrer" className={cn('flex-shrink-0 object-cover', r)} style={{ width: size, height: size }} />;
  return (
    <div className={cn('flex flex-shrink-0 items-center justify-center', r)} style={{ width: size, height: size, background: GRADIENT }}>
      <span style={{ fontSize: Math.max(9, size * 0.34), fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{initials(name)}</span>
    </div>
  );
}

export function StatusPill({ status, small }: { status: PostStatus; small?: boolean }) {
  const s = POST_STATUS[status];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full', small ? 'px-2 py-0.5' : 'px-2.5 py-1')}
      style={{ fontSize: small ? 10 : 11, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}
    >
      <span className="flex-shrink-0 rounded-full" style={{ width: 5, height: 5, background: s.dot }} />
      {s.label}
    </span>
  );
}

export function Spinner({ size = 18, color = C.blue }: { size?: number; color?: string }) {
  return (
    <div
      className="animate-spin rounded-full"
      style={{ width: size, height: size, border: `2px solid ${color}33`, borderTopColor: color }}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size={26} />
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse rounded-2xl bg-white/70', className)} style={style} />;
}

/** Centered modal in the design's style. */
export function Modal({
  open,
  onClose,
  children,
  width = 440,
  closable = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  closable?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closable && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, closable]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.38)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => e.target === e.currentTarget && closable && onClose()}
    >
      <div
        className="relative max-h-[92vh] w-full animate-fade-in overflow-y-auto"
        style={{ maxWidth: width, background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)' }}
      >
        {closable && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex items-center justify-center rounded-lg transition-colors hover:bg-[#F4F6F8]"
            style={{ width: 28, height: 28, color: C.ghost }}
            aria-label="Close"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  loading,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} width={400} closable={!loading}>
      <div style={{ padding: '24px 24px 8px' }}>
        <div className="mb-3 flex items-center gap-3">
          {icon && (
            <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: danger ? C.redSoft : '#F8FAFC', border: `1px solid ${danger ? C.redBorder : C.border}` }}>
              {icon}
            </div>
          )}
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>{title}</h2>
        </div>
        {description && <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.65, paddingLeft: icon ? 48 : 0 }}>{description}</div>}
        {children}
      </div>
      <div className="flex items-center justify-end gap-2.5" style={{ padding: '20px 24px 24px' }}>
        <Btn variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Btn>
        <Btn variant={danger ? 'danger' : 'dark'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

type BtnVariant = 'primary' | 'gradient' | 'outline' | 'soft' | 'dark' | 'danger' | 'ghost' | 'dangerSoft';
const BTN: Record<BtnVariant, React.CSSProperties> = {
  primary: { color: '#fff', background: C.blue, boxShadow: '0 1px 3px rgba(37,99,235,0.2)' },
  gradient: { color: '#fff', background: GRADIENT, boxShadow: '0 4px 16px rgba(37,99,235,0.38)', fontWeight: 700 },
  outline: { color: C.slate2, background: '#fff', border: `1px solid ${C.border3}` },
  soft: { color: C.blue, background: C.blueSoft, border: `1px solid ${C.blueBorder}` },
  dark: { color: '#fff', background: '#1E293B', boxShadow: '0 1px 3px rgba(15,23,42,0.20)' },
  danger: { color: '#fff', background: C.red },
  dangerSoft: { color: C.red, background: C.redSoft, border: `1px solid ${C.redBorder}` },
  ghost: { color: C.muted, background: 'transparent' },
};

/** Button with the design's proportions (rounded-xl, 13px semibold). */
export function Btn({
  variant = 'primary',
  loading,
  className,
  style,
  children,
  disabled,
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const pad = size === 'sm' ? 'px-3 py-1.5' : size === 'lg' ? 'px-5 py-3' : 'px-4 py-2.5';
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'outline' && 'hover:bg-[#F8FAFC] hover:opacity-100',
        pad,
        className,
      )}
      style={{ fontSize: size === 'sm' ? 12 : 13, fontWeight: 600, ...BTN[variant], ...style }}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size={14} color={['outline', 'soft', 'ghost', 'dangerSoft'].includes(variant) ? C.blue : '#fff'} />}
      {children}
    </button>
  );
}

/** Text input in the design's style (focus ring in brand blue). */
export const inputStyle: React.CSSProperties = {
  fontSize: 13,
  border: `1px solid ${C.border3}`,
  color: C.ink,
  background: '#fff',
  borderRadius: 12,
  padding: '10px 16px',
  width: '100%',
  outline: 'none',
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn('transition-shadow focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.09)]', props.className)}
      style={{ ...inputStyle, ...props.style }}
    />
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: C.slate2, display: 'block', marginBottom: 8 }}>{children}</label>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{subtitle}</p>}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-12 text-center">
      <p style={{ fontSize: 13, color: C.ghost }}>{children}</p>
    </div>
  );
}
