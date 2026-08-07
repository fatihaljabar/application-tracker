import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { applications, reminders } from '../db/schema.ts';
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

  res.status(existing ? 200 : 201).json({ id });
});

remindersRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const [row] = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Reminder tidak ditemukan.');

  await db.delete(reminders).where(eq(reminders.id, id));
  res.json({ id, deleted: true });
});
