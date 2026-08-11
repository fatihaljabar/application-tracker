import { useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader, TagChip } from '../components/shared';
import { Button, Confirm, Field, Icon, Input, SectionTitle, Select, Toggle } from '../components/ui';
import { TIMEZONES } from '../lib/constants';
import { cx } from '../lib/utils';

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--line)] py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-[var(--ink)]">{title}</p>
        {desc && <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-muted)]">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { t, db, updateSettings, addTag, deleteTag, resetData, signOut, toast, deleteAccount, saving } = useStore();
  const s = db.settings;
  const [tagDraft, setTagDraft] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const palette = ['#2f6f5e', '#5b7fa6', '#b58a52', '#a6708f', '#6f7fb5', '#8a72b0', '#b06565'];

  const save = (p: Parameters<typeof updateSettings>[0]) => {
    updateSettings(p, t('set.saved'));
  };

  return (
    <>
      <PageHeader title={t('set.title')} subtitle={t('set.subtitle')} />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('set.appearance')} icon="fi-rr-moon" />
          <Row title={t('set.theme')}>
            <div className="inline-flex gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1">
              {(['light', 'dark'] as const).map((th) => (
                <button type="button"
                  key={th}
                  onClick={() => save({ theme: th })}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-200 cursor-pointer',
                    s.theme === th
                      ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]',
                  )}
                >
                  <Icon name={th === 'light' ? 'fi-rr-sun' : 'fi-rr-moon'} className="text-[11px]" />
                  {t(th === 'light' ? 'set.light' : 'set.dark')}
                </button>
              ))}
            </div>
          </Row>
          <Row title={t('set.language')}>
            <Select
              className="w-[168px]"
              size="sm"
              value={s.language}
              onChange={(v) => save({ language: v as 'id' | 'en' })}
              options={[
                { value: 'id', label: 'Bahasa Indonesia' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Row>
          <Row title={t('set.timezone')}>
            <Select
              className="w-[168px]"
              size="sm"
              value={s.timezone}
              onChange={(v) => save({ timezone: v })}
              options={TIMEZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))}
            />
          </Row>
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('set.targets')} icon="fi-rr-target" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('d.weeklyTarget')}>
              <Input
                type="number"
                min={1}
                value={s.weeklyTarget}
                onChange={(e) => updateSettings({ weeklyTarget: Math.max(1, +e.target.value || 1) })}
              />
            </Field>
            <Field label={t('d.monthlyTarget')}>
              <Input
                type="number"
                min={1}
                value={s.monthlyTarget}
                onChange={(e) => updateSettings({ monthlyTarget: Math.max(1, +e.target.value || 1) })}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label={t('set.cvValid')}>
              <Input
                type="number"
                min={1}
                value={s.cvValidDays}
                onChange={(e) => updateSettings({ cvValidDays: Math.max(1, +e.target.value || 1) })}
              />
            </Field>
          </div>
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('set.notif')} icon="fi-rr-bell" />
          <Row title={t('set.emailNotif')} desc={t('set.emailNotifDesc')}>
            <Toggle checked={s.emailNotif} onChange={(v) => updateSettings({ emailNotif: v })} />
          </Row>
          <Row title={t('set.dailyReminder')} desc={t('set.dailyReminderDesc')}>
            <Toggle checked={s.dailyReminder} onChange={(v) => updateSettings({ dailyReminder: v })} />
          </Row>
          <div className="pt-4">
            <Field label={t('set.notifyEmail')}>
              <Input
                type="email"
                value={s.notifyEmail}
                placeholder="kamu@email.com"
                onChange={(e) => updateSettings({ notifyEmail: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <SectionTitle title={t('set.tagManager')} icon="fi-rr-tags" />
          <div className="flex flex-wrap gap-1.5">
            {db.tags.map((tag) => (
              <TagChip key={tag.name} name={tag.name} onRemove={() => deleteTag(tag.name)} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Input
              value={tagDraft}
              placeholder={t('set.newTag')}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagDraft.trim()) {
                  addTag({ name: tagDraft.trim(), color: palette[db.tags.length % palette.length] });
                  setTagDraft('');
                }
              }}
            />
            <Button
              variant="soft"
              icon="fi-rr-plus"
              onClick={() => {
                if (!tagDraft.trim()) return;
                addTag({ name: tagDraft.trim(), color: palette[db.tags.length % palette.length] });
                setTagDraft('');
              }}
            >
              {t('c.add')}
            </Button>
          </div>
        </section>

        <section className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:col-span-2">
          <SectionTitle title={t('set.data')} icon="fi-rr-cloud-upload-alt" />
          <p className="text-[12.5px] leading-relaxed text-[var(--ink-muted)]">{t('set.dataDesc')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Navigasi ke endpoint, bukan dump isi memori. Data diambil ulang
                dari database, jadi ekspor tidak pernah tertinggal dari
                perubahan di perangkat lain. */}
            <Button
              icon="fi-rr-download"
              onClick={() => {
                window.location.href = '/api/export';
              }}
            >
              {t('c.export')}
            </Button>
            <Button variant="danger" icon="fi-rr-trash" onClick={() => setConfirmReset(true)}>
              {t('set.resetData')}
            </Button>
            {db.user && (
              <Button variant="ghost" icon="fi-rr-sign-out-alt" onClick={signOut}>
                {t('set.signOut')}
              </Button>
            )}
          </div>

          {/* A4 — hapus akun (PRD § 6.19). Dipisah garis dari tombol di atas
              karena ini satu-satunya aksi di halaman ini yang tidak bisa
              dibatalkan, dan tidak boleh tertukar dengan "Hapus semua data"
              yang masih menyisakan akunnya. */}
          {db.user && (
            <div className="mt-5 border-t border-[var(--line)] pt-5">
              <p className="text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
                {t('set.deleteAccountWarn')}
              </p>
              <Button
                className="mt-3"
                variant="danger"
                icon="fi-rr-trash"
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
              >
                {t('set.deleteAccount')}
              </Button>
            </div>
          )}

          {db.user && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[14px] font-semibold text-[var(--accent-ink)]">
                {db.user.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-[var(--ink)]">{db.user.name}</p>
                <p className="truncate text-[12px] text-[var(--ink-muted)]">
                  {db.user.email} · {db.user.provider === 'google' ? 'Google' : 'Guest'}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <Confirm
        open={confirmDelete}
        title={t('set.deleteAccountConfirm')}
        description={t('set.deleteAccountWarn')}
        confirmLabel={t('set.deleteAccountYes')}
        cancelLabel={t('c.cancel')}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          // Tidak perlu memuat ulang halaman: begitu berhasil, store
          // mengosongkan state dan `user` jadi null, dan Shell menampilkan
          // halaman masuk sendiri.
          void deleteAccount(t('set.accountDeleted'));
        }}
      />

      <Confirm
        open={confirmReset}
        title={t('set.resetConfirm')}
        description={t('c.confirmDeleteDesc')}
        confirmLabel={t('c.yesDelete')}
        cancelLabel={t('c.cancel')}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetData();
          setConfirmReset(false);
          toast(t('set.saved'), 'info');
        }}
      />
    </>
  );
}
