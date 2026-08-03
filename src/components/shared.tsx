import { useMemo, useState } from 'react';
import type { Application, Status } from '../lib/types';
import { statusMeta } from '../lib/constants';
import { useStore } from '../lib/store';
import { cx, initials } from '../lib/utils';
import { Icon } from './ui';

export function StatusPill({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  const { t } = useStore();
  const meta = statusMeta(status);
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-medium leading-none',
        size === 'sm' ? 'px-2 py-[5px] text-[10.5px]' : 'px-2.5 py-1.5 text-[11.5px]',
      )}
      style={{ color: meta.color, background: `${meta.color}17` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {t(`status.${status}`)}
    </span>
  );
}

export function TagChip({
  name,
  onRemove,
  onClick,
  active,
}: {
  name: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
}) {
  const { db } = useStore();
  const color = db.tags.find((x) => x.name === name)?.color ?? '#8d887d';
  return (
    // Pembungkus tidak bisa jadi <button> karena tombol hapus bersarang di dalamnya
    // (tombol di dalam tombol bukan HTML yang sah). Peran dan fokus ditambahkan manual,
    // dan hanya ketika chip-nya memang bisa diklik.
    // biome-ignore lint/a11y/noStaticElementInteractions: peran, fokus, dan handler papan ketik diberikan bersamaan hanya ketika onClick ada. Aturan ini tidak bisa membuktikan hubungan bersyarat itu secara statis.
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none transition-all duration-200',
        onClick && 'cursor-pointer hover:brightness-95',
      )}
      style={{
        color: active === false ? 'var(--ink-muted)' : color,
        background: active === false ? 'transparent' : `${color}14`,
        borderColor: active === false ? 'var(--line)' : `${color}33`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-1 grid h-4 w-4 place-items-center rounded-full transition-colors hover:bg-black/10 cursor-pointer"
        >
          <Icon name="fi-rr-cross-small" className="text-[10px]" />
        </button>
      )}
    </span>
  );
}

export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { db, addTag } = useStore();
  const [draft, setDraft] = useState('');
  const palette = ['#2f6f5e', '#5b7fa6', '#b58a52', '#a6708f', '#6f7fb5', '#8a72b0', '#b06565'];

  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((x) => x !== name) : [...value, name]);

  const create = () => {
    const name = draft.trim();
    if (!name) return;
    addTag({ name, color: palette[db.tags.length % palette.length] });
    if (!value.includes(name)) onChange([...value, name]);
    setDraft('');
  };

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap gap-1.5">
        {db.tags.map((tag) => (
          <TagChip
            key={tag.name}
            name={tag.name}
            active={value.includes(tag.name)}
            onClick={() => toggle(tag.name)}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
          placeholder="+ tag baru"
          className="h-8 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-ring"
        />
        <button
          type="button"
          onClick={create}
          className="h-8 rounded-lg bg-[var(--accent-soft)] px-3 text-[12px] font-medium text-[var(--accent-ink)] transition-all hover:brightness-95 cursor-pointer"
        >
          <Icon name="fi-rr-plus" className="text-[10px]" />
        </button>
      </div>
    </div>
  );
}

export function CompanyAvatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }, [name]);
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center rounded-xl font-semibold tracking-tight',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `hsl(${hue} 32% 92%)`,
        color: `hsl(${hue} 38% 32%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="anim-fade-up mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-[var(--ink)] sm:text-[27px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function appLabel(a: Application) {
  return `${a.company} — ${a.position}`;
}
