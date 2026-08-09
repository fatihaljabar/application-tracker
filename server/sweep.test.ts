import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { inArray } from 'drizzle-orm';
import { db } from './db/client.ts';
import { documents, settings, users } from './db/schema.ts';
import { sweepPendingDocuments } from './jobs/documents.ts';
import { r2Configured } from './lib/r2.ts';

/**
 * Pembersih berkas gantung menghapus data, dan itu satu-satunya alasan berkas
 * tes ini ada. Kalau batas waktunya terbalik atau penyaring `state` hilang,
 * yang terhapus bukan sampah melainkan dokumen pengguna yang sah — persis
 * "kehilangan data diam-diam" yang disebut PRD § 9 sebagai cacat paling serius.
 *
 * Tesnya menguji MAKSUD, bukan sekadar perilaku: baris `ready` tua dan baris
 * `pending` yang masih baru dimasukkan justru supaya keduanya terbukti SELAMAT.
 * Tanpa dua baris itu, sebuah sapuan yang menghapus seluruh isi tabel juga
 * akan lulus.
 *
 * Kunci objek yang dipakai di sini milik pengguna sekali pakai yang baru dibuat
 * dan tidak pernah punya berkas, jadi permintaan hapus ke R2 menyasar objek
 * yang memang tidak ada dan tidak mungkin menyentuh milik siapa pun.
 */

const userId = randomUUID();

const rows = {
  stale: randomUUID(),
  recent: randomUUID(),
  readyOld: randomUUID(),
};

/**
 * Umur baris ditulis dengan jam MySQL (`NOW(3) - INTERVAL ? HOUR`), bukan jam
 * JavaScript — dan itu bukan detail gaya.
 *
 * Versi pertama tes ini memakai `new Date(Date.now() - 25 jam)` dan LULUS di
 * atas penyapu yang cacat: pool mengirim Date sebagai UTC sementara zona sesi
 * MySQL `SYSTEM`, jadi baris yang ditulis dan batas waktu yang dibandingkan
 * meleset sama besar dan saling meniadakan. Cacatnya baru terlihat ketika baris
 * gantung dibuat lewat jalur lain: penyapu ternyata baru bekerja setelah 31 jam.
 *
 * Menulis umur lewat MySQL membuat tes ini memihak kebenaran, bukan memihak
 * implementasinya.
 */
async function insertDoc(id: string, state: 'pending' | 'ready', hoursAgo: number) {
  await db.$client.query(
    'INSERT INTO documents (id, user_id, object_key, name, label, `group`, category, size, mime, note, state, uploaded_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?, NOW(3) - INTERVAL ? HOUR)',
    [
      id,
      userId,
      `docs/${userId}/${id}`,
      'cv.pdf',
      'CV',
      'CV Utama',
      'cv',
      1024,
      'application/pdf',
      '',
      state,
      hoursAgo,
    ],
  );
}

const idsLeft = async () => {
  const found = await db
    .select({ id: documents.id })
    .from(documents)
    .where(inArray(documents.id, Object.values(rows)));
  return new Set(found.map((r) => r.id));
};

describe('sapu dokumen gantung', () => {
  before(async () => {
    const at = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        googleSub: `sweep-test-${userId}`,
        email: `sweep-${userId}@sweep.test`,
        name: 'Pengguna Sapu',
        avatarUrl: null,
        createdAt: at,
        lastSeenAt: at,
      });
      await tx.insert(settings).values({ userId, notifyEmail: `sweep-${userId}@sweep.test` });
    });

    // 25 jam: gantung, harus disapu. 1 jam: masih berjalan, harus selamat.
    // 25 jam tapi `ready`: berkas sungguhan yang lama, harus selamat.
    await insertDoc(rows.stale, 'pending', 25);
    await insertDoc(rows.recent, 'pending', 1);
    await insertDoc(rows.readyOld, 'ready', 25);
  });

  after(async () => {
    await db.delete(users).where(inArray(users.id, [userId]));
    const [left] = await db.$client.query('SELECT COUNT(*) AS n FROM documents WHERE user_id = ?', [
      userId,
    ]);
    assert.equal(Number((left as { n: number }[])[0]?.n), 0, 'data uji sapu masih tertinggal');
    await db.$client.end();
  });

  it('tanpa kredensial R2 tidak menghapus apa pun', async (t) => {
    if (r2Configured) {
      t.skip('R2 terkonfigurasi — kasus ini hanya berlaku tanpa kredensial');
      return;
    }
    // Menghapus baris tanpa bisa menghapus objeknya akan meninggalkan berkas
    // yatim di R2 begitu kredensialnya diisi nanti. Lebih baik tidak menyapu.
    assert.equal(await sweepPendingDocuments(), 0);
    assert.equal((await idsLeft()).size, 3, 'baris terhapus padahal R2 tidak aktif');
  });

  it('hanya membuang pending yang lewat 24 jam', async (t) => {
    if (!r2Configured) {
      t.skip('butuh kredensial R2 — penghapusan objek tidak bisa dilewati');
      return;
    }
    const removed = await sweepPendingDocuments();
    assert.ok(removed >= 1, 'tidak ada satu pun baris gantung yang tersapu');

    const left = await idsLeft();
    assert.ok(!left.has(rows.stale), 'pending 25 jam tidak tersapu');
    // Dua ini yang membuat tesnya bermakna.
    assert.ok(
      left.has(rows.recent),
      'pending yang baru 1 jam ikut terhapus — batas waktunya salah',
    );
    assert.ok(left.has(rows.readyOld), 'dokumen READY ikut terhapus — ini kehilangan data');
  });

  it('sapuan kedua tidak menghapus apa-apa lagi', async (t) => {
    if (!r2Configured) {
      t.skip('butuh kredensial R2');
      return;
    }
    // Idempoten: penjadwal menjalankannya sekali tiap start, dan di hosting ini
    // proses sering didaur ulang.
    const before = await idsLeft();
    await sweepPendingDocuments();
    assert.deepEqual(await idsLeft(), before);
  });
});
