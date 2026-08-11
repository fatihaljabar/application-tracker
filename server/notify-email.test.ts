import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { db } from './db/client.ts';
import { settings, users } from './db/schema.ts';
import { notifyEmailToken, unsubscribeToken, verifyNotifyEmailToken } from './lib/email.ts';
import { env } from './lib/env.ts';

/**
 * Alamat tujuan notifikasi hanya berlaku setelah PEMILIK ALAMATNYA setuju.
 *
 * Tanpa itu, siapa pun yang punya akun Google bisa mengarahkan pengingatnya ke
 * alamat orang lain lalu mengisi judul dan catatan reminder dengan tulisannya
 * sendiri — dan korban menerimanya dari domain yang menandatangani DKIM-nya
 * sendiri. Temuan tinjauan keamanan M2+M3.
 *
 * Yang paling mudah salah diam-diam ada dua, dan keduanya dikunci di sini:
 * tautan untuk satu alamat tidak boleh mengesahkan alamat lain, dan alamat baru
 * TIDAK boleh tersimpan sebelum dikonfirmasi.
 */

const PORT = 3997;
const base = `http://127.0.0.1:${PORT}/api`;

const user = { id: randomUUID(), akun: 'pemilik@notify.test' };
const ALAMAT_ASING = 'korban@notify.test';

function cookieFor(userId: string) {
  const sig = createHmac('sha256', env.sessionSecret)
    .update(userId)
    .digest('base64')
    .replace(/=+$/, '');
  return `sid=${encodeURIComponent(`s:${userId}.${sig}`)}`;
}

const settingsPayload = (notifyEmail: string) => ({
  theme: 'light',
  language: 'id',
  timezone: 'Asia/Jakarta',
  weeklyTarget: 5,
  monthlyTarget: 20,
  emailNotif: true,
  dailyReminder: true,
  notifyEmail,
  cvValidDays: 90,
});

const tersimpan = async () => {
  const [row] = await db
    .select({ notifyEmail: settings.notifyEmail })
    .from(settings)
    .where(eq(settings.userId, user.id));
  return row?.notifyEmail;
};

describe('tanda tangan alamat notifikasi', () => {
  it('tautan untuk satu alamat tidak mengesahkan alamat lain', () => {
    // Inti temuannya. Tanpa alamat ikut ditandatangani, satu tautan sah bisa
    // dipakai mengarahkan pengingat ke alamat mana pun.
    const t = notifyEmailToken(user.id, 'a@contoh.test');
    assert.equal(verifyNotifyEmailToken(user.id, 'a@contoh.test', t), true);
    assert.equal(verifyNotifyEmailToken(user.id, 'b@contoh.test', t), false);
  });

  it('tautan milik pengguna lain ditolak', () => {
    const t = notifyEmailToken(randomUUID(), 'a@contoh.test');
    assert.equal(verifyNotifyEmailToken(user.id, 'a@contoh.test', t), false);
  });

  it('tidak bisa ditukar dengan tanda tangan berhenti berlangganan', () => {
    // Rahasianya sama, jadi yang memisahkan hanya awalan pesannya.
    assert.equal(verifyNotifyEmailToken(user.id, user.akun, unsubscribeToken(user.id)), false);
  });

  it('panjang berbeda tidak membuat pembandingnya melempar', () => {
    assert.equal(verifyNotifyEmailToken(user.id, 'a@contoh.test', 'pendek'), false);
  });
});

describe('rute konfirmasi alamat notifikasi', () => {
  let server: ReturnType<typeof spawn>;
  const cookie = cookieFor(user.id);

  before(async () => {
    server = spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], {
      cwd: new URL('..', import.meta.url),
      // Tanpa kunci Resend: `emailConfigured` mati, jadi email konfirmasinya
      // tidak benar-benar dikirim. Bukan sekadar soal cepat — alamat uji di
      // sini karangan, dan mengirim ke sana tiap kali suite jalan berarti
      // menumpuk pantulan atas nama domain produksi. Logika yang diuji tidak
      // bergantung padanya: alamat barunya ditahan lebih dulu, baru emailnya.
      env: { ...process.env, PORT: String(PORT), RESEND_API_KEY: '' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        // port belum diangkat
      }
      await sleep(100);
    }
    const at = new Date();
    await db.insert(users).values({
      id: user.id,
      googleSub: `notify-${user.id}`,
      email: user.akun,
      name: 'Pemilik Akun',
      avatarUrl: null,
      createdAt: at,
      lastSeenAt: at,
    });
    await db.insert(settings).values({ userId: user.id, notifyEmail: user.akun });
  });

  after(async () => {
    await db.delete(users).where(eq(users.id, user.id));
    const [rows] = await db.$client.query('SELECT COUNT(*) AS n FROM users WHERE id = ?', [
      user.id,
    ]);
    assert.equal(Number((rows as { n: number }[])[0]?.n), 0, 'data uji notify-email tertinggal');
    server.kill();
    await db.$client.end();
  });

  const simpan = (notifyEmail: string) =>
    fetch(`${base}/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(settingsPayload(notifyEmail)),
    });

  it('alamat asing TIDAK langsung tersimpan', async () => {
    const res = await simpan(ALAMAT_ASING);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { notifyEmail: string; pendingNotifyEmail: string | null };

    assert.equal(
      await tersimpan(),
      user.akun,
      'alamat asing langsung berlaku — pengingat bisa dikirim ke orang yang tidak memintanya',
    );
    // Balasannya harus jujur, kalau tidak layar menampilkan alamat yang server
    // belum menerimanya.
    assert.equal(body.notifyEmail, user.akun);
    assert.equal(body.pendingNotifyEmail, ALAMAT_ASING);
  });

  it('pengaturan lain tetap tersimpan walau alamatnya tertunda', async () => {
    // Kegagalan menyimpan tema hanya karena emailnya menunggu konfirmasi akan
    // membuat pengguna mengira aplikasinya rusak.
    const [row] = await db
      .select({ weeklyTarget: settings.weeklyTarget })
      .from(settings)
      .where(eq(settings.userId, user.id));
    assert.equal(row?.weeklyTarget, 5);
  });

  it('GET konfirmasi hanya bertanya — belum mengubah apa pun', async () => {
    const t = notifyEmailToken(user.id, ALAMAT_ASING);
    const url = `${base}/notify-email?u=${user.id}&e=${encodeURIComponent(ALAMAT_ASING)}&t=${t}`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<form method="post"/);
    assert.equal(await tersimpan(), user.akun, 'GET sudah mengubah alamatnya');
  });

  it('POST konfirmasi menerapkannya', async () => {
    const t = notifyEmailToken(user.id, ALAMAT_ASING);
    const url = `${base}/notify-email?u=${user.id}&e=${encodeURIComponent(ALAMAT_ASING)}&t=${t}`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 200);
    assert.equal(await tersimpan(), ALAMAT_ASING);
  });

  it('tanda tangan karangan ditolak dan tidak mengubah apa pun', async () => {
    const url = `${base}/notify-email?u=${user.id}&e=${encodeURIComponent('lain@notify.test')}&t=karangan`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 400);
    assert.equal(await tersimpan(), ALAMAT_ASING);
  });

  it('kembali ke alamat akun sendiri tidak butuh konfirmasi', async () => {
    // Sudah terbukti miliknya sejak dia berhasil masuk dengan Google, dan
    // PRD § 6.13 menjadikannya nilai bawaan.
    const res = await simpan(user.akun);
    const body = (await res.json()) as { pendingNotifyEmail: string | null };
    assert.equal(body.pendingNotifyEmail, null);
    assert.equal(await tersimpan(), user.akun);
  });
});
