import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store';
import Layout from './components/Layout';
import Toaster from './components/Toaster';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import Pipeline from './pages/Pipeline';
import Timeline from './pages/Timeline';
import Reminders from './pages/Reminders';
import Documents from './pages/Documents';
import Interviews from './pages/Interviews';
import Statistics from './pages/Statistics';
import Calendar from './pages/Calendar';
import Bookmarks from './pages/Bookmarks';
import Wishlist from './pages/Wishlist';
import Settings from './pages/Settings';

function Shell() {
  const { db } = useStore();
  if (!db.user) return <Login />;
  return (
    <Layout>
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
    </Layout>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
      <Toaster />
    </StoreProvider>
  );
}
