import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

/**
 * Pengiriman email lewat Resend (TECHNICAL.md § 9), dipanggil dengan `fetch`
 * biasa — tidak ada SDK yang dipasang untuk satu permintaan POST.
 *
 * Notifikasi hanya lewat email. Tanpa SMS, tanpa WhatsApp, tanpa push
 * (PRD § 6.13).
 */

/**
 * Alamat pengirim. Domainnya sama dengan aplikasi, dan DKIM ditandatangani di
 * situ; jalur pantulan lewat `send.` diurus Resend sendiri.
 *
 * `noreply` disengaja: kotak surat itu tidak ada, jadi balasan memantul balik
 * ke pengirimnya alih-alih hilang diam-diam. Setiap email memuat alamat kontak
 * sungguhan di kakinya, sesuai janji halaman privasi.
 */
const FROM = 'Tracking Lamaran <noreply@trackinglamaran.site>';
const CONTACT = 'fatihaljabar@gmail.com';

export const emailConfigured = Boolean(env.resendApiKey);

/* ------------------------------------------------------- berhenti langganan */

/**
 * Tautan berhenti berlangganan wajib berfungsi TANPA MASUK (PRD § 6.13) —
 * orang yang berhenti berlangganan justru yang paling tidak mau login dulu.
 *
 * Karena itu id pengguna ikut di URL, dan satu-satunya yang menghalangi orang
 * lain mematikan notifikasi milik orang asing adalah tanda tangan ini.
 * Rahasianya sama dengan cookie sesi, tapi isinya diberi awalan sendiri supaya
 * tanda tangan berhenti-langganan tidak pernah bisa dipakai sebagai cookie.
 */
const unsubMessage = (userId: string) => `unsubscribe:${userId}`;

export function unsubscribeToken(userId: string): string {
  return createHmac('sha256', env.sessionSecret).update(unsubMessage(userId)).digest('base64url');
}

/**
 * Perbandingan waktu-tetap. Perbandingan `===` biasa berhenti di karakter
 * pertama yang berbeda, dan selisih waktunya cukup untuk menebak tanda tangan
 * satu karakter demi satu karakter.
 */
export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export const unsubscribeUrl = (userId: string) =>
  `${env.appUrl}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;

/* ------------------------------------------------------------------ kiriman */

/** Lolos dari HTML. Isi email datang dari data pengguna sendiri, tapi tetap. */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`,
  );

/**
 * Satu kerangka untuk semua email. Sengaja HTML sederhana dengan gaya sebaris:
 * klien email mengabaikan sebagian besar CSS, dan tampilannya tidak terikat
 * penguncian desain aplikasi — ini bukan layar, ini surat.
 */
function layout(heading: string, body: string, userId: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2926">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e3dd;border-radius:16px;padding:28px">
<h1 style="margin:0 0 16px;font-size:18px;font-weight:600">${esc(heading)}</h1>
${body}
<hr style="border:0;border-top:1px solid #e6e3dd;margin:24px 0 16px">
<p style="margin:0;font-size:12px;line-height:1.6;color:#7c766c">
Email ini dikirim otomatis dan tidak dibalas. Ada pertanyaan? Hubungi
<a href="mailto:${CONTACT}" style="color:#3f8f74">${CONTACT}</a>.<br>
<a href="${unsubscribeUrl(userId)}" style="color:#7c766c">Berhenti menerima email dari Tracking Lamaran</a>
</p></div></body></html>`;
}

export interface Mail {
  to: string;
  subject: string;
  heading: string;
  /** Sudah berupa HTML; pemanggil bertanggung jawab melolosinya. */
  bodyHtml: string;
  userId: string;
}

/**
 * Mengembalikan true bila Resend menerima kiriman.
 *
 * Tidak pernah melempar: pemanggilnya adalah penjadwal, dan satu email gagal
 * tidak boleh menghentikan sisa antrean. Kegagalan dicatat lengkap di log
 * supaya bisa ditelusuri, tapi tidak merambat.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!emailConfigured) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        html: layout(mail.heading, mail.bodyHtml, mail.userId),
        // Sebagian klien email menampilkan tombol "berhenti berlangganan"
        // sendiri dari header ini. Satu klik, tanpa membuka isinya.
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl(mail.userId)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    if (res.ok) return true;
    console.error('[email] ditolak Resend', res.status, (await res.text()).slice(0, 300));
    return false;
  } catch (err) {
    console.error('[email] gagal dikirim', err);
    return false;
  }
}
