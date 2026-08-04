/**
 * Id dibuat di sisi klien supaya antarmuka bisa menampilkan hasil tanpa
 * menunggu balasan server. Wajib UUID: kolom id di database CHAR(36), dan
 * server menolak apa pun yang bukan UUID.
 */
export const uid = () => crypto.randomUUID();

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Mengembalikan url hanya kalau skemanya http atau https, selain itu string
 * kosong. Aturannya sama persis dengan `safeUrl` di server/lib/validate.ts —
 * kalau salah satunya diubah, ubah keduanya.
 *
 * Server sudah menolak `javascript:` sejak disimpan, jadi ini menjaga data yang
 * sudah telanjur ada: baris lama, hasil impor, dan apa pun yang masuk sebelum
 * aturan itu berlaku. Pemeriksaan saat menyimpan tidak menolong baris yang
 * sudah di database sejak sebelumnya.
 *
 * Daftar izin, bukan daftar larangan: apa pun yang tidak diawali http(s):// —
 * termasuk spasi sisipan dan skema yang diaburkan — ikut ditolak tanpa perlu
 * ditebak satu per satu. Dipangkas dulu karena peramban juga mengabaikan spasi
 * di tepi saat membaca skema.
 */
export function safeUrl(value: string) {
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

export function fmtDate(value: string, lang: 'id' | 'en', tz?: string) {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  }).format(d);
}

export function fmtDateTime(value: string, lang: 'id' | 'en', tz?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(d);
}

export function fmtMoney(n: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} rb`;
  return String(n);
}

export function salaryLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return '—';
  if (min !== null && max !== null) return `Rp ${fmtMoney(min)} – ${fmtMoney(max)}`;
  return `Rp ${fmtMoney(min ?? max)}`;
}

export function daysUntil(value: string) {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T23:59:59` : value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function relTime(value: string, lang: 'id' | 'en') {
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang === 'id' ? 'id' : 'en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / 2592000), 'month');
}

export function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday first
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function fileSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function initials(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function downloadJSON(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
