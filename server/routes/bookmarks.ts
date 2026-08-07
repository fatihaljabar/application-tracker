import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { bookmarks } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { bookmarkInput, parse, uuid } from '../lib/validate.ts';

export const bookmarksRouter = Router();
bookmarksRouter.use(requireAuth);

/** Upsert, alasan sama seperti reminder: satu tombol simpan, id dibuat klien. */
bookmarksRouter.put('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const input = parse(bookmarkInput, req.body);
  if (input.id !== id) throw new ApiError(400, 'invalid_input', 'Id tidak cocok.', 'id');

  const [existing] = await db
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, id))
    .limit(1);
  // 404, bukan 403: 403 justru mengonfirmasi bahwa id ini ada.
  if (existing && existing.userId !== userId) {
    throw new ApiError(404, 'not_found', 'Bookmark tidak ditemukan.');
  }

  const values = {
    userId,
    company: input.company,
    position: input.position,
    url: input.url,
    source: input.source,
    deadline: input.deadline === '' ? null : input.deadline,
    note: input.note,
    favorite: input.favorite,
    savedAt: new Date(input.savedAt),
  };

  if (existing) {
    await db.update(bookmarks).set(values).where(eq(bookmarks.id, id));
  } else {
    await db.insert(bookmarks).values({ id, ...values });
  }
  res.status(existing ? 200 : 201).json({ id });
});

bookmarksRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);
  const [row] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Bookmark tidak ditemukan.');

  await db.delete(bookmarks).where(eq(bookmarks.id, id));
  res.json({ id, deleted: true });
});
