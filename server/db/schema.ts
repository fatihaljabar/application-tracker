import {
  boolean,
  char,
  date,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  ACTIVITY_TYPE_VALUES,
  DOC_CATEGORY_VALUES,
  JOB_TYPE_VALUES,
  PREP_STATUS_VALUES,
  REMINDER_TYPE_VALUES,
  STATUS_VALUES,
  WORK_TYPE_VALUES,
} from '../../shared/types.ts';

/**
 * Skema database. Rancangan dan alasannya di TECHNICAL.md § 5.
 *
 * Tiga aturan yang berlaku di seluruh berkas ini:
 *
 * 1. Semua id CHAR(36) UUID yang dibuat di sisi klien, supaya antarmuka bisa
 *    menampilkan hasil tanpa menunggu balasan server.
 * 2. Setiap tabel milik pengguna membawa user_id sendiri, bukan mengandalkan
 *    join ke induknya. Penyaringan kepemilikan jadi selalu satu kondisi —
 *    itu yang membuat isolation.test.ts bisa sederhana dan meyakinkan.
 * 3. Penghapusan mengalir lewat ON DELETE CASCADE, bukan lewat kode aplikasi.
 *    Database yang menjamin, bukan ingatan pengembang.
 *
 * Daftar nilai enum diimpor dari shared/types.ts supaya hanya ada satu sumber
 * kebenaran untuk frontend dan database.
 */

const id = () => char('id', { length: 36 }).primaryKey();

/**
 * Semua kolom waktu berpresisi milidetik (fsp 3).
 *
 * Tanpa itu MySQL MEMBULATKAN detik pecahan ke atas: 10:00:00.567 tersimpan
 * jadi 10:00:01. Nilai di database lalu terlihat lebih baru daripada yang
 * dipegang klien, dan deteksi konflik antar tab menolak perubahan yang sah —
 * membuat lamaran lalu langsung memindahkan statusnya selalu gagal.
 */
