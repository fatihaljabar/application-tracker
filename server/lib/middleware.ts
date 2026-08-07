import type { NextFunction, Request, Response } from 'express';
import { env } from './env.ts';

/**
 * Galat yang disengaja, dengan kode status dan pesan yang memang untuk pengguna.
 * Apa pun yang bukan ApiError dianggap bug dan tidak pernah bocor isinya ke klien.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  // Ditulis eksplisit, bukan parameter property: Node menjalankan TypeScript dengan
  // menghapus tipe saja, dan parameter property butuh transformasi. Aturan yang sama
  // berlaku untuk seluruh server/ — tanpa enum, tanpa namespace.
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const R2_HOST = env.r2.accountId ? `https://${env.r2.accountId}.r2.cloudflarestorage.com` : '';

/**
 * Header keamanan untuk semua balasan. Rinciannya di TECHNICAL.md § 10.3.
 *
 * `style-src` terpaksa memakai 'unsafe-inline' karena antarmuka memakai style={{...}}
 * di banyak tempat dan desainnya terkunci. Itu alasan tambahan kenapa `script-src`
 * harus tetap ketat.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com",
      // accounts.google.com ada di sini karena pustaka masuk Google memuat
      // stylesheet-nya sendiri dari sana. Tanpa itu peramban memblokirnya, dan
      // tombol Google dirender tanpa gaya miliknya. Hari ini akibatnya tidak
      // terlihat karena tombol itu disembunyikan lalu ditumpuk tombol kita —
      // tapi pustakanya dimuat langsung dari Google tanpa versi terkunci, jadi
      // rancangan tombolnya bisa berubah kapan saja. Kalau versi berikutnya
      // butuh stylesheet ini untuk mengatur ukuran, tombol tak terlihat itu
      // bergeser dan login berhenti bekerja tanpa galat apa pun.
      // Domain ini toh sudah dipercaya untuk script-src dan frame-src; melarang
      // stylesheet-nya sementara mengizinkan skripnya tidak konsisten.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn-uicons.flaticon.com https://accounts.google.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn-uicons.flaticon.com",
      "img-src 'self' data: https://lh3.googleusercontent.com",
      `connect-src 'self' https://accounts.google.com${R2_HOST ? ` ${R2_HOST}` : ''}`,
      'frame-src https://accounts.google.com',
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (env.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/** Bentuk balasan galat seragam. Lihat TECHNICAL.md § 6. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
    return;
  }
  // Bug, bukan galat yang direncanakan: dicatat lengkap, tapi klien hanya tahu ada kegagalan.
  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'internal', message: 'Terjadi kesalahan di server.' },
  });
}
