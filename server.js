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

// Impor dinamis, bukan `import` biasa: pernyataan import statis diangkat ke atas
// berkas dan akan dijalankan SEBELUM baris di atas, sehingga NODE_ENV belum
// sempat terpasang saat server membaca kebijakan keamanannya.
await import('./server/index.ts');
