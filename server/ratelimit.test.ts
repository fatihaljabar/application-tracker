import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buatPenghitung } from './lib/ratelimit.ts';

/**
 * Penghitung ini berdiri di depan tiga hal yang mahal — `/health`, ekspor, dan
 * sekarang `GET /state` — dan di depan satu hal yang menyentuh kotak masuk
 * orang lain: email konfirmasi alamat tujuan.
 *
 * Gagalnya diam. Penghitung yang selalu mengizinkan tidak menimbulkan galat
 * apa pun; yang ketahuan cuma tagihan atau keluhan, dan keduanya datang
 * terlambat. Karena itu batasnya diuji tepat di angka, bukan kira-kira.
 */
describe('penghitung pembatas laju', () => {
  it('mengizinkan tepat sebanyak max, lalu menolak', () => {
    const ambil = buatPenghitung({ max: 3, windowMs: 60_000 });
    assert.deepEqual(
      [1, 2, 3].map(() => ambil('a').ok),
      [true, true, true],
      'menolak sebelum batasnya tercapai',
    );
    assert.equal(ambil('a').ok, false, 'yang keempat lolos padahal max 3');
  });

  it('kunci berbeda dihitung terpisah', () => {
    // Kalau tidak, satu pengguna yang berlebihan mengunci semua orang.
    const ambil = buatPenghitung({ max: 1, windowMs: 60_000 });
    assert.equal(ambil('a').ok, true);
    assert.equal(ambil('a').ok, false);
    assert.equal(ambil('b').ok, true, 'kunci lain ikut terkunci');
  });

  it('jendela yang lewat memulai hitungan baru', async () => {
    const ambil = buatPenghitung({ max: 1, windowMs: 20 });
    assert.equal(ambil('a').ok, true);
    assert.equal(ambil('a').ok, false);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(ambil('a').ok, true, 'jendelanya tidak pernah dibuka lagi');
  });

  it('yang ditolak menyebut sisa detiknya', () => {
    // Dipakai sebagai Retry-After. Nol akan membuat klien mencoba lagi seketika
    // dan menabrak dinding yang sama.
    const ambil = buatPenghitung({ max: 1, windowMs: 60_000 });
    ambil('a');
    const ditolak = ambil('a');
    assert.equal(ditolak.ok, false);
    assert.ok(ditolak.sisaDetik > 0 && ditolak.sisaDetik <= 60, `sisaDetik=${ditolak.sisaDetik}`);
  });
});
