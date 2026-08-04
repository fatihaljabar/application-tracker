import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, CompanyAvatar, TagChip } from '../components/shared';
import { Button, Icon, SearchInput } from '../components/ui';
import ApplicationForm from '../components/ApplicationForm';
import AppDetail from '../components/AppDetail';
import { STATUSES } from '../lib/constants';
import type { Application, Status } from '@shared/types';
import { cx, daysUntil, fmtDate } from '../lib/utils';

export default function Pipeline() {
  const { t, db, lang, moveApp } = useStore();
  const tz = db.settings.timezone;
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [detail, setDetail] = useState<Application | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [presetStatus, setPresetStatus] = useState<Status>('wishlist');

  const apps = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.apps.filter(
      (a) =>
        !a.archived &&
        (!term || (`${a.company} ${a.position}`).toLowerCase().includes(term)),
    );
  }, [db.apps, q]);

  const drop = (status: Status) => {
    if (dragId) {
      const app = db.apps.find((a) => a.id === dragId);
      if (app && app.status !== status) {
        moveApp(dragId, status, `${app.company} → ${t(`status.${status}`)}`);
      }
    }
    setDragId(null);
    setOverCol(null);
  };

  return (
    <>
      <PageHeader
        title={t('p.title')}
        subtitle={t('p.subtitle')}
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder={t('c.search')} className="w-[210px]" />
            <Button
              variant="primary"
              icon="fi-rr-plus"
              onClick={() => {
                setEditing(null);
                setPresetStatus('wishlist');
                setFormOpen(true);
              }}
            >
              {t('a.new')}
            </Button>
          </>
        }
      />

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7">
        <div className="flex min-w-max gap-3">
          {STATUSES.map((s, ci) => {
            const items = apps.filter((a) => a.status === s.key);
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: kolom hanya target lepas untuk mouse. Pengguna papan ketik memindahkan status lewat pilihan status di halaman detail, jadi tidak ada jalur yang hilang.
              <section
                key={s.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(s.key);
                }}
                onDragLeave={() => setOverCol((c) => (c === s.key ? null : c))}
                onDrop={() => drop(s.key)}
                className={cx(
                  'anim-fade-up flex w-[264px] shrink-0 flex-col rounded-2xl border bg-[var(--surface-2)] transition-all duration-200',
                  overCol === s.key
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)]',
                )}
                style={{ animationDelay: `${ci * 30}ms` }}
              >
                <header className="flex items-center gap-2 px-3.5 py-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <h3 className="flex-1 truncate text-[12.5px] font-semibold text-[var(--ink)]">
                    {t(`status.${s.key}`)}
                  </h3>
                  <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                    {items.length}
                  </span>
                </header>

                <div className="flex max-h-[calc(100vh-260px)] min-h-[110px] flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
                  {items.map((a) => {
                    const dl = daysUntil(a.deadline);
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: kartu ini sekaligus sumber seret HTML5 dan berisi elemen blok, dua hal yang tidak sah di dalam <button> asli.
                      <div
                        key={a.id}
                        draggable
                        onDragStart={() => setDragId(a.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        onClick={() => setDetail(a)}
                        // Seret-dan-lepas tidak berfungsi dengan papan ketik maupun layar sentuh.
                        // Kartu harus tetap bisa difokus dan dibuka dengan Enter atau Spasi;
                        // pemindahan status dilakukan lewat pilihan status di halaman detail.
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetail(a);
                          }
                        }}
                        aria-label={`${a.company} — ${a.position}`}
                        className={cx(
                          'cursor-grab rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition-all duration-200 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-soft)] active:cursor-grabbing',
                          dragId === a.id && 'dragging',
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <CompanyAvatar name={a.company} size={30} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-semibold text-[var(--ink)]">
                              {a.company}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--ink-muted)]">
                              {a.position}
                            </p>
                          </div>
                          {a.favorite && (
                            <Icon name="fi-rr-star" className="text-[10px] text-[var(--warn)]" />
                          )}
                        </div>
                        {a.tags.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {a.tags.slice(0, 2).map((tg) => (
                              <TagChip key={tg} name={tg} />
                            ))}
                          </div>
                        )}
                        <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-[var(--ink-muted)]">
                          <span>{a.appliedDate ? fmtDate(a.appliedDate, lang, tz) : a.workType}</span>
                          {dl !== null && dl >= 0 && dl <= 7 && (
                            <span className="rounded-full bg-[var(--danger)]/12 px-1.5 py-0.5 font-medium text-[var(--danger)]">
                              {dl} {t('c.days')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <button type="button"
                    onClick={() => {
                      setEditing(null);
                      setPresetStatus(s.key);
                      setFormOpen(true);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line-strong)] py-2.5 text-[11.5px] text-[var(--ink-muted)] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                  >
                    <Icon name="fi-rr-plus" className="text-[9px]" /> {t('c.add')}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <ApplicationForm
        open={formOpen}
        editing={editing}
        presetStatus={presetStatus}
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
    </>
  );
}
