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
 * Pukul `JAM_PAGI` di zona pengguna, pada tanggal `YYYY-MM-DD`.
 *
 * Dihitung lewat offset zona pada tanggal itu, bukan dengan mengurangi jam
 * mentah — supaya tetap benar saat ada pergeseran waktu musim panas, dan supaya
 * "pagi" berarti pagi bagi PENGGUNA, bukan pagi di zona server.
 */
function pagiDi(tanggal: string, timeZone: string): Date | null {
  try {
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

/** Menggeser sebuah instan ke pukul `JAM_PAGI` di zona pengguna, `hari` sebelumnya. */
function pagiSebelumnya(at: Date, hari: number, timeZone: string): Date | null {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return pagiDi(f.format(new Date(at.getTime() - hari * 24 * 3600 * 1000)), timeZone);
  } catch {
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

/**
 * Turunan untuk DEADLINE lamaran: H-3 dan H-1 pagi (PRD § 6.6).
 *
 * Berdiri sendiri, tidak lewat `turunanUntuk`, karena deadline hanya berupa
 * TANGGAL tanpa jam — tidak ada instan yang bisa dijadikan acuan, dan mengarang
 * jamnya akan salah untuk sebagian pengguna.
 *
 * Selisih harinya dihitung sebagai tanggal, bukan dengan mengurangi 24 jam dari
 * sebuah instan: "tiga hari sebelum 20 Agustus" selalu 17 Agustus, sementara
 * mengurangi 72 jam bisa meleset sehari di sekitar pergeseran waktu musim panas.
 *
 * Tidak ada baris untuk hari-H itu sendiri. PRD § 6.6 menyebut waktu
 * pengingatnya "H-3 dan H-1" — dua — dan rangkuman harian sudah punya bagian
 * "Deadline hari ini" yang menutup harinya.
 */
export function turunanDeadline(
  tanggal: string,
  timeZone: string,
  sekarang = new Date(),
): Turunan[] {
  const hasil: Turunan[] = [];
  for (const [kunci, hari] of [
    ['h3', 3],
    ['h1', 1],
  ] as const) {
    const target = new Date(`${tanggal}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() - hari);
    const at = pagiDi(target.toISOString().slice(0, 10), timeZone);
    // Hanya yang masih di depan, dengan alasan yang sama seperti turunan lain:
    // pengingat untuk waktu yang sudah lewat langsung terkirim di putaran
    // berikutnya, mengingatkan sesuatu yang sudah telat.
    if (at && at.getTime() > sekarang.getTime()) hasil.push({ kunci, at });
  }
  return hasil;
}

/** Judul yang menjelaskan JARAKNYA, bukan mengulang judul aslinya. */
export function judulTurunan(kunci: string, judulAsli: string): string {
  const awalan = { h3: '3 hari lagi', h1: 'Besok', j2: '2 jam lagi' }[kunci] ?? 'Segera';
  return `${awalan}: ${judulAsli}`;
}

export const autoKeyTurunan = (reminderId: string, kunci: string) => `ahead:${kunci}:${reminderId}`;

/**
 * Penanda pengingat deadline. Menempel ke ID LAMARAN, bukan ke sebuah reminder
 * induk — deadline tidak punya induk, ia cuma sebuah kolom tanggal.
 */
export const autoKeyDeadline = (applicationId: string, kunci: string) =>
  `deadline:${kunci}:${applicationId}`;
