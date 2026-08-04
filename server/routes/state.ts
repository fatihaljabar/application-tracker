import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
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
} from '../../shared/types.ts';
import { db } from '../db/client.ts';
import {
  activities,
  applicationDocuments,
  applications,
  bookmarks,
  documents,
  interviewNotes,
  reminders,
  settings,
  statusHistory,
  tags,
  users,
  wishes,
} from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';

export const stateRouter = Router();

/**
 * Satu panggilan mengembalikan seluruh data pengguna dalam bentuk DB yang
 * sudah dipakai store.tsx. Itulah sebabnya 12 halaman tidak perlu diubah
 * sama sekali — yang berpindah cuma sumber datanya (TECHNICAL.md § 6).
 *
 * ponytail: sekali muat semuanya akan terasa berat di atas ~1.000 lamaran.
 * Jalan naiknya: pisahkan activities jadi panggilan terpaginasi sendiri —
 * itu bagian terbesar dan paling jarang dilihat seluruhnya.
 */

/** Frontend mengharapkan string ISO, atau string kosong bila tidak ada. */
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : '');

/**
 * Kolom DATE dideklarasikan mode 'string' di skema, jadi nilainya sudah
 * 'YYYY-MM-DD'. Ini disengaja: kalau dibiarkan jadi objek Date, tanggal
 * lamaran bisa bergeser sehari mengikuti zona waktu server — dan pergeseran
 * itu tidak menimbulkan galat apa pun, jadi baru ketahuan dari data yang salah.
 */
const dateOnly = (d: string | null) => d ?? '';

stateRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.userId as string;

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw new ApiError(401, 'unauthenticated', 'Sesi berakhir. Silakan masuk lagi.');

  const [
    appRows,
    activityRows,
    reminderRows,
    docRows,
    noteRows,
    bookmarkRows,
    wishRows,
    tagRows,
    settingsRows,
  ] = await Promise.all([
    db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.createdAt)),
    db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.date)),
    db
      .select()
      .from(reminders)
      .where(eq(reminders.userId, userId))
      .orderBy(asc(reminders.datetime)),
    db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.uploadedAt)),
    db.select().from(interviewNotes).where(eq(interviewNotes.userId, userId)),
    db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.savedAt)),
    db.select().from(wishes).where(eq(wishes.userId, userId)),
    db.select().from(tags).where(eq(tags.userId, userId)),
    db.select().from(settings).where(eq(settings.userId, userId)).limit(1),
  ]);

  // Riwayat status dan kaitan dokumen diambil hanya untuk lamaran milik pengguna
  // ini. Keduanya tidak punya user_id sendiri karena menempel pada lamaran.
  const appIds = appRows.map((a) => a.id);
  const [historyRows, linkRows] = await Promise.all([
    appIds.length
      ? db
          .select()
          .from(statusHistory)
          .where(inArray(statusHistory.applicationId, appIds))
          .orderBy(asc(statusHistory.at))
      : Promise.resolve([]),
    appIds.length
      ? db
          .select()
          .from(applicationDocuments)
          .where(inArray(applicationDocuments.applicationId, appIds))
      : Promise.resolve([]),
  ]);

  const historyByApp = new Map<string, { status: Application['status']; at: string }[]>();
  for (const h of historyRows) {
    const list = historyByApp.get(h.applicationId) ?? [];
    list.push({ status: h.status, at: iso(h.at) });
    historyByApp.set(h.applicationId, list);
  }

  const docsByApp = new Map<string, string[]>();
  for (const l of linkRows) {
    const list = docsByApp.get(l.applicationId) ?? [];
    list.push(l.documentId);
    docsByApp.set(l.applicationId, list);
  }

  const apps: Application[] = appRows.map((a) => ({
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
    appliedDate: dateOnly(a.appliedDate),
    deadline: dateOnly(a.deadline),
    recruiterName: a.recruiterName,
    recruiterEmail: a.recruiterEmail,
    recruiterPhone: a.recruiterPhone,
    notes: a.notes,
    status: a.status,
    tags: a.tags,
    documentIds: docsByApp.get(a.id) ?? [],
    archived: a.archived,
    favorite: a.favorite,
    history: historyByApp.get(a.id) ?? [],
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  }));

  const s = settingsRows[0];
  if (!s) throw new ApiError(500, 'internal', 'Pengaturan pengguna tidak ditemukan.');

  const payload: DB = {
    apps,
    activities: activityRows.map(
      (x): Activity => ({
        id: x.id,
        appId: x.applicationId,
        type: x.type,
        title: x.title,
        description: x.description,
        date: iso(x.date),
      }),
    ),
    reminders: reminderRows.map(
      (x): Reminder => ({
        id: x.id,
        appId: x.applicationId,
        type: x.type,
        title: x.title,
        datetime: iso(x.datetime),
        notes: x.notes,
        done: x.done,
      }),
    ),
    docs: docRows.map(
      (x): DocFile => ({
        id: x.id,
        name: x.name,
        label: x.label,
        group: x.group,
        category: x.category,
        language: x.language,
        version: x.version,
        size: x.size,
        mime: x.mime,
        // Isi berkas tidak pernah ikut di sini. Unduhan lewat endpoint tersendiri
        // yang memeriksa kepemilikan lalu mengalihkan ke presigned URL (M2).
        dataUrl: null,
        uploadedAt: iso(x.uploadedAt),
        note: x.note,
      }),
    ),
    notes: noteRows.map(
      (x): InterviewNote => ({
        id: x.id,
        appId: x.applicationId,
        stage: x.stage,
        date: dateOnly(x.date),
        qa: x.qa,
        feedback: x.feedback,
        strengths: x.strengths,
        weaknesses: x.weaknesses,
        toLearn: x.toLearn,
      }),
    ),
    bookmarks: bookmarkRows.map(
      (x): Bookmark => ({
        id: x.id,
        company: x.company,
        position: x.position,
        url: x.url,
        source: x.source,
        deadline: dateOnly(x.deadline),
        note: x.note,
        favorite: x.favorite,
        savedAt: iso(x.savedAt),
      }),
    ),
    wishes: wishRows.map(
      (x): CompanyWish => ({
        id: x.id,
        company: x.company,
        role: x.role,
        prep: x.prep,
        skills: x.skills,
        deadline: dateOnly(x.deadline),
        notes: x.notes,
      }),
    ),
    tags: tagRows.map((x) => ({ name: x.name, color: x.color })),
    settings: {
      theme: s.theme,
      language: s.language,
      timezone: s.timezone,
      weeklyTarget: s.weeklyTarget,
      monthlyTarget: s.monthlyTarget,
      emailNotif: s.emailNotif,
      dailyReminder: s.dailyReminder,
      notifyEmail: s.notifyEmail,
      cvValidDays: s.cvValidDays,
    } satisfies Settings,
    user: {
      name: userRow.name,
      email: userRow.email,
      provider: 'google',
      // Antarmuka menampilkan inisial di dalam lingkaran, bukan gambar.
      // Foto Google tersimpan di kolomnya sendiri untuk dipakai nanti.
      avatar: initials(userRow.name),
      since: iso(userRow.createdAt),
    },
  };

  res.json(payload);
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
