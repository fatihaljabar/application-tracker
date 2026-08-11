import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader } from '../components/shared';
import { Button, Confirm, Empty, Field, Icon, Input, Modal, Select, Textarea, Segmented } from '../components/ui';
import { REMINDER_ICON, REMINDER_TYPES } from '../lib/constants';
import type { Reminder, ReminderType } from '@shared/types';
import { cx, fmtDateTime, relTime, uid } from '../lib/utils';

const blank = (): Reminder => ({
  id: '',
  appId: null,
  type: 'interview',
  title: '',
  datetime: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  notes: '',
  done: false,
});

export default function Reminders() {
  const { t, db, lang, saveReminder, deleteReminder, toggleReminder, saving } = useStore();
  const tz = db.settings.timezone;
  const [filter, setFilter] = useState('open');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Reminder>(blank());
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useMemo(() => {
    const now = Date.now();
    let out = [...db.reminders];
    if (filter === 'open') out = out.filter((r) => !r.done);
    if (filter === 'done') out = out.filter((r) => r.done);
    if (filter === 'overdue') out = out.filter((r) => !r.done && +new Date(r.datetime) < now);
    return out.sort((a, b) => +new Date(a.datetime) - +new Date(b.datetime));
  }, [db.reminders, filter]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = `${t('f.title')} ${t('c.required')}`;
    if (!form.datetime) e.datetime = `${t('f.date')} ${t('c.required')}`;
    setErr(e);
    if (Object.keys(e).length) return;
    const ok = await saveReminder({
      ...form,
      id: form.id || uid(),
      title: form.title.trim(),
      datetime: new Date(form.datetime).toISOString(),
    }, t('r.saved'));
    if (!ok) return;
    setOpen(false);
  };

  const edit = (r: Reminder) => {
    setForm({ ...r, datetime: new Date(r.datetime).toISOString().slice(0, 16) });
    setErr({});
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t('r.title')}
        subtitle={t('r.subtitle')}
        actions={
          <Button
            variant="primary"
            icon="fi-rr-plus"
            onClick={() => {
              setForm(blank());
              setErr({});
              setOpen(true);
            }}
          >
            {t('r.add')}
          </Button>
        }
      />

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: t('c.upcoming') },
          { value: 'overdue', label: t('c.overdue') },
          { value: 'done', label: t('c.done') },
          { value: 'all', label: t('c.all') },
        ]}
      />

      {list.length === 0 ? (
        <Empty icon="fi-rr-bell" title={t('r.empty')} description={t('c.emptyHint')} />
      ) : (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {list.map((r, i) => {
            const app = db.apps.find((a) => a.id === r.appId);
            const overdue = !r.done && +new Date(r.datetime) < Date.now();
            return (
              <article
                key={r.id}
                className={cx(
                  'anim-fade-up group flex gap-3 rounded-2xl border bg-[var(--surface)] p-4 transition-all duration-300 hover:shadow-[var(--shadow-soft)]',
                  overdue ? 'border-[var(--danger)]/35' : 'border-[var(--line)]',
                  r.done && 'opacity-60',
                )}
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              >
                <button type="button"
                  onClick={() => toggleReminder(r.id)}
                  aria-pressed={r.done}
                  aria-label={`${t(r.done ? 'r.a11y.undone' : 'r.a11y.done')}: ${r.title}`}
                  className={cx(
                    'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-200 cursor-pointer',
                    r.done
                      ? 'border-[var(--ok)] bg-[var(--ok)] text-white'
                      : 'border-[var(--line-strong)] text-transparent hover:border-[var(--accent)]',
                  )}
                >
                  <Icon name="fi-rr-check" className="text-[10px]" />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon
                      name={REMINDER_ICON[r.type]}
                      className="text-[11px] text-[var(--ink-muted)]"
                    />
                    <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                      {t(`r.type.${r.type}`)}
                    </span>
                  </div>
                  <p
                    className={cx(
                      'mt-1 text-[13.5px] font-medium text-[var(--ink)]',
                      r.done && 'line-through',
                    )}
                  >
                    {r.title}
                  </p>
                  {r.notes && (
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-muted)]">{r.notes}</p>
                  )}
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className={overdue ? 'text-[var(--danger)]' : 'text-[var(--ink-muted)]'}>
                      {fmtDateTime(r.datetime, lang, tz)} · {relTime(r.datetime, lang)}
                    </span>
                    {app && (
                      <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[var(--ink-muted)]">
                        {app.company}
                      </span>
                    )}
                  </p>
                </div>

                {/* group-focus-within: tanpa ini tombolnya tetap opacity-0 saat
                    dijangkau papan ketik — pengguna keyboard memfokuskan sesuatu
                    yang tidak terlihat sama sekali. Tampilan dengan tetikus tidak
                    berubah: keduanya tetap muncul hanya saat kartunya disentuh. */}
                <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  <button type="button"
                    onClick={() => edit(r)}
                    aria-label={`${t('r.a11y.edit')}: ${r.title}`}
                    className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    <Icon name="fi-rr-pencil" className="text-[11px]" />
                  </button>
                  <button type="button"
                    onClick={() => setConfirmId(r.id)}
                    aria-label={`${t('r.a11y.delete')}: ${r.title}`}
                    className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] cursor-pointer"
                  >
                    <Icon name="fi-rr-trash" className="text-[11px]" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? t('c.edit') : t('r.add')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('c.cancel')}
            </Button>
            <Button variant="primary" icon="fi-rr-check" pending={saving} onClick={submit}>
              {t('c.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('f.title')} error={err.title}>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Contoh: Interview HR Tokopedia"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('f.type')}>
              <Select
                value={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v as ReminderType }))}
                options={REMINDER_TYPES.map((x) => ({ value: x, label: t(`r.type.${x}`) }))}
              />
            </Field>
            <Field label={t('f.date')} error={err.datetime}>
              <Input
                type="datetime-local"
                value={form.datetime}
                onChange={(e) => setForm((f) => ({ ...f, datetime: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t('f.application')} hint={t('c.optional')}>
            <Select
              value={form.appId ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, appId: v || null }))}
              placeholder={t('c.none')}
              options={[
                { value: '', label: t('c.none') },
                ...db.apps.map((a) => ({ value: a.id, label: `${a.company} — ${a.position}` })),
              ]}
            />
          </Field>
          <Field label={t('f.notes')} hint={t('c.optional')}>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Confirm
        open={!!confirmId}
        title={t('c.confirmDelete')}
        description={t('c.confirmDeleteDesc')}
        confirmLabel={t('c.yesDelete')}
        cancelLabel={t('c.cancel')}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) deleteReminder(confirmId);
          setConfirmId(null);
        }}
      />
    </>
  );
}
