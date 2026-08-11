import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { db } from './db/client.ts';
import { settings, users } from './db/schema.ts';
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

/**
 * Rutenya, bukan cuma tanda tangannya.
 *
 * Yang dijaga di sini: GET TIDAK BOLEH MENGUBAH APA PUN. Pemindai keamanan
 * email mem-prefetch setiap tautan di email masuk dengan GET, dan tautan ini
 * ada di kaki setiap email dengan tanda tangan yang sah — sebelum ada
 * pemisahan ini, pemindainya mematikan seluruh pengingat pengguna tanpa
 * penggunanya menekan apa pun.
 *
 * Sekaligus menjaga arah sebaliknya: POST harus tetap bekerja tanpa formulir,
 * karena `List-Unsubscribe-Post` (RFC 8058) mengirim POST langsung.
 */
describe('rute berhenti berlangganan', () => {
  const PORT = 3998;
  const base = `http://127.0.0.1:${PORT}/api/unsubscribe`;
  const user = { id: randomUUID(), email: 'unsub@rute.test', cookie: '' };
  let server: ReturnType<typeof spawn>;

  const notif = async () => {
    const [row] = await db
      .select({ emailNotif: settings.emailNotif, dailyReminder: settings.dailyReminder })
      .from(settings)
      .where(eq(settings.userId, user.id));
    return row;
  };
  const tautan = () => `${base}?u=${encodeURIComponent(user.id)}&t=${unsubscribeToken(user.id)}`;

  before(async () => {
    server = spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break;
      } catch {
        // port belum diangkat
      }
      await sleep(100);
    }
    const at = new Date();
    await db.insert(users).values({
      id: user.id,
      googleSub: `unsub-${user.id}`,
      email: user.email,
      name: 'Uji Unsub',
      avatarUrl: null,
      createdAt: at,
      lastSeenAt: at,
    });
    await db.insert(settings).values({ userId: user.id, notifyEmail: user.email });
  });

  after(async () => {
    await db.delete(users).where(eq(users.id, user.id));
    const [rows] = await db.$client.query('SELECT COUNT(*) AS n FROM users WHERE id = ?', [
      user.id,
    ]);
    assert.equal(Number((rows as { n: number }[])[0]?.n), 0, 'data uji unsubscribe tertinggal');
    server.kill();
    await db.$client.end();
  });

  it('GET hanya bertanya — notifikasi tidak berubah', async () => {
    const res = await fetch(tautan());
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<form method="post"/, 'GET tidak menawarkan formulir konfirmasi');

    assert.deepEqual(
      await notif(),
      { emailNotif: true, dailyReminder: true },
      'GET mematikan notifikasi — pemindai email akan melakukannya diam-diam',
    );
  });

  it('POST yang mengubah, dan tanpa formulir — RFC 8058 mengirimnya langsung', async () => {
    const res = await fetch(tautan(), { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(
      await notif(),
      { emailNotif: false, dailyReminder: false },
      'POST tidak mematikan notifikasi',
    );
  });

  it('tanda tangan orang lain ditolak, dan tidak mengubah apa pun', async () => {
    const asing = randomUUID();
    const res = await fetch(`${base}?u=${user.id}&t=${unsubscribeToken(asing)}`, {
      method: 'POST',
    });
    assert.equal(res.status, 400);
  });
});
