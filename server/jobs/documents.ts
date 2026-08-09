import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { documents } from '../db/schema.ts';
import { deleteObject, r2Configured } from '../lib/r2.ts';

/**
 * Pembersih berkas gantung (PRD § 6.7: "unggahan yang gagal tidak meninggalkan
 * sampah yang menghabiskan kuota pengguna").
 *
 * Baris `pending` lahir saat pengguna meminta URL unggah. Kalau peramban tidak
 * pernah menyelesaikan PUT-nya — koneksi putus, tab ditutup, unggahan dibatalkan
 * — barisnya tertinggal selamanya. Ini bukan dugaan: dua baris seperti itu benar
 * -benar tertinggal saat endpoint unggah diuji.
 *
 * Yang dimakannya adalah jatah JUMLAH dokumen (50), bukan kuota byte — kuota
 * byte hanya menghitung baris `ready`. Jadi akibatnya pengguna bisa kehabisan
 * jatah dokumen tanpa punya satu pun berkas.
 */

/**
 * 24 jam, dihitung OLEH MySQL — bukan di JavaScript.
 *
 * Ini bukan selera. Pool dikonfigurasi `timezone: 'Z'` sehingga objek Date
 * dikirim sebagai UTC, sementara zona sesi MySQL mengikuti `SYSTEM`. Sebuah
 * `new Date(Date.now() - 24 jam)` karena itu sampai di MySQL sebagai waktu yang
 * meleset sebesar offset server: diukur di sini, "24 jam lalu" diterima sebagai
 * 31 jam lalu di zona WIB (+7).
 *
 * Di server dengan offset positif akibatnya cuma menyapu terlambat. Di server
 * dengan offset NEGATIF arahnya terbalik — baris yang belum 24 jam ikut
 * terhapus, dan itu menghapus unggahan yang masih berjalan. Membiarkan MySQL
 * mengurangi waktunya sendiri membuat seluruh pertanyaan itu tidak ada.
 */
const STALE_CUTOFF = sql`NOW(3) - INTERVAL 24 HOUR`;

/**
 * Dibatasi supaya satu putaran tidak memegang koneksi pool terlalu lama —
 * pool-nya cuma 5 di hosting bersama (TECHNICAL § 5). Sisanya terangkut di
 * putaran berikutnya.
 */
const BATCH = 200;

/**
 * Objek dihapus lebih dulu, baru barisnya — urutan yang sama seperti
 * DELETE /documents/:id, dan alasannya sama: baris yang hilang duluan membuat
 * objeknya mustahil ditemukan lagi.
 *
 * Kegagalan satu baris tidak boleh menghentikan sisanya. Berkas yang gagal
 * dihapus tetap punya barisnya, jadi putaran besok mencobanya lagi.
 */
export async function sweepPendingDocuments(): Promise<number> {
  // Tanpa kredensial, menghapus objek mustahil — dan menghapus barisnya saja
  // akan membuat berkasnya yatim di R2 begitu kredensialnya diisi nanti.
  if (!r2Configured) return 0;

  const stale = await db
    .select({ id: documents.id, objectKey: documents.objectKey })
    .from(documents)
    .where(and(eq(documents.state, 'pending'), lt(documents.uploadedAt, STALE_CUTOFF)))
    .limit(BATCH);

  let removed = 0;
  for (const row of stale) {
    try {
      // Objek yang memang tidak pernah ada ikut lolos di sini: deleteObject
      // menganggap 404 sebagai sukses, dan itu memang kasus paling umum —
      // baris pending yang PUT-nya tidak pernah terjadi.
      await deleteObject(row.objectKey);
      await db.delete(documents).where(eq(documents.id, row.id));
      removed++;
    } catch (err) {
      console.error('[sweep] gagal membersihkan dokumen', row.id, err);
    }
  }
  return removed;
}
