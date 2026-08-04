import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, CompanyAvatar } from '../components/shared';
import { Button, Confirm, Empty, Field, Icon, Input, Modal, SearchInput, Select, Textarea, Segmented } from '../components/ui';
import { SOURCES } from '../lib/constants';
import type { Bookmark } from '@shared/types';
import { cx, daysUntil, fmtDate, todayISO, uid } from '../lib/utils';

const blank = (): Bookmark => ({
  id: '',
  company: '',
  position: '',
  url: '',
  source: 'LinkedIn',
  deadline: '',
  note: '',
  favorite: false,
  savedAt: todayISO(),
});

export default function Bookmarks() {
  const { t, db, lang, saveBookmark, deleteBookmark, toggleBookmarkFav, addApp, toast, saving } = useStore();
  const tz = db.settings.timezone;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Bookmark>(blank());
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.bookmarks
      .filter((b) => !term || (`${b.company} ${b.position} ${b.note}`).toLowerCase().includes(term))
      .filter((b) => filter !== 'fav' || b.favorite)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.savedAt.localeCompare(a.savedAt));
  }, [db.bookmarks, q, filter]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.company.trim()) e.company = `${t('f.company')} ${t('c.required')}`;
    if (!form.position.trim()) e.position = `${t('f.position')} ${t('c.required')}`;
    if (form.url && !/^https?:\/\//i.test(form.url)) e.url = 'URL harus diawali http:// atau https://';
    setErr(e);
    if (Object.keys(e).length) return;
    const ok = await saveBookmark({ ...form, id: form.id || uid(), company: form.company.trim(), position: form.position.trim() }, `${t('c.save')} ✓`);
    if (!ok) return;
    setOpen(false);
  };

  const convert = (b: Bookmark) => {
    addApp({
      company: b.company,
      position: b.position,
      department: '',
      location: '',
      workType: 'Remote',
      jobType: 'Full Time',
      salaryMin: null,
      salaryMax: null,
      source: b.source,
      url: b.url,
      appliedDate: todayISO(),
      deadline: b.deadline,
      recruiterName: '',
      recruiterEmail: '',
      recruiterPhone: '',
      notes: b.note,
      status: 'applied',
      tags: [],
      documentIds: [],
      archived: false,
      favorite: b.favorite,
    });
    deleteBookmark(b.id);
    toast(t('b.converted'));
  };

  return (
    <>
      <PageHeader
        title={t('b.title')}
        subtitle={t('b.subtitle')}
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
            {t('b.add')}
          </Button>
        }
      />

      <div className="anim-fade-up flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:p-5">
        <SearchInput value={q} onChange={setQ} placeholder={t('c.search')} className="flex-1" />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('c.all') },
            { value: 'fav', label: t('c.favorite') },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <Empty icon="fi-rr-bookmark" title={t('c.empty')} description={t('c.emptyHint')} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((b, i) => {
            const dl = daysUntil(b.deadline);
            return (
              <article
                key={b.id}
                className="anim-fade-up group flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <CompanyAvatar name={b.company} size={40} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
                      {b.company}
                    </h3>
                    <p className="truncate text-[12.5px] text-[var(--ink-muted)]">{b.position}</p>
                  </div>
                  <button type="button"
                    onClick={() => toggleBookmarkFav(b.id)}
                    className={cx(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all duration-200 cursor-pointer',
                      b.favorite
                        ? 'text-[var(--warn)]'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--bg-soft)]',
                    )}
                  >
                    <Icon name={b.favorite ? 'fi-sr-star' : 'fi-rr-star'} className="text-[12px]" />
                  </button>
                </div>

                {b.note && (
                  <p className="mt-3 line-clamp-3 rounded-xl bg-[var(--surface-2)] p-3 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                    {b.note}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--ink-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="fi-rr-link-alt" className="text-[10px]" /> {b.source}
                  </span>
                  {b.deadline && (
                    <span
                      className={cx(
                        'inline-flex items-center gap-1.5',
                        dl !== null && dl <= 3 && 'text-[var(--danger)]',
                      )}
                    >
                      <Icon name="fi-rr-clock" className="text-[10px]" /> {fmtDate(b.deadline, lang, tz)}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-[var(--line)] pt-4">
                  <Button size="sm" variant="soft" icon="fi-rr-paper-plane" onClick={() => convert(b)}>
                    {t('b.convert')}
                  </Button>
                  {b.url && (
                    <a href={b.url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" icon="fi-rr-link-alt" />
                    </a>
                  )}
                  <div className="flex-1" />
                  <button type="button"
                    onClick={() => {
                      setForm(b);
                      setErr({});
                      setOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    <Icon name="fi-rr-pencil" className="text-[11px]" />
                  </button>
                  <button type="button"
                    onClick={() => setConfirmId(b.id)}
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
        title={form.id ? t('c.edit') : t('b.add')}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('f.company')} error={err.company}>
              <Input
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </Field>
            <Field label={t('f.position')} error={err.position}>
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label={t('f.source')}>
              <Select
                value={form.source}
                onChange={(v) => setForm((f) => ({ ...f, source: v }))}
                options={SOURCES.map((s) => ({ value: s, label: s }))}
              />
            </Field>
            <Field label={t('f.deadline')} hint={t('c.optional')}>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t('f.url')} error={err.url} hint={t('c.optional')}>
            <Input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://"
            />
          </Field>
          <Field label={t('b.noteBefore')} hint={t('c.optional')}>
            <Textarea
              rows={3}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
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
          if (confirmId) deleteBookmark(confirmId);
          setConfirmId(null);
        }}
      />
    </>
  );
}
