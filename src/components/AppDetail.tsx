import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Application } from '@shared/types';
import { Badge, Button, Icon, Modal, Select } from './ui';
import { CompanyAvatar, StatusPill, TagChip } from './shared';
import { STATUS_KEYS, ACTIVITY_ICON, statusMeta } from '../lib/constants';
import { fmtDate, fmtDateTime, salaryLabel, daysUntil, fileSize } from '../lib/utils';

export default function AppDetail({
  app,
  onClose,
  onEdit,
}: {
  app: Application | null;
  onClose: () => void;
  onEdit: (a: Application) => void;
}) {
  const { t, db, lang, moveApp, toast } = useStore();
  const [tab, setTab] = useState<'info' | 'timeline' | 'docs'>('info');
  if (!app) return null;
  const tz = db.settings.timezone;
  const acts = db.activities
    .filter((a) => a.appId === app.id)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const docs = db.docs.filter((d) => app.documentIds.includes(d.id));
  const notes = db.notes.filter((n) => n.appId === app.id);
  const dl = daysUntil(app.deadline);

  const rows: { icon: string; label: string; value: React.ReactNode }[] = [
    { icon: 'fi-rr-briefcase', label: t('f.department'), value: app.department || '—' },
    { icon: 'fi-rr-marker', label: t('f.location'), value: app.location || '—' },
    { icon: 'fi-rr-building', label: t('f.workType'), value: app.workType },
    { icon: 'fi-rr-clock', label: t('f.jobType'), value: app.jobType },
    { icon: 'fi-rr-chart-line-up', label: t('f.salary'), value: salaryLabel(app.salaryMin, app.salaryMax) },
    { icon: 'fi-rr-globe', label: t('f.source'), value: app.source || '—' },
    { icon: 'fi-rr-calendar', label: t('f.appliedDate'), value: fmtDate(app.appliedDate, lang, tz) },
    {
      icon: 'fi-rr-time-past',
      label: t('f.deadline'),
      value: app.deadline ? (
        <span className={dl !== null && dl <= 3 ? 'text-[var(--danger)]' : undefined}>
          {fmtDate(app.deadline, lang, tz)}
        </span>
      ) : (
        '—'
      ),
    },
    { icon: 'fi-rr-user', label: t('f.recruiter'), value: app.recruiterName || '—' },
  ];

  return (
    <Modal open={!!app} onClose={onClose} title={app.company} subtitle={app.position} size="lg">
      <div className="anim-fade">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] pb-5">
          <CompanyAvatar name={app.company} size={46} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={app.status} />
              {app.archived && <Badge>{t('c.archived')}</Badge>}
              {app.favorite && (
                <Badge color="#b58a52">
                  <Icon name="fi-rr-star" className="text-[9px]" /> {t('c.favorite')}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              size="sm"
              className="w-[168px]"
              value={app.status}
              onChange={(v) => {
                moveApp(app.id, v as Application['status']);
                toast(t('p.moved'));
              }}
              options={STATUS_KEYS.map((s) => ({
                value: s,
                label: t(`status.${s}`),
                color: statusMeta(s).color,
              }))}
            />
            <Button size="sm" icon="fi-rr-pencil" onClick={() => onEdit(app)}>
              {t('c.edit')}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-1 rounded-full bg-[var(--surface-2)] p-1 text-[12.5px]">
          {(['info', 'timeline', 'docs'] as const).map((k) => (
            <button type="button"
              key={k}
              onClick={() => setTab(k)}
              className={
                'flex-1 rounded-full px-3 py-2 font-medium transition-all duration-200 cursor-pointer ' +
                (tab === k
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-soft)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]')
              }
            >
              {k === 'info' ? t('c.detail') : k === 'timeline' ? t('nav.timeline') : t('f.documents')}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="anim-fade mt-5 space-y-5">
            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-start gap-3">
                  <Icon name={r.icon} className="mt-0.5 text-[12px] text-[var(--ink-muted)]" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                      {r.label}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink)]">{r.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {(app.recruiterEmail || app.recruiterPhone || app.url) && (
              <div className="flex flex-wrap gap-2">
                {app.url && (
                  <a href={app.url} target="_blank" rel="noreferrer">
                    <Button size="sm" icon="fi-rr-link-alt">{t('f.url')}</Button>
                  </a>
                )}
                {app.recruiterEmail && (
                  <a href={`mailto:${app.recruiterEmail}`}>
                    <Button size="sm" icon="fi-rr-envelope">{app.recruiterEmail}</Button>
                  </a>
                )}
                {app.recruiterPhone && (
                  <a
                    href={`https://wa.me/${app.recruiterPhone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm" icon="fi-rr-phone-call">{app.recruiterPhone}</Button>
                  </a>
                )}
              </div>
            )}

            {app.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {app.tags.map((tg) => (
                  <TagChip key={tg} name={tg} />
                ))}
              </div>
            )}

            {app.notes && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  {t('f.notes')}
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink-soft)]">
                  {app.notes}
                </p>
              </div>
            )}

            {notes.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  {t('nav.interviews')}
                </p>
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3"
                    >
                      <p className="text-[12.5px] font-medium text-[var(--ink)]">
                        {n.stage} · {fmtDate(n.date, lang, tz)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] text-[var(--ink-muted)]">
                        {n.feedback || n.qa[0]?.q || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'timeline' && (
          <div className="anim-fade mt-5">
            {acts.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--ink-muted)]">{t('c.empty')}</p>
            ) : (
              <ol className="relative ml-3 border-l border-[var(--line)] pl-6">
                {acts.map((a) => (
                  <li key={a.id} className="relative pb-6 last:pb-0">
                    <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[10px] text-[var(--ink-muted)]">
                      <Icon name={ACTIVITY_ICON[a.type] ?? 'fi-rr-circle-small'} />
                    </span>
                    <p className="text-[13px] font-medium text-[var(--ink)]">{a.title}</p>
                    {a.description && (
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
                        {a.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11.5px] text-[var(--ink-muted)]">
                      {fmtDateTime(a.date, lang, tz)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <div className="anim-fade mt-5 space-y-2">
            {docs.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--ink-muted)]">{t('c.empty')}</p>
            ) : (
              docs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--bg-soft)] text-[13px] text-[var(--ink-muted)]">
                    <Icon name="fi-rr-document" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--ink)]">{d.label}</p>
                    <p className="truncate text-[11.5px] text-[var(--ink-muted)]">
                      {t(`doc.cat.${d.category}`)} · {d.version} · {fileSize(d.size)}
                    </p>
                  </div>
                  {d.dataUrl && (
                    <a href={d.dataUrl} download={d.name}>
                      <Button size="icon" variant="ghost" icon="fi-rr-download" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
