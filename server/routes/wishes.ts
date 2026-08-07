import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { wishes } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { parse, uuid, wishInput } from '../lib/validate.ts';

export const wishesRouter = Router();
wishesRouter.use(requireAuth);

/** Upsert, alasan sama seperti reminder: satu tombol simpan, id dibuat klien. */
wishesRouter.put('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const input = parse(wishInput, req.body);
  if (input.id !== id) throw new ApiError(400, 'invalid_input', 'Id tidak cocok.', 'id');

  const [existing] = await db
    .select({ userId: wishes.userId })
    .from(wishes)
    .where(eq(wishes.id, id))
    .limit(1);
  // 404, bukan 403: 403 justru mengonfirmasi bahwa id ini ada.
  if (existing && existing.userId !== userId) {
    throw new ApiError(404, 'not_found', 'Wishlist tidak ditemukan.');
  }

  const values = {
    userId,
    company: input.company,
    role: input.role,
    prep: input.prep,
    skills: input.skills,
    deadline: input.deadline === '' ? null : input.deadline,
    notes: input.notes,
  };

  if (existing) {
    await db.update(wishes).set(values).where(eq(wishes.id, id));
  } else {
    await db.insert(wishes).values({ id, ...values });
  }
  res.status(existing ? 200 : 201).json({ id });
});

wishesRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const [row] = await db
    .select({ id: wishes.id })
    .from(wishes)
    .where(and(eq(wishes.id, id), eq(wishes.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Wishlist tidak ditemukan.');

  await db.delete(wishes).where(eq(wishes.id, id));
  res.json({ id, deleted: true });
});
