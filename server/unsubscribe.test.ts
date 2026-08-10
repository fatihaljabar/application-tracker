import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from './lib/email.ts';

/**
 * Tautan berhenti berlangganan berfungsi TANPA SESI (PRD § 6.13). Karena itu
 * tanda tangan ini satu-satunya yang memisahkan "mematikan notifikasi saya"
 * dari "mematikan notifikasi orang lain" — tidak ada cookie, tidak ada login,
 * tidak ada lapisan kedua.
 *
 * Memenuhi syarat unit test di TECHNICAL § 10.4: fungsi murni, di jalur
 * keamanan, dan gagal secara diam-diam kalau salah. Sebuah pemeriksa yang
 * selalu mengembalikan true tidak akan menimbulkan galat apa pun — cuma
 * notifikasi orang asing yang bisa dimatikan siapa saja.
 */

const userA = randomUUID();
const userB = randomUUID();

describe('tanda tangan berhenti berlangganan', () => {
  it('tanda tangan sendiri diterima', () => {
    assert.equal(verifyUnsubscribeToken(userA, unsubscribeToken(userA)), true);
  });

  it('tanda tangan milik pengguna lain ditolak', () => {
    // Ini kasus intinya: tanpa pengikatan ke userId, satu tautan sah bisa
    // dipakai mematikan notifikasi akun mana pun dengan menukar parameter u.
    assert.equal(verifyUnsubscribeToken(userB, unsubscribeToken(userA)), false);
  });

  it('tanda tangan karangan ditolak', () => {
    assert.equal(verifyUnsubscribeToken(userA, 'tandatangankarangan'), false);
    assert.equal(verifyUnsubscribeToken(userA, ''), false);
  });

  it('satu karakter berubah sudah cukup untuk ditolak', () => {
    const token = unsubscribeToken(userA);
    const ubah = `${token.slice(0, -1)}${token.at(-1) === 'A' ? 'B' : 'A'}`;
    assert.equal(verifyUnsubscribeToken(userA, ubah), false);
  });

  it('panjang berbeda tidak membuat pembanding melempar', () => {
    // timingSafeEqual MELEMPAR bila panjang buffer berbeda. Tanpa penjaga
    // panjang di depannya, tautan cacat menghasilkan 500, bukan penolakan.
    assert.doesNotThrow(() => verifyUnsubscribeToken(userA, 'pendek'));
    assert.equal(verifyUnsubscribeToken(userA, 'pendek'), false);
  });

  it('tautannya memuat id dan tanda tangan, dan aman sebagai URL', () => {
    const url = new URL(unsubscribeUrl(userA));
    assert.equal(url.pathname, '/api/unsubscribe');
    assert.equal(url.searchParams.get('u'), userA);
    assert.equal(verifyUnsubscribeToken(userA, url.searchParams.get('t') as string), true);
    // base64url tidak memuat + / = yang akan rusak saat dibaca sebagai query.
    assert.match(unsubscribeToken(userA), /^[A-Za-z0-9_-]+$/);
  });
});
