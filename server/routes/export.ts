import { Router } from 'express';
import { requireAuth } from '../lib/session.ts';
import { buildState } from './state.ts';

export const exportRouter = Router();
exportRouter.use(requireAuth);

/**
 * Mengunduh seluruh data pengguna sebagai satu berkas JSON (PRD § 6.19).
 *
 * Datanya diambil ULANG dari database, bukan dari apa yang kebetulan ada di
 * memori peramban. Bedanya terasa saat ekspor dilakukan setelah aplikasi lama
 * dibuka: yang di memori bisa tertinggal dari perubahan di perangkat lain,
 * sementara ekspor yang tertinggal adalah ekspor yang salah tanpa ada tanda
 * apa pun bahwa ia salah.
 *
 * Bentuknya sama persis dengan GET /state, lewat fungsi yang sama. Ekspor
 * dengan bentuk sendiri akan pelan-pelan menyimpang dari aplikasinya.
 *
 * Isi berkas dokumen TIDAK ikut. Berkasnya bisa berjumlah 20 MB dan akan
 * memaksa seluruhnya lewat proses Node — persis yang dihindari sejak awal
 * (TECHNICAL § 8). Metadatanya lengkap, dan tiap berkas tetap bisa diunduh
 * satu per satu dari halaman Dokumen.
 */
exportRouter.get('/', async (req, res) => {
  const userId = req.userId as string;
  const data = await buildState(userId);

  const tanggal = new Date().toISOString().slice(0, 10);
  // Dipaksa terunduh sebagai berkas, bukan ditampilkan sebagai JSON di tab.
  res.setHeader('Content-Disposition', `attachment; filename="tracking-lamaran-${tanggal}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Diberi indentasi: PRD § 6.19 meminta berkas yang BISA DIBACA MANUSIA, dan
  // JSON satu baris sepanjang ratusan kilobyte tidak memenuhi itu.
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2));
});
