import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, CompanyAvatar } from '../components/shared';
import { Empty, Icon, Progress, SectionTitle } from '../components/ui';
import { FUNNEL_ORDER, statusMeta, STATUSES } from '../lib/constants';
import type { Status } from '../lib/types';

const RANK: Record<Status, number> = {
  wishlist: 0,
  applied: 1,
  screening: 2,
  hr_interview: 3,
  user_interview: 4,
  technical_test: 4,
  offer: 5,
  accepted: 6,
  rejected: -1,
  ghosted: -1,
  withdrawn: -1,
};

export default function Statistics() {
  const { t, db } = useStore();

  const s = useMemo(() => {
    const apps = db.apps.filter((a) => !a.archived);
    const reached = (min: number) =>
      apps.filter((a) => {
        const own = RANK[a.status] >= min;
        const hist = a.history.some((h) => RANK[h.status] >= min);
        return own || hist;
      }).length;

    const applied = apps.filter((a) => a.status !== 'wishlist').length || 0;
    const screened = reached(2);
    const interviewed = reached(3);
    const offered = reached(5);
    const accepted = apps.filter((a) => a.status === 'accepted').length;

    const pct = (n: number) => (applied ? Math.round((n / applied) * 100) : 0);

    // funnel counts
    const funnel = FUNNEL_ORDER.filter((x) => x !== 'wishlist').map((st) => ({
      status: st,
      count: apps.filter(
        (a) => a.status === st || a.history.some((h) => h.status === st),
      ).length,
    }));

    // responsive companies
    const byCompany = new Map<string, { total: number; responses: number }>();
    apps.forEach((a) => {
      const cur = byCompany.get(a.company) ?? { total: 0, responses: 0 };
      cur.total += 1;
      if (a.history.length > 1 || RANK[a.status] >= 2) cur.responses += 1;
      byCompany.set(a.company, cur);
    });
    const responsive = Array.from(byCompany.entries())
      .filter(([, v]) => v.responses > 0)
      .sort((a, b) => b[1].responses - a[1].responses || b[1].total - a[1].total)
      .slice(0, 5);

    // top positions
    const byPos = new Map<string, number>();
    apps.forEach((a) => byPos.set(a.position, (byPos.get(a.position) ?? 0) + 1));
    const topPositions = Array.from(byPos.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // avg response time
    const diffs: number[] = [];
    apps.forEach((a) => {
      if (!a.appliedDate) return;
      const first = a.history.find((h) => RANK[h.status] >= 2 || h.status === 'rejected');
      if (!first) return;
      const dd = (+new Date(first.at) - +new Date(a.appliedDate + 'T00:00:00')) / 86400000;
      if (dd >= 0 && dd < 400) diffs.push(dd);
    });
    const avgResponse = diffs.length
      ? Math.round((diffs.reduce((x, y) => x + y, 0) / diffs.length) * 10) / 10
      : 0;

    // sources
    const bySource = new Map<string, number>();
    apps.forEach((a) => bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1));
    const sources = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]);

    const byWork = new Map<string, number>();
    apps.forEach((a) => byWork.set(a.workType, (byWork.get(a.workType) ?? 0) + 1));
    const workTypes = Array.from(byWork.entries()).sort((a, b) => b[1] - a[1]);

    const byStatus = STATUSES.map((st) => ({
      ...st,
      count: apps.filter((a) => a.status === st.key).length,
    })).filter((x) => x.count > 0);

    return {
      applied,
      rates: [
        { label: t('s.screeningRate'), value: pct(screened), count: screened, color: '#6f7fb5' },
        { label: t('s.interviewRate'), value: pct(interviewed), count: interviewed, color: '#8a72b0' },
        { label: t('s.offerRate'), value: pct(offered), count: offered, color: '#3f8f74' },
        { label: t('s.acceptRate'), value: pct(accepted), count: accepted, color: '#2f7d55' },
      ],
      funnel,
      responsive,
      topPositions,
      avgResponse,
      sources,
      workTypes,
      byStatus,
      total: apps.length,
    };
  }, [db.apps, t]);

  if (s.total === 0)
    return (
      <>
        <PageHeader title={t('s.title')} subtitle={t('s.subtitle')} />
        <Empty icon="fi-rr-stats" title={t('c.empty')} description={t('c.emptyHint')} />
      </>
    );

  const maxFunnel = Math.max(...s.funnel.map((f) => f.count), 1);
  const maxSource = Math.max(...s.sources.map(([, v]) => v), 1);

  return (
    <>
      <PageHeader title={t('s.title')} subtitle={t('s.subtitle')} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {s.rates.map((r, i) => (
          <div
            key={r.label}
            className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-[var(--ink-muted)]">{r.label}</span>
              <span className="text-[11px] text-[var(--ink-muted)]">
                {r.count}/{s.applied}
              </span>
            </div>
            <p
              className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em]"
              style={{ color: r.color }}
            >
              {r.value}
              <span className="text-[16px]">%</span>
            </p>
            <Progress value={r.value} color={r.color} className="mt-3.5" />
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:col-span-2">
          <SectionTitle title={t('s.funnel')} icon="fi-rr-chart-pie-alt" />
          <div className="space-y-2.5">
            {s.funnel.map((f, i) => (
              <div key={f.status} className="flex items-center gap-3">
                <span className="w-[104px] shrink-0 truncate text-[12px] text-[var(--ink-soft)]">
                  {t('status.' + f.status)}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-[var(--bg-soft)]">
                  <div
                    className="flex h-full items-center justify-end rounded-lg px-2.5 text-[11px] font-semibold text-white transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(6, (f.count / maxFunnel) * 100)}%`,
                      background: statusMeta(f.status).color,
                      transitionDelay: `${i * 60}ms`,
                    }}
                  >
                    {f.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="anim-fade-up flex flex-col justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('s.avgResponse')} icon="fi-rr-clock" />
          <p className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-[var(--accent)]">
            {s.avgResponse}
            <span className="ml-1.5 text-[15px] font-medium text-[var(--ink-muted)]">
              {t('c.days')}
            </span>
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-muted)]">
            {t('s.avgResponseDesc')}
          </p>
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('s.responsive')} icon="fi-rr-building" />
          {s.responsive.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-[var(--ink-muted)]">{t('c.empty')}</p>
          ) : (
            <div className="space-y-2.5">
              {s.responsive.map(([company, v]) => (
                <div key={company} className="flex items-center gap-3">
                  <CompanyAvatar name={company} size={34} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]">{company}</span>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-ink)]">
                    {v.responses} {t('s.responses')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('s.topPositions')} icon="fi-rr-briefcase" />
          <div className="space-y-3">
            {s.topPositions.map(([pos, n]) => (
              <div key={pos}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[12.5px] text-[var(--ink)]">{pos}</span>
                  <span className="shrink-0 text-[11.5px] text-[var(--ink-muted)]">
                    {n} {t('s.apps')}
                  </span>
                </div>
                <Progress value={(n / (s.topPositions[0]?.[1] ?? 1)) * 100} />
              </div>
            ))}
          </div>
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('s.bySource')} icon="fi-rr-link-alt" />
          <div className="space-y-2.5">
            {s.sources.map(([src, n]) => (
              <div key={src} className="flex items-center gap-3">
                <span className="w-[110px] shrink-0 truncate text-[12px] text-[var(--ink-soft)]">{src}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
                    style={{ width: `${(n / maxSource) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-[11.5px] text-[var(--ink-muted)]">{n}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('s.byWorkType')} icon="fi-rr-marker" />
          <div className="grid grid-cols-3 gap-3">
            {s.workTypes.map(([w, n]) => (
              <div
                key={w}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-center"
              >
                <p className="text-[24px] font-semibold leading-none tracking-[-0.03em] text-[var(--ink)]">
                  {n}
                </p>
                <p className="mt-1.5 text-[11.5px] text-[var(--ink-muted)]">{w}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-4">
            {s.byStatus.map((st) => (
              <span
                key={st.key}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: st.color + '15', color: st.color }}
              >
                <Icon name="fi-rr-circle-small" className="text-[8px]" />
                {t('status.' + st.key)} {st.count}
              </span>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
