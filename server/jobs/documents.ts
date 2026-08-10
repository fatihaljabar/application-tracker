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
 * 24 jam — dan `UTC_TIMESTAMP`, bukan `NOW`.
 *
 * Kolom waktu di tabel ini berisi UTC: pool dikonfigurasi `timezone: 'Z'`,
 * jadi objek Date yang ditulis aplikasi diserialisasi sebagai UTC. Sementara
 * `NOW()` mengembalikan waktu LOKAL server database — di WIB itu tujuh jam
 * lebih maju. Membandingkan keduanya menggeser ambangnya sebesar offset server:
 * diukur langsung, ambang berbasis NOW menyapu baris yang baru berumur 20 jam.
 *
 * `UTC_TIMESTAMP` berada di kerangka yang sama dengan isi kolomnya, jadi
 * ambangnya tepat 24 jam di zona mana pun server itu berdiri.
 *
 * Objek Date dari JavaScript juga benar di sini, dan itulah bentuk aslinya.
 * SQL dipilih supaya kerangka waktunya tertulis di kuerinya sendiri, tidak
 * bergantung pada opsi `timezone` pool tetap seperti sekarang.
 */
const STALE_CUTOFF = sql`UTC_TIMESTAMP(3) - INTERVAL 24 HOUR`;

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
