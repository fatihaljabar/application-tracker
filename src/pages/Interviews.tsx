import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, CompanyAvatar } from '../components/shared';
import { Button, Confirm, Empty, Field, Icon, Input, Modal, SearchInput, Select, Textarea } from '../components/ui';
import type { InterviewNote } from '@shared/types';
import { fmtDate, todayISO, uid } from '../lib/utils';

const blank = (appId = ''): InterviewNote => ({
  id: '',
  appId,
  stage: 'HR Interview',
  date: todayISO(),
  qa: [{ id: uid(), q: '', a: '' }],
  feedback: '',
  strengths: '',
  weaknesses: '',
  toLearn: '',
});

const STAGES = ['Screening', 'HR Interview', 'User Interview', 'Technical Interview', 'Final Interview'];

export default function Interviews() {
  const { t, db, lang, saveNote, deleteNote } = useStore();
  const tz = db.settings.timezone;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InterviewNote>(blank());
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.notes
      .filter((n) => {
        if (!term) return true;
        const app = db.apps.find((a) => a.id === n.appId);
        return (
          (`${app?.company} ${app?.position} ${n.stage} ${n.feedback}`)
            .toLowerCase()
            .includes(term) || n.qa.some((x) => (x.q + x.a).toLowerCase().includes(term))
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db.notes, db.apps, q]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.appId) e.appId = `${t('f.application')} ${t('c.required')}`;
    if (!form.stage.trim()) e.stage = `${t('i.stage')} ${t('c.required')}`;
    setErr(e);
    if (Object.keys(e).length) return;
    saveNote({
      ...form,
      id: form.id || uid(),
      qa: form.qa.filter((x) => x.q.trim() || x.a.trim()),
    }, t('i.saved'))
    
    setOpen(false);
  };

  return (
    <>
      <PageHeader
        title={t('i.title')}
        subtitle={t('i.subtitle')}
        actions={
          <Button
            variant="primary"
            icon="fi-rr-plus"
            onClick={() => {
              setForm(blank(db.apps[0]?.id ?? ''));
              setErr({});
              setOpen(true);
            }}
          >
            {t('i.add')}
          </Button>
        }
      />

      <div className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <SearchInput value={q} onChange={setQ} placeholder={t('c.search')} />
      </div>

      {list.length === 0 ? (
        <Empty icon="fi-rr-comment-alt" title={t('c.empty')} description={t('c.emptyHint')} />
      ) : (
        <div className="mt-4 space-y-3">
          {list.map((n, i) => {
            const app = db.apps.find((a) => a.id === n.appId);
            const isOpen = expanded === n.id;
            return (
              <article
                key={n.id}
                className="anim-fade-up overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition-all duration-300"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <header className="flex items-center gap-3 p-4">
                  <CompanyAvatar name={app?.company ?? '?'} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[var(--ink)]">
                      {app?.company ?? '—'}
                    </p>
                    <p className="truncate text-[12px] text-[var(--ink-muted)]">
                      {n.stage} · {fmtDate(n.date, lang, tz)} · {n.qa.length} {t('i.question').toLowerCase()}
                    </p>
                  </div>
                  <button type="button"
                    onClick={() => {
                      setForm(n);
                      setErr({});
                      setOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    <Icon name="fi-rr-pencil" className="text-[12px]" />
                  </button>
                  <button type="button"
                    onClick={() => setConfirmId(n.id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] cursor-pointer"
                  >
                    <Icon name="fi-rr-trash" className="text-[12px]" />
                  </button>
                  <button type="button"
                    onClick={() => setExpanded(isOpen ? null : n.id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    <Icon
                      name="fi-rr-angle-small-down"
                      className={`text-[13px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </header>

                {isOpen && (
                  <div className="anim-fade space-y-4 border-t border-[var(--line)] p-4 sm:p-5">
                    {n.qa.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                          {t('i.questions')}
                        </p>
                        <div className="space-y-2.5">
                          {n.qa.map((x) => (
                            <div
                              key={x.id}
                              className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
                            >
                              <p className="flex gap-2 text-[13px] font-medium text-[var(--ink)]">
                                <Icon name="fi-rr-interrogation" className="mt-0.5 text-[11px] text-[var(--accent)]" />
                                {x.q}
                              </p>
                              {x.a && (
                                <p className="mt-1.5 pl-5 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
                                  {x.a}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: t('i.feedback'), value: n.feedback, icon: 'fi-rr-comment-alt', color: 'var(--ink-soft)' },
                        { label: t('i.strengths'), value: n.strengths, icon: 'fi-rr-check', color: 'var(--ok)' },
                        { label: t('i.weaknesses'), value: n.weaknesses, icon: 'fi-rr-exclamation', color: 'var(--danger)' },
                        { label: t('i.toLearn'), value: n.toLearn, icon: 'fi-rr-bulb', color: 'var(--warn)' },
                      ]
                        .filter((x) => x.value)
                        .map((x) => (
                          <div
                            key={x.label}
                            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
                          >
                            <p
                              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
                              style={{ color: x.color }}
                            >
                              <Icon name={x.icon} className="text-[10px]" />
                              {x.label}
                            </p>
                            <p className="text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{x.value}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={form.id ? t('c.edit') : t('i.add')}
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('f.application')} error={err.appId}>
              <Select
                value={form.appId}
                onChange={(v) => setForm((f) => ({ ...f, appId: v }))}
                placeholder={t('c.select')}
                options={db.apps.map((a) => ({ value: a.id, label: `${a.company} — ${a.position}` }))}
              />
            </Field>
            <Field label={t('i.stage')} error={err.stage}>
              <Select
                value={form.stage}
                onChange={(v) => setForm((f) => ({ ...f, stage: v }))}
                options={STAGES.map((s) => ({ value: s, label: s }))}
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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-[var(--ink-soft)]">{t('i.questions')}</span>
              <Button
                size="sm"
                variant="soft"
                icon="fi-rr-plus"
                onClick={() => setForm((f) => ({ ...f, qa: [...f.qa, { id: uid(), q: '', a: '' }] }))}
              >
                {t('i.addQA')}
              </Button>
            </div>
            <div className="space-y-2.5">
              {form.qa.map((x, idx) => (
                <div key={x.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={x.q}
                      placeholder={t('i.question')}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          qa: f.qa.map((y, j) => (j === idx ? { ...y, q: e.target.value } : y)),
                        }))
                      }
                    />
                    <button type="button"
                      onClick={() => setForm((f) => ({ ...f, qa: f.qa.filter((_, j) => j !== idx) }))}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] cursor-pointer"
                    >
                      <Icon name="fi-rr-trash" className="text-[11px]" />
                    </button>
                  </div>
                  <Textarea
                    rows={2}
                    className="mt-2"
                    value={x.a}
                    placeholder={t('i.answer')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        qa: f.qa.map((y, j) => (j === idx ? { ...y, a: e.target.value } : y)),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('i.feedback')}>
              <Textarea
                rows={3}
                value={form.feedback}
                onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
              />
            </Field>
            <Field label={t('i.strengths')}>
              <Textarea
                rows={3}
                value={form.strengths}
                onChange={(e) => setForm((f) => ({ ...f, strengths: e.target.value }))}
              />
            </Field>
            <Field label={t('i.weaknesses')}>
              <Textarea
                rows={3}
                value={form.weaknesses}
                onChange={(e) => setForm((f) => ({ ...f, weaknesses: e.target.value }))}
              />
            </Field>
            <Field label={t('i.toLearn')}>
              <Textarea
                rows={3}
                value={form.toLearn}
                onChange={(e) => setForm((f) => ({ ...f, toLearn: e.target.value }))}
              />
            </Field>
          </div>
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
          if (confirmId) deleteNote(confirmId);
          setConfirmId(null);
        }}
      />
    </>
  );
}
