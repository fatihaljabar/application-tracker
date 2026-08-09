import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { assertDatabaseReachable } from './db/client.ts';
import { startScheduler } from './jobs/scheduler.ts';
import { env } from './lib/env.ts';
import { ApiError, errorHandler, securityHeaders } from './lib/middleware.ts';
import { perIp, perUserOrIp, rateLimit } from './lib/ratelimit.ts';
import { activitiesRouter } from './routes/activities.ts';
import { applicationsRouter } from './routes/applications.ts';
import { authRouter } from './routes/auth.ts';
import { bookmarksRouter } from './routes/bookmarks.ts';
import { documentsRouter } from './routes/documents.ts';
import { notesRouter } from './routes/notes.ts';
import { remindersRouter } from './routes/reminders.ts';
import { settingsRouter } from './routes/settings.ts';
import { stateRouter } from './routes/state.ts';
import { tagsRouter } from './routes/tags.ts';
import { wishesRouter } from './routes/wishes.ts';

const app = express();

// Angka dari PRD/Notion: 10 percobaan masuk per menit per IP, 60 permintaan
// tulis per menit per pengguna. /health tidak ada di sana — ditambahkan karena
// ia satu-satunya endpoint tanpa sesi yang menyentuh database.
const writeLimit = rateLimit({
  max: 60,
  windowMs: 60_000,
  key: perUserOrIp,
  message: 'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.',
});
const healthLimit = rateLimit({
  max: 30,
  windowMs: 60_000,
  key: perIp,
  message: 'Terlalu sering. Coba lagi sebentar.',
});
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

app.disable('x-powered-by');
// Satu hop: LiteSpeed di depan proses Node. Tanpa ini req.ip berisi alamat
// proxy untuk SEMUA permintaan, sehingga batas per-IP di bawah akan mengunci
// seluruh pengguna sekaligus alih-alih pemanggil yang berlebihan saja.
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser(env.sessionSecret));

// Semua permintaan yang MENGUBAH data, dihitung per pengguna. Dipasang di satu
// tempat, bukan di tiap router, supaya rute baru ikut terlindungi tanpa perlu
// diingat — sejalan dengan aturan bahwa endpoint baru gampang lupa didaftarkan.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  writeLimit(req, res, next);
});

/**
 * Hasil pemeriksaan database ditahan sebentar, bukan diulang tiap permintaan.
 *
 * Ancaman aslinya bukan "terlalu banyak permintaan" melainkan "terlalu banyak
 * query": endpoint ini satu-satunya tanpa sesi yang menyentuh database, dan pool
 * dibatasi 5 koneksi karena hosting bersama (TECHNICAL § 5). Pembatasan laju
 * saja tidak cukup di sini — penghitungnya di memori proses, dan di LiteSpeed
 * proses itu didaur ulang, terbukti saat diuji di produksi.
 *
 * Cache ini tidak menghitung apa pun, jadi kebal terhadap restart maupun jumlah
 * proses: seribu permintaan tetap jadi paling banyak enam query per menit.
 *
 * Harganya: kalau database mati, endpoint ini masih menjawab "ok" sampai
 * sepuluh detik. Diterima — ini alat diagnosis, bukan pemantau kesehatan.
 */
const HEALTH_TTL_MS = 10_000;
let healthCache: { at: number; name: string; version: string } | null = null;

app.get('/api/health', healthLimit, async (_req, res) => {
  const now = Date.now();
  if (!healthCache || now - healthCache.at >= HEALTH_TTL_MS) {
    const info = await assertDatabaseReachable();
    healthCache = { at: now, name: info.name, version: info.version };
  }
  res.json({ ok: true, database: healthCache.name, mysql: healthCache.version });
});

app.use('/api/auth', authRouter);
app.use('/api/state', stateRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/bookmarks', bookmarksRouter);
app.use('/api/wishes', wishesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/settings', settingsRouter);

// Rute resource menyusul di sini seiring M1.

// /api yang tidak dikenal harus 404 sebagai JSON, bukan jatuh ke index.html.
app.use('/api', (_req, _res, next) => {
  next(new ApiError(404, 'not_found', 'Endpoint tidak ditemukan.'));
});

// Sajikan hasil build frontend. Aset ber-hash boleh di-cache selamanya;
// index.html tidak pernah, supaya rilis baru langsung terpakai.
if (existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(errorHandler);

const info = await assertDatabaseReachable();
app.listen(env.port, () => {
  console.log(`server siap di http://localhost:${env.port}`);
  console.log(`database  ${info.name} (MySQL ${info.version})`);
  if (!existsSync(distDir)) {
    console.log('dist/ belum ada — jalankan "npm run dev" untuk frontend, atau "npm run build"');
  }
  // Setelah port terangkat, bukan sebelumnya: tugas terjadwal tidak boleh
  // menunda saat aplikasi mulai melayani permintaan.
  startScheduler();
});
