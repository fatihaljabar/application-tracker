import type { ReminderType } from '../../shared/types.ts';

/**
 * Pengingat turunan: kapan sebuah jadwal harus MENGINGATKAN, bukan kapan ia
 * terjadi (PRD § 6.6).
 *
 * Tanpa ini, pengingat interview jam 10.00 mengirim email jam 10.00 — tepat
 * saat interviewnya dimulai, yang praktis tidak berguna. Yang dibutuhkan
 * peringatan sebelum.
 *
 * | Tipe                   | Turunan             |
 * |------------------------|---------------------|
 * | interview, technical   | H-1 pagi, T-2 jam   |
 * | deadline               | H-3 pagi, H-1 pagi  |
 *
 * follow-up dan masa berlaku CV tidak punya turunan: keduanya sudah berupa
 * peringatan itu sendiri, bukan jadwal sebuah acara.
 */

/** Jam "pagi", di zona pengguna. Sama dengan jam rangkuman harian. */
const JAM_PAGI = 7;

export interface Turunan {
  /** Bagian akhir auto_key, dibuat unik terhadap pengingat sumbernya. */
  kunci: string;
  at: Date;
}

/**
 * Menggeser sebuah instan ke pukul `JAM_PAGI` di zona pengguna, `hari`
 * sebelumnya.
 *
 * Dihitung lewat offset zona pada tanggal itu, bukan dengan mengurangi jam
 * mentah — supaya tetap benar saat ada pergeseran waktu musim panas, dan supaya
 * "pagi" berarti pagi bagi PENGGUNA, bukan pagi di zona server.
 */
function pagiSebelumnya(at: Date, hari: number, timeZone: string): Date | null {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const target = new Date(at.getTime() - hari * 24 * 3600 * 1000);
    const tanggal = f.format(target);
    // Offset zona pada tanggal itu, diukur dari selisih dua pembacaan instan
    // yang sama.
    const acuan = new Date(`${tanggal}T12:00:00Z`);
    const offsetMs =
      new Date(acuan.toLocaleString('en-US', { timeZone })).getTime() -
      new Date(acuan.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return new Date(new Date(`${tanggal}T00:00:00Z`).getTime() - offsetMs + JAM_PAGI * 3600 * 1000);
  } catch {
    // Zona rusak: lebih baik tidak membuat turunan daripada membuatnya di
    // waktu yang salah.
    return null;
  }
}

/**
 * Turunan yang MASIH DI DEPAN saja. Pengingat untuk waktu yang sudah lewat
 * akan langsung terkirim di putaran berikutnya — email yang mengingatkan
 * sesuatu yang sudah terjadi lebih buruk daripada tidak ada email.
 */
export function turunanUntuk(
  type: ReminderType,
  at: Date,
  timeZone: string,
  sekarang = new Date(),
): Turunan[] {
  const hasil: Turunan[] = [];
  const tambah = (kunci: string, waktu: Date | null) => {
    if (waktu && waktu.getTime() > sekarang.getTime() && waktu.getTime() < at.getTime()) {
      hasil.push({ kunci, at: waktu });
    }
  };

  if (type === 'interview' || type === 'technical_test') {
    tambah('h1', pagiSebelumnya(at, 1, timeZone));
    tambah('j2', new Date(at.getTime() - 2 * 3600 * 1000));
  } else if (type === 'deadline') {
    tambah('h3', pagiSebelumnya(at, 3, timeZone));
    tambah('h1', pagiSebelumnya(at, 1, timeZone));
  }
  return hasil;
}

/** Judul yang menjelaskan JARAKNYA, bukan mengulang judul aslinya. */
export function judulTurunan(kunci: string, judulAsli: string): string {
  const awalan = { h3: '3 hari lagi', h1: 'Besok', j2: '2 jam lagi' }[kunci] ?? 'Segera';
  return `${awalan}: ${judulAsli}`;
}

export const autoKeyTurunan = (reminderId: string, kunci: string) => `ahead:${kunci}:${reminderId}`;
