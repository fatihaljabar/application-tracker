import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { loadGoogleIdentity } from '../lib/google';
import { initials } from '../lib/utils';
import { useStore } from '../lib/store';

export default function Login() {
  const { t, lang, signIn, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  /**
   * Pustaka Google disiapkan SEKALI, dan itu sebabnya callback-nya diambil
   * lewat ref alih-alih jadi dependensi efek.
   *
   * Sebelumnya efeknya bergantung pada [signIn, toast, t]. `signIn` lahir dari
   * useMemo besar di store yang dibuat ulang setiap kali data, keadaan simpan,
   * atau status koneksi berubah — jadi efeknya berjalan berulang kali dan
   * memanggil `google.accounts.id.initialize()` berkali-kali. Google sendiri
   * yang memberi tahu, lewat peringatan di konsol: "called multiple times.
   * This could cause unexpected behavior and only the last initialized
   * instance will be used."
   *
   * Ref tidak reaktif, jadi efeknya tidak perlu berjalan ulang hanya untuk
   * memakai fungsi versi terbaru.
   */
  const terbaru = useRef({ signIn, toast, t });
  terbaru.current = { signIn, toast, t };

  useEffect(() => {
    let cancelled = false;

    const signInWith = async (credential: string) => {
      const { signIn, toast, t } = terbaru.current;
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        let res: Response;
        try {
          res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          });
        } catch {
          // Server tidak menjawab sama sekali. Tanpa cabang ini pengguna melihat
          // pesan parser JSON yang tidak menjelaskan apa pun.
          throw new Error(t('l.serverDown'));
        }

        // Balasan bisa saja bukan JSON — misalnya galat proxy saat backend mati.
        const isJson = res.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await res.json() : null;
        if (!res.ok || !data) {
          throw new Error(data?.error?.message ?? t('l.serverDown'));
        }
        signIn({
          name: data.user.name,
          email: data.user.email,
          provider: 'google',
          // Antarmuka menampilkan field ini sebagai teks di dalam lingkaran,
          // jadi isinya inisial — bukan URL foto Google.
          avatar: initials(data.user.name),
          since: data.user.since,
        });
        toast(t('l.signedIn'));
      } catch (e) {
        toast(e instanceof Error ? e.message : t('l.signInFailed'), 'error');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };

    loadGoogleIdentity()
      .then((id) => {
        if (cancelled || !slot.current) return;
        id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: (res) => void signInWith(res.credential),
          cancel_on_tap_outside: true,
        });
        // Tombol Google dirender di sini lalu ditumpuk tak terlihat di atas tombol
        // kita, supaya tampilan tetap sama persis sementara klik yang diterima
        // Google tetap klik pengguna yang asli.
        id.renderButton(slot.current, { type: 'standard', width: 320 });
      })
      .catch(() => terbaru.current.toast(terbaru.current.t('l.signInFailed'), 'error'));

    return () => {
      cancelled = true;
    };
    // Sengaja kosong: seluruh callback diambil dari ref di atas, dan
    // menyiapkan pustaka Google lebih dari sekali justru yang diperbaiki di
    // sini. Lihat komentar pada `terbaru`.
  }, []);

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
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl" />
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {t('appName')}
            </span>
          </div>
          <h1 className="mt-8 max-w-lg text-[38px] font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--ink)] sm:text-[52px]">
            {t('l.welcome')}.<span className="block text-[var(--ink-muted)]">{t('tagline')}.</span>
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

        <div
          className="anim-fade-up rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[var(--shadow-soft)] sm:p-9"
          style={{ animationDelay: '90ms' }}
        >
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            {t('l.choose')}
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--ink-muted)]">{t('l.chooseDesc')}</p>

          <div className="relative mt-7">
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-3.5 text-[14px] font-medium text-[var(--ink)] transition-all duration-200 hover:bg-[var(--surface-2)] active:scale-[0.985] cursor-pointer disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.5 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.2 2.2-6.4 0-11.7-3.7-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
                />
              </svg>
              {busy ? t('l.signingIn') : t('l.google')}
            </button>
            {/* Tombol asli Google: menutupi tombol di atas, tidak terlihat.
                Klik pengguna sampai ke Google secara sah, tampilan tetap milik kita.

                Tombol Google tingginya tetap 40px sementara tombol kita 51px, jadi
                anaknya diregangkan vertikal supaya seluruh permukaan bereaksi —
                tanpa ini, sekitar 5px di tepi atas dan bawah tidak melakukan apa pun.
                Peregangan tidak terlihat karena lapisannya transparan. */}
            <div
              ref={slot}
              aria-hidden="true"
              className={`absolute inset-0 overflow-hidden opacity-0 [&>div]:origin-center [&>div]:scale-y-[1.3] ${busy ? 'pointer-events-none' : ''}`}
              style={{ colorScheme: 'light' }}
            />
          </div>

          <p className="mt-7 text-center text-[11.5px] leading-relaxed text-[var(--ink-muted)]">
            {t('l.local')}
          </p>
          {/* Ukuran, warna, dan perataan sengaja sama persis dengan baris di atasnya —
              ini keterangan, bukan ajakan, jadi tidak boleh menarik perhatian dari
              tombol masuk. Berkas statis di public/, bisa dibuka tanpa sesi. */}
          <p className="mt-2 text-center text-[11.5px] leading-relaxed text-[var(--ink-muted)]">
            {/* Mengikuti bahasa yang dipilih. Dua berkas terpisah, bukan satu
                halaman dwibahasa: ini dokumen yang dibaca orang saat sedang
                khawatir, dan setengahnya dalam bahasa asing membuatnya lebih
                sulit dipercaya, bukan lebih lengkap. */}
            <a
              href={lang === 'en' ? '/privacy.html' : '/privasi.html'}
              className="underline underline-offset-2 transition-colors duration-200 hover:text-[var(--ink-soft)] focus-ring rounded"
            >
              {t('l.privacy')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
