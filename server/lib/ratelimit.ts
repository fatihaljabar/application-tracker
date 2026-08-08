import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './middleware.ts';

/**
 * Pembatasan laju sederhana, penghitung di memori proses.
 *
 * Kenapa perlu sebelum pengguna nyata masuk: hanya dua endpoint yang bisa
 * dipanggil tanpa sesi, dan keduanya mahal. `/api/health` menyentuh database
 * setiap panggilan, sementara pool dibatasi 5 koneksi karena hosting bersama —
 * satu perulangan curl bisa menghabiskannya dan menghentikan layanan untuk
 * pengguna sungguhan, tanpa kredensial apa pun. `/api/auth/google` memanggil
 * Google setiap permintaan dengan batas 8 detik.
 *
 * ponytail: penghitungnya di memori, jadi (1) hilang saat proses restart dan
 * (2) berlaku per proses — kalau suatu hari ada dua proses, batas efektifnya
 * jadi dua kali lipat. Untuk satu proses Node di satu mesin itu cukup, dan
 * menambah penyimpan bersama berarti Redis, yang ditolak proyek ini. Jalan
 * naiknya kalau benar-benar perlu: tabel MySQL dengan (kunci, jendela, jumlah).
 */

/** Peta tidak boleh tumbuh tanpa batas — entri kedaluwarsa disapu di ambang ini. */
const AMBANG_SAPU = 5000;

export function rateLimit(opts: {
  max: number;
  windowMs: number;
  key: (req: Request) => string;
  message: string;
}) {
  const hits = new Map<string, { n: number; reset: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = opts.key(req);
    const cur = hits.get(k);

    if (!cur || now >= cur.reset) {
      if (hits.size > AMBANG_SAPU) {
        for (const [key, v] of hits) if (now >= v.reset) hits.delete(key);
      }
      hits.set(k, { n: 1, reset: now + opts.windowMs });
      next();
      return;
    }

    cur.n += 1;
    if (cur.n > opts.max) {
      // Retry-After memberi tahu klien kapan boleh mencoba lagi, alih-alih
      // membiarkannya menebak dan terus menabrak dinding yang sama.
      res.setHeader('Retry-After', String(Math.ceil((cur.reset - now) / 1000)));
      next(new ApiError(429, 'rate_limited', opts.message));
      return;
    }
    next();
  };
}

/**
 * IP pemanggil. Bergantung pada `trust proxy` di index.ts: tanpa itu, di balik
 * LiteSpeed semua permintaan terlihat datang dari alamat proxy dan satu pengguna
 * yang berlebihan akan mengunci semua orang.
 */
export const perIp = (req: Request) => req.ip ?? 'tanpa-ip';

/** Pengguna kalau ada sesinya, IP kalau belum masuk. */
export const perUserOrIp = (req: Request) => {
  const sid = req.signedCookies?.sid;
  return typeof sid === 'string' && sid ? `u:${sid}` : `ip:${req.ip ?? 'tanpa-ip'}`;
};
