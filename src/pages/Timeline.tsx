import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader } from '../components/shared';
import { Button, Confirm, Empty, Field, Icon, Input, Modal, SearchInput, Select, Textarea } from '../components/ui';
import { ACTIVITY_ICON } from '../lib/constants';
import type { ActivityType } from '@shared/types';
import { fmtDateTime, relTime, todayISO } from '../lib/utils';

const TYPES: ActivityType[] = ['created', 'status', 'email', 'interview', 'test', 'followup', 'offer', 'note', 'document'];

export default function Timeline() {
  const { t, db, lang, addActivity, deleteActivity, toast } = useStore();
  const tz = db.settings.timezone;
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [appId, setAppId] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState({
    appId: '',
    type: 'note' as ActivityType,
    title: '',
    description: '',
    date: todayISO(),
  });
  const [err, setErr] = useState('');

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.activities
      .filter((a) => !term || (`${a.title} ${a.description}`).toLowerCase().includes(term))
      .filter((a) => !type || a.type === type)
      .filter((a) => !appId || a.appId === appId)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [db.activities, q, type, appId]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof list>();
    list.forEach((a) => {
      const key = a.date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), a]);
    });
    return Array.from(map.entries());
  }, [list]);

  const submit = () => {
    if (!form.title.trim()) {
      setErr(`${t('f.title')} ${t('c.required')}`);
      return;
    }
    addActivity({
      appId: form.appId || null,
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      date: new Date(`${form.date}T${new Date().toTimeString().slice(0, 5)}`).toISOString(),
    });
    toast(t('t.added'));
    setOpen(false);
    setForm({ appId: '', type: 'note', title: '', description: '', date: todayISO() });
    setErr('');
  };

  return (
    <>
      <PageHeader
        title={t('t.title')}
        subtitle={t('t.subtitle')}
        actions={
          <Button variant="primary" icon="fi-rr-plus" onClick={() => setOpen(true)}>
            {t('t.add')}
          </Button>
        }
      />

      <div className="anim-fade-up flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:p-5">
        <SearchInput value={q} onChange={setQ} placeholder={t('c.search')} className="flex-1" />
        <Select
          className="sm:w-[168px]"
          value={type}
          onChange={setType}
          placeholder={t('f.type')}
          options={[{ value: '', label: t('c.all') }, ...TYPES.map((x) => ({ value: x, label: t(`t.type.${x}`) }))]}
        />
        <Select
          className="sm:w-[190px]"
          value={appId}
          onChange={setAppId}
          placeholder={t('f.application')}
          options={[
            { value: '', label: t('c.all') },
            ...db.apps.map((a) => ({ value: a.id, label: `${a.company} — ${a.position}` })),
          ]}
        />
      </div>

      {grouped.length === 0 ? (
        <Empty icon="fi-rr-time-past" title={t('c.empty')} description={t('c.emptyHint')} />
      ) : (
        <div className="mt-5 space-y-7">
          {grouped.map(([day, items], gi) => (
            <section key={day} className="anim-fade-up" style={{ animationDelay: `${gi * 40}ms` }}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                  {new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: tz,
                  }).format(new Date(`${day}T00:00:00`))}
                </span>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <ol className="relative ml-3 border-l border-[var(--line)] pl-6">
                {items.map((a) => {
                  const app = db.apps.find((x) => x.id === a.appId);
                  return (
                    <li key={a.id} className="group relative pb-5 last:pb-0">
                      <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[10px] text-[var(--ink-muted)] transition-colors group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]">
                        <Icon name={ACTIVITY_ICON[a.type] ?? 'fi-rr-circle-small'} />
                      </span>
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 transition-all duration-200 hover:border-[var(--line-strong)]">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-medium text-[var(--ink)]">{a.title}</p>
                            {a.description && (
                              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
                                {a.description}
                              </p>
                            )}
                            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-muted)]">
                              <span>{fmtDateTime(a.date, lang, tz)}</span>
                              <span>· {relTime(a.date, lang)}</span>
                              {app && (
                                <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5">
                                  {app.company}
                                </span>
                              )}
                            </p>
                          </div>
                          {/* Sama seperti di Pengingat dan Dokumen: varian hover
                              tidak pernah berlaku di layar sentuh, jadi menghapus
                              aktivitas (PRD § 6.5) mustahil dari ponsel. */}
                          <button type="button"
                            onClick={() => setConfirmId(a.id)}
                            aria-label={`${t('c.delete')}: ${a.title}`}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] opacity-0 transition-all duration-200 hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 cursor-pointer"
                          >
                            <Icon name="fi-rr-trash" className="text-[11px]" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('t.add')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('c.cancel')}
            </Button>
            <Button variant="primary" icon="fi-rr-check" onClick={submit}>
              {t('c.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('f.title')} error={err}>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('t.titlePlaceholder')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('f.type')}>
              <Select
                value={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v as ActivityType }))}
                options={TYPES.map((x) => ({ value: x, label: t(`t.type.${x}`) }))}
              />
            </Field>
            <Field label={t('f.date')}>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t('f.application')} hint={t('c.optional')}>
            <Select
              value={form.appId}
              onChange={(v) => setForm((f) => ({ ...f, appId: v }))}
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
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
          if (confirmId) deleteActivity(confirmId);
          setConfirmId(null);
        }}
      />
    </>
  );
}
