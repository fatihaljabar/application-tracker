import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { settings, users } from '../db/schema.ts';
import { sendNotifyEmailConfirmation } from '../lib/email.ts';
import { buatPenghitung } from '../lib/ratelimit.ts';
import { requireAuth } from '../lib/session.ts';
import { parse, settingsInput } from '../lib/validate.ts';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/**
 * Berapa kali seorang pengguna boleh MEMICU email konfirmasi.
 *
 * Bukan pembatas pada endpoint-nya: pengaturan tersimpan otomatis tanpa tombol
 * simpan (PRD § 6.18), jadi membatasi `PUT /settings` akan menghentikan orang
 * yang cuma menggeser tema. Yang perlu direm hanya email yang keluar — dan itu
 * satu-satunya bagian yang menyentuh kotak masuk orang lain.
 *
 * Ditolak dengan DIAM: pengaturannya tetap tersimpan dan balasannya tetap
 * menyebut alamat yang menunggu, karena dari sudut pengguna tidak ada yang
 * gagal — dia memang sudah dikirimi tautannya, beberapa kali.
 */
const kirimKonfirmasi = buatPenghitung({ max: 5, windowMs: 60 * 60_000 });

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

  /**
   * Alamat tujuan notifikasi TIDAK langsung berlaku.
   *
   * Sebelumnya kolom ini hanya divalidasi bentuknya, jadi siapa pun yang punya
   * akun Google bisa mengarahkan pengingatnya ke alamat orang lain lalu mengisi
   * judul dan catatan reminder dengan tulisannya sendiri — dan korban
   * menerimanya dari domain yang menandatangani DKIM-nya sendiri. Temuan
   * tinjauan keamanan M2+M3.
   *
   * Sekarang alamat baru baru berlaku setelah pemilik alamatnya menekan tautan
   * konfirmasi. Sampai itu terjadi, yang tersimpan tetap yang lama, dan
   * satu-satunya email yang bisa dikirim ke alamat yang belum mengiyakan adalah
   * kalimat konfirmasi yang isinya kita sendiri yang tulis.
   *
   * Alamat akun Google-nya sendiri dikecualikan: itu sudah terbukti miliknya
   * sejak dia berhasil masuk, dan PRD § 6.13 memang menjadikannya nilai bawaan.
   */
  const [kini] = await db
    .select({ notifyEmail: settings.notifyEmail, akun: users.email, nama: users.name })
    .from(settings)
    .innerJoin(users, eq(users.id, settings.userId))
    .where(eq(settings.userId, userId))
    .limit(1);

  const diminta = input.notifyEmail.trim().toLowerCase();
  const perluKonfirmasi =
    !!kini &&
    diminta !== kini.notifyEmail.trim().toLowerCase() &&
    diminta !== kini.akun.trim().toLowerCase();

  if (perluKonfirmasi && kirimKonfirmasi(userId).ok) {
    // Sengaja tidak menunggu hasilnya untuk memutuskan: gagal mengirim email
    // tidak boleh menggagalkan penyimpanan tema, zona waktu, dan target.
    await sendNotifyEmailConfirmation(userId, input.notifyEmail, kini.nama);
  }

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
      // Yang lama dipertahankan sampai alamat barunya dikonfirmasi.
      notifyEmail: perluKonfirmasi ? kini.notifyEmail : input.notifyEmail,
      cvValidDays: input.cvValidDays,
    })
    .where(eq(settings.userId, userId));

  // Klien memakai `notifyEmail` yang dikembalikan, bukan yang dia kirim —
  // kalau tidak, layar akan menampilkan alamat yang server belum menerimanya.
  res.json({
    ok: true,
    notifyEmail: perluKonfirmasi ? kini.notifyEmail : input.notifyEmail,
    pendingNotifyEmail: perluKonfirmasi ? input.notifyEmail : null,
  });
});
