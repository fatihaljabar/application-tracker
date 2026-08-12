import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autoKeyDeadline, judulTurunan, turunanDeadline, turunanUntuk } from './lib/ahead.ts';

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

  it('judulnya berbahasa Inggris kalau pengaturan bahasa pengguna en', () => {
    assert.equal(judulTurunan('h1', 'HR Interview', 'en'), 'Tomorrow: HR Interview');
    assert.equal(judulTurunan('j2', 'HR Interview', 'en'), 'In 2 hours: HR Interview');
    assert.equal(judulTurunan('h3', 'Deadline', 'en'), 'In 3 days: Deadline');
  });
});

/**
 * Deadline lamaran cuma TANGGAL, tanpa jam. Perhitungannya berdiri sendiri, dan
 * yang paling mudah salah adalah pergeseran sehari: tanggal yang meleset
 * membuat peringatan "3 hari lagi" datang 2 atau 4 hari sebelumnya, tanpa galat
 * apa pun.
 */
describe('pengingat deadline lamaran', () => {
  const WIB_ = 'Asia/Jakarta';
  const jauhSebelumnya = new Date('2026-08-01T00:00:00Z');

  it('H-3 dan H-1, keduanya pukul 07.00 waktu pengguna', () => {
    const peta = Object.fromEntries(
      turunanDeadline('2026-08-20', WIB_, jauhSebelumnya).map((x) => [x.kunci, x.at.toISOString()]),
    );
    // 17 Agustus 07.00 WIB = 16 Agustus 00.00 UTC.
    assert.equal(peta.h3, '2026-08-17T00:00:00.000Z');
    // 19 Agustus 07.00 WIB = 18 Agustus 00.00 UTC.
    assert.equal(peta.h1, '2026-08-19T00:00:00.000Z');
  });

  it('tidak ada pengingat di hari deadline-nya sendiri', () => {
    // PRD § 6.6 menyebut dua waktu, dan rangkuman harian sudah punya bagian
    // "Deadline hari ini". Baris ketiga berarti email yang tidak dijanjikan.
    const t = turunanDeadline('2026-08-20', WIB_, jauhSebelumnya);
    assert.equal(t.length, 2);
    assert.ok(!t.some((x) => x.at.toISOString().startsWith('2026-08-20')));
  });

  it('selisihnya dihitung sebagai TANGGAL, bukan 72 jam', () => {
    // Zona dengan pergeseran waktu musim panas. Mengurangi 72 jam dari sebuah
    // instan bisa mendarat di tanggal yang salah saat jamnya bergeser; menghitung
    // tanggalnya tidak pernah bisa.
    // Acuan "sekarang" harus mendahului tanggal yang paling awal diuji, kalau
    // tidak turunannya tersaring sebagai masa lalu dan tesnya lulus atas array
    // kosong — tanpa pernah menguji apa pun.
    const awalTahun = new Date('2026-01-01T00:00:00Z');
    for (const tanggal of ['2026-03-30', '2026-10-26', '2026-11-02']) {
      const t = turunanDeadline(tanggal, 'America/Los_Angeles', awalTahun);
      assert.equal(t.length, 2, `deadline ${tanggal} tidak menghasilkan dua turunan`);
      const hari = t.map((x) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(x.at),
      );
      const beda = (a: string) =>
        Math.round((+new Date(`${tanggal}T00:00:00Z`) - +new Date(`${a}T00:00:00Z`)) / 86400000);
      assert.deepEqual(hari.map(beda), [3, 1], `deadline ${tanggal} meleset sehari`);
    }
  });

  it('jam 07.00 mengikuti zona pengguna, bukan zona server', () => {
    const jkt = turunanDeadline('2026-08-20', WIB_, jauhSebelumnya)[0];
    const la = turunanDeadline('2026-08-20', 'America/Los_Angeles', jauhSebelumnya)[0];
    assert.notEqual(jkt.at.toISOString(), la.at.toISOString());
  });

  it('yang sudah lewat tidak dibuat', () => {
    // Deadline lusa: H-3 sudah lewat, hanya H-1 yang tersisa. Peringatan
    // "3 hari lagi" untuk sesuatu yang tinggal 2 hari itu salah sekaligus telat.
    const t = turunanDeadline('2026-08-20', WIB_, new Date('2026-08-18T00:00:00Z'));
    assert.deepEqual(
      t.map((x) => x.kunci),
      ['h1'],
    );
    // Deadline yang sudah lewat sama sekali tidak menghasilkan apa pun.
    assert.equal(turunanDeadline('2026-08-01', WIB_, jauhSebelumnya).length, 0);
  });

  it('zona rusak tidak menghasilkan waktu ngawur', () => {
    assert.equal(turunanDeadline('2026-08-20', 'Bukan/Zona', jauhSebelumnya).length, 0);
  });

  it('penanda otomatisnya menempel ke lamaran, bukan ke reminder induk', () => {
    // Deadline tidak punya induk — ia sebuah kolom tanggal. Penanda inilah yang
    // membuat pengingatnya bisa ditemukan lagi saat tanggalnya berubah.
    assert.equal(autoKeyDeadline('app-1', 'h3'), 'deadline:h3:app-1');
  });

  it('judulnya memakai bentuk yang sama dengan turunan lain', () => {
    assert.equal(judulTurunan('h1', 'HR Interview'), 'Besok: HR Interview');
    assert.equal(judulTurunan('j2', 'HR Interview'), '2 jam lagi: HR Interview');
    assert.equal(judulTurunan('h3', 'Deadline'), '3 hari lagi: Deadline');
  });
});
