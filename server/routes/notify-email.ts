import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { settings } from '../db/schema.ts';
import { verifyNotifyEmailToken } from '../lib/email.ts';

export const notifyEmailRouter = Router();

/**
 * Mengesahkan alamat tujuan notifikasi yang baru (menutup temuan tinjauan
 * keamanan M2+M3).
 *
 * TANPA SESI, dengan alasan yang sama seperti berhenti berlangganan: yang
 * menekan tautannya adalah pemilik alamat email itu, dan dia belum tentu punya
 * akun di sini sama sekali. Penjaganya tanda tangan HMAC atas pasangan
 * (userId, alamat) — jadi tautan untuk satu alamat tidak bisa mengesahkan
 * alamat lain, dan orang lain tidak bisa mengarang tautan untuk akun siapa pun.
 *
 * GET bertanya, POST mengubah — sama seperti /unsubscribe, dan karena alasan
 * yang sama: pemindai keamanan email mem-prefetch setiap tautan di email masuk,
 * dan tautan yang langsung berlaku saat di-prefetch berarti konfirmasinya
 * ditekan oleh mesin, bukan oleh orangnya. Itu akan mengembalikan persis lubang
 * yang rute ini ada untuk menutupnya.
 */
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

notifyEmailRouter.all('/', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).send(page('Metode tidak didukung', 'Buka tautannya lewat peramban.'));
    return;
  }

  const userId = String(req.query.u ?? '');
  const email = String(req.query.e ?? '');
  const token = String(req.query.t ?? '');

  if (!userId || !email || !token || !verifyNotifyEmailToken(userId, email, token)) {
    // Satu pesan untuk semua kegagalan: tautan karangan tidak boleh bisa
    // dipakai menebak id pengguna maupun alamat yang terdaftar.
    res.status(400).send(page('Tautan tidak berlaku', 'Tautannya salah atau sudah kedaluwarsa.'));
    return;
  }

  if (req.method === 'GET') {
    const aksi = `?u=${encodeURIComponent(userId)}&e=${encodeURIComponent(
      email,
    )}&t=${encodeURIComponent(token)}`;
    res.send(
      page(
        'Kirim pengingat ke alamat ini?',
        `Mulai sekarang email pengingat Tracking Lamaran akan dikirim ke ${email}.`,
        `<form method="post" action="${esc(aksi)}" style="margin:0">
<button type="submit" style="${TOMBOL}">Ya, kirim ke sini</button>
</form>`,
      ),
    );
    return;
  }

  await db.update(settings).set({ notifyEmail: email }).where(eq(settings.userId, userId));

  res.send(
    page(
      'Alamat email tersimpan',
      `Email pengingat akan dikirim ke ${email}. Kamu bisa menggantinya lagi kapan saja di halaman Pengaturan.`,
    ),
  );
});
