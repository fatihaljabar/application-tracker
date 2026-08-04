import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import {
  activities,
  applicationDocuments,
  applications,
  documents,
  statusHistory,
} from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { applicationInput, applicationUpdate, parse, statusChange, uuid } from '../lib/validate.ts';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

/** Kepemilikan diperiksa lewat query, bukan dengan mengambil lalu membandingkan. */
async function ownedOrThrow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Lamaran tidak ditemukan.');
  return row;
}

/**
 * Dokumen yang ditautkan wajib milik pengguna yang sama. Tanpa pemeriksaan ini,
 * seseorang bisa menautkan dokumen milik orang lain ke lamarannya sendiri dan
 * membacanya lewat endpoint unduhan nanti.
 */
async function assertDocumentsOwned(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.userId, userId), inArray(documents.id, ids)));
  if (rows.length !== ids.length) {
    throw new ApiError(403, 'forbidden', 'Ada dokumen yang bukan milik Anda.', 'documentIds');
  }
}

const emptyToNull = (v: string) => (v === '' ? null : v);

applicationsRouter.post('/', async (req, res) => {
  const userId = req.userId as string;
  const input = parse(applicationInput, req.body);
  await assertDocumentsOwned(userId, input.documentIds);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(applications).values({
      id: input.id,
      userId,
      company: input.company,
      position: input.position,
      department: input.department,
      location: input.location,
      workType: input.workType,
      jobType: input.jobType,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      source: input.source,
      url: input.url,
      appliedDate: emptyToNull(input.appliedDate),
      deadline: emptyToNull(input.deadline),
      recruiterName: input.recruiterName,
      recruiterEmail: input.recruiterEmail,
      recruiterPhone: input.recruiterPhone,
      notes: input.notes,
      status: input.status,
      tags: input.tags,
      archived: input.archived,
      favorite: input.favorite,
      createdAt: now,
      updatedAt: now,
    });

    // Lamaran yang dibuat langsung di tahap selain wishlist sudah punya satu
    // riwayat, persis seperti perilaku demo.
    if (input.status !== 'wishlist') {
      await tx
        .insert(statusHistory)
        .values({ id: randomUUID(), applicationId: input.id, status: input.status, at: now });
    }
    if (input.documentIds.length) {
      await tx
        .insert(applicationDocuments)
        .values(input.documentIds.map((d) => ({ applicationId: input.id, documentId: d })));
    }
  });

  res
    .status(201)
    .json({ id: input.id, createdAt: now.toISOString(), updatedAt: now.toISOString() });
});

applicationsRouter.put('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const input = parse(applicationUpdate, req.body);
  if (input.id !== id) throw new ApiError(400, 'invalid_input', 'Id tidak cocok.', 'id');

  const current = await ownedOrThrow(userId, id);
  await assertDocumentsOwned(userId, input.documentIds);

  // Deteksi konflik antar tab: kalau baris di database lebih baru daripada yang
  // dipegang klien, perubahan ini ditolak agar tidak menimpa pekerjaan tab lain.
  if (current.updatedAt.getTime() > new Date(input.updatedAt).getTime()) {
    throw new ApiError(409, 'conflict', 'Data ini baru saja berubah di tempat lain.');
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({
        company: input.company,
        position: input.position,
        department: input.department,
        location: input.location,
        workType: input.workType,
        jobType: input.jobType,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        source: input.source,
        url: input.url,
        appliedDate: emptyToNull(input.appliedDate),
        deadline: emptyToNull(input.deadline),
        recruiterName: input.recruiterName,
        recruiterEmail: input.recruiterEmail,
        recruiterPhone: input.recruiterPhone,
        notes: input.notes,
        status: input.status,
        tags: input.tags,
        archived: input.archived,
        favorite: input.favorite,
        updatedAt: now,
      })
      .where(eq(applications.id, id));

    // Tautan dokumen ditulis ulang seluruhnya: jumlahnya kecil dan cara ini
    // menghilangkan seluruh kelas bug "selisih tautan yang tidak sinkron".
    await tx.delete(applicationDocuments).where(eq(applicationDocuments.applicationId, id));
    if (input.documentIds.length) {
      await tx
        .insert(applicationDocuments)
        .values(input.documentIds.map((d) => ({ applicationId: id, documentId: d })));
    }
  });

  res.json({ id, updatedAt: now.toISOString() });
});

/**
 * Pindah status: menulis riwayat dan aktivitas dalam satu transaksi.
 * Ketiganya harus berhasil bersama — riwayat status adalah dasar seluruh
 * statistik di PRD § 6.9, jadi status yang berpindah tanpa riwayat akan
 * merusak angka tanpa menimbulkan galat apa pun.
 */
applicationsRouter.patch('/:id/status', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const input = parse(statusChange, req.body);

  const current = await ownedOrThrow(userId, id);
  if (current.updatedAt.getTime() > new Date(input.updatedAt).getTime()) {
    throw new ApiError(409, 'conflict', 'Data ini baru saja berubah di tempat lain.');
  }
  if (current.status === input.status) {
    res.json({ id, updatedAt: current.updatedAt.toISOString(), changed: false });
    return;
  }

  const now = new Date();
  // Tanggal melamar terisi otomatis saat pertama kali keluar dari wishlist,
  // hanya bila masih kosong (PRD § 6.3).
  const appliedDate =
    !current.appliedDate && input.status !== 'wishlist'
      ? now.toISOString().slice(0, 10)
      : current.appliedDate;

  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ status: input.status, appliedDate, updatedAt: now })
      .where(eq(applications.id, id));
    await tx
      .insert(statusHistory)
      .values({ id: randomUUID(), applicationId: id, status: input.status, at: now });
    await tx.insert(activities).values({
      id: input.activity.id,
      userId,
      applicationId: id,
      type: input.activity.type,
      title: input.activity.title,
      description: input.activity.description,
      date: now,
    });
  });

  res.json({ id, updatedAt: now.toISOString(), appliedDate: appliedDate ?? '', changed: true });
});

applicationsRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  await ownedOrThrow(userId, id);
  // Riwayat status, aktivitas, reminder, dan catatan interview ikut terhapus
  // lewat ON DELETE CASCADE — dijamin database, bukan diingat kode.
  await db.delete(applications).where(eq(applications.id, id));
  res.json({ id, deleted: true });
});
