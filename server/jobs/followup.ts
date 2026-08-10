import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { applications, reminders, statusHistory } from '../db/schema.ts';

/**
 * Reminder follow-up otomatis (PRD § 6.6).
 *
 * Aturannya: status TIDAK BERUBAH tujuh hari setelah `Applied`, atau lima hari
 * setelah tahap interview mana pun. Yang dipakai bukan tanggal lamaran, tapi
 * kapan status sekarang mulai berlaku — itu tersimpan di `status_history`.
 */

/** Berapa hari diam sebelum layak ditanya lagi, per status. */
const DIAM_HARI: Partial<Record<string, number>> = {
  applied: 7,
  hr_interview: 5,
  user_interview: 5,
  technical_test: 5,
};

const autoKeyFor = (applicationId: string) => `followup:${applicationId}`;

/**
 * Membuat reminder yang belum ada, mengembalikan jumlah yang dibuat.
 *
 * Tiga hal yang membuatnya tidak mengganggu:
 * - Lamaran arsip dilewati — pengguna sudah selesai dengan itu.
 * - `followup_dismissed` dihormati: sekali pengguna menghapus reminder ini,
 *   tidak pernah dibuat lagi. `auto_key` saja tidak cukup untuk itu, karena
 *   keunikannya ikut hilang bersama barisnya.
 * - `onDuplicateKeyUpdate` membuat penyisipan idempoten, jadi dua proses yang
 *   berjalan bersamaan tidak saling menjatuhkan dengan galat kunci ganda.
 */
export async function createFollowupReminders(): Promise<number> {
  const statuses = Object.keys(DIAM_HARI);

  // Waktu status sekarang mulai berlaku = entri riwayat TERBARU lamaran itu.
  const mulai = db
    .select({
      applicationId: statusHistory.applicationId,
      at: sql<Date>`MAX(${statusHistory.at})`.as('mulai_at'),
    })
    .from(statusHistory)
    .groupBy(statusHistory.applicationId)
    .as('mulai');

  const kandidat = await db
    .select({
      id: applications.id,
      userId: applications.userId,
      company: applications.company,
      position: applications.position,
      status: applications.status,
      mulaiAt: mulai.at,
    })
    .from(applications)
    .innerJoin(mulai, eq(mulai.applicationId, applications.id))
    .where(
      and(
        eq(applications.archived, false),
        eq(applications.followupDismissed, false),
        inArray(applications.status, statuses as never),
      ),
    )
    .orderBy(desc(applications.updatedAt))
    .limit(500);

  const sekarang = Date.now();
  let dibuat = 0;

  for (const a of kandidat) {
    const hari = DIAM_HARI[a.status];
    if (!hari) continue;
    const diamMs = sekarang - new Date(a.mulaiAt).getTime();
    if (diamMs < hari * 24 * 3600 * 1000) continue;

    const res = await db
      .insert(reminders)
      .values({
        id: randomUUID(),
        userId: a.userId,
        applicationId: a.id,
        type: 'followup',
        title: `Follow up ${a.company}`,
        // Jatuh tempo sekarang: PRD § 6.6 menyebut "pada hari terpicu", dan
        // pengirim reminder yang akan mengantarkannya di putaran berikutnya.
        datetime: new Date(),
        notes: `Belum ada kabar ${hari} hari untuk posisi ${a.position}.`,
        done: false,
        autoKey: autoKeyFor(a.id),
      })
      // Sudah pernah dibuat untuk lamaran ini — biarkan apa adanya.
      .onDuplicateKeyUpdate({ set: { autoKey: autoKeyFor(a.id) } });

    if ((res[0] as { affectedRows: number }).affectedRows === 1) dibuat++;
  }
  return dibuat;
}

/**
 * Dipanggil saat pengguna MENGHAPUS reminder follow-up otomatis.
 *
 * Menandai lamarannya supaya tugas harian tidak membuatnya lagi besok —
 * memenuhi PRD § 6.6 "tidak dibuat ulang setelah pengguna menghapusnya".
 */
export async function dismissFollowup(applicationId: string, userId: string) {
  await db
    .update(applications)
    .set({ followupDismissed: true })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
}

export { autoKeyFor };
