import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { settings, users } from '../db/schema.ts';
import { verifyGoogleIdToken } from '../lib/google.ts';
import { ApiError } from '../lib/middleware.ts';
import { clearSession, readSession, setSession } from '../lib/session.ts';

export const authRouter = Router();

/** Bentuk pengguna yang dikirim ke frontend. Tidak ada field lain yang bocor. */
function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    since: row.createdAt,
  };
}

authRouter.post('/google', async (req, res) => {
  const credential = (req.body as { credential?: unknown })?.credential;
  if (typeof credential !== 'string') {
    throw new ApiError(400, 'bad_request', 'Token Google tidak dikirim.', 'credential');
  }

  const profile = await verifyGoogleIdToken(credential);
  const now = new Date();

  const [existing] = await db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1);

  let user = existing;
  if (user) {
    // Nama dan foto bisa berubah di sisi Google; ikutkan supaya tidak basi.
    await db
      .update(users)
      .set({ name: profile.name, avatarUrl: profile.picture, lastSeenAt: now })
      .where(eq(users.id, user.id));
    user = { ...user, name: profile.name, avatarUrl: profile.picture, lastSeenAt: now };
  } else {
    const id = randomUUID();
    user = {
      id,
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
      createdAt: now,
      lastSeenAt: now,
    };
    // Akun baru selalu punya baris pengaturan, supaya tidak ada jalur kode yang
    // harus menangani "pengaturan belum ada".
    await db.transaction(async (tx) => {
      await tx.insert(users).values(user);
      await tx.insert(settings).values({ userId: id, notifyEmail: profile.email });
    });
  }

  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/** Dipakai frontend saat dimuat untuk tahu apakah sesi masih sah. */
authRouter.get('/me', async (req, res) => {
  const userId = readSession(req);
  if (!userId) {
    res.json({ user: null });
    return;
  }
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) {
    // Sesi menunjuk pengguna yang sudah dihapus — perlakukan sebagai keluar.
    clearSession(res);
    res.json({ user: null });
    return;
  }
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.id));
  res.json({ user: publicUser(row) });
});
