import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { applications, tags } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { requireAuth } from '../lib/session.ts';
import { parse, tagInput } from '../lib/validate.ts';

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

tagsRouter.post('/', async (req, res) => {
  const userId = req.userId as string;
  const input = parse(tagInput, req.body);

  // Nama tag unik tanpa membedakan huruf besar/kecil (PRD § 6.11). Kunci primer
  // (user_id, name) hanya menjamin keunikan persis, jadi pemeriksaan ini nyata.
  const existing = await db.select({ name: tags.name }).from(tags).where(eq(tags.userId, userId));
  if (existing.some((t) => t.name.toLowerCase() === input.name.toLowerCase())) {
    throw new ApiError(409, 'duplicate', 'Tag dengan nama itu sudah ada.', 'name');
  }
  if (existing.length >= 50) {
    throw new ApiError(413, 'too_many', 'Jumlah tag sudah mencapai batas.', 'name');
  }

  await db.insert(tags).values({ userId, name: input.name, color: input.color });
  res.status(201).json({ name: input.name, color: input.color });
});

/**
 * Menghapus tag juga melepasnya dari semua lamaran (PRD § 6.11) — tanpa itu,
 * lamaran akan menyimpan nama tag yang tidak punya warna lagi.
 *
 * Larik tag disaring di sini lalu ditulis ulang, bukan lewat fungsi JSON MySQL:
 * jumlah lamaran per pengguna kecil, dan kode yang bisa dibaca lebih berharga
 * daripada satu query yang pintar. Semuanya dalam satu transaksi.
 */
tagsRouter.delete('/:name', async (req, res) => {
  const userId = req.userId as string;
  const name = decodeURIComponent(req.params.name);

  const [row] = await db
    .select({ name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Tag tidak ditemukan.');

  await db.transaction(async (tx) => {
    await tx.delete(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));

    const rows = await tx
      .select({ id: applications.id, tags: applications.tags })
      .from(applications)
      .where(eq(applications.userId, userId));

    for (const app of rows) {
      if (!app.tags.includes(name)) continue;
      await tx
        .update(applications)
        .set({ tags: app.tags.filter((t) => t !== name) })
        .where(eq(applications.id, app.id));
    }
  });

  res.json({ name, deleted: true });
});
