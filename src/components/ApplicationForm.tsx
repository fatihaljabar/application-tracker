import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select, Textarea, Icon } from './ui';
import { TagPicker } from './shared';
import { useStore } from '../lib/store';
import { JOB_TYPES, SOURCES, STATUS_KEYS, STATUSES, WORK_TYPES } from '../lib/constants';
import type { Application, JobType, Status, WorkType } from '../lib/types';
import { cx, fileSize, todayISO } from '../lib/utils';

const blank = (): Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'history'> => ({
  company: '',
  position: '',
  department: '',
  location: '',
  workType: 'Remote',
  jobType: 'Full Time',
  salaryMin: null,
  salaryMax: null,
  source: 'LinkedIn',
  url: '',
  appliedDate: todayISO(),
  deadline: '',
  recruiterName: '',
  recruiterEmail: '',
  recruiterPhone: '',
  notes: '',
  status: 'applied',
  tags: [],
  documentIds: [],
  archived: false,
  favorite: false,
});

export default function ApplicationForm({
  open,
  onClose,
  editing,
  presetStatus,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Application | null;
  presetStatus?: Status;
}) {
  const { t, db, addApp, saveApp, toast } = useStore();
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'main' | 'contact' | 'docs'>('main');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTab('main');
    if (editing) {
      const { id: _i, createdAt: _c, updatedAt: _u, history: _h, ...rest } = editing;
      setForm(rest);
    } else {
      setForm({ ...blank(), status: presetStatus ?? 'applied' });
    }
  }, [open, editing, presetStatus]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.company.trim()) e.company = `${t('f.company')} ${t('c.required')}`;
    if (!form.position.trim()) e.position = `${t('f.position')} ${t('c.required')}`;
    if (form.url && !/^https?:\/\//i.test(form.url)) e.url = 'URL harus diawali http:// atau https://';
    if (form.recruiterEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.recruiterEmail))
      e.recruiterEmail = 'Format email tidak valid';
    if (
      form.salaryMin !== null &&
      form.salaryMax !== null &&
      form.salaryMin > form.salaryMax
    )
      e.salaryMax = 'Gaji maksimum harus lebih besar';
    setErrors(e);
    if (Object.keys(e).length) setTab(e.recruiterEmail ? 'contact' : 'main');
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    if (editing) {
      saveApp({ ...editing, ...form });
    } else {
      addApp(form);
    }
    toast(t('a.saved'));
    onClose();
  };

  const tabs = [
    { key: 'main', label: t('c.detail'), icon: 'fi-rr-briefcase' },
    { key: 'contact', label: t('f.recruiter'), icon: 'fi-rr-user' },
    { key: 'docs', label: t('f.documents'), icon: 'fi-rr-document' },
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? t('a.editApp') : t('a.new')}
      subtitle={editing ? `${editing.company} · ${editing.position}` : t('a.subtitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('c.cancel')}
          </Button>
          <Button variant="primary" icon="fi-rr-check" onClick={submit}>
            {t('c.save')}
          </Button>
        </>
      }
    >
      <div className="mb-6 flex gap-1 border-b border-[var(--line)]">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            className={cx(
              'relative -mb-px flex items-center gap-2 px-3.5 pb-3 pt-1 text-[13px] font-medium transition-colors duration-200 cursor-pointer',
              tab === x.key
                ? 'text-[var(--ink)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-soft)]',
            )}
          >
            <Icon name={x.icon} className="text-[12px]" />
            {x.label}
            {tab === x.key && (
              <span className="anim-fade absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        ))}
      </div>

      {tab === 'main' && (
        <div className="anim-fade grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('f.company')} required error={errors.company}>
            <Input
              value={form.company}
              onChange={(e) => set('company', e.target.value)}
              placeholder="Tokopedia"
            />
          </Field>
          <Field label={t('f.position')} required error={errors.position}>
            <Input
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              placeholder="Frontend Engineer"
            />
          </Field>
          <Field label={t('f.department')}>
            <Input
              value={form.department}
              onChange={(e) => set('department', e.target.value)}
              placeholder="Product Engineering"
            />
          </Field>
          <Field label={t('f.location')}>
            <Input
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Jakarta Selatan"
            />
          </Field>
          <Field label={t('f.workType')}>
            <Select
              value={form.workType}
              onChange={(v) => set('workType', v as WorkType)}
              options={WORK_TYPES.map((w) => ({ value: w, label: w }))}
            />
          </Field>
          <Field label={t('f.jobType')}>
            <Select
              value={form.jobType}
              onChange={(v) => set('jobType', v as JobType)}
              options={JOB_TYPES.map((w) => ({ value: w, label: w }))}
            />
          </Field>
          <Field label={t('f.salaryMin')} hint="Rupiah per bulan">
            <Input
              type="number"
              min={0}
              step={500000}
              value={form.salaryMin ?? ''}
              onChange={(e) =>
                set('salaryMin', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder="10000000"
            />
          </Field>
          <Field label={t('f.salaryMax')} error={errors.salaryMax}>
            <Input
              type="number"
              min={0}
              step={500000}
              value={form.salaryMax ?? ''}
              onChange={(e) =>
                set('salaryMax', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder="15000000"
            />
          </Field>
          <Field label={t('f.source')}>
            <Select
              value={form.source}
              onChange={(v) => set('source', v)}
              options={SOURCES.map((s) => ({ value: s, label: s }))}
            />
          </Field>
          <Field label={t('f.status')}>
            <Select
              value={form.status}
              onChange={(v) => set('status', v as Status)}
              options={STATUS_KEYS.map((s) => ({
                value: s,
                label: t('status.' + s),
                color: STATUSES.find((x) => x.key === s)!.color,
              }))}
            />
          </Field>
          <Field label={t('f.url')} error={errors.url} className="sm:col-span-2">
            <Input
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label={t('f.appliedDate')}>
            <Input
              type="date"
              value={form.appliedDate}
              onChange={(e) => set('appliedDate', e.target.value)}
            />
          </Field>
          <Field label={t('f.deadline')}>
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => set('deadline', e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--ink-soft)]">
              {t('f.tags')}
            </span>
            <TagPicker value={form.tags} onChange={(v) => set('tags', v)} />
          </div>
          <Field label={t('f.notes')} className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Catatan penting tentang lamaran ini…"
            />
          </Field>
        </div>
      )}

      {tab === 'contact' && (
        <div className="anim-fade grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('f.recruiter')} className="sm:col-span-2">
            <Input
              value={form.recruiterName}
              onChange={(e) => set('recruiterName', e.target.value)}
              placeholder="Nama recruiter"
            />
          </Field>
          <Field label={t('f.recruiterEmail')} error={errors.recruiterEmail}>
            <Input
              type="email"
              value={form.recruiterEmail}
              onChange={(e) => set('recruiterEmail', e.target.value)}
              placeholder="recruiter@perusahaan.com"
            />
          </Field>
          <Field label={t('f.recruiterPhone')}>
            <Input
              value={form.recruiterPhone}
              onChange={(e) => set('recruiterPhone', e.target.value)}
              placeholder="+62 8xx-xxxx-xxxx"
            />
          </Field>
        </div>
      )}

      {tab === 'docs' && (
        <div className="anim-fade space-y-2">
          {db.docs.length === 0 && (
            <p className="py-8 text-center text-[13px] text-[var(--ink-muted)]">
              {t('c.empty')}
            </p>
          )}
          {db.docs.map((doc) => {
            const checked = form.documentIds.includes(doc.id);
            return (
              <button
                type="button"
                key={doc.id}
                onClick={() =>
                  set(
                    'documentIds',
                    checked
                      ? form.documentIds.filter((x) => x !== doc.id)
                      : [...form.documentIds, doc.id],
                  )
                }
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 cursor-pointer',
                  checked
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]',
                )}
              >
                <span
                  className={cx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px]',
                    checked
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-soft)] text-[var(--ink-muted)]',
                  )}
                >
                  <Icon name={checked ? 'fi-rr-check' : 'fi-rr-document'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
                    {doc.label}
                  </span>
                  <span className="block truncate text-[11.5px] text-[var(--ink-muted)]">
                    {t('doc.cat.' + doc.category)} · {doc.version} · {fileSize(doc.size)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
