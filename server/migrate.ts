import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

/**
 * Menjalankan migrasi memakai migrator milik drizzle-orm, bukan CLI drizzle-kit.
 *
 * Alasannya ditemukan saat deploy pertama: CLI drizzle-kit membaca
 * drizzle.config.ts lewat esbuild, dan biner esbuild tiba di server Hostinger
 * TANPA bit eksekusi — `spawn ... esbuild EACCES`. Bisa ditambal dengan
 * `chmod +x`, tapi folder rilis dibuat ulang setiap deploy sehingga tambalannya
 * hilang lagi. Migrator ini hanya memakai drizzle-orm dan mysql2, dua paket yang
 * memang sudah dipakai server saat berjalan, jadi tidak ada biner yang perlu
 * dieksekusi sama sekali.
 *
 * Hasilnya identik: berkas SQL di drizzle/ diterapkan berurutan menurut
 * drizzle/meta/_journal.json, dan yang sudah diterapkan dicatat di tabel
 * __drizzle_migrations — jadi menjalankannya dua kali tidak mengubah apa pun.
 * `drizzle-kit generate` tetap dipakai untuk MEMBUAT berkas migrasi, dan itu
 * hanya dijalankan di laptop.
 *
 * Sengaja tidak mengimpor lib/env.ts: berkas itu juga mewajibkan SESSION_SECRET
 * dan VITE_GOOGLE_CLIENT_ID, dan migrasi tidak membutuhkan keduanya. Di sesi SSH
 * variabel panel hosting tidak tersedia, jadi menuntut tiga variabel padahal
 * cuma butuh satu akan menghalangi tanpa alasan.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL belum diisi. Contoh:');
  console.error(
    "  DATABASE_URL='mysql://user:sandi@127.0.0.1:3306/nama_db' node server/migrate.ts",
  );
  process.exit(1);
}

// Jalur folder dihitung dari letak berkas ini, bukan dari direktori kerja —
// supaya perintahnya benar dari mana pun dijalankan.
const folder = fileURLToPath(new URL('../drizzle', import.meta.url));

const conn = await mysql.createConnection(url);
try {
  await migrate(drizzle(conn), { migrationsFolder: folder });
  const [rows] = await conn.query('SHOW TABLES');
  console.log(`migrasi selesai — ${(rows as unknown[]).length} tabel`);
} finally {
  await conn.end();
}
