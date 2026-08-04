import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { inArray } from 'drizzle-orm';
import type { DB } from '../shared/types.ts';
import { db } from './db/client.ts';
import { documents, settings, users } from './db/schema.ts';
import { env } from './lib/env.ts';

/**
 * Satu-satunya tes wajib di proyek ini (TECHNICAL.md § 10.4).
 *
 * Isinya: dua akun dibuat, lalu pengguna B mencoba menyentuh data milik
 * pengguna A di setiap endpoint. Tidak boleh ada satu pun yang berhasil.
 * Alasannya cuma satu, dan cukup: satu rute yang lupa menyaring `user_id`
 * membocorkan riwayat lamaran orang, dan itu tidak bisa diperbaiki setelah
 * terjadi.
 *
 * Sesi ditandatangani di sini dengan SESSION_SECRET yang sama seperti cookie
 * sungguhan — persis seperti yang dilakukan cookie-parser. Tidak ada jalur
 * bypass autentikasi di kode aplikasi, karena jalur seperti itu bisa ikut
 * ter-deploy.
 *
 * Setiap kasus penolakan selalu berpasangan dengan pembuktian bahwa rutenya
 * memang hidup: kalau `404` untuk B tidak diimbangi `200` untuk A, tes ini
 * akan tetap hijau di atas endpoint yang rusak total.
 *
 * WAJIB DIPERBARUI SETIAP ADA ENDPOINT BARU: tambahkan barisnya ke ENDPOINTS
 * (sapuan tanpa sesi) dan tulis kasus lintas-penggunanya sendiri di bawah.
 * Endpoint yang tidak muncul di sini dianggap belum selesai.
 *
 * Jalankan: npm test  (butuh MySQL lokal dan .env terisi)
 */

const PORT = 3999;
const base = `http://127.0.0.1:${PORT}/api`;

/**
 * Seluruh endpoint yang butuh sesi. Yang sengaja publik dan karena itu tidak
 * ada di daftar ini: `GET /health`, `POST /auth/google`, `POST /auth/logout`,
 * dan `GET /auth/me` — tiga terakhir memang tugasnya membuat atau membaca sesi.
 */
const ENDPOINTS: [method: string, path: string][] = [
  ['GET', '/state'],
  ['DELETE', '/state'],
  ['POST', '/applications'],
  ['PUT', `/applications/${randomUUID()}`],
  ['PATCH', `/applications/${randomUUID()}/status`],
  ['DELETE', `/applications/${randomUUID()}`],
  ['POST', '/activities'],
  ['DELETE', `/activities/${randomUUID()}`],
  ['PUT', `/reminders/${randomUUID()}`],
  ['DELETE', `/reminders/${randomUUID()}`],
  ['PUT', `/notes/${randomUUID()}`],
  ['DELETE', `/notes/${randomUUID()}`],
  ['PUT', `/bookmarks/${randomUUID()}`],
  ['DELETE', `/bookmarks/${randomUUID()}`],
  ['PUT', `/wishes/${randomUUID()}`],
  ['DELETE', `/wishes/${randomUUID()}`],
  ['POST', '/tags'],
  ['DELETE', '/tags/apa-saja'],
  ['PUT', '/settings'],
];

/** Tabel yang punya kolom user_id — dipakai untuk membuktikan data uji bersih. */
const OWNED_TABLES = [
  'settings',
  'applications',
  'activities',
  'reminders',
  'interview_notes',
  'documents',
  'bookmarks',
  'wishes',
  'tags',
];

/**
 * Bentuk cookie sesi persis seperti express + cookie-parser membuatnya:
 * `s:` + nilai + `.` + HMAC-SHA256 base64 tanpa padding.
 */
function cookieFor(userId: string) {
  const sig = createHmac('sha256', env.sessionSecret)
    .update(userId)
    .digest('base64')
    .replace(/=+$/, '');
  return `sid=${encodeURIComponent(`s:${userId}.${sig}`)}`;
}

