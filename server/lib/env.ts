/**
 * Satu-satunya tempat variabel lingkungan dibaca.
 *
 * Kalau ada yang kurang, proses berhenti saat start dengan pesan yang menyebut
 * nama variabelnya — bukan gagal misterius nanti saat permintaan pertama masuk.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variabel lingkungan ${name} belum diisi. Lihat .env.example`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  googleClientId: required('VITE_GOOGLE_CLIENT_ID'),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  port: Number(process.env.PORT ?? 3000),
  isProduction: process.env.NODE_ENV === 'production',

  // Baru dibutuhkan di M2 — sengaja opsional supaya M1 bisa jalan tanpa keduanya.
  r2: {
    accountId: optional('R2_ACCOUNT_ID'),
    accessKeyId: optional('R2_ACCESS_KEY_ID'),
    secretAccessKey: optional('R2_SECRET_ACCESS_KEY'),
    bucket: optional('R2_BUCKET'),
  },
  resendApiKey: optional('RESEND_API_KEY'),
};
