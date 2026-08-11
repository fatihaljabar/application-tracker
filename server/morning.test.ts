import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db/client.ts';
import { reminders, settings, users } from './db/schema.ts';
import { batasHariLokal, lokal, sendDailyDigests } from './jobs/digest.ts';
import { sendDueReminders } from './jobs/reminders.ts';

/**
 * Satu kejadian, satu email (PRD § 6.13).
 *
 * Pengingat turunan H-1/H-3 jatuh tempo pukul 07.00 waktu pengguna — jam yang
 * sama dengan rangkuman harian. Sebelum berkas ini ada, keduanya mengirim
 * sendiri-sendiri: dua email berisi hal yang sama, berselang satu menit. Semua
 * tes lain lulus selama itu, karena tidak satu pun menjalankan KEDUA tugas
 * dalam satu pagi.
 *
 * Yang diuji di sini adalah pembagian tugasnya, dari dua arah — penjadwal tidak
 * menjamin siapa yang berjalan lebih dulu.
 *
 * `fetch` ke Resend dicegat, jadi tidak ada email yang benar-benar keluar.
 * Selebihnya berjalan asli: kueri, klaim, dan penyusunan isi email.
 *
 * KENAPA `npm test` memakai `--test-concurrency=1`: kedua tugas di sini bekerja
 * pada SELURUH tabel, tanpa saringan pengguna — memang begitu sifat tugas
 * batch. Dijalankan berbarengan dengan berkas tes lain yang memanggil
 * `claimDueReminders`, keduanya berebut baris yang sama dan berkas ini gagal
 * kira-kira dua dari tiga kali. Bukan tesnya yang rapuh; satu basis data
 * bersama memang tidak bisa melayani dua pemanggil tugas batch sekaligus.
 */

/**
 * Zona dipilih SAAT JALAN. Rangkuman hanya terpicu untuk pengguna yang jam
 * lokalnya sedang 07, jadi zona yang ditulis tetap akan berhenti memenuhi
 * syarat itu satu jam kemudian — dan seluruh berkas ini lulus tanpa rangkuman
 * pernah berjalan sekali pun. Persis itu yang terjadi saat berkas ini ditulis.
 */
const ZONA = [
  'Pacific/Kiritimati',
  'Pacific/Auckland',
  'Australia/Brisbane',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Jakarta',
  'Asia/Dhaka',
  'Asia/Karachi',
  'Asia/Dubai',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/London',
  'Atlantic/Azores',
  'America/Sao_Paulo',
  'America/Halifax',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];
const jamDi = (z: string) =>
  Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: z, hour: '2-digit', hour12: false }).format(
      new Date(),
    ),
  );
const TZ = ZONA.find((z) => jamDi(z) === 7) ?? '';

const ditangkap: { to: string; subject: string; html: string }[] = [];
const fetchAsli = globalThis.fetch;
let gagalkanKiriman = false;

const dibuat: string[] = [];

async function buatPengguna(dailyReminder: boolean) {
  const id = randomUUID();
  const email = `pagi-${id.slice(0, 8)}@morning.test`;
  const at = new Date();
  await db.insert(users).values({
    id,
    googleSub: `pagi-${id}`,
    email,
    name: 'Uji Pagi',
    avatarUrl: null,
    createdAt: at,
    lastSeenAt: at,
  });
  await db
    .insert(settings)
    .values({ userId: id, notifyEmail: email, timezone: TZ, emailNotif: true, dailyReminder });
  dibuat.push(id);
  return { id, email };
}

/** Instan untuk pukul `jam` waktu lokal pengguna, hari ini. */
function jamLokal(jam: number) {
  const hariIni = lokal(TZ);
  assert.ok(hariIni, 'zona tidak terbaca');
  return new Date(+batasHariLokal(hariIni.tanggal, TZ).mulai + jam * 3600 * 1000);
}

async function buatReminder(userId: string, title: string, at: Date) {
  const id = randomUUID();
  await db.insert(reminders).values({
    id,
    userId,
    applicationId: null,
    type: 'interview',
    title,
    datetime: at,
    notes: '',
    done: false,
  });
  return id;
}

const emailUntuk = (alamat: string) => ditangkap.filter((e) => e.to === alamat);

async function sentAt(id: string) {
  const [r] = await db
    .select({ sentAt: reminders.sentAt })
    .from(reminders)
    .where(eq(reminders.id, id));
  return r?.sentAt ?? null;
}

