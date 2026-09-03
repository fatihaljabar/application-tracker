import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ButtonHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/utils';

/* ------------------------------------------------------------------ icon */
export function Icon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <i className={cx('fi', name, className)} style={style} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- button */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'soft' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: string;
  /**
   * Sejak menyimpan menunggu balasan server, tombol tanpa penanda terlihat
   * menggantung dan bisa ditekan dua kali. Ikonnya diganti pemutar, tombolnya
   * dinonaktifkan — ukuran dan warnanya tidak berubah sama sekali.
   */
  pending?: boolean;
};

export function Button({
  variant = 'outline',
  size = 'md',
  icon,
  pending = false,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 focus-ring select-none disabled:opacity-45 disabled:pointer-events-none active:scale-[0.97] cursor-pointer';
  const variants: Record<string, string> = {
    primary:
      'bg-[var(--accent)] text-white hover:brightness-110 shadow-[0_6px_18px_-8px_var(--ring)]',
    outline:
      'border border-[var(--line-strong)] text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-muted)]',
    ghost: 'text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]',
    soft: 'bg-[var(--accent-soft)] text-[var(--accent-ink)] hover:brightness-[0.97]',
    danger: 'text-[var(--danger)] border border-[var(--line)] hover:bg-[var(--danger)]/10',
  };
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-[12.5px]',
    md: 'h-10 px-4 text-[13.5px]',
    lg: 'h-12 px-6 text-[14.5px]',
    icon: 'h-9 w-9 text-[13px]',
  };
  return (
    <button
      type="button"
      disabled={disabled || pending}
      className={cx(base, variants[variant], sizes[size], className)}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? (
        <Icon name="fi-rr-spinner" className="animate-spin text-[1.05em]" />
      ) : (
        icon && <Icon name={icon} className="text-[1.05em]" />
      )}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- skeleton */
/**
 * Penanda muat. Bentuknya meniru kartu yang digantikannya: sudut dan warna
 * memakai token yang sama (`--surface-2`, `--line`), tanpa keyframe baru —
 * denyutnya memakai animasi bawaan Tailwind.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]',
        className,
      )}
    />
  );
}

/** Kerangka isi halaman saat data pertama kali diambil. */
export function PageSkeleton() {
  return (
    <div className="anim-fade" aria-busy="true">
      <Skeleton className="mb-7 h-9 w-64 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[132px]" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- field */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: {children} hampir selalu berisi Input atau Textarea, dan label pembungkus memang benar untuk keduanya. Aturan ini tidak bisa menembus prop children untuk membuktikannya.
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[12.5px] font-medium text-[var(--ink-soft)]">
          {label}
          {required && <span className="text-[var(--danger)]">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1.5 flex items-center gap-1 text-[11.5px] text-[var(--danger)] anim-fade">
          <Icon name="fi-rr-exclamation" className="text-[10px]" />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11.5px] text-[var(--ink-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

const inputCls =
  'w-full h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] transition-all duration-200 focus-ring focus:border-[var(--accent)] hover:border-[var(--line-strong)]';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputCls, className)} {...rest} />;
}

export function Textarea({
  className,
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cx(inputCls, 'h-auto py-2.5 leading-relaxed resize-y', className)}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------- dropdown */
export interface Option {
  value: string;
  label: string;
  hint?: string;
  color?: string;
}

export function Select({
  value,
  options,
  onChange,
  placeholder = 'Pilih',
  // Default DI SINI, bukan digabung permanen ke class dasar di bawah — kalau
  // 'w-full' ikut ditulis di string dasar, ia bertabrakan head-to-head di CSS
  // yang di-generate Tailwind dengan className lebar tetap yang dikirim
  // pemanggil (mis. "w-[150px]"), dan urutan kemunculan di stylesheet itu yang
  // sebenarnya menentukan siapa menang — bukan urutan penulisan di className,
  // dan w-full kebetulan selalu menang. Sebagai default parameter, className
  // yang dikirim pemanggil MENGGANTIKAN nilai ini sepenuhnya, jadi tidak
  // pernah head-to-head. Ditemukan lewat tangkapan layar sungguhan: dropdown
  // di Applications melebar penuh dan saling dorong ke baris sendiri padahal
  // sudah dikirim `className="w-[150px]"`.
  className = 'w-full',
  size = 'md',
}: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, up: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  // useCallback supaya identitasnya stabil dan bisa dipakai sebagai dependensi efek
  // sekaligus sebagai listener yang benar-benar bisa dilepas kembali.
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 240 && r.top > spaceBelow;
    setCoords({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 text-left text-[var(--ink)] transition-all duration-200 focus-ring hover:border-[var(--line-strong)] cursor-pointer',
          size === 'sm' ? 'h-9 text-[12.5px]' : 'h-10 text-[13.5px]',
          open && 'border-[var(--accent)]',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {selected?.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: selected.color }}
            />
          )}
          <span className={cx('truncate', !selected && 'text-[var(--ink-muted)]')}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <Icon
          name="fi-rr-angle-small-down"
          className={cx(
            'shrink-0 text-[15px] text-[var(--ink-muted)] transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={listRef}
            // Urutan lapisan: Select 110 > Modal 100 > Menu 95, dan Toaster 200 di
            // atas semuanya. Select WAJIB di atas Modal karena dibuka dari dalam
            // modal di delapan berkas — di z-90 daftarnya tetap terbuka, cuma
            // tersembunyi di belakang modal, jadi terlihat seperti tidak berfungsi.
            className="anim-pop fixed z-[110] max-h-64 overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-soft)]"
            style={{
              top: coords.up ? undefined : coords.top,
              bottom: coords.up ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: coords.width,
            }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors duration-150 cursor-pointer',
                  o.value === value
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]',
                )}
              >
                {o.color && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />
                )}
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-[11px] text-[var(--ink-muted)]">{o.hint}</span>}
                {o.value === value && <Icon name="fi-rr-check" className="text-[11px]" />}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-3 text-[12.5px] text-[var(--ink-muted)]">—</div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ----------------------------------------------------------------- menu */
export function Menu({
  items,
  trigger,
  align = 'right',
}: {
  items: { label: string; icon?: string; onClick: () => void; danger?: boolean }[];
  trigger?: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 184;
    setPos({
      top: Math.min(r.bottom + 6, window.innerHeight - 8 - items.length * 38 - 12),
      left: align === 'right' ? Math.max(8, r.right - width) : r.left,
    });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !boxRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={
          trigger
            ? 'w-full rounded-xl text-[var(--ink-muted)] cursor-pointer'
            : 'grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-all duration-200 hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] focus-ring cursor-pointer'
        }
      >
        {trigger ?? <Icon name="fi-rr-menu-dots" className="text-[13px]" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={boxRef}
            className="anim-pop fixed z-[95] w-46 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-soft)]"
            style={{ top: pos.top, left: pos.left, width: 184 }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors duration-150 cursor-pointer',
                  it.danger
                    ? 'text-[var(--danger)] hover:bg-[var(--danger)]/10'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]',
                )}
              >
                {it.icon && <Icon name={it.icon} className="text-[12px]" />}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ---------------------------------------------------------------- modal */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      {/* Lapisan gelap hanya pintasan mouse; pengguna papan ketik memakai Escape. */}
      <div
        role="presentation"
        aria-hidden="true"
        className="anim-fade absolute inset-0 bg-[#1a1916]/35 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        className={cx(
          'anim-sheet relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)] sm:rounded-3xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] text-[var(--ink-muted)]">{subtitle}</p>
            )}
          </div>
          <button type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-all duration-200 hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] focus-ring cursor-pointer"
          >
            <Icon name="fi-rr-cross-small" className="text-[16px]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------- confirm */
