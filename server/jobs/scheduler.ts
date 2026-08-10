import { sendDailyDigests } from './digest.ts';
import { sweepPendingDocuments } from './documents.ts';
import { createFollowupReminders } from './followup.ts';
import { sendDueReminders } from './reminders.ts';

/**
 * Penjadwal di dalam proses yang sama (TECHNICAL.md § 9). Jadwalnya sesederhana
 * "tiap sekian jam", jadi tidak ada ekspresi cron yang perlu diurai dan tidak
 * ada pustaka penjadwal yang dipasang.
 *
 * Empat tugas: pengirim reminder, rangkuman harian, pembersih berkas gantung,
 * dan pembuat reminder follow-up otomatis.
 *
 * Tiap putaran dibungkus try/catch. Satu tugas yang gagal tidak boleh
 * menjatuhkan penjadwal, dan penjadwal yang jatuh tidak boleh menjatuhkan
 * server — kegagalan mengirim email tidak sepadan dengan aplikasi yang mati.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Jeda sebelum putaran pertama. Bukan sekadar kerapian: proses baru saja
 * melayani permintaan pertamanya, dan menyapu database di detik yang sama
 * memperebutkan pool 5 koneksi dengan pengguna yang sedang menunggu.
 */
const FIRST_RUN_MS = 60_000;

async function run(name: string, task: () => Promise<number>) {
  try {
    const n = await task();
    if (n > 0) console.log(`[jobs] ${name}: ${n}`);
  } catch (err) {
    console.error(`[jobs] ${name} gagal`, err);
  }
}

/**
 * Setiap tugas dijalankan sekali tak lama setelah start, lalu berkala.
 *
 * Sekali di awal itu penting di hosting ini: LiteSpeed mendaur ulang proses
 * Node, terbukti saat pembatasan laju diukur di produksi. Penjadwal yang hanya
 * mengandalkan interval 24 jam bisa tidak pernah sampai ke putaran pertamanya.
 * Menyapu berulang tidak berbahaya — tugasnya idempoten dan biasanya nol baris.
 */
export function startScheduler() {
  const schedule = (name: string, task: () => Promise<number>, everyMs: number) => {
    setTimeout(() => void run(name, task), FIRST_RUN_MS).unref();
    // unref: interval tidak boleh menahan proses tetap hidup saat server ditutup,
    // termasuk server uji yang di-spawn isolation.test.ts.
    setInterval(() => void run(name, task), everyMs).unref();
  };

  // Tiap 5 menit. Toleransi PRD § 3 adalah ±15 menit, jadi interval ini
  // menyisakan ruang untuk satu putaran terlewat tanpa melanggar janjinya.
  schedule('kirim pengingat', sendDueReminders, 5 * 60_000);
  // Tiap jam: "pukul 07.00" terjadi 24 kali sehari di jam server yang berbeda,
  // karena penggunanya berada di zona berbeda.
  schedule('rangkuman harian', sendDailyDigests, 60 * 60_000);
  schedule('sapu dokumen gantung', sweepPendingDocuments, DAY_MS);
  schedule('buat follow-up otomatis', createFollowupReminders, DAY_MS);
}
