import { and, asc, eq, gte, lt, ne } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { applications, reminders, settings, users } from '../db/schema.ts';
import { emailConfigured, sendMail } from '../lib/email.ts';

/**
 * Rangkuman harian, dikirim pukul 07.00 WAKTU LOKAL PENGGUNA (PRD § 6.13).
 *
 * Dijalankan tiap jam, bukan sekali sehari: pengguna berada di zona berbeda,
 * jadi "pukul 07.00" terjadi dua puluh empat kali sehari di jam server yang
 * berbeda-beda. Tiap putaran menanyakan siapa yang jam lokalnya sedang 07.
 */

const JAM_KIRIM = 7;

/** Tanggal dan jam lokal pengguna, dari zona yang dia pilih sendiri. */
function lokal(timeZone: string, at = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(at);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return { tanggal: `${get('year')}-${get('month')}-${get('day')}`, jam: Number(get('hour')) };
  } catch {
    // Zona rusak di satu baris pengaturan tidak boleh menjatuhkan seluruh
    // putaran untuk pengguna lain.
    return null;
  }
}

/** Batas UTC dari satu hari lokal — dipakai menyaring agenda "hari ini". */
function batasHariLokal(tanggal: string, timeZone: string) {
  // Offset zona pada tanggal itu, dihitung dari selisih pembacaan yang sama
  // dalam UTC. Cara ini ikut benar saat ada pergeseran waktu musim panas.
  const acuan = new Date(`${tanggal}T12:00:00Z`);
  const utc = new Date(acuan.toLocaleString('en-US', { timeZone: 'UTC' }));
  const lokalWaktu = new Date(acuan.toLocaleString('en-US', { timeZone }));
  const offsetMs = lokalWaktu.getTime() - utc.getTime();
  const mulai = new Date(`${tanggal}T00:00:00Z`).getTime() - offsetMs;
  return { mulai: new Date(mulai), selesai: new Date(mulai + 24 * 3600 * 1000) };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`,
  );

const baris = (utama: string, keterangan: string) =>
  `<li style="margin:0 0 10px;font-size:14px;line-height:1.6"><strong>${esc(utama)}</strong><br><span style="color:#57534a">${esc(keterangan)}</span></li>`;

/**
 * Satu putaran. Mengembalikan jumlah email yang benar-benar terkirim.
 *
 * Yang TIDAK punya apa-apa untuk ditindak sengaja dilewati — email kosong
 * adalah cara tercepat membuat orang berhenti berlangganan (PRD § 6.13).
 */
export async function sendDailyDigests(): Promise<number> {
  if (!emailConfigured) return 0;

  const kandidat = await db
    .select({
      userId: settings.userId,
      email: settings.notifyEmail,
      timezone: settings.timezone,
      lastDigestOn: settings.lastDigestOn,
      nama: users.name,
    })
    .from(settings)
    .innerJoin(users, eq(users.id, settings.userId))
    .where(eq(settings.dailyReminder, true));

  let terkirim = 0;

  for (const u of kandidat) {
    const now = lokal(u.timezone);
    if (!now || now.jam !== JAM_KIRIM) continue;
    if (u.lastDigestOn === now.tanggal) continue;

    /**
     * Klaim hari ini SEBELUM menyusun isinya, dengan alasan yang sama seperti
     * pengirim reminder: produksi menjalankan lebih dari satu proses, dan tiap
     * proses menjalankan tugasnya sekali saat start. Tanpa klaim, satu pagi
     * bisa menghasilkan beberapa rangkuman untuk orang yang sama.
     */
    const klaim = await db
      .update(settings)
      .set({ lastDigestOn: now.tanggal })
      .where(and(eq(settings.userId, u.userId), ne(settings.lastDigestOn, now.tanggal)));
    // MySQL melaporkan 0 bila nilainya sudah sama — artinya proses lain menang.
    if ((klaim[0] as { affectedRows: number }).affectedRows !== 1) continue;

    const { mulai, selesai } = batasHariLokal(now.tanggal, u.timezone);

    const agenda = await db
      .select({ title: reminders.title, datetime: reminders.datetime })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, u.userId),
          eq(reminders.done, false),
          gte(reminders.datetime, mulai),
          lt(reminders.datetime, selesai),
        ),
      )
      .orderBy(asc(reminders.datetime))
      .limit(20);

    /**
     * Yang sudah lewat dan belum ditandai selesai.
     *
     * Tanpa bagian ini, pengingat yang terlewat sehari HILANG dari email
     * selamanya — orang yang lupa menandainya tidak pernah diingatkan lagi.
     * Dibatasi tujuh hari ke belakang supaya rangkuman tidak berubah jadi
     * daftar penyesalan yang sama panjang tiap pagi.
     */
    const terlambat = await db
      .select({ title: reminders.title, datetime: reminders.datetime })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, u.userId),
          eq(reminders.done, false),
          lt(reminders.datetime, mulai),
          gte(reminders.datetime, new Date(+mulai - 7 * 24 * 3600 * 1000)),
        ),
      )
      .orderBy(asc(reminders.datetime))
      .limit(20);

    const deadline = await db
      .select({ company: applications.company, position: applications.position })
      .from(applications)
      .where(
        and(
          eq(applications.userId, u.userId),
          eq(applications.archived, false),
          eq(applications.deadline, now.tanggal),
        ),
      )
      .limit(20);

    // Tidak ada yang perlu ditindak — hari ini dilewati, dan klaimnya tetap
    // dipegang supaya tidak dihitung ulang tiap jam.
    if (agenda.length === 0 && deadline.length === 0 && terlambat.length === 0) continue;

    const jam = (d: Date) =>
      new Intl.DateTimeFormat('id-ID', { timeStyle: 'short', timeZone: u.timezone }).format(d);
    const tanggalJam = (d: Date) =>
      new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: u.timezone,
      }).format(d);

    const isi = [
      // Yang terlambat ditaruh PALING ATAS: itu yang paling mudah terlewat lagi.
      terlambat.length
        ? `<p style="margin:0 0 8px;font-size:13px;color:#b06565">Terlambat</p><ul style="margin:0 0 20px;padding-left:18px">${terlambat.map((a) => baris(a.title, tanggalJam(new Date(a.datetime)))).join('')}</ul>`
        : '',
      agenda.length
        ? `<p style="margin:0 0 8px;font-size:13px;color:#7c766c">Agenda hari ini</p><ul style="margin:0 0 20px;padding-left:18px">${agenda.map((a) => baris(a.title, `pukul ${jam(new Date(a.datetime))}`)).join('')}</ul>`
        : '',
      deadline.length
        ? `<p style="margin:0 0 8px;font-size:13px;color:#7c766c">Deadline hari ini</p><ul style="margin:0;padding-left:18px">${deadline.map((d) => baris(d.company, d.position)).join('')}</ul>`
        : '',
    ].join('');

    const ok = await sendMail({
      to: u.email,
      subject: `Agenda hari ini — ${terlambat.length + agenda.length + deadline.length} hal`,
      heading: `Selamat pagi, ${u.nama.split(/\s+/)[0] ?? ''}`.trim(),
      bodyHtml: isi,
      userId: u.userId,
    });
    if (ok) terkirim++;
    else {
      // Lepas klaimnya supaya putaran berikutnya di jam yang sama mencoba lagi.
      await db
        .update(settings)
        .set({ lastDigestOn: u.lastDigestOn })
        .where(eq(settings.userId, u.userId));
    }
  }
  return terkirim;
}

export { batasHariLokal, lokal };
