import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { activities, applications } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { activityCreate, parse, uuid } from '../lib/validate.ts';

export const activitiesRouter = Router();
activitiesRouter.use(requireAuth);

/**
 * Aktivitas yang tertaut ke lamaran wajib menunjuk lamaran milik pengguna yang
 * sama. Tanpa ini, aktivitas bisa ditempelkan ke lamaran orang lain — dan
 * karena penyaringan di /state memakai user_id aktivitasnya, kebocorannya baru
 * terlihat dari sisi pemilik lamaran.
 */
async function assertAppOwned(userId: string, appId: string | null) {
  if (!appId) return;
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, appId), eq(applications.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Lamaran tidak ditemukan.', 'appId');
}

activitiesRouter.post('/', async (req, res) => {
  const userId = req.userId as string;
  const input = parse(activityCreate, req.body);
  await assertAppOwned(userId, input.appId);

  await db.insert(activities).values({
    id: input.id,
    userId,
    applicationId: input.appId,
    type: input.type,
    title: input.title,
    description: input.description,
    date: new Date(input.date),
  });

  res.status(201).json({ id: input.id });
});

activitiesRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const [row] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Aktivitas tidak ditemukan.');

  await db.delete(activities).where(eq(activities.id, id));
  res.json({ id, deleted: true });
});
