import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { settings } from '../db/schema.ts';
import { verifyUnsubscribeToken } from '../lib/email.ts';

export const unsubscribeRouter = Router();

/**
 * Berhenti berlangganan TANPA MASUK (PRD § 6.13) — orang yang ingin berhenti
 * justru yang paling tidak mau login dulu.
 *
 * Ini satu-satunya rute data yang sengaja tidak memakai sesi, jadi tanda tangan
 * HMAC-lah satu-satunya penjaga. Yang bisa dilakukan pemegang tautan hanya
 * MEMATIKAN notifikasi milik dirinya sendiri: tidak ada data yang terbaca,
 * tidak ada yang terhapus, dan tidak ada cara menyalakannya kembali dari sini.
 * Kerusakan terburuk kalau tautannya bocor adalah pengguna berhenti menerima
 * email — mengganggu, bukan bencana, dan bisa dinyalakan lagi di Pengaturan.
 *
 * Membalas HTML, bukan JSON: yang membukanya peramban orang, bukan kode.
 */
function page(title: string, message: string) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2926">
<div style="max-width:420px;margin:64px auto;background:#fff;border:1px solid #e6e3dd;border-radius:16px;padding:28px;text-align:center">
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600">${title}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#57534a">${message}</p>
<a href="/" style="display:inline-block;background:#3f8f74;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Buka Tracking Lamaran</a>
</div></body></html>`;
}

/**
 * POST ikut ditangani karena `List-Unsubscribe-Post` membuat klien email
 * mengirim POST, bukan GET, saat penggunanya menekan tombol bawaan klien.
 * Tanpa ini tombol itu gagal diam-diam.
 */
unsubscribeRouter.all('/', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).send(page('Metode tidak didukung', 'Buka tautannya lewat peramban.'));
    return;
  }

  const userId = String(req.query.u ?? '');
  const token = String(req.query.t ?? '');

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    // Tidak membedakan "tanda tangan salah" dari "pengguna tidak ada": keduanya
    // pesan yang sama, supaya tautan karangan tidak bisa dipakai menebak id
    // pengguna yang benar-benar terdaftar.
    res.status(400).send(page('Tautan tidak berlaku', 'Tautannya salah atau sudah kedaluwarsa.'));
    return;
  }

  await db
    .update(settings)
    .set({ emailNotif: false, dailyReminder: false })
    .where(eq(settings.userId, userId));

  // Kata "berlangganan" sengaja DIHINDARI di teks yang dibaca pengguna.
  // Aplikasi ini gratis tanpa iklan, dan dalam bahasa Indonesia "berhenti
  // berlangganan" terbaca seperti membatalkan paket berbayar — pengguna bisa
  // mengira dia baru saja menghapus akunnya. Kalimat kedua menegaskan bahwa
  // yang berhenti cuma emailnya.
  res.send(
    page(
      'Email pengingat dimatikan',
      'Kami tidak akan mengirim email pengingat lagi. Akun dan seluruh data lamaranmu tetap utuh — kamu bisa menyalakan emailnya lagi kapan saja di halaman Pengaturan.',
    ),
  );
});
