import { randomUUID } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { applications, reminders, settings } from '../db/schema.ts';
import { autoKeyFor, dismissFollowup } from '../jobs/followup.ts';
import { autoKeyTurunan, judulTurunan, turunanUntuk } from '../lib/ahead.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { parse, reminderInput, uuid } from '../lib/validate.ts';

export const remindersRouter = Router();
remindersRouter.use(requireAuth);

async function assertAppOwned(userId: string, appId: string | null) {
  if (!appId) return;
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, appId), eq(applications.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Lamaran tidak ditemukan.', 'appId');
}

/**
 * PUT bersifat upsert karena antarmuka memakai satu tombol simpan untuk membuat
 * maupun mengubah, dan id dibuat di sisi klien. Menandai selesai juga lewat sini
 * — klien sudah memegang seluruh isi reminder, jadi tidak perlu endpoint sendiri
 * hanya untuk membalik satu boolean.
 */
remindersRouter.put('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const input = parse(reminderInput, req.body);
  if (input.id !== id) throw new ApiError(400, 'invalid_input', 'Id tidak cocok.', 'id');
  await assertAppOwned(userId, input.appId);

  const [existing] = await db
    .select({ id: reminders.id, userId: reminders.userId })
    .from(reminders)
    .where(eq(reminders.id, id))
    .limit(1);

  // Id ada tapi milik orang lain: jangan pernah menimpanya, dan jangan pula
  // membocorkan bahwa id itu ada.
  if (existing && existing.userId !== userId) {
    throw new ApiError(404, 'not_found', 'Reminder tidak ditemukan.');
  }

  const values = {
    userId,
    applicationId: input.appId,
    type: input.type,
    title: input.title,
    datetime: new Date(input.datetime),
    notes: input.notes,
    done: input.done,
  };

  if (existing) {
    await db.update(reminders).set(values).where(eq(reminders.id, id));
  } else {
    await db.insert(reminders).values({ id, ...values });
  }

  /**
   * Pengingat turunan dibuat DI SINI, saat pengguna menyimpan jadwalnya —
   * bukan lewat tugas terjadwal (PRD § 6.6: "dibuat saat pengguna mengisi
   * jadwal interview").
   *
   * Alasannya bukan kemudahan. Tugas terjadwal akan membuat ulang turunan yang
   * sudah pengguna hapus, setiap kali ia berputar — persis masalah yang
   * memaksa follow-up butuh kolom penanda sendiri. Dibuat sekali di sini, dan
   * penghapusan pengguna bertahan karena tidak ada yang menjalankannya lagi.
   *
   * Turunan lama dibuang lebih dulu supaya mengubah jam interview memindahkan
   * peringatannya juga. Tanpa itu, mengubah jadwal meninggalkan peringatan yang
   * menunjuk waktu yang sudah tidak berlaku.
   */
  await db
    .delete(reminders)
    .where(and(eq(reminders.userId, userId), like(reminders.autoKey, `ahead:%:${id}`)));

  if (!input.done) {
    const [pref] = await db
      .select({ timezone: settings.timezone })
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    const turunan = turunanUntuk(input.type, new Date(input.datetime), pref?.timezone ?? 'UTC');
    if (turunan.length) {
      await db.insert(reminders).values(
        turunan.map((t) => ({
          id: randomUUID(),
          userId,
          applicationId: input.appId,
          type: input.type,
          title: judulTurunan(t.kunci, input.title),
          datetime: t.at,
          notes: input.notes,
          done: false,
          autoKey: autoKeyTurunan(id, t.kunci),
        })),
      );
    }
  }

  res.status(existing ? 200 : 201).json({ id });
});

remindersRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const [row] = await db
    .select({
      id: reminders.id,
      autoKey: reminders.autoKey,
      applicationId: reminders.applicationId,
    })
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Reminder tidak ditemukan.');

  // Menghapus reminder follow-up OTOMATIS berarti "jangan tawarkan lagi", bukan
  // sekadar "hilangkan hari ini" (PRD § 6.6). Tanpa penanda ini tugas harian
  // membuatnya lagi besok, karena keunikan auto_key ikut hilang bersama
  // barisnya — dan pengguna akan merasa penghapusannya diabaikan.
  if (row.applicationId && row.autoKey === autoKeyFor(row.applicationId)) {
    await dismissFollowup(row.applicationId, userId);
  }

  // Menghapus jadwalnya juga membuang peringatan turunannya. Membiarkannya
  // berarti pengguna tetap diingatkan soal interview yang sudah ia batalkan.
  await db
    .delete(reminders)
    .where(and(eq(reminders.userId, userId), like(reminders.autoKey, `ahead:%:${id}`)));
  await db.delete(reminders).where(eq(reminders.id, id));
  res.json({ id, deleted: true });
});
