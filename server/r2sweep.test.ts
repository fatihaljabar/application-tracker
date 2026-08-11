import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { deleteUserObjects } from './lib/r2.ts';

/**
 * `deleteUserObjects` menjawab pertanyaan "apakah berkas pengguna ini sudah
 * habis?" — dan pemanggilnya menghapus baris `users` atas dasar jawabannya.
 *
 * Dulu fungsi ini punya DUA jalan keluar yang mengembalikan angka: prefix sudah
 * kosong, dan batas 20 putaran tersentuh. Keduanya tidak bisa dibedakan dari
 * luar, jadi yang kedua membuat pemanggilnya menghapus barisnya sementara objek
 * yang tersisa kehilangan pemiliknya selamanya — tidak ada lagi yang tahu
 * berkas itu milik siapa, jadi tidak akan pernah bisa disapu.
 *
 * `fetch` ke R2 dicegat supaya kasusnya bisa dibuat tanpa mengunggah 20.000
 * berkas sungguhan. Yang diuji tetap fungsi aslinya.
 */

const fetchAsli = globalThis.fetch;
/** Jumlah kunci yang dikembalikan tiap pendaftaran; null berarti tak habis-habis. */
let sisaPutaran: number | null = 0;

const daftar = (n: number) =>
  `<?xml version="1.0"?><ListBucketResult>${Array.from(
    { length: n },
    (_, i) => `<Key>docs/uji/${i}</Key>`,
  ).join('')}</ListBucketResult>`;

describe('penyapu berkas pengguna', () => {
  before(() => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      // aws4fetch memanggil fetch dengan objek Request, bukan string — `String(req)`
      // menghasilkan "[object Request]" dan permintaannya lolos ke R2 sungguhan.
      // Versi pertama berkas ini kena persis itu: tesnya "gagal" karena benar-benar
      // mendaftar bucket dev, bukan karena kodenya salah.
      const req = url instanceof Request ? url : null;
      const u = req ? req.url : String(url);
      const method = req ? req.method : (init?.method ?? 'GET');
      if (!u.includes('r2.cloudflarestorage.com')) return fetchAsli(url as string, init);
      // DELETE satu objek selalu berhasil.
      // null, bukan '': 204 tidak boleh punya body dan konstruktornya melempar.
      if (method === 'DELETE') return new Response(null, { status: 204 });
      // Pendaftaran: habis setelah `sisaPutaran` putaran, atau tidak pernah.
      if (sisaPutaran === null) return new Response(daftar(3), { status: 200 });
      const n = sisaPutaran > 0 ? 3 : 0;
      if (sisaPutaran > 0) sisaPutaran--;
      return new Response(daftar(n), { status: 200 });
    }) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = fetchAsli;
  });

  it('menghabiskan prefix lalu mengembalikan jumlahnya', async () => {
    sisaPutaran = 2;
    assert.equal(await deleteUserObjects('uji'), 6, 'jumlah objek yang dihapus tidak cocok');
  });

  it('prefix yang sudah kosong mengembalikan nol, bukan melempar', async () => {
    sisaPutaran = 0;
    assert.equal(await deleteUserObjects('uji'), 0);
  });

  it('batas putaran tersentuh: MELEMPAR, tidak mengaku selesai', async () => {
    // Inti berkas ini. Kalau ini mengembalikan angka alih-alih melempar,
    // pemanggilnya akan menghapus baris pengguna dan menjadikan sisanya yatim.
    sisaPutaran = null;
    await assert.rejects(
      () => deleteUserObjects('uji'),
      (e: { status?: number; code?: string }) => e.status === 502 && e.code === 'storage_error',
      'penyapu keluar diam-diam saat masih ada sisa',
    );
  });
});
