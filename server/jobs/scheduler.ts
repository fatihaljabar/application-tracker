import { sweepPendingDocuments } from './documents.ts';

/**
 * Penjadwal di dalam proses yang sama (TECHNICAL.md § 9). Jadwalnya sesederhana
 * "tiap sekian jam", jadi tidak ada ekspresi cron yang perlu diurai dan tidak
 * ada pustaka penjadwal yang dipasang.
 *
 * Baru satu tugas terpasang: pembersih berkas gantung. Pengirim reminder dan
 * rangkuman harian menyusul bersama Resend.
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

  schedule('sapu dokumen gantung', sweepPendingDocuments, DAY_MS);
}
