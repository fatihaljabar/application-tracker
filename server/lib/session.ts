import type { NextFunction, Request, Response } from 'express';
import { env } from './env.ts';
import { ApiError } from './middleware.ts';

const COOKIE = 'sid';
const MAX_AGE_DAYS = 30;

/**
 * Sesi hanya berisi userId, ditandatangani HMAC oleh cookie-parser.
 * Bukan JWT, dan tidak ada penyimpan sesi — jadi selamat dari restart proses
 * tanpa infrastruktur tambahan (TECHNICAL.md § 4).
 *
 * ponytail: karena tidak ada penyimpan, sesi tidak bisa dicabut dari server.
 * Pengguna yang kehilangan perangkat harus menunggu cookie kedaluwarsa.
 * Jalan naiknya: kolom users.token_version ikut ditandatangani di cookie,
 * pencabutan cukup menaikkan angkanya.
 */
export function setSession(res: Response, userId: string) {
  res.cookie(COOKIE, userId, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function readSession(req: Request): string | null {
  const v = req.signedCookies?.[COOKIE];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Menempelkan userId ke request. Seluruh rute resource memakai ini, dan
 * userId TIDAK PERNAH dibaca dari body, query, atau header — hanya dari sini.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = readSession(req);
  if (!userId) {
    next(new ApiError(401, 'unauthenticated', 'Sesi berakhir. Silakan masuk lagi.'));
    return;
  }
  req.userId = userId;
  next();
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