export function Confirm({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  danger = true,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Tanpa label ini tombol batal tidak dirender — bentuk itu dipakai dialog galat. */
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Dialog galat bukan tindakan merusak, jadi tombolnya tidak selalu merah. */
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          {cancelLabel && (
            <Button variant="ghost" onClick={onClose}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant="primary"
            className={danger ? 'bg-[var(--danger)]' : undefined}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-[var(--ink-soft)]">{description}</p>
    </Modal>
  );
}

/* ---------------------------------------------------------------- badge */
export function Badge({
  children,
  color,
  className,
  dot,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none',
        className,
      )}
      style={
        color
          ? { color, background: `${color}1a`, border: `1px solid ${color}33` }
          : undefined
      }
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- toggle */
export function Toggle({
  checked,
  onChange,
  ...rest
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      {...rest}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 focus-ring cursor-pointer',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------ segmented */
export function Segmented({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: { value: string; label: string; icon?: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'inline-flex gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-250 cursor-pointer',
            value === o.value
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,0.07)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-soft)]',
          )}
        >
          {o.icon && <Icon name={o.icon} className="text-[12px]" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- empty state */
export function Empty({
  icon = 'fi-rr-box',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-muted)]">
        <Icon name={icon} className="text-[20px]" />
      </div>
      <p className="text-[14px] font-medium text-[var(--ink)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- search */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <Icon
        name="fi-rr-search"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--ink-muted)]"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(inputCls, 'pl-10 pr-9')}
      />
      {value && (
        <button type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
        >
          <Icon name="fi-rr-cross-small" className="text-[13px]" />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- progress bar */
export function Progress({
  value,
  color,
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]',
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: color ?? 'var(--accent)',
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------- section head */
export function SectionTitle({
  title,
  action,
  icon,
}: {
  title: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
        {icon && <Icon name={icon} className="text-[13px] text-[var(--ink-muted)]" />}
        {title}
      </h2>
      {action}
    </div>
  );
}
