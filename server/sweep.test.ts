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
  justOver: randomUUID(),
  justUnder: randomUUID(),
  recent: randomUUID(),
  readyOld: randomUUID(),
};

/**
 * Umur baris ditulis PERSIS SEPERTI APLIKASI MENULISNYA: objek Date lewat
 * drizzle. Itu satu-satunya cara tes ini bisa menangkap salah kerangka waktu.
 *
 * Riwayatnya layak dicatat, karena dua versi tes ini sempat salah dengan cara
 * berlawanan. Versi kedua menyemai umur dengan `NOW(3) - INTERVAL ? HOUR` —
 * jam LOKAL server — dan itu simetris dengan cutoff `NOW(3)` yang juga lokal,
 * jadi keduanya saling meniadakan dan tes lulus di atas penyapu yang menyapu
 * baris berumur 20 jam. Tes yang menyemai lewat jalur berbeda dari aplikasi
 * tidak menguji aplikasinya, ia menguji dirinya sendiri.
 */
async function insertDoc(id: string, state: 'pending' | 'ready', hoursAgo: number) {
  await db.insert(documents).values({
    id,
    userId,
    objectKey: `docs/${userId}/${id}`,
    name: 'cv.pdf',
    label: 'CV',
    group: 'CV Utama',
    category: 'cv',
    size: 1024,
    mime: 'application/pdf',
    note: '',
    state,
    uploadedAt: new Date(Date.now() - hoursAgo * 3600 * 1000),
  });
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
    // 20 jam: TEPAT kasus yang lolos dari cutoff berkerangka salah — di WIB
    // sebuah cutoff NOW(3) berlaku pada 17 jam, jadi baris ini ikut tersapu.
    await insertDoc(rows.stale, 'pending', 25);
    await insertDoc(rows.justOver, 'pending', 24.5);
    await insertDoc(rows.justUnder, 'pending', 20);
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
    // Dihitung dari `rows`, bukan angka tetap: angka tetap diam-diam jadi salah
    // begitu ada baris uji baru, dan cabang ini di-skip saat R2 aktif sehingga
    // kesalahannya tidak akan terlihat sampai dijalankan di lingkungan lain.
    assert.equal(
      (await idsLeft()).size,
      Object.keys(rows).length,
      'baris terhapus padahal R2 tidak aktif',
    );
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
    assert.ok(
      !left.has(rows.justOver),
      'pending 24,5 jam tidak tersapu — ambangnya kelewat longgar',
    );
    // Tiga ini yang membuat tesnya bermakna: tanpa mereka, penyapu yang
    // mengosongkan seluruh tabel juga akan lulus.
    assert.ok(
      left.has(rows.recent),
      'pending yang baru 1 jam ikut terhapus — batas waktunya salah',
    );
    // Penjaga kerangka waktu, dan inilah kasus yang lolos dari versi sebelumnya.
    // Kolomnya berisi UTC; cutoff berbasis NOW() berada di waktu lokal server
    // dan menggeser ambang sebesar offsetnya — di WIB baris ini tersapu pada
    // 17 jam, tujuh jam terlalu cepat.
    assert.ok(
      left.has(rows.justUnder),
      'pending 20 jam ikut terhapus — cutoff beda kerangka waktu dengan kolomnya',
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
