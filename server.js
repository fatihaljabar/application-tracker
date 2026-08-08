// Titik masuk untuk host yang mewajibkan berkas entry berekstensi .js —
// panel Hostinger menolak server/index.ts secara langsung.
//
// Tidak ada langkah kompilasi di sini, dan itu disengaja: Node 24 menghapus
// tipe TypeScript secara bawaan, yang juga alasan `tsx` dicopot (TECHNICAL § 2).
// Konsekuensinya host WAJIB memakai Node 24 — di 22.x berkas ini gagal, karena
// di sana penghapusan tipe masih butuh flag dan host menjalankan `node <entry>`
// tanpa flag apa pun.

// NODE_ENV disetel di sini, BUKAN sebagai variabel di panel hosting. Alasannya
// bukan selera: npm memperlakukan NODE_ENV=production sebagai isyarat untuk
// MELEWATI devDependencies, dan `typescript` serta `vite` ada di sana — dipakai
// oleh `postinstall` untuk membangun dist/. Menyetelnya di panel membuat build
// mati dengan "tsc: command not found", persis sekali di deploy pertama.
// `??=` supaya masih bisa ditimpa, misalnya NODE_ENV=development saat menguji.
process.env.NODE_ENV ??= 'production';

// Impor dinamis TANPA `await`, dan dua-duanya disengaja.
//
// Dinamis: pernyataan `import` statis diangkat ke atas berkas dan akan berjalan
// SEBELUM baris NODE_ENV di atas, sehingga server membaca kebijakan keamanannya
// saat variabel itu belum terpasang.
//
// Tanpa `await`: LiteSpeed di Hostinger memuat berkas entry ini dengan
// `require()`, dan `require()` menolak graf ESM yang memakai await di tingkat
// modul — `ERR_REQUIRE_ASYNC_MODULE`. server/index.ts memang memakainya (ia
// menunggu database sebelum membuka port), jadi graf itu harus tetap berada di
// balik import() yang tidak ditunggu, bukan di jalur require().
//
// Konsekuensinya kegagalan saat start jadi promise yang ditolak, bukan lemparan
// biasa. Ditangkap di sini supaya tetap terlihat dan prosesnya benar-benar mati,
// bukan menggantung dalam keadaan setengah hidup.
import('./server/index.ts').catch((e) => {
  console.error('[server] gagal memulai:', e);
  process.exit(1);
});
