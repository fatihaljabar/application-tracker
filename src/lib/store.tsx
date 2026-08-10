import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Activity,
  Application,
  Bookmark,
  CompanyWish,
  DB,
  DocFile,
  InterviewNote,
  Reminder,
  Settings,
  Status,
  Tag,
  UserProfile,
} from '@shared/types';
import { ApiError, api, del, patch, post, put, uploadFile } from './api';
import { translate } from './i18n';
import { initials, uid } from './utils';

/**
 * Sumber data pindah dari localStorage ke server. Bentuk DB di memori sengaja
 * tidak berubah, karena itulah yang membuat 12 halaman tidak perlu disentuh
 * sama sekali (TECHNICAL.md § 7).
 *
 * Aturan mutasi: **panggil API dulu, baru perbarui tampilan.** Pola optimistis
 * menuntut jalur pengembalian di setiap fungsi, dan satu jalur yang keliru
 * menghasilkan tampilan yang menyatakan data tersimpan padahal gagal. Menunggu
 * 100–300 ms untuk sebuah form tidak terasa; kehilangan data terasa selamanya.
 *
 * Satu pengecualian: `moveApp`. Kartu yang diam sesaat setelah dilepas terasa
 * rusak, jadi di sana tampilan berubah lebih dulu dan dikembalikan bila gagal.
 */

const EMPTY: DB = {
  apps: [],
  activities: [],
  reminders: [],
  docs: [],
  notes: [],
  bookmarks: [],
  wishes: [],
  tags: [],
  settings: {
    theme: 'light',
    language: 'id',
    timezone: 'Asia/Jakarta',
    weeklyTarget: 5,
    monthlyTarget: 20,
    emailNotif: true,
    dailyReminder: true,
    notifyEmail: '',
    cvValidDays: 90,
  },
  user: null,
};

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

/** Dialog galat yang menghentikan pengguna — bukan toast yang lewat begitu saja. */
export interface Alert {
  title: string;
  description?: string;
  actionLabel: string;
  onAction: () => void;
}

