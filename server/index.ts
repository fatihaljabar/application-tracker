import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { assertDatabaseReachable } from './db/client.ts';
import { env } from './lib/env.ts';
import { ApiError, errorHandler, securityHeaders } from './lib/middleware.ts';
import { authRouter } from './routes/auth.ts';
import { stateRouter } from './routes/state.ts';

const app = express();
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser(env.sessionSecret));

app.get('/api/health', async (_req, res) => {
  const info = await assertDatabaseReachable();
  res.json({ ok: true, database: info.name, mysql: info.version });
});

app.use('/api/auth', authRouter);
app.use('/api/state', stateRouter);

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
});
