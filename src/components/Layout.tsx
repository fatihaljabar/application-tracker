import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useStore } from '../lib/store';
import { Icon, Menu } from './ui';
import { cx, daysUntil } from '../lib/utils';

const NAV = [
  {
    group: 'nav.group.track',
    items: [
      { to: '/', key: 'nav.dashboard', icon: 'fi-rr-home' },
      { to: '/applications', key: 'nav.applications', icon: 'fi-rr-briefcase' },
      { to: '/pipeline', key: 'nav.pipeline', icon: 'fi-rr-apps' },
      { to: '/timeline', key: 'nav.timeline', icon: 'fi-rr-time-past' },
      { to: '/statistics', key: 'nav.statistics', icon: 'fi-rr-chart-histogram' },
    ],
  },
  {
    group: 'nav.group.prep',
    items: [
      { to: '/documents', key: 'nav.documents', icon: 'fi-rr-document' },
      { to: '/interviews', key: 'nav.interviews', icon: 'fi-rr-comment-alt' },
      { to: '/wishlist', key: 'nav.wishlist', icon: 'fi-rr-target' },
      { to: '/bookmarks', key: 'nav.bookmarks', icon: 'fi-rr-bookmark' },
    ],
  },
  {
    group: 'nav.group.other',
    items: [
      { to: '/calendar', key: 'nav.calendar', icon: 'fi-rr-calendar' },
      { to: '/reminders', key: 'nav.reminders', icon: 'fi-rr-bell' },
      { to: '/settings', key: 'nav.settings', icon: 'fi-rr-settings' },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { t, db, updateSettings, signOut, toast } = useStore();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: loc.pathname sengaja dipakai sebagai pemicu, bukan nilai yang dibaca di dalam efek. Tanpa dependensi ini menu berhenti menutup saat pindah halaman.
  useEffect(() => setOpen(false), [loc.pathname]);

  // Menu mobile wajib bisa ditutup tanpa mouse.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const dueSoon = db.reminders.filter((r) => {
    if (r.done) return false;
    const d = daysUntil(r.datetime);
    return d !== null && d <= 3;
  });

  const theme = db.settings.theme;
  const user = db.user;

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            {t(g.group)}
          </p>
          <div className="space-y-0.5">
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                      : 'text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      name={it.icon}
                      className={cx(
                        'text-[13px] transition-transform duration-200 group-hover:scale-110',
                        isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]',
                      )}
                    />
                    <span className="flex-1 truncate">{t(it.key)}</span>
                    {it.to === '/reminders' && dueSoon.length > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1.5 text-[10.5px] font-semibold text-white">
                        {dueSoon.length}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-[var(--line)] bg-[var(--surface)] lg:flex">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent)] text-white">
            <Icon name="fi-rr-briefcase" className="text-[13px]" />
          </span>
          <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            {t('appName')}
          </span>
        </div>
        {nav}
        <div className="border-t border-[var(--line)] p-3">
          <Menu
            align="left"
            items={[
              {
                label: theme === 'light' ? t('set.dark') : t('set.light'),
                icon: theme === 'light' ? 'fi-rr-moon' : 'fi-rr-sun',
                onClick: () => updateSettings({ theme: theme === 'light' ? 'dark' : 'light' }),
              },
              {
                label: t('set.signOut'),
                icon: 'fi-rr-sign-out-alt',
                danger: true,
                onClick: () => {
                  signOut();
                  toast(t('set.signOut'), 'info');
                },
              },
            ]}
            trigger={
              <span className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--bg-soft)]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent-ink)]">
                  {user?.avatar ?? 'T'}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12.5px] font-medium text-[var(--ink)]">
                    {user?.name ?? 'Tamu'}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--ink-muted)]">
                    {user?.email ?? 'local'}
                  </span>
                </span>
                <Icon name="fi-rr-menu-dots" className="text-[11px] text-[var(--ink-muted)]" />
              </span>
            }
          />
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <button type="button"
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--line)] text-[var(--ink)] transition-colors hover:bg-[var(--bg-soft)] cursor-pointer"
        >
          <Icon name="fi-rr-menu-burger" className="text-[13px]" />
        </button>
        <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-white">
            <Icon name="fi-rr-briefcase" className="text-[11px]" />
          </span>
          {t('appName')}
        </span>
        <button type="button"
          onClick={() => updateSettings({ theme: theme === 'light' ? 'dark' : 'light' })}
          className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-soft)] cursor-pointer"
        >
          <Icon name={theme === 'light' ? 'fi-rr-moon' : 'fi-rr-sun'} className="text-[13px]" />
        </button>
      </header>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Lapisan gelap hanya pintasan mouse; pengguna papan ketik memakai Escape. */}
          <div
            role="presentation"
            aria-hidden="true"
            className="anim-fade absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <aside className="anim-slide-right absolute inset-y-0 left-0 flex w-[268px] flex-col border-r border-[var(--line)] bg-[var(--surface)]">
            <div className="flex items-center justify-between px-5 py-5">
              <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {t('appName')}
              </span>
              <button type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] cursor-pointer"
              >
                <Icon name="fi-rr-cross-small" className="text-[14px]" />
              </button>
            </div>
            {nav}
            <button type="button"
              onClick={signOut}
              className="m-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10 cursor-pointer"
            >
              <Icon name="fi-rr-sign-out-alt" className="text-[13px]" /> {t('set.signOut')}
            </button>
          </aside>
        </div>
      )}

      <main className="lg:pl-[252px]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-7 sm:py-9">{children}</div>
      </main>
    </div>
  );
}
