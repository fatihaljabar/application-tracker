import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Ekstensi .ts ditulis eksplisit: Node menyelesaikan modul apa adanya, tidak
// menebak ekstensi seperti Vite. Berkas ini tidak ikut ter-bundle, jadi hanya
// tes ini yang terpengaruh.
import { safeUrl } from './utils.ts';

/**
 * Unit test untuk `safeUrl` — satu-satunya jenis tes selain isolation.test.ts
 * yang dibenarkan di proyek ini (TECHNICAL.md § 10.4). Syaratnya tiga, dan
 * ketiganya harus terpenuhi sebelum sebuah fungsi diuji di sini:
 *
 *   1. fungsi murni — tanpa database, tanpa jaringan, tanpa React
 *   2. jalur keamanan, uang, atau parsing
 *   3. gagalnya diam — tidak ada galat, tidak ada yang terlihat rusak
 *
 * `safeUrl` memenuhi ketiganya: kalau aturannya salah, tidak ada yang error —
 * sebuah tautan cuma jadi bisa diklik padahal seharusnya tidak. `fmtDate` dan
 * `fileSize` TIDAK memenuhi syarat ketiga: salahnya langsung terlihat di layar.
 *
 * Kasus di bawah menjaga dua arah sekaligus, dan itu disengaja: jangan sampai
 * yang jahat lolos, tapi jangan sampai yang sah ikut diblokir. Menguji satu
 * arah saja mendorong orang memperketat aturan sampai fitur normalnya rusak.
 *
 * Pola regexnya sengaja TIDAK disalin ke sini. Tes yang memuat pola yang sama
 * hanya membuktikan pola itu sama dengan dirinya sendiri, dan ikut salah kalau
 * polanya salah.
 */

const KASUS: [masukan: string, harapan: string, alasan: string][] = [
  ['https://sah.test/lowongan', 'https://sah.test/lowongan', 'https biasa lolos apa adanya'],
  ['http://sah.test', 'http://sah.test', 'http ikut lolos — banyak papan lowongan lama belum https'],
  ['HTTPS://SAH.test', 'HTTPS://SAH.test', 'huruf besar lolos — gagal kalau flag i hilang dari pola'],
  [
    '  https://sah.test  ',
    'https://sah.test',
    'spasi di tepi dipangkas — tanpa ini url yang sah ikut hilang dari layar',
  ],
  [
    'httpx://jahat.test',
    '',
    "httpx:// ditolak — ini yang lolos kalau daftar izin diganti startsWith('http')",
  ],
  [
    'https:/jahat.test',
    '',
    'satu garis miring ditolak — ini yang lolos kalau // hilang dari pola',
  ],
  ['javascript:alert(1)', '', 'javascript: ditolak'],
  [
    '  javascript:alert(1)',
    '',
    'javascript: berspasi ditolak — pemangkasan tidak boleh membuka jalan masuk',
  ],
  [
    'data:text/html,<script>alert(1)</script>',
    '',
    'data: ditolak — React TIDAK memblokir yang ini, jadi cuma ini penjaganya',
  ],
  ['ms-msdt:/id PCWDiagnostic', '', 'skema aplikasi ditolak — React juga tidak memblokir ini'],
  ['', '', 'string kosong tetap kosong, bukan dianggap sah'],
];

describe('safeUrl', () => {
  for (const [masukan, harapan, alasan] of KASUS) {
    it(alasan, () => {
      assert.equal(safeUrl(masukan), harapan);
    });
  }
});
