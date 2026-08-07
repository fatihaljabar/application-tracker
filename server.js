// Titik masuk untuk host yang mewajibkan berkas entry berekstensi .js —
// panel Hostinger menolak server/index.ts secara langsung.
//
// Tidak ada langkah kompilasi di sini, dan itu disengaja: Node 24 menghapus
// tipe TypeScript secara bawaan, yang juga alasan `tsx` dicopot (TECHNICAL § 2).
// Konsekuensinya host WAJIB memakai Node 24 — di 22.x berkas ini gagal, karena
// di sana penghapusan tipe masih butuh flag dan host menjalankan `node <entry>`
// tanpa flag apa pun.
import './server/index.ts';
