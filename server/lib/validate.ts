import { z } from 'zod';
import {
  ACTIVITY_TYPE_VALUES,
  JOB_TYPE_VALUES,
  PREP_STATUS_VALUES,
  REMINDER_TYPE_VALUES,
  STATUS_VALUES,
  WORK_TYPE_VALUES,
} from '../../shared/types.ts';
import { ApiError } from './middleware.ts';

/**
 * Validasi di batas kepercayaan. Setiap aturan yang ada di frontend diperiksa
 * ulang di sini — pemeriksaan di klien itu kenyamanan, bukan keamanan
 * (TECHNICAL.md § 10.1).
 */

export const uuid = z.string().uuid();

/**
 * Hanya http dan https. Tanpa ini, nilai seperti `javascript:...` yang diketik
 * pengguna akan dipasang apa adanya ke atribut href (TECHNICAL.md § 10.2).
 */
const safeUrl = z
  .string()
  .max(1024)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), {
    message: 'URL harus diawali http:// atau https://',
  });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');
const emptyOr = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal(''), s]);

export const applicationInput = z.object({
  id: uuid,
  company: z.string().trim().min(1, 'Nama perusahaan wajib diisi').max(255),
  position: z.string().trim().min(1, 'Posisi wajib diisi').max(255),
  department: z.string().max(255).default(''),
  location: z.string().max(255).default(''),
  workType: z.enum(WORK_TYPE_VALUES),
  jobType: z.enum(JOB_TYPE_VALUES),
  salaryMin: z.number().int().min(0).max(2_000_000_000).nullable(),
  salaryMax: z.number().int().min(0).max(2_000_000_000).nullable(),
  source: z.string().max(64).default(''),
  url: safeUrl.default(''),
  appliedDate: emptyOr(dateOnly).default(''),
  deadline: emptyOr(dateOnly).default(''),
  recruiterName: z.string().max(255).default(''),
  recruiterEmail: emptyOr(z.string().email('Format email tidak valid').max(255)).default(''),
  recruiterPhone: z.string().max(32).default(''),
  notes: z.string().max(20_000).default(''),
  status: z.enum(STATUS_VALUES),
  tags: z.array(z.string().max(64)).max(50).default([]),
  documentIds: z.array(uuid).max(50).default([]),
  archived: z.boolean().default(false),
  favorite: z.boolean().default(false),
});

/** Perubahan mengirim updatedAt yang dipegang klien, untuk deteksi konflik antar tab. */
export const applicationUpdate = applicationInput.extend({
  updatedAt: z.string().datetime(),
});

/**
 * Judul dan keterangan aktivitas datang dari klien karena isinya sudah
 * diterjemahkan di sana. Memindahkan penyusunannya ke server berarti
 * menggandakan seluruh berkas i18n — dan dua salinan terjemahan suatu hari
 * akan berbeda. Isinya data milik pengguna sendiri, jadi tidak ada yang
 * dipercaya melebihi haknya.
 */
export const activityInput = z.object({
  id: uuid,
  type: z.enum(ACTIVITY_TYPE_VALUES),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(2000).default(''),
});

/**
 * Aktivitas "dibuat" ikut dalam permintaan yang sama supaya lamaran dan entri
 * Timeline-nya lahir dalam satu transaksi. Dua panggilan terpisah bisa berhenti
 * di tengah dan meninggalkan lamaran tanpa jejak di Timeline.
 */
export const applicationCreate = applicationInput.extend({
  activity: activityInput.optional(),
});

/** Aktivitas yang ditambahkan pengguna sendiri lewat halaman Timeline. */
export const activityCreate = activityInput.extend({
  appId: uuid.nullable().default(null),
  date: z.string().datetime(),
});

export const reminderInput = z.object({
  id: uuid,
  appId: uuid.nullable().default(null),
  type: z.enum(REMINDER_TYPE_VALUES),
  title: z.string().trim().min(1, 'Judul wajib diisi').max(255),
  datetime: z.string().datetime(),
  notes: z.string().max(5000).default(''),
  done: z.boolean().default(false),
});

export const noteInput = z.object({
  id: uuid,
  appId: uuid,
  stage: z.string().trim().min(1, 'Tahap wajib diisi').max(64),
  date: emptyOr(dateOnly).default(''),
  qa: z
    .array(z.object({ id: uuid, q: z.string().max(5000), a: z.string().max(20_000) }))
    .max(100)
    .default([]),
  feedback: z.string().max(20_000).default(''),
  strengths: z.string().max(20_000).default(''),
  weaknesses: z.string().max(20_000).default(''),
  toLearn: z.string().max(20_000).default(''),
});

export const bookmarkInput = z.object({
  id: uuid,
  company: z.string().trim().min(1, 'Nama perusahaan wajib diisi').max(255),
  position: z.string().trim().min(1, 'Posisi wajib diisi').max(255),
  url: safeUrl.default(''),
  source: z.string().max(64).default(''),
  deadline: emptyOr(dateOnly).default(''),
  note: z.string().max(5000).default(''),
  favorite: z.boolean().default(false),
  savedAt: z.string().datetime(),
});

export const wishInput = z.object({
  id: uuid,
  company: z.string().trim().min(1, 'Nama perusahaan wajib diisi').max(255),
  role: z.string().max(255).default(''),
  prep: z.enum(PREP_STATUS_VALUES),
  skills: z.array(z.string().max(64)).max(50).default([]),
  deadline: emptyOr(dateOnly).default(''),
  notes: z.string().max(5000).default(''),
});

export const tagInput = z.object({
  name: z.string().trim().min(1, 'Nama tag wajib diisi').max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berupa kode heksadesimal'),
});

export const settingsInput = z.object({
  theme: z.enum(['light', 'dark']),
  language: z.enum(['id', 'en']),
  timezone: z.string().min(1).max(64),
  weeklyTarget: z.number().int().min(1).max(1000),
  monthlyTarget: z.number().int().min(1).max(10_000),
  emailNotif: z.boolean(),
  dailyReminder: z.boolean(),
  notifyEmail: z.string().email('Format email tidak valid').max(255),
  cvValidDays: z.number().int().min(1).max(3650),
});

export const statusChange = z.object({
  status: z.enum(STATUS_VALUES),
  updatedAt: z.string().datetime(),
  activity: activityInput,
});

/** Mengubah galat zod jadi bentuk balasan seragam, lengkap dengan nama kolomnya. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  throw new ApiError(
    400,
    'invalid_input',
    first?.message ?? 'Isian tidak sah.',
    first?.path.join('.') || undefined,
  );
}
