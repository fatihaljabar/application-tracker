import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { StoreProvider, useStore } from './lib/store';
import Layout from './components/Layout';
import { PageSkeleton } from './components/ui';
import Toaster from './components/Toaster';
import AlertDialog from './components/AlertDialog';
import Login from './pages/Login';

/**
 * Dua belas halaman di bawah `lazy()` — Login TIDAK, karena itu satu-satunya
 * yang wajib ada sebelum masuk, dan menunggu unduhan potongan JS-nya sendiri
 * akan menunda hal pertama yang dilihat siapa pun.
 *
 * Sebelumnya App.tsx mengimpor ke-13 halaman ini statis, jadi siapa pun yang
 * BELUM masuk tetap mengunduh seluruh kode 12 halaman lain yang tidak akan
 * dia lihat sampai dia masuk — persis temuan PageSpeed Insights "85,9 KB
 * JavaScript tidak terpakai" di halaman masuk.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Applications = lazy(() => import('./pages/Applications'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Timeline = lazy(() => import('./pages/Timeline'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Documents = lazy(() => import('./pages/Documents'));
const Interviews = lazy(() => import('./pages/Interviews'));
const Statistics = lazy(() => import('./pages/Statistics'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Bookmarks = lazy(() => import('./pages/Bookmarks'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Settings = lazy(() => import('./pages/Settings'));

function Shell() {
  const { db, loading } = useStore();
  // Selama data pertama diambil, tampilkan kerangka di dalam layout — bukan
  // layar kosong yang terlihat seperti aplikasi rusak.
  if (!db.user) return <Login />;
  // Pengguna sudah dikenali, datanya belum sampai: kerangka di dalam layout.
  if (loading) {
    return (
      <Layout>
        <PageSkeleton />
      </Layout>
    );
  }
  return (
    <Layout>
      {/* Fallback-nya PageSkeleton yang SAMA dengan kondisi "data belum sampai"
          persis di atas — bukan tampilan baru. Satu potongan halaman yang
          belum pernah dibuka sebelumnya butuh sepersekian detik diunduh;
          navigasi berikutnya ke halaman yang sama sudah dari cache peramban,
          jadi Suspense ini tidak pernah terlihat lagi setelah kunjungan
          pertama ke tiap halaman. */}
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/interviews" element={<Interviews />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
      <Toaster />
      <AlertDialog />
    </StoreProvider>
  );
}
