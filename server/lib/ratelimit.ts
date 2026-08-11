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

/**
 * Penghitungnya sendiri, dipisah dari middleware supaya hal yang dibatasi
 * BUKAN sebuah permintaan HTTP juga bisa memakainya — misalnya "berapa kali
 * seorang pengguna boleh memicu email konfirmasi". Satu tempat menghitung,
 * bukan dua yang lama-lama berbeda.
 *
 * `sisaDetik` hanya berarti saat `ok` bernilai false.
 */
export function buatPenghitung(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, { n: number; reset: number }>();

  return function ambil(key: string): { ok: boolean; sisaDetik: number } {
    const now = Date.now();
    const cur = hits.get(key);

    if (!cur || now >= cur.reset) {
      if (hits.size > AMBANG_SAPU) {
        for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
      }
      hits.set(key, { n: 1, reset: now + opts.windowMs });
      return { ok: true, sisaDetik: 0 };
    }

    cur.n += 1;
    return cur.n > opts.max
      ? { ok: false, sisaDetik: Math.ceil((cur.reset - now) / 1000) }
      : { ok: true, sisaDetik: 0 };
  };
}

export function rateLimit(opts: {
  max: number;
  windowMs: number;
  key: (req: Request) => string;
  message: string;
}) {
  const ambil = buatPenghitung(opts);

  return (req: Request, res: Response, next: NextFunction) => {
    const hasil = ambil(opts.key(req));
    if (hasil.ok) {
      next();
      return;
    }
    // Retry-After memberi tahu klien kapan boleh mencoba lagi, alih-alih
    // membiarkannya menebak dan terus menabrak dinding yang sama.
    res.setHeader('Retry-After', String(hasil.sisaDetik));
    next(new ApiError(429, 'rate_limited', opts.message));
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
