import { useState } from 'react';
import { useStore } from '../lib/store';
import { Button, Icon } from '../components/ui';

const ACCOUNTS = [
  { name: 'Rani Kusuma', email: 'rani.kusuma@gmail.com', hue: 168 },
  { name: 'Bagus Pratama', email: 'baguspratama@gmail.com', hue: 28 },
];

export default function Login() {
  const { t, signIn, toast } = useStore();
  const [chooser, setChooser] = useState(false);

  const enter = (name: string, email: string, provider: 'google' | 'guest') => {
    signIn({
      name,
      email,
      provider,
      avatar: name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      since: new Date().toISOString(),
    });
    toast(t('l.signedIn'));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)]">
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent-soft), transparent 68%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-52 -right-32 h-[460px] w-[460px] rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--bg-soft), transparent 68%)' }}
      />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-14 px-6 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <div className="anim-fade-up">
          <div className="inline-flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-white">
              <Icon name="fi-rr-briefcase" className="text-[14px]" />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {t('appName')}
            </span>
          </div>
          <h1 className="mt-8 max-w-lg text-[38px] font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--ink)] sm:text-[52px]">
            {t('l.welcome')}.
            <span className="block text-[var(--ink-muted)]">{t('tagline')}.</span>
          </h1>
          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
            {t('l.desc')}
          </p>
          <div className="mt-9 flex flex-wrap gap-2.5">
            {[
              { icon: 'fi-rr-apps', label: t('l.f1') },
              { icon: 'fi-rr-bell', label: t('l.f2') },
              { icon: 'fi-rr-chart-histogram', label: t('l.f3') },
            ].map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-[12.5px] text-[var(--ink-soft)]"
              >
                <Icon name={f.icon} className="text-[12px] text-[var(--accent)]" />
                {f.label}
              </span>
            ))}
          </div>
        </div>

        <div className="anim-fade-up rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[var(--shadow-soft)] sm:p-9" style={{ animationDelay: '90ms' }}>
          {!chooser ? (
            <>
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {t('l.choose')}
              </h2>
              <p className="mt-1.5 text-[13px] text-[var(--ink-muted)]">{t('l.chooseDesc')}</p>
              <button type="button"
                onClick={() => setChooser(true)}
                className="mt-7 flex w-full items-center justify-center gap-3 rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-3.5 text-[14px] font-medium text-[var(--ink)] transition-all duration-200 hover:bg-[var(--surface-2)] active:scale-[0.985] cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.5 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z" />
                  <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z" />
                  <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.2 2.2-6.4 0-11.7-3.7-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                {t('l.google')}
              </button>
              <div className="my-5 flex items-center gap-3 text-[11.5px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                <span className="h-px flex-1 bg-[var(--line)]" />atau<span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <Button
                variant="soft"
                size="lg"
                className="w-full"
                icon="fi-rr-user"
                onClick={() => enter('Tamu', 'guest@local', 'guest')}
              >
                {t('l.guest')}
              </Button>
            </>
          ) : (
            <div className="anim-fade">
              <button type="button"
                onClick={() => setChooser(false)}
                className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] cursor-pointer"
              >
                <Icon name="fi-rr-angle-left" className="text-[11px]" /> {t('c.cancel')}
              </button>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {t('l.choose')}
              </h2>
              <div className="mt-5 space-y-2">
                {ACCOUNTS.map((a) => (
                  <button type="button"
                    key={a.email}
                    onClick={() => enter(a.name, a.email, 'google')}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-left transition-all duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--bg-soft)] active:scale-[0.99] cursor-pointer"
                  >
                    <span
                      className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-semibold"
                      style={{
                        background: `hsl(${a.hue} 34% 90%)`,
                        color: `hsl(${a.hue} 40% 30%)`,
                      }}
                    >
                      {a.name.split(' ').map((w) => w[0]).join('')}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-[var(--ink)]">
                        {a.name}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--ink-muted)]">
                        {a.email}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-7 text-center text-[11.5px] leading-relaxed text-[var(--ink-muted)]">
            {t('l.local')}
          </p>
        </div>
      </div>
    </div>
  );
}
