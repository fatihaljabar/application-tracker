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
import { seedDB } from './seed';
import { translate } from './i18n';
import { uid } from './utils';

const KEY = 'lacak-lamaran-db-v1';

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      const base = seedDB();
      return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
    }
  } catch {
    /* ignore */
  }
  return seedDB();
}

/** Fungsi murni, sengaja di luar komponen supaya tidak dibuat ulang tiap render. */
const pushActivity = (d: DB, a: Omit<Activity, 'id'>): DB => ({
  ...d,
  activities: [{ ...a, id: uid() }, ...d.activities],
});

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface Ctx {
  db: DB;
  t: (key: string) => string;
  lang: 'id' | 'en';
  toasts: Toast[];
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  // apps
  saveApp: (app: Application) => void;
  addApp: (app: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'history'>) => Application;
  deleteApp: (id: string) => void;
  duplicateApp: (id: string) => void;
  toggleArchive: (id: string) => void;
  toggleFavorite: (id: string) => void;
  moveApp: (id: string, status: Status) => void;
  // activities
  addActivity: (a: Omit<Activity, 'id'>) => void;
  deleteActivity: (id: string) => void;
  // reminders
  saveReminder: (r: Reminder) => void;
  deleteReminder: (id: string) => void;
  toggleReminder: (id: string) => void;
  // docs
  addDoc: (d: Omit<DocFile, 'id'>) => void;
  deleteDoc: (id: string) => void;
  // notes
  saveNote: (n: InterviewNote) => void;
  deleteNote: (id: string) => void;
  // bookmarks
  saveBookmark: (b: Bookmark) => void;
  deleteBookmark: (id: string) => void;
  toggleBookmarkFav: (id: string) => void;
  // wishes
  saveWish: (w: CompanyWish) => void;
  deleteWish: (id: string) => void;
  // tags
  addTag: (t: Tag) => void;
  deleteTag: (name: string) => void;
  // settings & auth
  updateSettings: (patch: Partial<Settings>) => void;
  signIn: (user: UserProfile) => void;
  signOut: () => void;
  resetData: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* quota */
    }
  }, [db]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', db.settings.theme === 'dark');
    root.dataset.theme = db.settings.theme;
  }, [db.settings.theme]);

  const lang = db.settings.language;
  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback(
    (message: string, tone: Toast['tone'] = 'success') => {
      const id = uid();
      setToasts((prev) => [...prev, { id, message, tone }]);
      timers.current[id] = window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 3200);
    },
    [],
  );

  const patch = useCallback((fn: (d: DB) => DB) => setDb((prev) => fn(prev)), []);

  const value: Ctx = useMemo(() => {
    return {
      db,
      t,
      lang,
      toasts,
      toast,
      dismissToast,
      addApp: (data) => {
        const now = new Date().toISOString();
        const app: Application = {
          ...data,
          id: uid(),
          createdAt: now,
          updatedAt: now,
          history: data.status === 'wishlist' ? [] : [{ status: data.status, at: now }],
        };
        patch((d) =>
          pushActivity({ ...d, apps: [app, ...d.apps] }, {
            appId: app.id,
            type: 'created',
            title: `${translate(d.settings.language, 't.type.created')} — ${app.company}`,
            description: `${app.position}${app.location ? ` · ${app.location}` : ''}`,
            date: now,
          }),
        );
        return app;
      },
      saveApp: (app) => {
        patch((d) => ({
          ...d,
          apps: d.apps.map((a) =>
            a.id === app.id ? { ...app, updatedAt: new Date().toISOString() } : a,
          ),
        }));
      },
      deleteApp: (id) =>
        patch((d) => ({
          ...d,
          apps: d.apps.filter((a) => a.id !== id),
          activities: d.activities.filter((a) => a.appId !== id),
          reminders: d.reminders.filter((r) => r.appId !== id),
          notes: d.notes.filter((n) => n.appId !== id),
        })),
      duplicateApp: (id) =>
        patch((d) => {
          const src = d.apps.find((a) => a.id === id);
          if (!src) return d;
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
          return { ...d, apps: [copy, ...d.apps] };
        }),
      toggleArchive: (id) =>
        patch((d) => ({
          ...d,
          apps: d.apps.map((a) => (a.id === id ? { ...a, archived: !a.archived } : a)),
        })),
      toggleFavorite: (id) =>
        patch((d) => ({
          ...d,
          apps: d.apps.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a)),
        })),
      moveApp: (id, status) =>
        patch((d) => {
          const app = d.apps.find((a) => a.id === id);
          if (!app || app.status === status) return d;
          const now = new Date().toISOString();
          const updated: Application = {
            ...app,
            status,
            updatedAt: now,
            appliedDate:
              !app.appliedDate && status !== 'wishlist' ? now.slice(0, 10) : app.appliedDate,
            history: [...app.history, { status, at: now }],
          };
          const next = { ...d, apps: d.apps.map((a) => (a.id === id ? updated : a)) };
          return pushActivity(next, {
            appId: id,
            type: 'status',
            title: `${app.company} → ${translate(d.settings.language, `status.${status}`)}`,
            description: `${app.position}`,
            date: now,
          });
        }),
      addActivity: (a) => patch((d) => pushActivity(d, a)),
      deleteActivity: (id) =>
        patch((d) => ({ ...d, activities: d.activities.filter((x) => x.id !== id) })),
      saveReminder: (r) =>
        patch((d) => ({
          ...d,
          reminders: d.reminders.some((x) => x.id === r.id)
            ? d.reminders.map((x) => (x.id === r.id ? r : x))
            : [r, ...d.reminders],
        })),
      deleteReminder: (id) =>
        patch((d) => ({ ...d, reminders: d.reminders.filter((x) => x.id !== id) })),
      toggleReminder: (id) =>
        patch((d) => ({
          ...d,
          reminders: d.reminders.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
        })),
      addDoc: (doc) => patch((d) => ({ ...d, docs: [{ ...doc, id: uid() }, ...d.docs] })),
      deleteDoc: (id) =>
        patch((d) => ({
          ...d,
          docs: d.docs.filter((x) => x.id !== id),
          apps: d.apps.map((a) => ({ ...a, documentIds: a.documentIds.filter((x) => x !== id) })),
        })),
      saveNote: (n) =>
        patch((d) => ({
          ...d,
          notes: d.notes.some((x) => x.id === n.id)
            ? d.notes.map((x) => (x.id === n.id ? n : x))
            : [n, ...d.notes],
        })),
      deleteNote: (id) => patch((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== id) })),
      saveBookmark: (b) =>
        patch((d) => ({
          ...d,
          bookmarks: d.bookmarks.some((x) => x.id === b.id)
            ? d.bookmarks.map((x) => (x.id === b.id ? b : x))
            : [b, ...d.bookmarks],
        })),
      deleteBookmark: (id) =>
        patch((d) => ({ ...d, bookmarks: d.bookmarks.filter((x) => x.id !== id) })),
      toggleBookmarkFav: (id) =>
        patch((d) => ({
          ...d,
          bookmarks: d.bookmarks.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)),
        })),
      saveWish: (w) =>
        patch((d) => ({
          ...d,
          wishes: d.wishes.some((x) => x.id === w.id)
            ? d.wishes.map((x) => (x.id === w.id ? w : x))
            : [w, ...d.wishes],
        })),
      deleteWish: (id) => patch((d) => ({ ...d, wishes: d.wishes.filter((x) => x.id !== id) })),
      addTag: (tag) =>
        patch((d) =>
          d.tags.some((x) => x.name.toLowerCase() === tag.name.toLowerCase())
            ? d
            : { ...d, tags: [...d.tags, tag] },
        ),
      deleteTag: (name) =>
        patch((d) => ({
          ...d,
          tags: d.tags.filter((x) => x.name !== name),
          apps: d.apps.map((a) => ({ ...a, tags: a.tags.filter((x) => x !== name) })),
        })),
      updateSettings: (p) => patch((d) => ({ ...d, settings: { ...d.settings, ...p } })),
      signIn: (user) => patch((d) => ({ ...d, user })),
      signOut: () => patch((d) => ({ ...d, user: null })),
      resetData: () =>
        setDb(() => {
          const fresh = seedDB();
          return fresh;
        }),
    };
  }, [db, t, lang, toasts, toast, dismissToast, patch]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