async function call<T = unknown>(
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

const now = () => new Date().toISOString();

const userA = { id: randomUUID(), email: 'a@isolation.test', cookie: '' };
const userB = { id: randomUUID(), email: 'b@isolation.test', cookie: '' };

/** Milik A. Semuanya dibuat lewat API, jadi jalur suksesnya ikut terbukti. */
const owned = {
  app: randomUUID(),
  activity: randomUUID(),
  reminder: randomUUID(),
  note: randomUUID(),
  bookmark: randomUUID(),
  wish: randomUUID(),
  doc: randomUUID(),
  tag: 'rahasia-a',
};

const appPayload = (id: string) => ({
  id,
  company: 'PT Rahasia A',
  position: 'Backend Engineer',
  workType: 'Remote',
  jobType: 'Full Time',
  salaryMin: null,
  salaryMax: null,
  status: 'applied',
});

const activityPayload = (id: string) => ({
  id,
  type: 'note',
  title: 'Catatan uji isolasi',
});

const settingsPayload = (weeklyTarget: number, theme: 'light' | 'dark', notifyEmail: string) => ({
  theme,
  language: 'id',
  timezone: 'Asia/Jakarta',
  weeklyTarget,
  monthlyTarget: 20,
  emailNotif: true,
  dailyReminder: true,
  notifyEmail,
  cvValidDays: 90,
});

const stateOf = (cookie: string) => call<DB>(cookie, 'GET', '/state');

let server: ReturnType<typeof spawn>;

async function startServer() {
  server = spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url),
    // PORT sendiri supaya tes tidak bentrok dengan `npm run dev` yang sedang jalan.
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // server belum mengangkat port — wajar pada detik pertama
    }
    await sleep(100);
  }
  throw new Error(`Server uji tidak siap di port ${PORT} dalam 10 detik.`);
}

async function createUser(user: { id: string; email: string; cookie: string }) {
  const at = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: user.id,
      googleSub: `isolation-test-${user.id}`,
      email: user.email,
      name: 'Pengguna Uji',
      avatarUrl: null,
      createdAt: at,
      lastSeenAt: at,
    });
    await tx.insert(settings).values({ userId: user.id, notifyEmail: user.email });
  });
  user.cookie = cookieFor(user.id);
}

