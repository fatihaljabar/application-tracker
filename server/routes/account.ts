import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { deleteUserFilesOrRefuse } from '../lib/r2.ts';
import { clearSession, requireAuth } from '../lib/session.ts';

export const accountRouter = Router();
accountRouter.use(requireAuth);

/**
 * Menghapus akun beserta SELURUH isinya (PRD § 6.19).
 *
 * Tidak bisa dibatalkan, dan itu memang maksudnya. Halaman privasi sudah
 * menjanjikan penghapusan ini; sampai endpoint ada, janji itu ditepati manual
 * satu per satu.
 *
 * Urutannya berkas dulu, baru baris — sama seperti DELETE /documents/:id dan
 * karena alasan yang sama: begitu baris pengguna hilang, tidak ada lagi yang
 * tahu berkas mana miliknya, dan objeknya jadi yatim selamanya di R2. Kalau
 * penghapusan berkas gagal, akunnya SENGAJA dibiarkan utuh supaya pengguna
 * bisa mencoba lagi, alih-alih kehilangan akses ke data yang berkasnya masih
 * ada di sana.
 *
 * Menghapus baris `users` membawa semuanya lewat ON DELETE CASCADE: lamaran,
 * riwayat status, aktivitas, reminder, catatan, dokumen, bookmark, wishlist,
 * tag, dan pengaturan. Itu satu DELETE, dan cascade-nya sudah diuji di
 * isolation.test.ts sejak M1.
 */
accountRouter.delete('/', async (req, res) => {
  const userId = req.userId as string;

  // Berkas dulu, baru baris. Melempar kalau ada yang akan tertinggal, jadi
  // akunnya sengaja dibiarkan utuh — "hapus akun" berjanji tidak menyisakan apa
  // pun di mana pun, dan memenuhi setengahnya lebih buruk daripada menolak.
  const berkasDihapus = await deleteUserFilesOrRefuse(userId);
  await db.delete(users).where(eq(users.id, userId));

  // Cookie dibuang juga. Tanpa ini peramban masih memegang sesi yang menunjuk
  // pengguna yang sudah tidak ada, dan setiap permintaan berikutnya menjawab
  // 401 — benar, tapi membingungkan.
  clearSession(res);

  res.json({ deleted: true, files: berkasDihapus });
});
