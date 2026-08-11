import { AwsClient } from 'aws4fetch';
import { count, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { documents } from '../db/schema.ts';
import { env } from './env.ts';
import { ApiError } from './middleware.ts';

/**
 * Presigned URL untuk Cloudflare R2 (TECHNICAL.md § 8).
 *
 * Berkas TIDAK PERNAH lewat proses Node: peramban PUT langsung ke R2, dan
 * mengunduh lewat pengalihan ke presigned GET. Itu sebabnya batas 256kb pada
 * express.json() tidak perlu diubah, dan sebabnya hosting bersama tidak
 * kehabisan memori saat ada yang mengunggah berkas 2 MB.
 *
 * Bucket-nya privat. Satu-satunya cara isinya terbaca adalah lewat URL
 * bertanda tangan yang dibuat di sini, dan semuanya berumur pendek.
 */

const configured = Boolean(
  env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket,
);

/**
 * R2 opsional supaya M1 tetap jalan tanpanya (TECHNICAL.md § 11). Selama
 * variabelnya kosong, endpoint dokumen menolak dengan jujur alih-alih
 * menjatuhkan proses saat start — produksi hari ini memang belum mengisinya.
 */
export const r2Configured = configured;

let client: AwsClient | null = null;

function aws(): AwsClient {
  if (!configured) {
    throw new ApiError(
      503,
      'storage_unavailable',
      'Penyimpanan dokumen belum aktif. Coba lagi nanti.',
    );
  }
  client ??= new AwsClient({
    accessKeyId: env.r2.accessKeyId as string,
    secretAccessKey: env.r2.secretAccessKey as string,
    service: 's3',
    region: 'auto',
  });
  return client;
}

/**
 * Kunci objek: docs/{user_id}/{document_id} — tanpa nama berkas asli, jadi
 * tidak bisa ditebak dan tidak membocorkan informasi (TECHNICAL.md § 8).
 * Keduanya UUID, jadi tidak ada karakter yang perlu di-escape di path.
 */
export const objectKeyFor = (userId: string, documentId: string) => `docs/${userId}/${documentId}`;

const objectUrl = (key: string) =>
  `https://${env.r2.accountId}.r2.cloudflarestorage.com/${env.r2.bucket}/${key}`;

async function presign(
  key: string,
  method: string,
  seconds: number,
  query?: Record<string, string>,
) {
  const url = new URL(objectUrl(key));
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  url.searchParams.set('X-Amz-Expires', String(seconds));
  const signed = await aws().sign(url.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

/** Berlaku 10 menit — cukup untuk unggahan 2 MB di jaringan lambat. */
export const presignPut = (key: string) => presign(key, 'PUT', 600);

/**
 * Berlaku 5 menit, dan MEMAKSA unduhan alih-alih ditampilkan peramban.
 *
 * `attachment` itu penjaga, bukan kenyamanan: tipe berkas dideklarasikan klien
 * dan bisa berbohong, jadi tanpa ini sebuah berkas HTML yang mengaku PDF akan
 * dirender sebagai halaman di domain R2. Cookie aplikasi tidak ikut ke sana,
 * tapi halaman yang bisa dijalankan di domain penyimpanan tetap tidak ada
 * gunanya untuk siapa pun kecuali penyerang.
 *
 * filename* mengikuti RFC 5987 supaya nama berhuruf non-ASCII tetap utuh.
 */
export const presignGet = (key: string, filename: string) =>
  presign(key, 'GET', 300, {
    'response-content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'response-content-type': 'application/octet-stream',
  });

/**
 * Ukuran objek yang BENAR-BENAR terunggah.
 *
 * Ukuran di permintaan awal datang dari klien, dan klien bisa menulis angka
 * berapa pun. Tanpa pemeriksaan ini kuota 20 MB bisa dilewati hanya dengan
 * mengirim `size: 1` lalu mengunggah berkas raksasa — dan kuota itulah satu-
 * satunya rem penyalahgunaan pada layanan gratis (PRD § 10).
 *
 * Mengembalikan null bila objeknya tidak ada, artinya unggahan tidak pernah
 * selesai.
 */
export async function headObjectSize(key: string): Promise<number | null> {
  const res = await aws().fetch(objectUrl(key), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(502, 'storage_error', 'Penyimpanan dokumen tidak merespons.');
  const len = Number(res.headers.get('content-length'));
  return Number.isFinite(len) ? len : null;
}

/**
 * Objek yang sudah tidak ada dianggap sukses: tujuannya "berkas ini hilang",
 * dan 404 sudah memenuhinya. Menganggapnya galat justru membuat baris database
 * mustahil dihapus setelah objeknya lenyap karena sebab lain.
 */
/**
 * Menghapus SELURUH berkas milik satu pengguna, dipakai saat akun dihapus
 * (PRD § 6.19: "termasuk berkas dokumennya").
 *
 * Menyapu berdasarkan prefix, bukan berdasarkan baris di tabel `documents`.
 * Bedanya penting: baris `pending` yang objeknya sudah terunggah tapi belum
 * dikonfirmasi tetap terbawa, begitu juga objek yatim dari kegagalan lama.
 * Menghapus akun harus benar-benar tidak menyisakan apa pun — kalau lewat
 * tabel, yang tertinggal tidak akan pernah bisa ditemukan lagi karena
 * pemiliknya sudah hilang.
 *
 * Mengembalikan jumlah objek yang dihapus.
 */
export async function deleteUserObjects(userId: string): Promise<number> {
  if (!configured) return 0;
  const prefix = `docs/${userId}/`;
  const base = `https://${env.r2.accountId}.r2.cloudflarestorage.com/${env.r2.bucket}`;
  let dihapus = 0;

  // Dilakukan berulang: satu daftar mengembalikan maksimal 1000 kunci, dan
  // kuota 50 dokumen per pengguna membuat satu putaran hampir selalu cukup —
  // tapi objek yatim tidak dibatasi kuota.
  for (let putaran = 0; putaran < 20; putaran++) {
    const res = await aws().fetch(
      `${base}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`,
    );
    if (!res.ok) {
      throw new ApiError(502, 'storage_error', 'Penyimpanan dokumen tidak merespons.');
    }
    const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    // Habis: satu-satunya jalan keluar yang boleh mengaku selesai.
    if (keys.length === 0) return dihapus;
    for (const key of keys) {
      // Kunci dari R2 sendiri, tapi tetap dipastikan berada di bawah prefix
      // pengguna ini — penghapusan massal tidak boleh bisa melebar.
      if (!key.startsWith(prefix)) continue;
      await deleteObject(key);
      dihapus++;
    }
  }

  /**
   * Batas putaran tersentuh dan masih ada sisa.
   *
   * Sebelumnya fungsi ini keluar diam-diam lewat `break` dan mengembalikan
   * angka, tidak bisa dibedakan dari "sudah bersih" — lalu pemanggilnya
   * melanjutkan menghapus baris pengguna, dan sisanya jadi objek yatim yang
   * tidak ada lagi pemiliknya. Melempar galat menahan pemanggilnya, persis
   * seperti kegagalan mendaftar di atas.
   */
  throw new ApiError(
    502,
    'storage_error',
    'Berkas dokumen terlalu banyak untuk dihapus sekaligus. Belum ada yang dihapus dari akunmu — coba lagi.',
  );
}

/**
 * Menghapus seluruh berkas milik seorang pengguna, atau MENOLAK kalau tidak
 * bisa dipastikan bersih.
 *
 * Ada di sini, satu fungsi, karena dua pemanggilnya — hapus akun dan reset data
 * — sama-sama menghapus baris `documents`, dan begitu baris itu hilang tidak
 * ada lagi yang tahu berkas mana milik siapa. Invarian "objek dulu, baru baris"
 * yang berdiri di dua tempat suatu hari akan berdiri di satu tempat saja;
 * reset data memang sudah begitu, dan berkasnya tertinggal di R2 selamanya.
 *
 * `deleteUserObjects` mengembalikan 0 saat R2 tidak dikonfigurasi, yang tidak
 * bisa dibedakan dari "memang tidak punya berkas". Karena itu jumlah barisnya
 * diperiksa dulu, dan penghapusan dibatalkan seluruhnya kalau ada yang akan
 * tertinggal. Menolak dengan jujur lebih baik daripada memenuhi setengahnya
 * lalu mengaku selesai.
 */
export async function deleteUserFilesOrRefuse(userId: string): Promise<number> {
  if (!configured) {
    const [row] = await db
      .select({ n: count() })
      .from(documents)
      .where(eq(documents.userId, userId));
    if ((row?.n ?? 0) > 0) {
      throw new ApiError(
        502,
        'storage_unavailable',
        'Penyimpanan dokumen sedang tidak aktif, jadi berkasmu belum bisa ikut dihapus. Tidak ada yang jadi dihapus supaya tidak ada yang tertinggal. Coba lagi nanti.',
      );
    }
    return 0;
  }
  return deleteUserObjects(userId);
}

export async function deleteObject(key: string): Promise<void> {
  const res = await aws().fetch(objectUrl(key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(502, 'storage_error', 'Gagal menghapus berkas dari penyimpanan.');
  }
}
