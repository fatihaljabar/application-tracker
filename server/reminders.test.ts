import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db/client.ts';
import { reminders, settings, users } from './db/schema.ts';
import { claimDueReminders } from './jobs/reminders.ts';

/**
 * Menguji PEMILIHAN dan KLAIM, bukan pengirimannya. Dua hal itu yang bisa salah
 * diam-diam; `sendMail` sendiri sudah terbukti sampai ke Inbox.
 *
 * Dua janji yang dijaga di sini, keduanya dari PRD § 6.13:
 * - "Satu kejadian menghasilkan PALING BANYAK satu email" — dan produksi
 *   menjalankan lebih dari satu proses Node, jadi ini bukan soal teoretis.
 * - Pengguna yang mematikan notifikasi tidak dikirimi apa pun.
 *
 * Waktu disemai lewat drizzle dengan objek Date, PERSIS seperti endpoint
 * reminder menulisnya. Menyemai lewat jalur lain pernah membuat tes penyapu
 * lulus di atas kode yang salah, dua kali, ke dua arah berlawanan.
 */

const owner = randomUUID();
const muted = randomUUID();

const ids = {
  due: randomUUID(),
  future: randomUUID(),
  done: randomUUID(),
  alreadySent: randomUUID(),
  mutedUser: randomUUID(),
};

const jamLalu = (n: number) => new Date(Date.now() - n * 3600 * 1000);

async function makeUser(id: string, emailNotif: boolean) {
  const at = new Date();
  await db.insert(users).values({
    id,
    googleSub: `rem-${id}`,
    email: `rem-${id.slice(0, 8)}@reminder.test`,
    name: 'Pengguna Pengingat',
    avatarUrl: null,
    createdAt: at,
    lastSeenAt: at,
  });
  await db
    .insert(settings)
    .values({ userId: id, notifyEmail: `rem-${id.slice(0, 8)}@reminder.test`, emailNotif });
}

const mk = (
  id: string,
  userId: string,
  datetime: Date,
  extra: { done?: boolean; sentAt?: Date } = {},
) => ({
  id,
  userId,
  applicationId: null,
  type: 'interview' as const,
  title: `Pengingat ${id.slice(0, 4)}`,
  datetime,
  notes: '',
  done: extra.done ?? false,
  sentAt: extra.sentAt ?? null,
});

describe('pemilihan dan klaim pengingat jatuh tempo', () => {
  before(async () => {
    await makeUser(owner, true);
    await makeUser(muted, false);
    await db.insert(reminders).values([
      mk(ids.due, owner, jamLalu(1)),
      // Jatuh tempo satu jam LAGI. Ini yang tersapu kalau pembandingnya memakai
      // NOW() alih-alih UTC_TIMESTAMP: di WIB ambangnya maju tujuh jam.
      mk(ids.future, owner, new Date(Date.now() + 60 * 60 * 1000)),
      mk(ids.done, owner, jamLalu(2), { done: true }),
      mk(ids.alreadySent, owner, jamLalu(3), { sentAt: jamLalu(2) }),
      mk(ids.mutedUser, muted, jamLalu(1)),
    ]);
  });

  after(async () => {
    await db.delete(users).where(inArray(users.id, [owner, muted]));
    const [left] = await db.$client.query(
      'SELECT COUNT(*) AS n FROM reminders WHERE user_id IN (?, ?)',
      [owner, muted],
    );
    assert.equal(Number((left as { n: number }[])[0]?.n), 0, 'data uji pengingat masih tertinggal');
    await db.$client.end();
  });

  it('hanya mengambil yang jatuh tempo, belum selesai, belum terkirim, dan emailnya menyala', async () => {
    const got = (await claimDueReminders()).map((r) => r.id);

    assert.ok(got.includes(ids.due), 'pengingat jatuh tempo tidak terambil');
    // Empat berikut yang membuat tes ini bermakna: tanpa mereka, kueri yang
    // mengambil SELURUH tabel juga akan lulus.
    assert.ok(!got.includes(ids.future), 'pengingat yang belum jatuh tempo ikut terambil');
    assert.ok(!got.includes(ids.done), 'pengingat yang sudah ditandai selesai ikut terambil');
    assert.ok(!got.includes(ids.alreadySent), 'pengingat yang sudah dikirim diambil lagi');
    assert.ok(
      !got.includes(ids.mutedUser),
      'pengguna yang mematikan notifikasi email tetap dikirimi',
    );
  });

  it('klaim menandai sent_at, jadi putaran kedua tidak mengambilnya lagi', async () => {
    const lagi = (await claimDueReminders()).map((r) => r.id);
    assert.ok(!lagi.includes(ids.due), 'pengingat yang sama terambil dua kali');
  });

  it('dua proses bersamaan hanya menghasilkan satu klaim', async () => {
    // Inti dari seluruh berkas ini. Produksi menjalankan dua proses Node,
    // masing-masing dengan penjadwalnya sendiri; kalau keduanya bisa mengklaim
    // baris yang sama, pengguna menerima email dua kali.
    const balapan = randomUUID();
    await db.insert(reminders).values(mk(balapan, owner, jamLalu(1)));

    const [a, b] = await Promise.all([claimDueReminders(), claimDueReminders()]);
    const menang = [a, b].filter((hasil) => hasil.some((r) => r.id === balapan)).length;

    assert.equal(menang, 1, `baris yang sama diklaim ${menang} kali — email akan ganda`);
    await db.delete(reminders).where(eq(reminders.id, balapan));
  });
});
