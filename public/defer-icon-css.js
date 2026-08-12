// Mengaktifkan CSS ikon Flaticon yang dimuat dengan media="print" (index.html),
// begitu HTML selesai di-parse — sengaja bukan atribut onload inline, karena CSP
// di index.html tidak memuat 'unsafe-inline' di script-src. Berkas eksternal
// same-origin ini sah di bawah script-src 'self' tanpa mengubah CSP sedikit pun.
document.querySelectorAll('link[data-defer-swap]').forEach((link) => {
  link.media = 'all';
});
