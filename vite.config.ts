import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    // Port dikunci: Google hanya menerima origin yang terdaftar di Cloud Console.
    // Kalau Vite diam-diam pindah ke port lain, login gagal dengan pesan yang
    // menyesatkan. Lebih baik gagal start dengan jelas.
    port: 5173,
    strictPort: true,
    // Panggilan /api saat ngoding diteruskan ke proses Node, bukan ke Vite.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
