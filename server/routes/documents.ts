import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import {
  DOC_MAX_COUNT,
  DOC_MAX_FILE_BYTES,
  DOC_MAX_TOTAL_BYTES,
  type DocFile,
} from '../../shared/types.ts';
import { db } from '../db/client.ts';
import { documents, reminders, settings } from '../db/schema.ts';
import { ApiError } from '../lib/middleware.ts';
import { deleteObject, headObjectSize, objectKeyFor, presignGet, presignPut } from '../lib/r2.ts';
import { requireAuth } from '../lib/session.ts';
import { documentInput, parse, uuid } from '../lib/validate.ts';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

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

  if (input.size > DOC_MAX_FILE_BYTES) {
    throw new ApiError(413, 'file_too_large', 'Ukuran berkas maksimum 2 MB.', 'size');
  }

  const usage = await usageOf(userId);
  if (usage.count >= DOC_MAX_COUNT) {
    throw new ApiError(413, 'quota_exceeded', `Jumlah dokumen maksimum ${DOC_MAX_COUNT}.`);
  }
  if (usage.bytes + input.size > DOC_MAX_TOTAL_BYTES) {
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
  if (actual > DOC_MAX_FILE_BYTES || usage.bytes + actual > DOC_MAX_TOTAL_BYTES) {
    await deleteObject(row.objectKey);
    await db.delete(documents).where(eq(documents.id, id));
    throw new ApiError(413, 'quota_exceeded', 'Berkas melebihi batas ukuran atau kuota Anda.');
  }

  await db.update(documents).set({ state: 'ready', size: actual }).where(eq(documents.id, id));
  await buatPengingatMasaBerlaku(userId, { ...row, state: 'ready' });
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
  // Pengingat masa berlakunya ikut. Membiarkannya berarti mengingatkan
  // pengguna memperbarui CV yang sudah tidak ada.
  await db
    .delete(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.autoKey, autoKeyCv(id))));
  await db.delete(documents).where(eq(documents.id, id));
  res.json({ id, deleted: true });
});

/** Penanda unik supaya satu dokumen tidak pernah punya dua pengingat. */
const autoKeyCv = (documentId: string) => `cv:${documentId}`;

/**
 * Mengingatkan memperbarui CV setelah sekian hari (PRD § 6.6, tipe kelima).
 *
 * Masalah yang diselesaikan nyata dan disebut PRD § 2: orang mengirim CV yang
 * sama berbulan-bulan tanpa sadar isinya sudah basi, lalu mengirimnya ke
 * perusahaan impian.
 *
 * Hanya untuk kategori `cv`. Cover letter dan sertifikat tidak basi dengan cara
 * yang sama — sertifikat justru tidak pernah perlu diperbarui.
 *
 * Jumlah harinya diambil dari pengaturan pengguna, bawaannya 90. Gagal membuat
 * pengingat TIDAK boleh menjatuhkan unggahannya: berkasnya sudah sampai, dan
 * pengingat yang hilang jauh lebih ringan daripada unggahan yang ditolak
 * padahal berhasil.
 */
async function buatPengingatMasaBerlaku(
  userId: string,
  row: typeof documents.$inferSelect,
): Promise<void> {
  if (row.category !== 'cv') return;
  try {
    const [pref] = await db
      .select({ hari: settings.cvValidDays })
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    const hari = pref?.hari ?? 90;
    await db
      .insert(reminders)
      .values({
        id: randomUUID(),
        userId,
        applicationId: null,
        type: 'cv_validity',
        title: `Perbarui ${row.label}`,
        datetime: new Date(Date.now() + hari * 24 * 3600 * 1000),
        notes: `Sudah ${hari} hari sejak berkas ini diunggah. Cek apakah isinya masih terbaru.`,
        done: false,
        autoKey: autoKeyCv(row.id),
      })
      // Konfirmasi ulang tidak boleh menghasilkan pengingat kedua.
      .onDuplicateKeyUpdate({ set: { autoKey: autoKeyCv(row.id) } });
  } catch (err) {
    console.error('[dokumen] gagal membuat pengingat masa berlaku CV', row.id, err);
  }
}
