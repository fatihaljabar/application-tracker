import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judulTurunan, turunanUntuk } from './lib/ahead.ts';

/**
 * Pengingat turunan menentukan KAPAN orang diberi tahu. Salah di sini berarti
 * seseorang tahu soal interviewnya setelah interviewnya lewat — dan tidak ada
 * galat apa pun yang memberi tahu bahwa itu terjadi.
 *
 * Contoh yang dipakai persis kasus yang ditanyakan Fatih: interview
 * 12 Agustus 2026 pukul 10.00 WIB.
 */

const WIB = 'Asia/Jakarta';
// 12 Agustus 2026, 10.00 WIB = 03.00 UTC.
const interview = new Date('2026-08-12T03:00:00Z');
// Berdiri jauh sebelumnya supaya kedua turunan masih di depan.
const sekarang = new Date('2026-08-01T00:00:00Z');

describe('pengingat turunan', () => {
  it('interview menghasilkan H-1 pagi dan 2 jam sebelum', () => {
    const t = turunanUntuk('interview', interview, WIB, sekarang);
    const peta = Object.fromEntries(t.map((x) => [x.kunci, x.at.toISOString()]));

    // H-1 pagi = 11 Agustus 07.00 WIB = 10 Agustus 00.00 UTC.
    assert.equal(peta.h1, '2026-08-11T00:00:00.000Z');
    // 2 jam sebelum = 12 Agustus 08.00 WIB = 01.00 UTC.
    assert.equal(peta.j2, '2026-08-12T01:00:00.000Z');
    assert.equal(t.length, 2);
  });

  it('"pagi" berarti pagi bagi PENGGUNA, bukan pagi di zona server', () => {
    const jkt = turunanUntuk('interview', interview, WIB, sekarang).find((x) => x.kunci === 'h1');
    const la = turunanUntuk('interview', interview, 'America/Los_Angeles', sekarang).find(
      (x) => x.kunci === 'h1',
    );
    // Instan yang berbeda, karena pukul 07.00 terjadi di saat yang berbeda.
    assert.notEqual(jkt?.at.toISOString(), la?.at.toISOString());
  });

  it('deadline memakai H-3 dan H-1, bukan 2 jam', () => {
    const t = turunanUntuk('deadline', interview, WIB, sekarang).map((x) => x.kunci);
    assert.deepEqual(t.sort(), ['h1', 'h3']);
  });

  it('follow-up dan masa berlaku CV tidak punya turunan', () => {
    // Keduanya sudah berupa peringatan, bukan jadwal sebuah acara.
    assert.equal(turunanUntuk('followup', interview, WIB, sekarang).length, 0);
    assert.equal(turunanUntuk('cv_validity', interview, WIB, sekarang).length, 0);
  });

  it('turunan yang waktunya sudah lewat TIDAK dibuat', () => {
    // Dijadwalkan satu jam lagi: H-1 sudah lewat, dan 2 jam sebelum pun sudah
    // lewat. Membuatnya berarti mengirim email "besok" untuk sesuatu yang
    // terjadi satu jam lagi.
    const sebentarLagi = new Date('2026-08-12T02:00:00Z');
    assert.equal(turunanUntuk('interview', interview, WIB, sebentarLagi).length, 0);
  });

  it('turunan tidak pernah jatuh setelah acaranya sendiri', () => {
    for (const jam of [0.5, 1, 3, 25, 100]) {
      const at = new Date(sekarang.getTime() + jam * 3600 * 1000);
      for (const t of turunanUntuk('interview', at, WIB, sekarang)) {
        assert.ok(t.at < at, `turunan ${t.kunci} jatuh setelah acaranya (${jam} jam)`);
      }
    }
  });

  it('zona yang tidak dikenal tidak menghasilkan waktu ngawur', () => {
    // Lebih baik tidak ada turunan daripada turunan di waktu yang salah.
    const t = turunanUntuk('interview', interview, 'Bukan/Zona', sekarang);
    assert.ok(t.every((x) => x.kunci !== 'h1'));
  });

  it('judulnya menyebut jaraknya, bukan mengulang judul aslinya', () => {
    assert.equal(judulTurunan('h1', 'HR Interview'), 'Besok: HR Interview');
    assert.equal(judulTurunan('j2', 'HR Interview'), '2 jam lagi: HR Interview');
    assert.equal(judulTurunan('h3', 'Deadline'), '3 hari lagi: Deadline');
  });
});
