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
/** Lolos dari HTML. Halaman ini menyusun atribut dari nilai di query. */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`,
  );

const TOMBOL =
  'display:inline-block;border:0;cursor:pointer;background:#3f8f74;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px;font-family:inherit';

function page(title: string, message: string, aksi?: string) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2926">
<div style="max-width:420px;margin:64px auto;background:#fff;border:1px solid #e6e3dd;border-radius:16px;padding:28px;text-align:center">
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600">${esc(title)}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#57534a">${esc(message)}</p>
${aksi ?? `<a href="/" style="${TOMBOL}">Buka Tracking Lamaran</a>`}
</div></body></html>`;
}

/**
 * POST yang mengubah, GET yang bertanya.
 *
 * Dulu keduanya langsung mematikan notifikasi. Masalahnya bukan penyerang:
 * pemindai keamanan email — Defender Safe Links, Proofpoint, Barracuda —
 * MEM-PREFETCH setiap tautan di email masuk dengan GET. Tautan ini ada di kaki
 * setiap email dan membawa tanda tangan yang sah, jadi pemindainya mematikan
 * seluruh pengingat pengguna tanpa penggunanya menekan apa pun, tanpa
 * pemberitahuan. Untuk aplikasi yang gunanya mengingatkan, itu mematikan
 * fungsinya diam-diam.
 *
 * `List-Unsubscribe-Post` tetap berfungsi: RFC 8058 memang mengirim POST, jadi
 * tombol bawaan klien email langsung mengenai jalur yang mengubah tanpa
 * melewati formulir ini.
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

  if (req.method === 'GET') {
    // Tanda tangannya sudah lolos, jadi kedua nilai ini memang kita yang buat —
    // tetap dilolosi karena keduanya masuk ke atribut HTML.
    const aksi = `?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
    res.send(
      page(
        'Matikan email pengingat?',
        'Kami tidak akan mengirim email pengingat lagi. Akun dan seluruh data lamaranmu tetap utuh, dan emailnya bisa dinyalakan lagi kapan saja di halaman Pengaturan.',
        `<form method="post" action="${esc(aksi)}" style="margin:0">
<button type="submit" style="${TOMBOL}">Ya, matikan email</button>
</form>`,
      ),
    );
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
