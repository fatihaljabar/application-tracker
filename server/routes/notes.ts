import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { applications, interviewNotes } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { noteInput, parse, uuid } from '../lib/validate.ts';

export const notesRouter = Router();
notesRouter.use(requireAuth);

/** Catatan interview selalu menempel pada satu lamaran, jadi appId wajib ada. */
async function assertAppOwned(userId: string, appId: string) {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, appId), eq(applications.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Lamaran tidak ditemukan.', 'appId');
}

/** Upsert, alasan yang sama seperti reminder: satu tombol simpan, id dari klien. */
notesRouter.put('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const input = parse(noteInput, req.body);
  if (input.id !== id) throw new ApiError(400, 'invalid_input', 'Id tidak cocok.', 'id');
  await assertAppOwned(userId, input.appId);

  const [existing] = await db
    .select({ id: interviewNotes.id, userId: interviewNotes.userId })
    .from(interviewNotes)
    .where(eq(interviewNotes.id, id))
    .limit(1);
  if (existing && existing.userId !== userId) {
    throw new ApiError(404, 'not_found', 'Catatan tidak ditemukan.');
  }

  const values = {
    userId,
    applicationId: input.appId,
    stage: input.stage,
    date: input.date === '' ? null : input.date,
    qa: input.qa,
    feedback: input.feedback,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    toLearn: input.toLearn,
  };

  if (existing) {
    await db.update(interviewNotes).set(values).where(eq(interviewNotes.id, id));
  } else {
    await db.insert(interviewNotes).values({ id, ...values });
  }

  res.status(existing ? 200 : 201).json({ id });
});

notesRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const [row] = await db
    .select({ id: interviewNotes.id })
    .from(interviewNotes)
    .where(and(eq(interviewNotes.id, id), eq(interviewNotes.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Catatan tidak ditemukan.');

  await db.delete(interviewNotes).where(eq(interviewNotes.id, id));
  res.json({ id, deleted: true });
});