describe('satu pagi, satu email', () => {
  before(() => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith('https://api.resend.com')) {
        if (gagalkanKiriman) return new Response('ditolak', { status: 500 });
        const b = JSON.parse(String(init?.body));
        ditangkap.push({ to: b.to[0], subject: b.subject, html: b.html });
        return new Response(JSON.stringify({ id: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return fetchAsli(url as string, init);
    }) as typeof fetch;
  });

  after(async () => {
    globalThis.fetch = fetchAsli;
    if (dibuat.length) await db.delete(users).where(inArray(users.id, dibuat));
    const [left] = await db.$client.query(
      'SELECT COUNT(*) AS n FROM reminders WHERE user_id IN (?)',
      [dibuat.length ? dibuat : ['-']],
    );
    assert.equal(Number((left as { n: number }[])[0]?.n), 0, 'data uji pagi masih tertinggal');
    await db.$client.end();
  });

  /**
   * Tanpa kontrol ini seluruh berkas lulus meski rangkuman tidak pernah jalan:
   * setiap kasus di bawah "berhasil" hanya karena tidak ada email kedua.
   */
  it('rangkuman benar-benar terpicu di zona yang dipilih', async () => {
    assert.ok(TZ, 'tidak ada zona yang jam lokalnya 07 — daftar ZONA kurang lengkap');
    const u = await buatPengguna(true);
    await buatReminder(u.id, 'Kontrol: pengingat pagi', jamLokal(7));
    await sendDailyDigests();
    assert.equal(emailUntuk(u.email).length, 1, 'rangkuman tidak terkirim — kasus di bawah palsu');
  });

  it('pengingat lalu rangkuman: satu email, bukan dua', async () => {
    const u = await buatPengguna(true);
    await buatReminder(u.id, 'Besok: Interview', jamLokal(7));
    await sendDueReminders();
    await sendDailyDigests();
    assert.equal(
      emailUntuk(u.email).length,
      1,
      'pengingat yang sudah dikirim muncul lagi di rangkuman',
    );
  });

  it('rangkuman lalu pengingat: satu email, bukan dua', async () => {
    // Arah sebaliknya. Penjadwal tidak menjamin siapa duluan: pengirim
    // pengingat tiap 5 menit, rangkuman tiap jam.
    const u = await buatPengguna(true);
    await buatReminder(u.id, 'Besok: Technical test', jamLokal(7));
    await sendDailyDigests();
    await sendDueReminders();
    assert.equal(
      emailUntuk(u.email).length,
      1,
      'pengingat yang sudah diantar rangkuman dikirim lagi sendiri',
    );
  });

  it('rangkuman dimatikan: pengingat tetap sampai, digabung jadi satu', async () => {
    // Yang mematikan rangkuman tidak boleh kehilangan pengingatnya — kedua
    // sakelar itu terpisah (PRD § 6.13).
    const u = await buatPengguna(false);
    const judul = ['Interview HR', 'Technical test', 'Deadline lamaran'];
    for (const j of judul) await buatReminder(u.id, j, jamLokal(6));
    await sendDueReminders();
    await sendDailyDigests();

    const surat = emailUntuk(u.email);
    assert.equal(surat.length, 1, `${surat.length} email untuk 3 pengingat, seharusnya 1`);
    for (const j of judul) {
      assert.ok(surat[0].html.includes(j), `"${j}" hilang dari email gabungan`);
    }
  });

  it('yang jatuh tempo nanti hari ini tidak diklaim rangkuman', async () => {
    // "Agenda hari ini" cuma pratinjau. Pengingat "2 jam lagi" harus tetap
    // datang dua jam sebelum acaranya, bukan ikut terkirim pagi-pagi.
    const u = await buatPengguna(true);
    const nanti = await buatReminder(u.id, 'Sore: 2 jam lagi', jamLokal(15));
    await buatReminder(u.id, 'Pagi', jamLokal(7));
    await sendDailyDigests();
    assert.equal(await sentAt(nanti), null, 'pengingat sore ditandai terkirim — tidak akan datang');
  });

  it('rangkuman gagal terkirim: klaim pengingat dilepas', async () => {
    // Kalau tidak, pengingatnya ditandai terkirim padahal tidak pernah sampai —
    // dan tidak ada yang akan mengirimnya lagi. Hilang diam-diam.
    const u = await buatPengguna(true);
    const r = await buatReminder(u.id, 'Gagal kirim', jamLokal(7));
    gagalkanKiriman = true;
    await sendDailyDigests();
    gagalkanKiriman = false;

    assert.equal(await sentAt(r), null, 'ditandai terkirim padahal Resend menolak');
    await sendDueReminders();
    assert.equal(
      emailUntuk(u.email).length,
      1,
      'pengingat tidak pernah sampai setelah rangkuman gagal',
    );
  });
});
