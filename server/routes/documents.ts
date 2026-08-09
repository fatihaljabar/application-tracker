import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import type { DocFile } from '../../shared/types.ts';
import { db } from '../db/client.ts';
import { documents } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { deleteObject, headObjectSize, objectKeyFor, presignGet, presignPut } from '../lib/r2.ts';
import { requireAuth } from '../lib/session.ts';
import { documentInput, parse, uuid } from '../lib/validate.ts';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

/**
 * Batas dari PRD § 6.7. Ada di server karena di sinilah keputusannya diambil —
 * pemeriksaan serupa di halaman Dokumen itu kenyamanan, bukan keamanan.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTS = 50;

/** Bentuk yang sudah dipakai store.tsx, sama seperti di GET /state. */
const toDocFile = (row: typeof documents.$inferSelect): DocFile => ({
  id: row.id,
  name: row.name,
  label: row.label,
  group: row.group,
  category: row.category,
  language: row.language,
  version: row.version,
  size: row.size,
  mime: row.mime,
  // Isi berkas tidak pernah ikut di payload. Unduhan lewat endpointnya sendiri.
  dataUrl: null,
  uploadedAt: new Date(row.uploadedAt).toISOString(),
  note: row.note,
});

/**
 * Kuota dihitung dari baris `ready` saja: baris `pending` belum tentu jadi
 * berkas, dan menghitungnya berarti unggahan yang batal ikut memakan jatah
 * pengguna sampai pembersih harian berjalan.
 *
 * Jumlah dokumen sebaliknya menghitung keduanya — itu rem terhadap membanjiri
 * tabel dengan baris pending yang tidak pernah dikonfirmasi.
 */
async function usageOf(userId: string) {
  const [row] = await db
    .select({
      readyBytes: sql<number>`COALESCE(SUM(CASE WHEN ${documents.state} = 'ready' THEN ${documents.size} ELSE 0 END), 0)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(documents)
    .where(eq(documents.userId, userId));
  return { bytes: Number(row?.readyBytes ?? 0), count: Number(row?.total ?? 0) };
}

/**
 * Langkah 1 dari tiga (TECHNICAL.md § 8): validasi kuota, buat baris `pending`,
 * balas dengan URL unggah bertanda tangan.
 *
 * Id dibuat SERVER di sini, menyimpang dari rute lain yang menerima id dari
 * klien. Alasannya id ini ikut menjadi kunci objek di R2: id pilihan klien bisa
 * ditabrakkan dengan milik pengguna lain, dan tabrakan di penyimpanan berkas
 * jauh lebih mahal daripada di sebuah baris tabel.
 */
documentsRouter.post('/upload-url', async (req, res) => {
  const userId = req.userId as string;
  const input = parse(documentInput, req.body);

  if (input.size > MAX_FILE_BYTES) {
    throw new ApiError(413, 'file_too_large', 'Ukuran berkas maksimum 2 MB.', 'size');
  }

  const usage = await usageOf(userId);
  if (usage.count >= MAX_DOCUMENTS) {
    throw new ApiError(413, 'quota_exceeded', `Jumlah dokumen maksimum ${MAX_DOCUMENTS}.`);
  }
  if (usage.bytes + input.size > MAX_TOTAL_BYTES) {
    throw new ApiError(
      413,
      'quota_exceeded',
      'Kuota penyimpanan 20 MB akan terlampaui. Hapus dokumen lain dulu.',
    );
  }

  const id = randomUUID();
  const objectKey = objectKeyFor(userId, id);
  // URL dibuat sebelum INSERT: kalau penandatanganan gagal, jangan tinggalkan
  // baris pending yang tidak akan pernah punya objek.
  const uploadUrl = await presignPut(objectKey);

  await db.insert(documents).values({
    id,
    userId,
    objectKey,
    name: input.name,
    label: input.label,
    group: input.group,
    category: input.category,
    language: input.language,
    version: input.version,
    size: input.size,
    mime: input.mime,
    note: input.note,
    state: 'pending',
    uploadedAt: new Date(),
  });

  res.status(201).json({ id, uploadUrl });
});

/**
 * Langkah 3: unggahan selesai, baris jadi `ready`.
 *
 * Ukuran diambil ulang dari R2, bukan dipercaya dari permintaan awal. Berkas
 * yang ternyata lebih besar dari yang dijanjikan dibuang beserta barisnya —
 * kalau tidak, kuota bisa dilewati hanya dengan berbohong di langkah 1.
 */
documentsRouter.post('/:id/confirm', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);

  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Dokumen tidak ditemukan.');
  // Konfirmasi ulang tidak boleh menghitung kuota dua kali.
  if (row.state === 'ready') {
    res.json(toDocFile(row));
    return;
  }

  const actual = await headObjectSize(row.objectKey);
  if (actual === null) {
    await db.delete(documents).where(eq(documents.id, id));
    throw new ApiError(400, 'upload_incomplete', 'Berkas belum sampai di penyimpanan.');
  }

  const usage = await usageOf(userId);
  if (actual > MAX_FILE_BYTES || usage.bytes + actual > MAX_TOTAL_BYTES) {
    await deleteObject(row.objectKey);
    await db.delete(documents).where(eq(documents.id, id));
    throw new ApiError(413, 'quota_exceeded', 'Berkas melebihi batas ukuran atau kuota Anda.');
  }

  await db.update(documents).set({ state: 'ready', size: actual }).where(eq(documents.id, id));
  res.json(toDocFile({ ...row, state: 'ready', size: actual }));
});

/**
 * Kepemilikan diperiksa di sini, lalu peramban dialihkan ke URL bertanda tangan
 * berumur 5 menit. Tidak ada tautan permanen yang bisa terbagi tanpa sengaja
 * (PRD § 10).
 */
documentsRouter.get('/:id/download', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);

  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId), eq(documents.state, 'ready')))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Dokumen tidak ditemukan.');

  res.redirect(302, await presignGet(row.objectKey, row.name));
});

/**
 * Objek dihapus lebih dulu, baru barisnya. Urutan ini disengaja: kalau R2 gagal,
 * barisnya masih ada dan pengguna bisa mencoba lagi. Urutan sebaliknya
 * meninggalkan berkas yatim yang memakan kuota tanpa ada yang bisa menghapusnya.
 *
 * Kaitan ke lamaran ikut terhapus lewat ON DELETE CASCADE pada
 * application_documents — memenuhi PRD § 7 "menghapus dokumen melepasnya dari
 * semua lamaran".
 */
documentsRouter.delete('/:id', async (req, res) => {
  const userId = req.userId as string;
  const id = parse(uuid, req.params.id);

  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Dokumen tidak ditemukan.');

  await deleteObject(row.objectKey);
  await db.delete(documents).where(eq(documents.id, id));
  res.json({ id, deleted: true });
});
