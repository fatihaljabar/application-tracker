import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, StatusPill, TagChip, CompanyAvatar } from '../components/shared';
import {
  Button,
  Confirm,
  Empty,
  Icon,
  Menu,
  SearchInput,
  Select,
  Toggle,
  Segmented,
} from '../components/ui';
import ApplicationForm from '../components/ApplicationForm';
import AppDetail from '../components/AppDetail';
import { STATUS_KEYS, WORK_TYPES, statusMeta } from '../lib/constants';
import type { Application } from '@shared/types';
import { cx, daysUntil, fmtDate, salaryLabel } from '../lib/utils';

export default function Applications() {
  const { t, db, lang, deleteApp, duplicateApp, toggleArchive, toggleFavorite, toast } = useStore();
  const tz = db.settings.timezone;

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [workType, setWorkType] = useState('');
  const [location, setLocation] = useState('');
  const [tag, setTag] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [showArchived, setShowArchived] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [detail, setDetail] = useState<Application | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const locations = useMemo(
    () => Array.from(new Set(db.apps.map((a) => a.location).filter(Boolean))).sort(),
    [db.apps],
  );

  const list = useMemo(() => {
    let out = db.apps.filter((a) => (showArchived ? true : !a.archived));
    const term = q.trim().toLowerCase();
    if (term)
      out = out.filter((a) =>
        [a.company, a.position, a.location, a.department, a.source, a.notes]
          .join(' ')
          .toLowerCase()
          .includes(term),
      );
    if (status) out = out.filter((a) => a.status === status);
    if (workType) out = out.filter((a) => a.workType === workType);
    if (location) out = out.filter((a) => a.location === location);
    if (tag) out = out.filter((a) => a.tags.includes(tag));
    if (minSalary) out = out.filter((a) => (a.salaryMax ?? a.salaryMin ?? 0) >= Number(minSalary));
    if (from) out = out.filter((a) => a.appliedDate && a.appliedDate >= from);
    if (to) out = out.filter((a) => a.appliedDate && a.appliedDate <= to);

    const sorted = [...out];
    if (sort === 'newest') sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (sort === 'oldest') sorted.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    if (sort === 'company') sorted.sort((a, b) => a.company.localeCompare(b.company));
    if (sort === 'deadline')
      sorted.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    if (sort === 'favorite') sorted.sort((a, b) => Number(b.favorite) - Number(a.favorite));
    return sorted;
  }, [db.apps, q, status, workType, location, tag, minSalary, from, to, sort, showArchived]);

  const reset = () => {
    setQ('');
    setStatus('');
    setWorkType('');
    setLocation('');
    setTag('');
    setMinSalary('');
    setFrom('');
    setTo('');
  };

  const activeFilters =
    [status, workType, location, tag, minSalary, from, to].filter(Boolean).length + (q ? 1 : 0);

  const menuFor = (a: Application) => [
    { label: t('c.detail'), icon: 'fi-rr-eye', onClick: () => setDetail(a) },
    {
      label: t('c.edit'),
      icon: 'fi-rr-pencil',
      onClick: () => {
        setEditing(a);
        setFormOpen(true);
      },
    },
    {
      label: t('c.duplicate'),
      icon: 'fi-rr-duplicate',
      onClick: () => {
        duplicateApp(a.id);
        toast(t('a.duplicated'));
      },
    },
    {
      label: a.archived ? t('c.unarchive') : t('c.archive'),
      icon: 'fi-rr-archive',
      onClick: () => {
        toggleArchive(a.id);
        toast(a.archived ? t('c.unarchive') : t('a.archivedMsg'), 'info');
      },
    },
    {
      label: t('c.favorite'),
      icon: 'fi-rr-star',
      onClick: () => toggleFavorite(a.id),
    },
    { label: t('c.delete'), icon: 'fi-rr-trash', danger: true, onClick: () => setConfirmId(a.id) },
  ];

  return (
    <>
      <PageHeader
        title={t('a.title')}
        subtitle={t('a.subtitle')}
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => setView(v as 'grid' | 'list')}
              options={[
                { value: 'grid', label: t('a.grid'), icon: 'fi-rr-apps' },
                { value: 'list', label: t('a.list'), icon: 'fi-rr-list' },
              ]}
            />
            <Button
              variant="primary"
              icon="fi-rr-plus"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('a.new')}
            </Button>
          </>
        }
      />

      <div className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={q} onChange={setQ} placeholder={t('a.searchPh')} className="flex-1" />
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-[150px]"
              value={status}
              onChange={setStatus}
              placeholder={t('f.status')}
              options={[
                { value: '', label: t('c.all') },
                ...STATUS_KEYS.map((s) => ({
                  value: s,
                  label: t(`status.${s}`),
                  color: statusMeta(s).color,
                })),
              ]}
            />
            <Select
              className="w-[132px]"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'newest', label: t('c.newest') },
                { value: 'oldest', label: t('c.oldest') },
                { value: 'company', label: t('c.company_az') },
                { value: 'deadline', label: t('c.deadlineSoon') },
                { value: 'favorite', label: t('c.favorite') },
              ]}
            />
            <Button
              icon="fi-rr-filter"
              onClick={() => setAdvanced((v) => !v)}
              className={cx(advanced && 'border-[var(--accent)] text-[var(--accent-ink)]')}
            >
              {t('c.filter')}
              {activeFilters > 0 && (
                <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-white">
                  {activeFilters}
                </span>
              )}
            </Button>
          </div>
        </div>

        {advanced && (
          <div className="anim-fade mt-4 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              value={workType}
              onChange={setWorkType}
              placeholder={t('f.workType')}
              options={[{ value: '', label: t('c.all') }, ...WORK_TYPES.map((w) => ({ value: w, label: w }))]}
            />
            <Select
              value={location}
              onChange={setLocation}
              placeholder={t('f.location')}
              options={[{ value: '', label: t('c.all') }, ...locations.map((l) => ({ value: l, label: l }))]}
            />
            <Select
              value={tag}
              onChange={setTag}
              placeholder={t('f.tags')}
              options={[
                { value: '', label: t('c.all') },
                ...db.tags.map((x) => ({ value: x.name, label: x.name, color: x.color })),
              ]}
            />
            <input
              type="number"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
              placeholder={t('a.minSalary')}
              className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-ring"
            />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--ink-muted)]">{t('a.dateFrom')}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] text-[var(--ink)] focus-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--ink-muted)]">{t('a.dateTo')}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] text-[var(--ink)] focus-ring"
              />
            </label>
            {/* Bukan <label>: Toggle adalah tombol role="switch", bukan kontrol form,
                jadi label pembungkus tidak pernah berfungsi. Namanya diberikan lewat aria-label. */}
            <div className="flex items-center gap-3 self-end rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5">
              <Toggle
                checked={showArchived}
                onChange={setShowArchived}
                aria-label={t('a.showArchived')}
              />
              <span className="text-[12.5px] text-[var(--ink-soft)]">{t('a.showArchived')}</span>
            </div>
            <Button variant="ghost" icon="fi-rr-refresh" onClick={reset} className="self-end">
              {t('c.reset')}
            </Button>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] text-[var(--ink-muted)]">
        {list.length} {t('c.results')}
      </p>

      {list.length === 0 ? (
        <Empty
          icon="fi-rr-briefcase"
          title={t('c.empty')}
          description={t('c.emptyHint')}
          action={
            <Button variant="soft" icon="fi-rr-plus" onClick={() => setFormOpen(true)}>
              {t('a.new')}
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a, i) => {
            const dl = daysUntil(a.deadline);
            return (
              <article
                key={a.id}
                className="anim-fade-up group flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-soft)]"
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              >
                <div className="flex items-start gap-3">
                  <CompanyAvatar name={a.company} size={42} />
                  <div className="min-w-0 flex-1">
                    <button type="button"
                      onClick={() => setDetail(a)}
                      className="block max-w-full truncate text-left text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink)] transition-colors hover:text-[var(--accent)] cursor-pointer"
                    >
                      {a.company}
                    </button>
                    <p className="truncate text-[12.5px] text-[var(--ink-muted)]">{a.position}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button type="button"
                      onClick={() => toggleFavorite(a.id)}
                      className={cx(
                        'grid h-8 w-8 place-items-center rounded-full transition-all duration-200 cursor-pointer',
                        a.favorite
                          ? 'text-[var(--warn)]'
                          : 'text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--ink)]',
                      )}
                    >
                      <Icon name="fi-rr-star" className="text-[12px]" />
                    </button>
                    <Menu items={menuFor(a)} />
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                  <StatusPill status={a.status} size="sm" />
                  {a.archived && (
                    <span className="rounded-full bg-[var(--bg-soft)] px-2 py-[5px] text-[10.5px] text-[var(--ink-muted)]">
                      {t('c.archived')}
                    </span>
                  )}
                </div>

                <dl className="mt-3.5 space-y-1.5 text-[12px] text-[var(--ink-muted)]">
                  <div className="flex items-center gap-2">
                    <Icon name="fi-rr-marker" className="text-[11px]" />
                    <span className="truncate">
                      {a.location || '—'} · {a.workType} · {a.jobType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon name="fi-rr-chart-line-up" className="text-[11px]" />
                    <span>{salaryLabel(a.salaryMin, a.salaryMax)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon name="fi-rr-calendar" className="text-[11px]" />
                    <span>{a.appliedDate ? fmtDate(a.appliedDate, lang, tz) : '—'}</span>
                    {dl !== null && dl >= 0 && dl <= 7 && (
                      <span className="ml-auto rounded-full bg-[var(--danger)]/12 px-2 py-0.5 text-[10.5px] font-medium text-[var(--danger)]">
                        {t('f.deadline')} {dl}{t('c.days').slice(0, 1)}
                      </span>
                    )}
                  </div>
                </dl>

                {a.tags.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3.5">
                    {a.tags.slice(0, 3).map((tg) => (
                      <TagChip key={tg} name={tg} />
                    ))}
                    {a.tags.length > 3 && (
                      <span className="text-[11px] text-[var(--ink-muted)]">+{a.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="anim-fade-up mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  <th className="px-5 py-3 font-medium">{t('f.company')}</th>
                  <th className="px-5 py-3 font-medium">{t('f.position')}</th>
                  <th className="px-5 py-3 font-medium">{t('f.status')}</th>
                  <th className="px-5 py-3 font-medium">{t('f.location')}</th>
                  <th className="px-5 py-3 font-medium">{t('f.appliedDate')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--line)] text-[13px] transition-colors last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-5 py-3">
                      <button type="button"
                        onClick={() => setDetail(a)}
                        className="font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent)] cursor-pointer"
                      >
                        {a.company}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-[var(--ink-soft)]">{a.position}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={a.status} size="sm" />
                    </td>
                    <td className="px-5 py-3 text-[var(--ink-muted)]">{a.location || '—'}</td>
                    <td className="px-5 py-3 text-[var(--ink-muted)]">
                      {a.appliedDate ? fmtDate(a.appliedDate, lang, tz) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Menu items={menuFor(a)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ApplicationForm
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <AppDetail
        app={detail}
        onClose={() => setDetail(null)}
        onEdit={(a) => {
          setDetail(null);
          setEditing(a);
          setFormOpen(true);
        }}
      />
      <Confirm
        open={!!confirmId}
        title={t('c.confirmDelete')}
        description={t('c.confirmDeleteDesc')}
        confirmLabel={t('c.yesDelete')}
        cancelLabel={t('c.cancel')}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) deleteApp(confirmId);
          setConfirmId(null);
          toast(t('a.deleted'), 'info');
        }}
      />
    </>
  );
}
