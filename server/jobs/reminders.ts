import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { ReminderType } from '../../shared/types.ts';
import { db } from '../db/client.ts';
import { applications, reminders, settings } from '../db/schema.ts';
import { emailConfigured, sendMail } from '../lib/email.ts';

/**
 * Pengirim reminder yang jatuh tempo (TECHNICAL.md § 9, PRD § 6.6).
 *
 * Dibatasi supaya satu putaran tidak menahan koneksi pool terlalu lama — pool
 * cuma 5 di hosting bersama. Sisanya terangkut lima menit kemudian.
 */
const BATCH = 50;

const LABEL: Record<ReminderType, string> = {
  interview: 'Interview',
  technical_test: 'Technical test',
  followup: 'Follow up HR',
  deadline: 'Deadline lamaran',
  cv_validity: 'Masa berlaku CV',
};

export interface DueReminder {
  id: string;
  userId: string;
  type: ReminderType;
  title: string;
  datetime: Date;
  notes: string;
  email: string;
  timezone: string;
  company: string | null;
  position: string | null;
}

/**
 * Mengambil reminder jatuh tempo DAN mengklaimnya dalam satu langkah.
 *
 * Klaim ini bukan kehati-hatian berlebihan. Log produksi menunjukkan dua proses
 * Node hidup bersamaan — start-nya berselang di bawah satu detik — dan masing-
 * masing menjalankan penjadwalnya sendiri. Tanpa klaim, dua proses mengambil
 * baris jatuh tempo yang sama dan pengguna menerima email dua kali.
 *
 * `UPDATE … WHERE sent_at IS NULL` diselesaikan atomik oleh database: hanya
 * satu proses mendapat baris itu, yang kalah mendapat nol dan melewatinya.
 *
 * ponytail: menandai SEBELUM mengirim, bukan sesudah seperti tertulis di
 * TECHNICAL § 9. Dengan dua proses, urutan "kirim dulu baru tandai" tidak bisa
 * memenuhi janji PRD § 6.13 "satu kejadian menghasilkan PALING BANYAK satu
 * email" — ada celah antara mengirim dan menandai. Harganya: kalau proses mati
 * tepat setelah klaim dan sebelum kirim, satu pengingat hilang. Dipilih karena
 * email ganda lebih merusak kepercayaan daripada satu pengingat telat. Jalan
 * naiknya: kolom `claimed_at` terpisah dari `sent_at`, sehingga klaim yatim
 * bisa dilepas kembali setelah beberapa menit.
 */
export async function claimDueReminders(): Promise<DueReminder[]> {
  const due = await db
    .select({
      id: reminders.id,
      userId: reminders.userId,
      type: reminders.type,
      title: reminders.title,
      datetime: reminders.datetime,
      notes: reminders.notes,
      email: settings.notifyEmail,
      timezone: settings.timezone,
      company: applications.company,
      position: applications.position,
    })
    .from(reminders)
    .innerJoin(settings, eq(settings.userId, reminders.userId))
    .leftJoin(applications, eq(applications.id, reminders.applicationId))
    .where(
      and(
        // UTC_TIMESTAMP, bukan NOW: kolom datetime berisi UTC karena pool
        // dikonfigurasi timezone 'Z', sementara NOW() mengembalikan waktu lokal
        // server. Membandingkan keduanya membuat pengingat berbunyi meleset
        // sebesar offset server — tujuh jam terlalu cepat di WIB.
        lte(reminders.datetime, sql`UTC_TIMESTAMP(3)`),
        eq(reminders.done, false),
        isNull(reminders.sentAt),
        // Pengguna yang mematikan notifikasi email tidak dikirimi apa pun.
        // Tautan berhenti berlangganan mematikan kolom yang sama ini.
        eq(settings.emailNotif, true),
      ),
    )
    .limit(BATCH);

  const claimed: DueReminder[] = [];
  for (const r of due) {
    const res = await db
      .update(reminders)
      .set({ sentAt: sql`UTC_TIMESTAMP(3)` })
      .where(and(eq(reminders.id, r.id), isNull(reminders.sentAt)));
    // affectedRows 0 berarti proses lain sudah mengklaimnya lebih dulu.
    if ((res[0] as { affectedRows: number }).affectedRows === 1) claimed.push(r);
  }
  return claimed;
}

/** Melepas klaim supaya putaran berikutnya mencobanya lagi. */
async function releaseClaim(id: string) {
  await db.update(reminders).set({ sentAt: null }).where(eq(reminders.id, id));
}

/**
 * Waktu ditulis di zona PENGGUNA, bukan zona server (PRD § 6.6: "semua
 * perhitungan waktu memakai zona waktu yang dipilih pengguna"). Sebuah email
 * yang bilang "besok 03.00" untuk interview jam 10 pagi lebih buruk daripada
 * tidak ada email.
 */
function formatWhen(at: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(at);
  } catch {
    // Zona tidak dikenal — jangan sampai satu pengaturan rusak menjatuhkan
    // seluruh putaran pengiriman.
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(at);
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`,
  );

function body(r: DueReminder) {
  const lamaran =
    r.company && r.position
      ? `<p style="margin:6px 0 0;font-size:13px;color:#57534a">${esc(r.company)} · ${esc(r.position)}</p>`
      : '';
  const catatan = r.notes
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;white-space:pre-wrap">${esc(r.notes)}</p>`
    : '';
  return `
<div style="border:1px solid #e6e3dd;border-radius:12px;padding:14px;margin:0 0 4px;background:#faf9f7">
  <p style="margin:0 0 4px;font-size:13px;color:#7c766c">${esc(LABEL[r.type])} · ${esc(formatWhen(r.datetime, r.timezone))}</p>
  <p style="margin:0;font-size:15px;font-weight:600">${esc(r.title)}</p>
  ${lamaran}
</div>${catatan}`;
}

/**
 * Satu putaran pengiriman. Mengembalikan jumlah email yang benar-benar terkirim.
 *
 * Satu pengiriman gagal tidak menghentikan sisanya, dan klaimnya dilepas supaya
 * putaran berikutnya mencobanya lagi — memenuhi PRD § 6.13 "kegagalan
 * pengiriman dicoba ulang".
 */
export async function sendDueReminders(): Promise<number> {
  if (!emailConfigured) return 0;

  const claimed = await claimDueReminders();
  let sent = 0;
  for (const r of claimed) {
    const ok = await sendMail({
      to: r.email,
      subject: `${LABEL[r.type]}: ${r.title}`,
      heading: r.title,
      bodyHtml: body(r),
      userId: r.userId,
    });
    if (ok) sent++;
    else await releaseClaim(r.id);
  }
  return sent;
}
