import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../lib/env.ts';

/**
 * Setelan pool mengikuti kenyataan hosting bersama, bukan angka bawaan.
 * Rinciannya di TECHNICAL.md § 5:
 *
 * - connectionLimit rendah: basis data di hosting bersama umumnya membatasi
 *   ~25 koneksi bersamaan untuk seluruh akun.
 * - keepAlive + idleTimeout: proses Node dimatikan saat lama menganggur lalu
 *   dihidupkan lagi. Tanpa ini, koneksi basi menyebabkan permintaan pertama
 *   setelah bangun gagal tanpa sebab yang jelas.
 */
const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: 5,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  idleTimeout: 60_000,
  waitForConnections: true,
  timezone: 'Z',
});

export const db = drizzle(pool);

/** Dipanggil sekali saat start supaya kegagalan koneksi ketahuan langsung. */
export async function assertDatabaseReachable() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT DATABASE() AS name, VERSION() AS version');
    return (rows as { name: string; version: string }[])[0];
  } finally {
    conn.release();
  }
}
