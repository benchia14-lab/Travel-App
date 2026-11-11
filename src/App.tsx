import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { TripsPage } from './pages/TripsPage';
import { TripPage } from './pages/TripPage';
import { PrintPage } from './pages/PrintPage';
import { SharePage } from './pages/SharePage';
import { SettingsPage } from './pages/SettingsPage';
import { LocationPage } from './pages/LocationPage';
import { AdminPage } from './pages/AdminPage';
import { AuthGate } from './components/AuthGate';

export default function App() {
  return (
    <ToastProvider>
      <AuthGate>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TripsPage />} />
            <Route path="trip/:id" element={<TripPage />} />
            <Route path="trip/:id/place/:legId" element={<LocationPage />} />
            <Route path="trip/:id/print" element={<PrintPage />} />
            <Route path="trip/:id/share" element={<SharePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<TripsPage />} />
          </Route>
        </Routes>
      </HashRouter>
      </AuthGate>
    </ToastProvider>
  );
}
