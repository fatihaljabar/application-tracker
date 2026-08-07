import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../lib/store';
import { PageHeader, CompanyAvatar } from '../components/shared';
import { Button, Icon, Progress, SectionTitle, Segmented, Empty } from '../components/ui';
import ApplicationForm from '../components/ApplicationForm';
import { ACTIVITY_ICON, REMINDER_ICON, STATUSES, statusMeta } from '../lib/constants';
import { addDays, fmtDate, fmtDateTime, relTime, startOfWeek } from '../lib/utils';
import type { Status } from '@shared/types';

function Stat({
  icon,
  label,
  value,
  color,
  delay,
  sub,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  delay: number;
  sub?: string;
}) {
  return (
    <div
      className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-xl text-[13px]"
        style={{ background: `${color}1c`, color }}
      >
        <Icon name={icon} />
      </span>
      <p className="mt-4 text-[27px] font-semibold leading-none tracking-[-0.03em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-2 text-[12.5px] text-[var(--ink-muted)]">{label}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-[var(--ink-muted)]">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { t, db, lang } = useStore();
  const [range, setRange] = useState<'weekly' | 'monthly'>('weekly');
  const [formOpen, setFormOpen] = useState(false);
  const tz = db.settings.timezone;
  const apps = db.apps.filter((a) => !a.archived);

  const stats = useMemo(() => {
    const sent = apps.filter((a) => a.status !== 'wishlist').length;
    const interviewSet: Status[] = ['hr_interview', 'user_interview', 'technical_test'];
    const interview = apps.filter(
      (a) => interviewSet.includes(a.status) || a.history.some((h) => interviewSet.includes(h.status)),
    ).length;
    const offer = apps.filter(
      (a) => a.status === 'offer' || a.status === 'accepted' || a.history.some((h) => h.status === 'offer'),
    ).length;
    const rejected = apps.filter((a) => a.status === 'rejected').length;
    const ghosted = apps.filter((a) => a.status === 'ghosted').length;
    return { sent, interview, offer, rejected, ghosted };
  }, [apps]);

  const chart = useMemo(() => {
    const now = new Date();
    if (range === 'weekly') {
      const start = startOfWeek(now);
      const buckets: { key: string; label: string; count: number }[] = [];
      for (let w = 7; w >= 0; w--) {
        const from = addDays(start, -7 * w);
        const to = addDays(from, 7);
        const count = apps.filter((a) => {
          if (!a.appliedDate) return false;
          const d = new Date(`${a.appliedDate}T00:00:00`);
          return d >= from && d < to;
        }).length;
        buckets.push({
          key: from.toISOString(),
          label: new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
            day: 'numeric',
            month: 'short',
          }).format(from),
          count,
        });
      }
      return buckets;
    }
    const buckets: { key: string; label: string; count: number }[] = [];
    for (let m = 7; m >= 0; m--) {
      const from = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
      const count = apps.filter((a) => {
        if (!a.appliedDate) return false;
        const d = new Date(`${a.appliedDate}T00:00:00`);
        return d >= from && d < to;
      }).length;
      buckets.push({
        key: from.toISOString(),
        label: new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { month: 'short' }).format(from),
        count,
      });
    }
    return buckets;
  }, [apps, range, lang]);

  const maxCount = Math.max(1, ...chart.map((c) => c.count));

  const targets = useMemo(() => {
    const now = new Date();
    const ws = startOfWeek(now);
    const weekCount = apps.filter(
      (a) => a.appliedDate && new Date(`${a.appliedDate}T00:00:00`) >= ws,
    ).length;
    const ms = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCount = apps.filter(
      (a) => a.appliedDate && new Date(`${a.appliedDate}T00:00:00`) >= ms,
    ).length;
    return { weekCount, monthCount };
  }, [apps]);

  const distribution = useMemo(
    () =>
      STATUSES.map((s) => ({
        ...s,
        count: apps.filter((a) => a.status === s.key).length,
      })).filter((s) => s.count > 0),
    [apps],
  );
  const distTotal = distribution.reduce((n, s) => n + s.count, 0) || 1;

  const upcoming = useMemo(
    () =>
      db.reminders
        .filter((r) => !r.done && new Date(r.datetime) >= new Date(Date.now() - 86400000))
        .sort((a, b) => +new Date(a.datetime) - +new Date(b.datetime))
        .slice(0, 4),
    [db.reminders],
  );

  const recent = useMemo(
    () =>
      [...db.activities].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 6),
    [db.activities],
  );

  return (
    <>
      <PageHeader
        title={`${t('d.greeting')}, ${db.user?.name?.split(' ')[0] ?? 'Tamu'}`}
        subtitle={t('d.subtitle')}
        actions={
          <Button variant="primary" icon="fi-rr-plus" onClick={() => setFormOpen(true)}>
            {t('d.quickAdd')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat icon="fi-rr-paper-plane" label={t('d.sent')} value={stats.sent} color="#5b7fa6" delay={0} />
        <Stat icon="fi-rr-comment-alt" label={t('d.interview')} value={stats.interview} color="#8a72b0" delay={60} />
        <Stat icon="fi-rr-badge-check" label={t('d.offer')} value={stats.offer} color="#3f8f74" delay={120} />
        <Stat icon="fi-rr-cross-small" label={t('d.rejected')} value={stats.rejected} color="#b06565" delay={180} />
        <Stat icon="fi-rr-eye-crossed" label={t('d.ghosted')} value={stats.ghosted} color="#8b8b8b" delay={240} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section
          className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
          style={{ animationDelay: '300ms' }}
        >
          <SectionTitle
            title={t('d.activity')}
            icon="fi-rr-chart-histogram"
            action={
              <Segmented
                value={range}
                onChange={(v) => setRange(v as 'weekly' | 'monthly')}
                options={[
                  { value: 'weekly', label: t('d.weekly') },
                  { value: 'monthly', label: t('d.monthly') },
                ]}
              />
            }
          />
          <div className="flex h-[190px] items-end gap-2 sm:gap-3">
            {chart.map((c) => (
              <div key={c.key} className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-medium text-[var(--ink-muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {c.count}
                </span>
                <div
                  className="w-full rounded-t-lg bg-[var(--accent)] transition-all duration-500 ease-out group-hover:brightness-110"
                  style={{
                    height: `${Math.max(4, (c.count / maxCount) * 140)}px`,
                    opacity: c.count === 0 ? 0.18 : 0.55 + (c.count / maxCount) * 0.45,
                  }}
                />
                <span className="truncate text-[10.5px] text-[var(--ink-muted)]">{c.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
          style={{ animationDelay: '340ms' }}
        >
          <SectionTitle title={t('d.target')} icon="fi-rr-target" />
          <div className="space-y-5">
            {[
              {
                label: t('d.thisWeek'),
                value: targets.weekCount,
                target: db.settings.weeklyTarget,
              },
              {
                label: t('d.thisMonth'),
                value: targets.monthCount,
                target: db.settings.monthlyTarget,
              },
            ].map((row) => {
              const pct = row.target ? (row.value / row.target) * 100 : 0;
              return (
                <div key={row.label}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[12.5px] text-[var(--ink-soft)]">{row.label}</span>
                    <span className="text-[13px] font-semibold text-[var(--ink)]">
                      {row.value}
                      <span className="text-[var(--ink-muted)]"> / {row.target}</span>
                    </span>
                  </div>
                  <Progress value={pct} color={pct >= 100 ? 'var(--ok)' : 'var(--accent)'} />
                  <p className="mt-1.5 text-[11px] text-[var(--ink-muted)]">
                    {Math.round(pct)}% {t('c.of')} {t('d.target').toLowerCase()}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <SectionTitle title={t('d.pipeline')} icon="fi-rr-chart-pie-alt" />
            <div className="flex h-2 w-full overflow-hidden rounded-full">
              {distribution.map((s) => (
                <div
                  key={s.key}
                  className="h-full transition-all duration-500"
                  style={{ width: `${(s.count / distTotal) * 100}%`, background: s.color }}
                  title={t(`status.${s.key}`)}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {distribution.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {t(`status.${s.key}`)} <span className="text-[var(--ink)]">{s.count}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section
          className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
          style={{ animationDelay: '380ms' }}
        >
          <SectionTitle
            title={t('d.upcoming')}
            icon="fi-rr-bell"
            action={
              <Link to="/reminders" className="text-[12px] text-[var(--accent)] hover:underline">
                {t('c.viewAll')}
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-[var(--ink-muted)]">{t('d.noUpcoming')}</p>
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((r) => {
                const app = db.apps.find((a) => a.id === r.appId);
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 transition-colors hover:border-[var(--line-strong)]"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-soft)] text-[12px] text-[var(--ink-soft)]">
                      <Icon name={REMINDER_ICON[r.type]} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--ink)]">{r.title}</p>
                      <p className="truncate text-[11.5px] text-[var(--ink-muted)]">
                        {fmtDateTime(r.datetime, lang, tz)}
                        {app ? ` · ${app.company}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--ink-muted)]">
                      {relTime(r.datetime, lang)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
          style={{ animationDelay: '420ms' }}
        >
          <SectionTitle
            title={t('d.recent')}
            icon="fi-rr-time-past"
            action={
              <Link to="/timeline" className="text-[12px] text-[var(--accent)] hover:underline">
                {t('c.viewAll')}
              </Link>
            }
          />
          {recent.length === 0 ? (
            <Empty title={t('c.empty')} description={t('c.emptyHint')} />
          ) : (
            <ol className="relative ml-2.5 border-l border-[var(--line)] pl-5">
              {recent.map((a) => (
                <li key={a.id} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[9px] text-[var(--ink-muted)]">
                    <Icon name={ACTIVITY_ICON[a.type] ?? 'fi-rr-circle-small'} />
                  </span>
                  <p className="text-[12.5px] font-medium text-[var(--ink)]">{a.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--ink-muted)]">
                    {fmtDate(a.date, lang, tz)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section
        className="anim-fade-up mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
        style={{ animationDelay: '460ms' }}
      >
        <SectionTitle
          title={t('nav.applications')}
          icon="fi-rr-briefcase"
          action={
            <Link to="/applications" className="text-[12px] text-[var(--accent)] hover:underline">
              {t('c.viewAll')}
            </Link>
          }
        />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[...apps]
            .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
            .slice(0, 4)
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 transition-all duration-200 hover:border-[var(--line-strong)]"
              >
                <CompanyAvatar name={a.company} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--ink)]">{a.company}</p>
                  <p className="truncate text-[11.5px] text-[var(--ink-muted)]">{a.position}</p>
                </div>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: statusMeta(a.status).color }}
                />
              </div>
            ))}
        </div>
      </section>

      <ApplicationForm open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
