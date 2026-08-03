import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader } from '../components/shared';
import { Button, Icon } from '../components/ui';
import { REMINDER_ICON } from '../lib/constants';
import { cx, fmtDateTime, sameDay } from '../lib/utils';

interface Ev {
  id: string;
  date: Date;
  title: string;
  kind: 'interview' | 'technical_test' | 'followup' | 'deadline' | 'cv_validity';
  meta: string;
  done: boolean;
}

const KIND_COLOR: Record<Ev['kind'], string> = {
  interview: '#8a72b0',
  technical_test: '#b58a52',
  followup: '#5b7fa6',
  deadline: '#b06565',
  cv_validity: '#3f8f74',
};

export default function Calendar() {
  const { t, db, lang } = useStore();
  const tz = db.settings.timezone;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(new Date());

  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = db.reminders.map((r) => ({
      id: `r-${r.id}`,
      date: new Date(r.datetime),
      title: r.title,
      kind: r.type,
      meta: db.apps.find((a) => a.id === r.appId)?.company ?? t(`r.type.${r.type}`),
      done: r.done,
    })) as Ev[];
    db.apps
      .filter((a) => a.deadline && !a.archived)
      .forEach((a) => {
        out.push({
          id: `d-${a.id}`,
          date: new Date(`${a.deadline}T23:59:00`),
          title: `${t('f.deadline')} · ${a.company}`,
          kind: 'deadline',
          meta: a.position,
          done: false,
        });
      });
    db.bookmarks
      .filter((b) => b.deadline)
      .forEach((b) => {
        out.push({
          id: `b-${b.id}`,
          date: new Date(`${b.deadline}T23:59:00`),
          title: `${t('f.deadline')} · ${b.company}`,
          kind: 'deadline',
          meta: b.position,
          done: false,
        });
      });
    return out.sort((a, b) => +a.date - +b.date);
  }, [db.reminders, db.apps, db.bookmarks, t]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(cursor.getFullYear(), cursor.getMonth(), 1 - startOffset + i));
    }
    return days;
  }, [cursor]);

  const dayEvents = (d: Date) => events.filter((e) => sameDay(e.date, d));
  const selectedEvents = dayEvents(selected);

  const weekdays =
    lang === 'id'
      ? ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      <PageHeader
        title={t('cal.title')}
        subtitle={t('cal.subtitle')}
        actions={
          <Button
            icon="fi-rr-calendar"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(now);
            }}
          >
            {t('cal.today')}
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
                month: 'long',
                year: 'numeric',
              }).format(cursor)}
            </h2>
            <div className="flex gap-1">
              <button type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-soft)] cursor-pointer"
              >
                <Icon name="fi-rr-angle-left" className="text-[11px]" />
              </button>
              <button type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-soft)] cursor-pointer"
              >
                <Icon name="fi-rr-angle-right" className="text-[11px]" />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-7 gap-1">
            {weekdays.map((w) => (
              <div
                key={w}
                className="pb-2 text-center text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]"
              >
                {w}
              </div>
            ))}
            {grid.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const evs = dayEvents(d);
              const isToday = sameDay(d, new Date());
              const isSel = sameDay(d, selected);
              return (
                <button
                  type="button"
                  key={d.toISOString()}
                  onClick={() => setSelected(d)}
                  className={cx(
                    'flex aspect-square flex-col items-center justify-start gap-1 rounded-xl p-1.5 transition-all duration-200 cursor-pointer sm:p-2',
                    isSel
                      ? 'bg-[var(--accent)] text-white'
                      : isToday
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : inMonth
                          ? 'text-[var(--ink)] hover:bg-[var(--bg-soft)]'
                          : 'text-[var(--ink-muted)]/50 hover:bg-[var(--bg-soft)]',
                  )}
                >
                  <span className="text-[12px] font-medium leading-none">{d.getDate()}</span>
                  <span className="flex flex-wrap justify-center gap-[3px]">
                    {evs.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: isSel ? '#ffffffcc' : KIND_COLOR[e.kind] }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--line)] pt-4">
            {(Object.keys(KIND_COLOR) as Ev['kind'][]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
                {t(`r.type.${k}`)}
              </span>
            ))}
          </div>
        </section>

        <aside className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {t('cal.agenda')}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            {new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(selected)}
          </h3>

          <div className="mt-4 space-y-2.5">
            {selectedEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-[12.5px] text-[var(--ink-muted)]">
                {t('cal.noEvent')}
              </p>
            ) : (
              selectedEvents.map((e) => (
                <div
                  key={e.id}
                  className={cx(
                    'flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 transition-all duration-200 hover:border-[var(--line-strong)]',
                    e.done && 'opacity-55',
                  )}
                >
                  <span
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px]"
                    style={{ background: `${KIND_COLOR[e.kind]}1c`, color: KIND_COLOR[e.kind] }}
                  >
                    <Icon name={REMINDER_ICON[e.kind]} />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cx(
                        'text-[13px] font-medium text-[var(--ink)]',
                        e.done && 'line-through',
                      )}
                    >
                      {e.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-muted)]">{e.meta}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                      {fmtDateTime(e.date.toISOString(), lang, tz)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