interface Ctx {
  db: DB;
  /** Data pertama sedang diambil. Halaman menampilkan kerangka, bukan layar kosong. */
  loading: boolean;
  /**
   * Ada mutasi yang sedang menunggu balasan server. Tombol simpan memakainya
   * supaya tidak terlihat menggantung dan tidak bisa ditekan dua kali.
   */
  saving: boolean;
  /**
   * Server terjangkau atau tidak (Lampiran A, A2). Toast kegagalan hilang
   * setelah tiga detik; penanda ini menetap selama koneksinya masih putus,
   * supaya pengguna tidak mengetik satu lamaran penuh baru tahu ada masalah.
   */
  online: boolean;
  alert: Alert | null;
  dismissAlert: () => void;
  t: (key: string) => string;
  lang: 'id' | 'en';
  toasts: Toast[];
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  // apps
  /** Mengembalikan true bila server menerima. Form menunggu ini sebelum menutup. */
  saveApp: (app: Application, done?: string) => Promise<boolean>;
  addApp: (
    app: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'history'>,
    done?: string,
  ) => Promise<boolean>;
  deleteApp: (id: string) => void;
  duplicateApp: (id: string) => void;
  toggleArchive: (id: string) => void;
  toggleFavorite: (id: string) => void;
  moveApp: (id: string, status: Status, done?: string) => void;
  // activities
  addActivity: (a: Omit<Activity, 'id'>) => void;
  deleteActivity: (id: string) => void;
  // reminders
  saveReminder: (r: Reminder, done?: string) => Promise<boolean>;
  deleteReminder: (id: string) => void;
  toggleReminder: (id: string) => void;
  // docs
  /** Mengembalikan true bila berkas benar-benar sampai. Form menunggu ini. */
  addDoc: (d: Omit<DocFile, 'id'>, done?: string) => Promise<boolean>;
  deleteDoc: (id: string) => void;
  /**
   * Persen unggahan yang sedang berjalan, null bila tidak ada (Lampiran A, A3).
   * Ada di store, bukan di halaman, karena unggahannya sendiri dikerjakan di
   * sini — halaman cuma menampilkannya.
   */
  uploadPercent: number | null;
  // notes
  saveNote: (n: InterviewNote, done?: string) => Promise<boolean>;
  deleteNote: (id: string) => void;
  // bookmarks
  saveBookmark: (b: Bookmark, done?: string) => Promise<boolean>;
  deleteBookmark: (id: string) => void;
  toggleBookmarkFav: (id: string) => void;
  // wishes
  saveWish: (w: CompanyWish, done?: string) => Promise<boolean>;
  deleteWish: (id: string) => void;
  // tags
  addTag: (t: Tag) => void;
  deleteTag: (name: string) => void;
  // settings & auth
  updateSettings: (patch: Partial<Settings>, done?: string) => void;
  signIn: (user: UserProfile) => void;
  signOut: () => void;
  resetData: (done?: string) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', db.settings.theme === 'dark');
    root.dataset.theme = db.settings.theme;
  }, [db.settings.theme]);

  const lang = db.settings.language;
  const t = useCallback((key: string) => translate(lang, key), [lang]);

  // Judul tab dan atribut lang ikut bahasa pilihan pengguna (PRD § 9: cakupan
  // dua bahasa penuh, tanpa teks yang tertinggal). index.html hanya memuat
  // nilai Indonesia sebagai bawaan sebelum React hidup.
  // `lang` juga menentukan pelafalan pembaca layar, jadi ini sekaligus
  // aksesibilitas — bukan cuma teks di tab.
  useEffect(() => {
    document.title = translate(lang, 'docTitle');
    document.documentElement.lang = lang;
  }, [lang]);

  /**
   * Dua sumber putusnya koneksi, dan keduanya perlu:
   *
   * - Peristiwa `offline`/`online` peramban — cepat, tapi cuma tahu soal kartu
   *   jaringan. Wi-Fi menyala sementara server mati tetap dianggap online.
   * - Panggilan API yang tidak dijawab APLIKASI ini — lihat `isUnreachable` di
   *   api.ts. Itu yang menangkap server mati, dan bentuknya berbeda antara
   *   pengembangan (proxy Vite membalas 5xx) dan produksi (fetch gagal total).
   */
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  /**
   * Pulih sendiri. Tanpa ini penandanya benar saat muncul tapi berbohong
   * sesudahnya: server bisa hidup lagi tanpa pengguna menyentuh apa pun, dan
   * penanda yang menetap salah lebih buruk daripada tidak ada penanda.
   *
   * `/api/health` menahan hasilnya sepuluh detik di server, jadi menyapa tiap
   * sepuluh detik hanya menghasilkan satu query — dan enam permintaan per menit
   * masih jauh di bawah batas laju 30.
   */
  useEffect(() => {
    if (online) return;
    const id = window.setInterval(() => {
      fetch('/api/health')
        .then((r) => {
          if (r.ok) setOnline(true);
        })
        .catch(() => {
          /* masih putus — biarkan penandanya */
        });
    }, 10_000);
    return () => window.clearInterval(id);
  }, [online]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, tone }]);
    timers.current[id] = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const loadState = useCallback(async () => {
    const state = await api<DB>('/state');
    setDb(state);
  }, []);

  const dismissAlert = useCallback(() => setAlert(null), []);

  // Muat sekali saat aplikasi dibuka. Sesi yang tidak sah menghasilkan 401,
  // dan itu berarti tampilkan halaman masuk — bukan galat.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<{
          user: { name: string; email: string; since: string } | null;
        }>('/auth/me');
        if (!alive) return;
        const who = me.user;
        if (!who) return;
        // Pengguna sudah diketahui sebelum datanya sampai, supaya Shell bisa
        // menampilkan kerangka di dalam layout — bukan layar kosong, dan bukan
        // pula halaman masuk yang berkelip.
        setDb((d) => ({
          ...d,
          user: {
            name: who.name,
            email: who.email,
            provider: 'google',
            avatar: initials(who.name),
            since: who.since,
          },
        }));
        setReady(true);
        await loadState();
      } catch (e) {
        if (!alive) return;
        // Muat pertama juga menentukan status koneksi. Tanpa baris ini penanda
        // A2 tidak pernah muncul saat aplikasi dibuka dengan server mati —
        // justru saat pengguna paling perlu tahu, karena belum ada satu pun
        // mutasi yang bisa menandainya.
        if (e instanceof ApiError && e.isUnreachable) setOnline(false);
        // 401 berarti memang belum masuk — tampilkan halaman masuk, bukan galat.
        // Selain itu server tidak terjangkau, dan menampilkan halaman masuk di
        // situ menyesatkan: pengguna sebenarnya masih login.
        if (!(e instanceof ApiError && e.isUnauthenticated)) {
          setAlert({
            title: 'Tidak bisa menghubungi server',
            description:
              'Data kamu aman di server, tapi aplikasi tidak bisa mengambilnya sekarang. Periksa koneksi, lalu muat ulang halaman.',
            actionLabel: 'Muat ulang',
            onAction: () => window.location.reload(),
          });
        }
      } finally {
        if (alive) {
          setReady(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadState]);

  /**
   * Menjalankan satu mutasi: panggil API, dan hanya kalau berhasil perbarui
   * tampilan. Kegagalan selalu terlihat pengguna — tidak ada yang ditelan.
   */
  const run = useCallback(
    async <R,>(call: () => Promise<R>, apply: (d: DB, result: R) => DB, successMessage?: string) => {
      setInFlight((n) => n + 1);
      try {
        const result = await call();
        // Balasan yang sampai adalah bukti terkuat bahwa server terjangkau.
        setOnline(true);
        setDb((d) => apply(d, result));
        if (successMessage) toast(successMessage);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.isUnreachable) setOnline(false);
        // Sesi habis dan konflik antar tab menghentikan pekerjaan pengguna,
        // jadi keduanya memakai dialog. Galat sementara cukup toast
        // (TECHNICAL.md § 6).
        if (e instanceof ApiError && e.isUnauthenticated) {
          setDb((d) => ({ ...d, user: null }));
          setAlert({
            title: 'Sesi berakhir',
            description: 'Silakan masuk lagi untuk melanjutkan.',
            actionLabel: 'Masuk',
            onAction: () => setAlert(null),
          });
          return false;
        }
        if (e instanceof ApiError && e.isConflict) {
          setAlert({
            title: 'Data berubah di tempat lain',
            description: `${e.message} Tampilan akan disegarkan supaya kamu melihat versi terbarunya.`,
            actionLabel: 'Mengerti',
            onAction: () => setAlert(null),
          });
          await loadState().catch(() => {});
          return false;
        }
        toast(e instanceof Error ? e.message : 'Gagal menyimpan.', 'error');
        return false;
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [toast, loadState],
  );

  const value: Ctx = useMemo(() => {
    const findApp = (id: string) => dbRef.current.apps.find((a) => a.id === id);

    /** Bentuk yang dikirim ke server; server mengabaikan field turunan. */
    const appPayload = (a: Application) => ({
      id: a.id,
      company: a.company,
      position: a.position,
      department: a.department,
      location: a.location,
      workType: a.workType,
      jobType: a.jobType,
      salaryMin: a.salaryMin,
      salaryMax: a.salaryMax,
      source: a.source,
      url: a.url,
      appliedDate: a.appliedDate,
      deadline: a.deadline,
      recruiterName: a.recruiterName,
      recruiterEmail: a.recruiterEmail,
      recruiterPhone: a.recruiterPhone,
      notes: a.notes,
      status: a.status,
      tags: a.tags,
      documentIds: a.documentIds,
      archived: a.archived,
      favorite: a.favorite,
    });

    return {
      db,
      loading,
      saving: inFlight > 0,
      uploadPercent,
      online,
      alert,
      dismissAlert,
      t,
      lang,
      toasts,
      toast,
      dismissToast,

      addApp: (data, done) => {
        const now = new Date().toISOString();
        const app: Application = {
          ...data,
          id: uid(),
          createdAt: now,
          updatedAt: now,
          history: data.status === 'wishlist' ? [] : [{ status: data.status, at: now }],
        };
        const activity: Activity = {
          id: uid(),
          appId: app.id,
          type: 'created',
          title: `${translate(lang, 't.type.created')} — ${app.company}`,
          description: `${app.position}${app.location ? ` · ${app.location}` : ''}`,
          date: now,
        };
        return run(
          () =>
            post<{ createdAt: string; updatedAt: string }>('/applications', {
              ...appPayload(app),
              activity: {
                id: activity.id,
                type: activity.type,
                title: activity.title,
                description: activity.description,
              },
            }),
          // Stempel waktu diambil dari balasan server, bukan dari jam peramban.
          // Kalau tidak, updatedAt lokal selalu lebih lama daripada yang tersimpan
          // dan setiap perubahan berikutnya ditolak sebagai konflik palsu.
          (d, r) => ({
            ...d,
            apps: [{ ...app, createdAt: r.createdAt, updatedAt: r.updatedAt }, ...d.apps],
            activities: [activity, ...d.activities],
          }),
          done,
        );
      },

      saveApp: (app, done) => {
        return run(
          () =>
            put<{ updatedAt: string }>(`/applications/${app.id}`, {
              ...appPayload(app),
              updatedAt: app.updatedAt,
            }),
          (d, r) => ({
            ...d,
            apps: d.apps.map((a) => (a.id === app.id ? { ...app, updatedAt: r.updatedAt } : a)),
          }),
          done,
        );
      },

      deleteApp: (id) => {
        void run(
          () => del(`/applications/${id}`),
          (d) => ({
            ...d,
            apps: d.apps.filter((a) => a.id !== id),
            activities: d.activities.filter((a) => a.appId !== id),
            reminders: d.reminders.filter((r) => r.appId !== id),
            notes: d.notes.filter((n) => n.appId !== id),
          }),
        );
      },

      duplicateApp: (id) => {
        const src = findApp(id);
        if (!src) return;
        const now = new Date().toISOString();
        const copy: Application = {
          ...src,
          id: uid(),
          company: `${src.company} (copy)`,
          status: 'wishlist',
          history: [],
          archived: false,
          createdAt: now,
          updatedAt: now,
        };
        void run(
          () => post<{ createdAt: string; updatedAt: string }>('/applications', appPayload(copy)),
          (d, r) => ({
            ...d,
            apps: [{ ...copy, createdAt: r.createdAt, updatedAt: r.updatedAt }, ...d.apps],
          }),
        );
      },

      toggleArchive: (id) => {
        const app = findApp(id);
        if (!app) return;
        const next = { ...app, archived: !app.archived };
        void run(
          () =>
            put<{ updatedAt: string }>(`/applications/${id}`, {
              ...appPayload(next),
              updatedAt: app.updatedAt,
            }),
          (d, r) => ({
            ...d,
            apps: d.apps.map((a) => (a.id === id ? { ...next, updatedAt: r.updatedAt } : a)),
          }),
        );
      },

      toggleFavorite: (id) => {
        const app = findApp(id);
        if (!app) return;
        const next = { ...app, favorite: !app.favorite };
        void run(
          () =>
            put<{ updatedAt: string }>(`/applications/${id}`, {
              ...appPayload(next),
              updatedAt: app.updatedAt,
            }),
          (d, r) => ({
            ...d,
            apps: d.apps.map((a) => (a.id === id ? { ...next, updatedAt: r.updatedAt } : a)),
          }),
        );
      },

      /**
       * Satu-satunya mutasi optimistis: kartu berpindah lebih dulu, karena
       * kartu yang diam sesaat setelah dilepas terasa rusak. Kalau server
       * menolak, kartu kembali ke kolom asalnya disertai pesan.
       */
      moveApp: (id, status, done) => {
        const app = findApp(id);
        if (!app || app.status === status) return;
        const before = dbRef.current;
        const now = new Date().toISOString();
        const activity: Activity = {
          id: uid(),
          appId: id,
          type: 'status',
          title: `${app.company} → ${translate(lang, `status.${status}`)}`,
          description: app.position,
          date: now,
        };
        const updated: Application = {
          ...app,
          status,
          updatedAt: now,
          appliedDate:
            !app.appliedDate && status !== 'wishlist' ? now.slice(0, 10) : app.appliedDate,
          history: [...app.history, { status, at: now }],
        };

        setDb((d) => ({
          ...d,
          apps: d.apps.map((a) => (a.id === id ? updated : a)),
          activities: [activity, ...d.activities],
        }));

        void (async () => {
          try {
            const r = await patch<{ updatedAt: string; appliedDate: string }>(`/applications/${id}/status`, {
              status,
              updatedAt: app.updatedAt,
              activity: {
                id: activity.id,
                type: activity.type,
                title: activity.title,
                description: activity.description,
              },
            });
            // Selaraskan dengan waktu server supaya perubahan berikutnya tidak
            // dianggap konflik.
            setDb((d) => ({
              ...d,
              apps: d.apps.map((a) =>
                a.id === id
                  ? { ...a, updatedAt: r.updatedAt, appliedDate: r.appliedDate || a.appliedDate }
                  : a,
              ),
            }));
            if (done) toast(done);
          } catch (e) {
            setDb(before);
            if (e instanceof ApiError && e.isConflict) {
              toast(e.message, 'error');
              await loadState().catch(() => {});
              return;
            }
            toast(e instanceof Error ? e.message : 'Gagal memindahkan status.', 'error');
          }
        })();
      },

      addActivity: (a) => {
        const activity: Activity = { ...a, id: uid() };
        void run(
          () =>
            post('/activities', {
              id: activity.id,
              appId: activity.appId,
              type: activity.type,
              title: activity.title,
              description: activity.description,
              date: activity.date,
            }),
          (d) => ({ ...d, activities: [activity, ...d.activities] }),
        );
      },

      deleteActivity: (id) => {
        void run(
          () => del(`/activities/${id}`),
          (d) => ({ ...d, activities: d.activities.filter((x) => x.id !== id) }),
        );
      },

      saveReminder: (r, done) => {
        return run(
          () => put(`/reminders/${r.id}`, r),
          (d) => ({
            ...d,
            reminders: d.reminders.some((x) => x.id === r.id)
              ? d.reminders.map((x) => (x.id === r.id ? r : x))
              : [r, ...d.reminders],
          }),
          done,
        );
      },

      deleteReminder: (id) => {
        void run(
          () => del(`/reminders/${id}`),
          (d) => ({ ...d, reminders: d.reminders.filter((x) => x.id !== id) }),
        );
      },

      toggleReminder: (id) => {
        const r = dbRef.current.reminders.find((x) => x.id === id);
        if (!r) return;
        const next = { ...r, done: !r.done };
        void run(
          () => put(`/reminders/${id}`, next),
          (d) => ({ ...d, reminders: d.reminders.map((x) => (x.id === id ? next : x)) }),
        );
      },

      /**
       * Unggahan tiga langkah (TECHNICAL.md § 8): minta URL bertanda tangan,
       * PUT berkasnya langsung ke penyimpanan, lalu konfirmasi.
       *
       * Berkasnya tidak pernah lewat server kita. Karena itu langkah tengahnya
       * memakai uploadFile(), bukan api() — tujuannya bukan domain kita.
       *
       * Kalau langkah tengah gagal, baris `pending` di server tertinggal.
       * Itu disengaja dan sudah ditangani: penyapu harian membuangnya beserta
       * objeknya. Mencoba membersihkan dari sini justru menambah satu panggilan
       * yang bisa ikut gagal.
       */
      addDoc: async (doc, done) => {
        setUploadPercent(0);
        try {
          return await run(
            async () => {
              const { id, uploadUrl } = await post<{ id: string; uploadUrl: string }>(
                '/documents/upload-url',
                {
                  name: doc.name,
                  label: doc.label,
                  group: doc.group,
                  category: doc.category,
                  language: doc.language,
                  version: doc.version,
                  size: doc.size,
                  mime: doc.mime,
                  note: doc.note,
                },
              );
              // dataUrl dari FileReader dikembalikan jadi Blob. Bukan jalur
              // tercepat, tapi halaman Dokumen sudah membacanya begitu dan
              // desainnya terkunci — 2 MB tidak sepadan dengan mengubah layar.
              const blob = await (await fetch(doc.dataUrl as string)).blob();
              await uploadFile(uploadUrl, blob, setUploadPercent);
              return await post<DocFile>(`/documents/${id}/confirm`);
            },
            (d, saved) => ({ ...d, docs: [saved, ...d.docs] }),
            done,
          );
        } finally {
          setUploadPercent(null);
        }
      },

      deleteDoc: (id) => {
        void run(
          () => del(`/documents/${id}`),
          // Server melepas dokumen dari semua lamaran lewat cascade, jadi
          // tampilan harus ikut melepasnya — kalau tidak, kartu lamaran masih
          // menghitung lampiran yang sudah tidak ada sampai halaman dimuat ulang.
          (d) => ({
            ...d,
            docs: d.docs.filter((x) => x.id !== id),
            apps: d.apps.map((a) =>
              a.documentIds.includes(id)
                ? { ...a, documentIds: a.documentIds.filter((x) => x !== id) }
                : a,
            ),
          }),
        );
      },

      saveNote: (n, done) => {
        return run(
          () => put(`/notes/${n.id}`, n),
          (d) => ({
            ...d,
            notes: d.notes.some((x) => x.id === n.id)
              ? d.notes.map((x) => (x.id === n.id ? n : x))
              : [n, ...d.notes],
          }),
          done,
        );
      },

      deleteNote: (id) => {
        void run(
          () => del(`/notes/${id}`),
          (d) => ({ ...d, notes: d.notes.filter((x) => x.id !== id) }),
        );
      },

      saveBookmark: (b, done) => {
        return run(
          () => put(`/bookmarks/${b.id}`, b),
          (d) => ({
            ...d,
            bookmarks: d.bookmarks.some((x) => x.id === b.id)
              ? d.bookmarks.map((x) => (x.id === b.id ? b : x))
              : [b, ...d.bookmarks],
          }),
          done,
        );
      },

      deleteBookmark: (id) => {
        void run(
          () => del(`/bookmarks/${id}`),
          (d) => ({ ...d, bookmarks: d.bookmarks.filter((x) => x.id !== id) }),
        );
      },

      toggleBookmarkFav: (id) => {
        const b = dbRef.current.bookmarks.find((x) => x.id === id);
        if (!b) return;
        const next = { ...b, favorite: !b.favorite };
        void run(
          () => put(`/bookmarks/${id}`, next),
          (d) => ({ ...d, bookmarks: d.bookmarks.map((x) => (x.id === id ? next : x)) }),
        );
      },

      saveWish: (w, done) => {
        return run(
          () => put(`/wishes/${w.id}`, w),
          (d) => ({
            ...d,
            wishes: d.wishes.some((x) => x.id === w.id)
              ? d.wishes.map((x) => (x.id === w.id ? w : x))
              : [w, ...d.wishes],
          }),
          done,
        );
      },

      deleteWish: (id) => {
        void run(
          () => del(`/wishes/${id}`),
          (d) => ({ ...d, wishes: d.wishes.filter((x) => x.id !== id) }),
        );
      },

      addTag: (tag) => {
        if (dbRef.current.tags.some((x) => x.name.toLowerCase() === tag.name.toLowerCase())) return;
        void run(
          () => post('/tags', tag),
          (d) => ({ ...d, tags: [...d.tags, tag] }),
        );
      },

      deleteTag: (name) => {
        void run(
          () => del(`/tags/${encodeURIComponent(name)}`),
          (d) => ({
            ...d,
            tags: d.tags.filter((x) => x.name !== name),
            apps: d.apps.map((a) => ({ ...a, tags: a.tags.filter((x) => x !== name) })),
          }),
        );
      },

      updateSettings: (p, done) => {
        const next = { ...dbRef.current.settings, ...p };
        void run(
          () => put('/settings', next),
          (d) => ({ ...d, settings: next }),
          done,
        );
      },

      signIn: (user) => {
        setDb((d) => ({ ...d, user }));
        // Sesi baru: ambil isi akunnya.
        void loadState().catch(() => toast('Gagal memuat data.', 'error'));
      },

      signOut: () => {
        void (async () => {
          try {
            await post('/auth/logout');
          } catch {
            // Keluar tidak boleh gagal dari sisi pengguna; sesi lokal tetap dibuang.
          }
          setDb(EMPTY);
        })();
      },

      resetData: (done) => {
        void run(
          () => del('/state'),
          (d) => ({ ...EMPTY, user: d.user, settings: { ...EMPTY.settings, notifyEmail: d.user?.email ?? '' } }),
          done,
        );
      },
    };
  }, [
    db,
    loading,
    inFlight,
    uploadPercent,
    online,
    alert,
    dismissAlert,
    t,
    lang,
    toasts,
    toast,
    dismissToast,
    run,
    loadState,
  ]);

  // Jangan render apa pun sebelum sesi diketahui: tanpa ini halaman masuk
  // berkelip sesaat sebelum dashboard muncul.
  if (!ready) return null;

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