describe('isolasi data antar pengguna', () => {
  before(async () => {
    await startServer();
    await createUser(userA);
    await createUser(userB);

    // Dokumen belum punya endpoint (M2), jadi barisnya ditulis langsung —
    // jalur penautannya sudah ada di POST/PUT /applications dan harus diuji.
    await db.insert(documents).values({
      id: owned.doc,
      userId: userA.id,
      objectKey: `docs/${userA.id}/${owned.doc}`,
      name: 'cv.pdf',
      label: 'CV',
      group: 'CV',
      category: 'cv',
      size: 1024,
      mime: 'application/pdf',
      note: '',
      state: 'ready',
      uploadedAt: new Date(),
    });

    const seeded = [
      await call(userA.cookie, 'POST', '/applications', {
        ...appPayload(owned.app),
        activity: activityPayload(randomUUID()),
      }),
      await call(userA.cookie, 'POST', '/activities', {
        ...activityPayload(owned.activity),
        appId: owned.app,
        date: now(),
      }),
      await call(userA.cookie, 'PUT', `/reminders/${owned.reminder}`, {
        id: owned.reminder,
        appId: owned.app,
        type: 'interview',
        title: 'Interview A',
        datetime: now(),
      }),
      await call(userA.cookie, 'PUT', `/notes/${owned.note}`, {
        id: owned.note,
        appId: owned.app,
        stage: 'HR',
      }),
      await call(userA.cookie, 'PUT', `/bookmarks/${owned.bookmark}`, {
        id: owned.bookmark,
        company: 'PT Rahasia A',
        position: 'Backend Engineer',
        savedAt: now(),
      }),
      await call(userA.cookie, 'PUT', `/wishes/${owned.wish}`, {
        id: owned.wish,
        company: 'PT Rahasia A',
        prep: 'not_started',
      }),
      await call(userA.cookie, 'POST', '/tags', { name: owned.tag, color: '#112233' }),
    ];
    for (const res of seeded) {
      assert.equal(res.status, 201, `penyiapan data A gagal: ${JSON.stringify(res.body)}`);
    }
  });

  after(async () => {
    // Menghapus pengguna membuang seluruh datanya lewat ON DELETE CASCADE.
    await db.delete(users).where(inArray(users.id, [userA.id, userB.id]));

    for (const table of OWNED_TABLES) {
      const [rows] = await db.$client.query(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE user_id IN (?, ?)`,
        [userA.id, userB.id],
      );
      const n = (rows as { n: number }[])[0]?.n;
      assert.equal(Number(n), 0, `data uji masih tertinggal di tabel ${table}`);
    }
    const [rows] = await db.$client.query('SELECT COUNT(*) AS n FROM users WHERE id IN (?, ?)', [
      userA.id,
      userB.id,
    ]);
    assert.equal(Number((rows as { n: number }[])[0]?.n), 0, 'pengguna uji masih ada di database');

    server.kill();
    await db.$client.end();
  });

  it('setiap endpoint menolak permintaan tanpa sesi', async () => {
    for (const [method, path] of ENDPOINTS) {
      const res = await call(null, method, path);
      assert.equal(res.status, 401, `${method} ${path} tidak menolak permintaan tanpa sesi`);
    }
  });

  it('cookie dengan tanda tangan palsu ditolak', async () => {
    // userId benar, tanda tangannya karangan: kalau ini lolos, seluruh isolasi
    // tinggal menebak satu UUID.
    const forged = `sid=${encodeURIComponent(`s:${userA.id}.tandatangankarangan`)}`;
    assert.equal((await call(forged, 'GET', '/state')).status, 401);
    assert.equal((await call(`sid=${userA.id}`, 'GET', '/state')).status, 401);
  });

  it('GET /auth/me hanya mengembalikan pemilik cookie', async () => {
    type Me = { user: { email: string } | null };
    assert.equal((await call<Me>(userA.cookie, 'GET', '/auth/me')).body.user?.email, userA.email);
    assert.equal((await call<Me>(userB.cookie, 'GET', '/auth/me')).body.user?.email, userB.email);
    assert.equal((await call<Me>(null, 'GET', '/auth/me')).body.user, null);
  });

  it('GET /state milik B tidak memuat apa pun milik A', async () => {
    const a = await stateOf(userA.cookie);
    assert.equal(a.status, 200);
    assert.equal(a.body.apps.length, 1, 'data A tidak tersimpan — sisa tes jadi tidak bermakna');

    const b = await stateOf(userB.cookie);
    assert.equal(b.status, 200);
    assert.deepEqual(
      {
        apps: b.body.apps.length,
        activities: b.body.activities.length,
        reminders: b.body.reminders.length,
        docs: b.body.docs.length,
        notes: b.body.notes.length,
        bookmarks: b.body.bookmarks.length,
        wishes: b.body.wishes.length,
        tags: b.body.tags.length,
      },
      { apps: 0, activities: 0, reminders: 0, docs: 0, notes: 0, bookmarks: 0, wishes: 0, tags: 0 },
    );
    assert.equal(b.body.user?.email, userB.email);
  });

  it('B tidak bisa mengubah, memindahkan status, atau menghapus lamaran A', async () => {
    const at = now();
    assert.equal(
      (
        await call(userB.cookie, 'PUT', `/applications/${owned.app}`, {
          ...appPayload(owned.app),
          company: 'Ditimpa B',
          updatedAt: at,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(userB.cookie, 'PATCH', `/applications/${owned.app}/status`, {
          status: 'rejected',
          updatedAt: at,
          activity: activityPayload(randomUUID()),
        })
      ).status,
      404,
    );
    assert.equal((await call(userB.cookie, 'DELETE', `/applications/${owned.app}`)).status, 404);

    const { body } = await stateOf(userA.cookie);
    assert.equal(body.apps[0]?.company, 'PT Rahasia A', 'lamaran A tersentuh oleh B');
    assert.equal(body.apps[0]?.status, 'applied');
  });

  it('B tidak bisa menempelkan aktivitas ke lamaran A, atau menghapus aktivitas A', async () => {
    assert.equal(
      (
        await call(userB.cookie, 'POST', '/activities', {
          ...activityPayload(randomUUID()),
          appId: owned.app,
          date: now(),
        })
      ).status,
      404,
    );
    assert.equal((await call(userB.cookie, 'DELETE', `/activities/${owned.activity}`)).status, 404);
  });

  it('B tidak bisa menimpa atau menghapus reminder A', async () => {
    // Dua jalan masuk: lewat id reminder milik A, dan lewat reminder baru
    // milik B sendiri yang ditempelkan ke lamaran A.
    assert.equal(
      (
        await call(userB.cookie, 'PUT', `/reminders/${owned.reminder}`, {
          id: owned.reminder,
          appId: null,
          type: 'deadline',
          title: 'Ditimpa B',
          datetime: now(),
        })
      ).status,
      404,
    );
    const fresh = randomUUID();
    assert.equal(
      (
        await call(userB.cookie, 'PUT', `/reminders/${fresh}`, {
          id: fresh,
          appId: owned.app,
          type: 'deadline',
          title: 'Nempel ke lamaran A',
          datetime: now(),
        })
      ).status,
      404,
    );
    assert.equal((await call(userB.cookie, 'DELETE', `/reminders/${owned.reminder}`)).status, 404);
  });

  it('B tidak bisa menimpa atau menghapus catatan interview A', async () => {
    assert.equal(
      (
        await call(userB.cookie, 'PUT', `/notes/${owned.note}`, {
          id: owned.note,
          appId: owned.app,
          stage: 'Ditimpa B',
        })
      ).status,
      404,
    );
    assert.equal((await call(userB.cookie, 'DELETE', `/notes/${owned.note}`)).status, 404);
  });

  it('B tidak bisa menimpa atau menghapus bookmark A', async () => {
    assert.equal(
      (
        await call(userB.cookie, 'PUT', `/bookmarks/${owned.bookmark}`, {
          id: owned.bookmark,
          company: 'Ditimpa B',
          position: 'Ditimpa B',
          savedAt: now(),
        })
      ).status,
      404,
    );
    assert.equal((await call(userB.cookie, 'DELETE', `/bookmarks/${owned.bookmark}`)).status, 404);
  });

  it('B tidak bisa menimpa atau menghapus wishlist A', async () => {
    assert.equal(
      (
        await call(userB.cookie, 'PUT', `/wishes/${owned.wish}`, {
          id: owned.wish,
          company: 'Ditimpa B',
          prep: 'ready',
        })
      ).status,
      404,
    );
    assert.equal((await call(userB.cookie, 'DELETE', `/wishes/${owned.wish}`)).status, 404);
  });

  it('B tidak bisa menghapus tag A, dan nama tag berdiri sendiri per pengguna', async () => {
    assert.equal((await call(userB.cookie, 'DELETE', `/tags/${owned.tag}`)).status, 404);
    // Nama yang sama boleh dipakai B: keunikan tag berlaku per pengguna, bukan
    // global. Kalau ini 409, berarti daftar tag orang lain ikut terbaca.
    assert.equal(
      (await call(userB.cookie, 'POST', '/tags', { name: owned.tag, color: '#445566' })).status,
      201,
    );
  });

  it('B tidak bisa menautkan dokumen milik A ke lamarannya sendiri', async () => {
    // Tautan yang lolos di sini berarti B bisa mengunduh berkas A lewat
    // endpoint unduhan nanti (M2).
    const res = await call(userB.cookie, 'POST', '/applications', {
      ...appPayload(randomUUID()),
      documentIds: [owned.doc],
    });
    assert.equal(res.status, 403);
    assert.equal((await stateOf(userB.cookie)).body.apps.length, 0, 'lamaran B tetap tercipta');
  });

  it('menyimpan pengaturan B tidak menyentuh pengaturan A', async () => {
    assert.equal(
      (await call(userB.cookie, 'PUT', '/settings', settingsPayload(99, 'dark', userB.email)))
        .status,
      200,
    );
    const a = await stateOf(userA.cookie);
    assert.equal(a.body.settings.weeklyTarget, 5);
    assert.equal(a.body.settings.theme, 'light');
    assert.equal(a.body.settings.notifyEmail, userA.email);
  });

  it('reset data B tidak menghapus data A', async () => {
    assert.equal((await call(userB.cookie, 'DELETE', '/state')).status, 200);

    const { body } = await stateOf(userA.cookie);
    assert.deepEqual(
      {
        apps: body.apps.length,
        reminders: body.reminders.length,
        notes: body.notes.length,
        bookmarks: body.bookmarks.length,
        wishes: body.wishes.length,
        tags: body.tags.length,
      },
      { apps: 1, reminders: 1, notes: 1, bookmarks: 1, wishes: 1, tags: 1 },
    );
    assert.ok(body.activities.length >= 2, 'aktivitas A ikut terhapus oleh reset B');
  });

  it('A masih bisa mengubah dan menghapus datanya sendiri', async () => {
    // Tanpa bagian ini, seluruh 404 di atas juga akan muncul dari endpoint
    // yang rusak total — dan tesnya tetap hijau.
    const before = await stateOf(userA.cookie);
    const app = before.body.apps[0];
    assert.ok(app);

    assert.equal(
      (
        await call(userA.cookie, 'PUT', `/applications/${owned.app}`, {
          ...appPayload(owned.app),
          company: 'PT Rahasia A (diubah)',
          updatedAt: app.updatedAt,
        })
      ).status,
      200,
    );

    const afterEdit = await stateOf(userA.cookie);
    assert.equal(afterEdit.body.apps[0]?.company, 'PT Rahasia A (diubah)');

    assert.equal(
      (
        await call(userA.cookie, 'PATCH', `/applications/${owned.app}/status`, {
          status: 'rejected',
          updatedAt: afterEdit.body.apps[0]?.updatedAt,
          activity: activityPayload(randomUUID()),
        })
      ).status,
      200,
    );

    for (const [method, path] of [
      ['DELETE', `/activities/${owned.activity}`],
      ['DELETE', `/reminders/${owned.reminder}`],
      ['DELETE', `/notes/${owned.note}`],
      ['DELETE', `/bookmarks/${owned.bookmark}`],
      ['DELETE', `/wishes/${owned.wish}`],
      ['DELETE', `/tags/${owned.tag}`],
      ['DELETE', `/applications/${owned.app}`],
    ] as [string, string][]) {
      assert.equal((await call(userA.cookie, method, path)).status, 200, `${method} ${path}`);
    }
  });
});
