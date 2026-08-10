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

  /**
   * Server tidak terjangkau — bukan sekadar permintaan yang ditolak.
   *
   * Dua bentuk, dan keduanya nyata:
   * - `status 0`: fetch gagal total, tidak ada balasan. Ini bentuknya di
   *   produksi, tempat Express melayani halaman dan API sekaligus.
   * - `5xx tanpa bentuk galat kita`: ada yang menjawab, tapi bukan aplikasi
   *   ini. Di pengembangan itu proxy Vite saat backend mati; di produksi bisa
   *   gerbang di depan Node. Kode `error` berarti tidak ada `{ error: { … } }`
   *   di badan balasan — aplikasi kita SELALU mengirimnya, jadi 500 dari kita
   *   sendiri (kode `internal`) sengaja tidak ikut: itu bug, bukan koneksi.
   */
  get isUnreachable() {
    return this.status === 0 || (this.status >= 500 && this.code === 'error');
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

/**
 * PUT berkas langsung ke penyimpanan objek, dengan laporan kemajuan.
 *
 * Memakai XMLHttpRequest, bukan `fetch`, karena satu alasan: `fetch` tidak bisa
 * melaporkan kemajuan UNGGAH sama sekali. Berkas 2 MB di jaringan 4G lambat
 * butuh beberapa detik, dan tanpa penanda kemajuan layar terlihat menggantung —
 * pengguna akan menekan tombolnya dua kali (PRD Lampiran A, A3).
 *
 * Ini satu-satunya panggilan yang tidak lewat `api()`: tujuannya bukan server
 * kita, jadi tidak ada bentuk galat `{ error: { code } }` yang bisa dibaca.
 */
export function uploadFile(
  url: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new ApiError(xhr.status, 'upload_failed', 'Berkas gagal diunggah. Coba lagi.'));
    };
    // Termasuk kasus CORS ditolak: peramban tidak memberi tahu bedanya, jadi
    // pesannya harus tetap masuk akal bagi pengguna.
    xhr.onerror = () => reject(new ApiError(0, 'offline', OFFLINE));
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Unggahan dibatalkan.'));
    xhr.send(blob);
  });
}