const userRef = () =>
  char('user_id', { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/* ------------------------------------------------------------------ users */
export const users = mysqlTable(
  'users',
  {
    id: id(),
    googleSub: varchar('google_sub', { length: 64 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 512 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    // Dipakai untuk KPI "berapa orang membuka aplikasi 7 hari terakhir" dan untuk
    // menemukan akun tak aktif 24 bulan (PRD § 6.19).
    lastSeenAt: datetime('last_seen_at', { fsp: 3 }).notNull(),
  },
  (t) => [index('idx_last_seen').on(t.lastSeenAt)],
);

/* --------------------------------------------------------------- settings */
export const settings = mysqlTable('settings', {
  userId: char('user_id', { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: mysqlEnum('theme', ['light', 'dark']).notNull().default('light'),
  language: mysqlEnum('language', ['id', 'en']).notNull().default('id'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Jakarta'),
  weeklyTarget: smallint('weekly_target').notNull().default(5),
  monthlyTarget: smallint('monthly_target').notNull().default(20),
  emailNotif: boolean('email_notif').notNull().default(true),
  dailyReminder: boolean('daily_reminder').notNull().default(true),
  notifyEmail: varchar('notify_email', { length: 255 }).notNull(),
  cvValidDays: smallint('cv_valid_days').notNull().default(90),
});

/* ----------------------------------------------------------- applications */
export const applications = mysqlTable(
  'applications',
  {
    id: id(),
    userId: userRef(),
    company: varchar('company', { length: 255 }).notNull(),
    position: varchar('position', { length: 255 }).notNull(),
    department: varchar('department', { length: 255 }).notNull().default(''),
    location: varchar('location', { length: 255 }).notNull().default(''),
    workType: mysqlEnum('work_type', WORK_TYPE_VALUES).notNull().default('WFO'),
    jobType: mysqlEnum('job_type', JOB_TYPE_VALUES).notNull().default('Full Time'),
    salaryMin: int('salary_min'),
    salaryMax: int('salary_max'),
    source: varchar('source', { length: 64 }).notNull().default(''),
    url: varchar('url', { length: 1024 }).notNull().default(''),
    appliedDate: date('applied_date', { mode: 'string' }),
    deadline: date('deadline', { mode: 'string' }),
    recruiterName: varchar('recruiter_name', { length: 255 }).notNull().default(''),
    recruiterEmail: varchar('recruiter_email', { length: 255 }).notNull().default(''),
    recruiterPhone: varchar('recruiter_phone', { length: 32 }).notNull().default(''),
    notes: text('notes').notNull(),
    status: mysqlEnum('status', STATUS_VALUES).notNull().default('wishlist'),
    // Larik nama tag, bentuknya sama persis dengan yang dipakai frontend.
    // Bukan tabel relasi karena tag tidak pernah dicari lintas pengguna.
    tags: json('tags').$type<string[]>().notNull(),
    archived: boolean('archived').notNull().default(false),
    favorite: boolean('favorite').notNull().default(false),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    // Dipakai untuk deteksi konflik antar tab: PUT yang membawa updatedAt lebih
    // lama dari baris di database ditolak dengan 409 (TECHNICAL.md § 7).
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (t) => [
    index('idx_user_status').on(t.userId, t.status),
    index('idx_user_deadline').on(t.userId, t.deadline),
    index('idx_user_created').on(t.userId, t.createdAt),
  ],
);

/* -------------------------------------------------------- status_history */
/**
 * Bersifat tambah-saja. Seluruh statistik di PRD § 6.9 bergantung padanya —
 * "pernah mencapai tahap X" dijawab dari tabel ini, bukan dari status sekarang.
 * Tidak ada kode yang boleh mengubah atau menghapus barisnya, kecuali cascade
 * saat lamaran induknya dihapus.
 */
export const statusHistory = mysqlTable(
  'status_history',
  {
    id: id(),
    applicationId: char('application_id', { length: 36 })
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    status: mysqlEnum('status', STATUS_VALUES).notNull(),
    at: datetime('at', { fsp: 3 }).notNull(),
  },
  (t) => [index('idx_app').on(t.applicationId, t.at)],
);

/* ------------------------------------------------------------- activities */
export const activities = mysqlTable(
  'activities',
  {
    id: id(),
    userId: userRef(),
    applicationId: char('application_id', { length: 36 }).references(() => applications.id, {
      onDelete: 'cascade',
    }),
    type: mysqlEnum('type', ACTIVITY_TYPE_VALUES).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    date: datetime('date', { fsp: 3 }).notNull(),
  },
  (t) => [index('idx_user_date').on(t.userId, t.date)],
);

/* -------------------------------------------------------------- reminders */
export const reminders = mysqlTable(
  'reminders',
  {
    id: id(),
    userId: userRef(),
    applicationId: char('application_id', { length: 36 }).references(() => applications.id, {
      onDelete: 'cascade',
    }),
    type: mysqlEnum('type', REMINDER_TYPE_VALUES).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    datetime: datetime('datetime', { fsp: 3 }).notNull(),
    notes: text('notes').notNull(),
    done: boolean('done').notNull().default(false),
    // Penanda reminder otomatis, contoh "followup:{application_id}". Unik per
    // pengguna supaya reminder yang sudah dihapus tidak dibuat ulang tiap hari.
    autoKey: varchar('auto_key', { length: 128 }),
    // Diisi setelah email berhasil terkirim. Kolom inilah yang menjamin satu
    // kejadian menghasilkan paling banyak satu email (PRD § 6.13).
    sentAt: datetime('sent_at', { fsp: 3 }),
  },
  (t) => [
    unique('uniq_auto').on(t.userId, t.autoKey),
    index('idx_due').on(t.datetime, t.done, t.sentAt),
  ],
);

/* -------------------------------------------------------------- documents */
export const documents = mysqlTable(
  'documents',
  {
    id: id(),
    userId: userRef(),
    // Lokasi di R2: docs/{user_id}/{document_id} — tanpa nama berkas asli,
    // jadi tidak bisa ditebak dan tidak membocorkan informasi.
    objectKey: varchar('object_key', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    group: varchar('group', { length: 255 }).notNull(),
    category: mysqlEnum('category', DOC_CATEGORY_VALUES).notNull(),
    language: mysqlEnum('language', ['id', 'en', '-']).notNull().default('-'),
    version: varchar('version', { length: 32 }).notNull().default('v1'),
    size: int('size').notNull(),
    mime: varchar('mime', { length: 128 }).notNull(),
    note: text('note').notNull(),
    // 'pending' dibuat sebelum presigned URL diberikan, jadi 'ready' setelah
    // klien mengonfirmasi unggahan. Baris pending >24 jam dibersihkan cron,
    // supaya unggahan gagal tidak memakan kuota pengguna (PRD § 6.7).
    state: mysqlEnum('state', ['pending', 'ready']).notNull().default('pending'),
    uploadedAt: datetime('uploaded_at', { fsp: 3 }).notNull(),
  },
  (t) => [index('idx_user_state').on(t.userId, t.state)],
);

/* -------------------------------------------- application_documents (m:n) */
/**
 * Tabel relasi sungguhan, bukan larik JSON: menghapus dokumen wajib melepasnya
 * dari semua lamaran (PRD § 7), dan itu satu DELETE berkat cascade.
 */
export const applicationDocuments = mysqlTable(
  'application_documents',
  {
    applicationId: char('application_id', { length: 36 })
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    documentId: char('document_id', { length: 36 })
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.documentId] })],
);

/* -------------------------------------------------------- interview_notes */
export const interviewNotes = mysqlTable(
  'interview_notes',
  {
    id: id(),
    userId: userRef(),
    applicationId: char('application_id', { length: 36 })
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    stage: varchar('stage', { length: 64 }).notNull(),
    date: date('date', { mode: 'string' }),
    // [{ id, q, a }] — id-nya stabil supaya React tidak salah memasangkan baris
    // saat satu pasangan dihapus.
    qa: json('qa').$type<{ id: string; q: string; a: string }[]>().notNull(),
    feedback: text('feedback').notNull(),
    strengths: text('strengths').notNull(),
    weaknesses: text('weaknesses').notNull(),
    toLearn: text('to_learn').notNull(),
  },
  (t) => [index('idx_user').on(t.userId)],
);

/* -------------------------------------------------------------- bookmarks */
export const bookmarks = mysqlTable(
  'bookmarks',
  {
    id: id(),
    userId: userRef(),
    company: varchar('company', { length: 255 }).notNull(),
    position: varchar('position', { length: 255 }).notNull(),
    url: varchar('url', { length: 1024 }).notNull().default(''),
    source: varchar('source', { length: 64 }).notNull().default(''),
    deadline: date('deadline', { mode: 'string' }),
    note: text('note').notNull(),
    favorite: boolean('favorite').notNull().default(false),
    savedAt: datetime('saved_at', { fsp: 3 }).notNull(),
  },
  (t) => [index('idx_user').on(t.userId)],
);

/* ----------------------------------------------------------------- wishes */
export const wishes = mysqlTable(
  'wishes',
  {
    id: id(),
    userId: userRef(),
    company: varchar('company', { length: 255 }).notNull(),
    role: varchar('role', { length: 255 }).notNull().default(''),
    prep: mysqlEnum('prep', PREP_STATUS_VALUES).notNull().default('not_started'),
    skills: json('skills').$type<string[]>().notNull(),
    deadline: date('deadline', { mode: 'string' }),
    notes: text('notes').notNull(),
  },
  (t) => [index('idx_user').on(t.userId)],
);

/* ------------------------------------------------------------------- tags */
export const tags = mysqlTable(
  'tags',
  {
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 64 }).notNull(),
    color: char('color', { length: 7 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.name] })],
);
