import { count, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { documents, users } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { deleteUserObjects, r2Configured } from '../lib/r2.ts';
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

  /**
   * Kalau penyimpanan tidak aktif, penghapusan DIBATALKAN — tidak dikerjakan
   * separuh.
   *
   * `deleteUserObjects` mengembalikan 0 saat R2 tidak dikonfigurasi, dan tanpa
   * penjaga ini akunnya tetap terhapus sementara berkasnya tertinggal di R2
   * selamanya. Lebih buruk lagi: begitu barisnya hilang, tidak ada lagi yang
   * tahu berkas itu milik siapa, jadi tidak akan pernah bisa dibersihkan.
   *
   * "Hapus akun" berjanji tidak menyisakan apa pun di mana pun. Menolak dengan
   * jujur lebih baik daripada memenuhi setengahnya lalu mengaku selesai.
   */
  if (!r2Configured) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(documents)
      .where(eq(documents.userId, userId));
    if (n > 0) {
      throw new ApiError(
        503,
        'storage_unavailable',
        'Penyimpanan dokumen sedang tidak aktif, jadi berkasmu belum bisa ikut dihapus. Akun tidak jadi dihapus supaya tidak ada yang tertinggal. Coba lagi nanti.',
      );
    }
  }

  const berkasDihapus = await deleteUserObjects(userId);
  await db.delete(users).where(eq(users.id, userId));

  // Cookie dibuang juga. Tanpa ini peramban masih memegang sesi yang menunjuk
  // pengguna yang sudah tidak ada, dan setiap permintaan berikutnya menjawab
  // 401 — benar, tapi membingungkan.
  clearSession(res);

  res.json({ deleted: true, files: berkasDihapus });
});
