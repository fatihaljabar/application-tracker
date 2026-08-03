import { env } from './env.ts';
import { ApiError } from './middleware.ts';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

interface TokenInfo {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string;
}

/**
 * Verifikasi ID token Google.
 *
 * Endpoint tokeninfo memeriksa tanda tangan token; ia TIDAK memeriksa bahwa
 * token itu ditujukan untuk aplikasi kita. Karena itu `aud` dicocokkan sendiri
 * di bawah — tanpa pemeriksaan itu, token milik aplikasi lain akan diterima.
 *
 * ponytail: tokeninfo adalah endpoint bantu Google dan punya batas laju. Cukup
 * untuk volume masuk aplikasi ini, dan hanya dipanggil saat login. Kalau nanti
 * terbatas, ganti dengan verifikasi JWT lokal terhadap JWKS Google yang di-cache
 * 24 jam — sekitar 40 baris memakai crypto.createPublicKey({ format: 'jwk' }).
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleProfile> {
  if (!credential || credential.length > 4096) {
    throw new ApiError(400, 'bad_credential', 'Token Google tidak sah.');
  }

  let info: TokenInfo;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      throw new ApiError(401, 'bad_credential', 'Token Google ditolak.');
    }
    info = (await res.json()) as TokenInfo;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(503, 'google_unreachable', 'Tidak bisa menghubungi Google. Coba lagi.');
  }

  if (info.aud !== env.googleClientId) {
    throw new ApiError(401, 'wrong_audience', 'Token ini bukan untuk aplikasi ini.');
  }
  if (info.email_verified !== true && info.email_verified !== 'true') {
    throw new ApiError(403, 'email_unverified', 'Alamat email Google Anda belum terverifikasi.');
  }
  if (!info.sub || !info.email) {
    throw new ApiError(401, 'bad_credential', 'Token Google tidak lengkap.');
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new ApiError(401, 'expired_credential', 'Token Google sudah kedaluwarsa.');
  }

  return {
    sub: info.sub,
    email: info.email,
    name: info.name?.trim() || info.email.split('@')[0],
    picture: info.picture ?? null,
  };
}
