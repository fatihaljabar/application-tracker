import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, CompanyAvatar } from '../components/shared';
import { Button, Confirm, Empty, Field, Icon, Input, Modal, Progress, SearchInput, Select, Textarea } from '../components/ui';
import { PREP_STATUSES } from '../lib/constants';
import type { CompanyWish, PrepStatus } from '../lib/types';
import { cx, daysUntil, fmtDate, uid } from '../lib/utils';

const PREP_COLOR: Record<PrepStatus, string> = {
  not_started: '#9a958b',
  research: '#5b7fa6',
  preparing: '#b58a52',
  ready: '#3f8f74',
};
const PREP_PCT: Record<PrepStatus, number> = {
  not_started: 8,
  research: 35,
  preparing: 68,
  ready: 100,
};

const blank = (): CompanyWish => ({
  id: '',
  company: '',
  role: '',
  prep: 'not_started',
  skills: [],
  deadline: '',
  notes: '',
});

export default function Wishlist() {
  const { t, db, lang, saveWish, deleteWish, toast } = useStore();
  const tz = db.settings.timezone;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanyWish>(blank());
  const [skillDraft, setSkillDraft] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.wishes.filter(
      (w) => !term || (`${w.company} ${w.role} ${w.skills.join(' ')}`).toLowerCase().includes(term),
    );
  }, [db.wishes, q]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.company.trim()) e.company = `${t('f.company')} ${t('c.required')}`;
    setErr(e);
    if (Object.keys(e).length) return;
    saveWish({ ...form, id: form.id || uid(), company: form.company.trim() });
    toast(`${t('c.save')} ✓`);
    setOpen(false);
  };

  const addSkill = () => {
    const s = skillDraft.trim();
    if (!s) return;
    if (!form.skills.includes(s)) setForm((f) => ({ ...f, skills: [...f.skills, s] }));
    setSkillDraft('');
  };

  return (
    <>
      <PageHeader
        title={t('w.title')}
        subtitle={t('w.subtitle')}
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
            {t('w.add')}
          </Button>
        }
      />

      <div className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <SearchInput value={q} onChange={setQ} placeholder={t('c.search')} />
      </div>

      {list.length === 0 ? (
        <Empty icon="fi-rr-target" title={t('c.empty')} description={t('c.emptyHint')} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((w, i) => {
            const dl = daysUntil(w.deadline);
            return (
              <article
                key={w.id}
                className="anim-fade-up group flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <CompanyAvatar name={w.company} size={42} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
                      {w.company}
                    </h3>
                    <p className="truncate text-[12.5px] text-[var(--ink-muted)]">{w.role || '—'}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                    <span className="text-[var(--ink-muted)]">{t('w.prep')}</span>
                    <span style={{ color: PREP_COLOR[w.prep] }} className="font-medium">
                      {t(`w.prep.${w.prep}`)}
                    </span>
                  </div>
                  <Progress value={PREP_PCT[w.prep]} color={PREP_COLOR[w.prep]} />
                </div>

                {w.skills.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                      {t('w.skills')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {w.skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--ink-soft)]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {w.notes && (
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-soft)]">{w.notes}</p>
                )}

                <div className="mt-4 flex items-center gap-2 border-t border-[var(--line)] pt-4">
                  {w.deadline && (
                    <span
                      className={cx(
                        'inline-flex items-center gap-1.5 text-[11.5px]',
                        dl !== null && dl <= 7 ? 'text-[var(--danger)]' : 'text-[var(--ink-muted)]',
                      )}
                    >
                      <Icon name="fi-rr-clock" className="text-[10px]" />
                      {fmtDate(w.deadline, lang, tz)}
                    </span>
                  )}
                  <div className="flex-1" />
                  <button type="button"
                    onClick={() => {
                      setForm(w);
                      setErr({});
                      setOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    <Icon name="fi-rr-pencil" className="text-[11px]" />
                  </button>
                  <button type="button"
                    onClick={() => setConfirmId(w.id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] cursor-pointer"
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
        title={form.id ? t('c.edit') : t('w.add')}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('f.company')} error={err.company}>
              <Input
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </Field>
            <Field label={t('w.role')} hint={t('c.optional')}>
              <Input
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              />
            </Field>
            <Field label={t('w.prep')}>
              <Select
                value={form.prep}
                onChange={(v) => setForm((f) => ({ ...f, prep: v as PrepStatus }))}
                options={PREP_STATUSES.map((p) => ({ value: p, label: t(`w.prep.${p}`) }))}
              />
            </Field>
            <Field label={t('w.personalDeadline')} hint={t('c.optional')}>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              />
            </Field>
          </div>

          <Field label={t('w.skills')}>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <div className="flex flex-wrap gap-1.5">
                {form.skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] text-[var(--ink-soft)]"
                  >
                    {s}
                    <button type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))
                      }
                      className="grid h-4 w-4 place-items-center rounded-full transition-colors hover:bg-[var(--bg-soft)] cursor-pointer"
                    >
                      <Icon name="fi-rr-cross-small" className="text-[9px]" />
                    </button>
                  </span>
                ))}
                {form.skills.length === 0 && (
                  <span className="text-[12px] text-[var(--ink-muted)]">{t('c.none')}</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="+ skill"
                  className="h-8 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-ring"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="h-8 rounded-lg bg-[var(--accent-soft)] px-3 text-[12px] font-medium text-[var(--accent-ink)] transition-all hover:brightness-95 cursor-pointer"
                >
                  <Icon name="fi-rr-plus" className="text-[10px]" />
                </button>
              </div>
            </div>
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
          if (confirmId) deleteWish(confirmId);
          setConfirmId(null);
        }}
      />
    </>
  );
}
