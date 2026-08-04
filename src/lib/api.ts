/**
 * Pembungkus fetch untuk seluruh panggilan API.
 *
 * Tugas utamanya bukan menyingkat kode, melainkan memastikan **setiap kegagalan
 * punya pesan yang berarti**. Tanpa ini, backend yang mati menghasilkan galat
 * parser JSON, dan itu yang dilihat pengguna (TECHNICAL.md § 7).
 */

export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }

  /** Sesi habis: pemanggil perlu mengembalikan pengguna ke halaman masuk. */
  get isUnauthenticated() {
    return this.status === 401;
  }

  /** Data sudah berubah di tempat lain — biasanya tab kedua. */
  get isConflict() {
    return this.status === 409;
  }
}

const OFFLINE = 'Tidak bisa menghubungi server. Periksa koneksi, lalu coba lagi.';

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Server tidak menjawab sama sekali.
    throw new ApiError(0, 'offline', OFFLINE);
  }

  // Balasan bisa saja bukan JSON — misalnya galat proxy saat backend mati.
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string; field?: string } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'error',
      e?.message ?? (res.status >= 500 ? OFFLINE : 'Permintaan ditolak.'),
      e?.field,
    );
  }

  return body as T;
}

export const post = <T = unknown>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });

export const put = <T = unknown>(path: string, data: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(data) });

export const patch = <T = unknown>(path: string, data: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });

export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });
