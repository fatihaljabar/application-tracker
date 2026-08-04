import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { settings } from '../db/schema.ts';
import { requireAuth } from '../lib/session.ts';
import { parse, settingsInput } from '../lib/validate.ts';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/**
 * Seluruh pengaturan dikirim sekaligus, bukan sebagian. Klien selalu memegang
 * nilai lengkapnya, dan mengirim utuh menghilangkan pertanyaan "field yang
 * tidak dikirim itu dikosongkan atau dibiarkan".
 *
 * Baris pengaturan dibuat bersamaan dengan akun, jadi di sini pasti sudah ada.
 */
settingsRouter.put('/', async (req, res) => {
  const userId = req.userId as string;
  const input = parse(settingsInput, req.body);

  await db
    .update(settings)
    .set({
      theme: input.theme,
      language: input.language,
      timezone: input.timezone,
      weeklyTarget: input.weeklyTarget,
      monthlyTarget: input.monthlyTarget,
      emailNotif: input.emailNotif,
      dailyReminder: input.dailyReminder,
      notifyEmail: input.notifyEmail,
      cvValidDays: input.cvValidDays,
    })
    .where(eq(settings.userId, userId));

  res.json({ ok: true });
});
