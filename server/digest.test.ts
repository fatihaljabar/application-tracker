import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db/client.ts';
import { applications, reminders, settings, statusHistory, users } from './db/schema.ts';
import { batasHariLokal, lokal } from './jobs/digest.ts';
import { createFollowupReminders } from './jobs/followup.ts';

/**
 * Dua tugas terjadwal terakhir. Yang diuji di sini adalah bagian yang gagal
 * DIAM-DIAM: batas waktu dan zona waktu. Pengirimannya sendiri sudah terbukti.
 */

const userId = randomUUID();
const apps = {
  diam8hari: randomUUID(),
  baru2hari: randomUUID(),
  interview6hari: randomUUID(),
  ditolakPengguna: randomUUID(),
  arsip: randomUUID(),
};

const hariLalu = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

async function seedApp(
  id: string,
  status: 'applied' | 'hr_interview',
  umurHari: number,
  extra: { archived?: boolean; followupDismissed?: boolean } = {},
) {
  const at = hariLalu(umurHari);
  await db.insert(applications).values({
    id,
    userId,
    company: `PT ${id.slice(0, 4)}`,
    position: 'Backend Engineer',
    department: '',
    location: '',
    workType: 'Remote',
    jobType: 'Full Time',
    salaryMin: null,
    salaryMax: null,
    source: '',
    url: '',
    appliedDate: null,
    deadline: null,
    recruiterName: '',
    recruiterEmail: '',
    recruiterPhone: '',
    notes: '',
    status,
    tags: [],
    archived: extra.archived ?? false,
    favorite: false,
    followupDismissed: extra.followupDismissed ?? false,
    createdAt: at,
    updatedAt: at,
  });
  // Kapan status sekarang mulai berlaku — inilah yang dibaca tugasnya, bukan
  // tanggal lamaran.
  await db.insert(statusHistory).values({ id: randomUUID(), applicationId: id, status, at });
}

describe('zona waktu rangkuman harian', () => {
  it('tanggal dan jam lokal diambil dari zona pengguna, bukan server', () => {
    // Satu instan yang sama terbaca sebagai HARI BERBEDA di dua zona. Inilah
    // sebabnya rangkuman tidak boleh memakai tanggal server.
    const instan = new Date('2026-08-10T17:30:00Z');
    const jakarta = lokal('Asia/Jakarta', instan);
    const losAngeles = lokal('America/Los_Angeles', instan);

    assert.deepEqual(jakarta, { tanggal: '2026-08-11', jam: 0 });
    assert.deepEqual(losAngeles, { tanggal: '2026-08-10', jam: 10 });
    assert.notEqual(jakarta?.tanggal, losAngeles?.tanggal);
  });

  it('zona yang tidak dikenal mengembalikan null, bukan melempar', () => {
    // Satu baris pengaturan rusak tidak boleh menghentikan rangkuman pengguna lain.
    assert.equal(lokal('Bukan/Zona'), null);
  });

  it('batas hari lokal menutup tepat 24 jam dan bergeser sesuai zona', () => {
    const jkt = batasHariLokal('2026-08-11', 'Asia/Jakarta');
    assert.equal(jkt.mulai.toISOString(), '2026-08-10T17:00:00.000Z');
    assert.equal(+jkt.selesai - +jkt.mulai, 24 * 3600 * 1000);

    // Zona lain memulai harinya di instan yang berbeda.
    const la = batasHariLokal('2026-08-11', 'America/Los_Angeles');
    assert.equal(la.mulai.toISOString(), '2026-08-11T07:00:00.000Z');
  });
});

describe('reminder follow-up otomatis', () => {
  before(async () => {
    const at = new Date();
    await db.insert(users).values({
      id: userId,
      googleSub: `fu-${userId}`,
      email: `fu-${userId.slice(0, 8)}@followup.test`,
      name: 'Uji Follow Up',
      avatarUrl: null,
      createdAt: at,
      lastSeenAt: at,
    });
    await db.insert(settings).values({ userId, notifyEmail: 'fu@followup.test' });

    await seedApp(apps.diam8hari, 'applied', 8);
    await seedApp(apps.baru2hari, 'applied', 2);
    await seedApp(apps.interview6hari, 'hr_interview', 6);
    await seedApp(apps.ditolakPengguna, 'applied', 10, { followupDismissed: true });
    await seedApp(apps.arsip, 'applied', 10, { archived: true });
  });

  after(async () => {
    await db.delete(users).where(inArray(users.id, [userId]));
    const [left] = await db.$client.query(
      'SELECT COUNT(*) AS n FROM applications WHERE user_id = ?',
      [userId],
    );
    assert.equal(Number((left as { n: number }[])[0]?.n), 0, 'data uji follow-up masih tertinggal');
    await db.$client.end();
  });

  const dibuatUntuk = async () => {
    const rows = await db
      .select({ applicationId: reminders.applicationId })
      .from(reminders)
      .where(eq(reminders.userId, userId));
    return new Set(rows.map((r) => r.applicationId));
  };

  it('dibuat hanya untuk yang sudah cukup lama diam', async () => {
    await createFollowupReminders();
    const ada = await dibuatUntuk();

    assert.ok(ada.has(apps.diam8hari), 'applied 8 hari tidak dibuatkan follow-up');
    assert.ok(ada.has(apps.interview6hari), 'interview 6 hari tidak dibuatkan follow-up');
    // Empat penolakan berikut yang membuat tes ini bermakna.
    assert.ok(!ada.has(apps.baru2hari), 'applied 2 hari sudah dibuatkan — ambangnya salah');
    assert.ok(
      !ada.has(apps.ditolakPengguna),
      'dibuat ulang padahal pengguna sudah menghapusnya — melanggar PRD § 6.6',
    );
    assert.ok(!ada.has(apps.arsip), 'lamaran arsip ikut dibuatkan follow-up');
  });

  it('putaran kedua tidak membuat duplikat', async () => {
    const sebelum = await db
      .select({ id: reminders.id })
      .from(reminders)
      .where(eq(reminders.userId, userId));
    await createFollowupReminders();
    const sesudah = await db
      .select({ id: reminders.id })
      .from(reminders)
      .where(eq(reminders.userId, userId));
    assert.equal(
      sesudah.length,
      sebelum.length,
      'follow-up dibuat dua kali untuk lamaran yang sama',
    );
  });
});
