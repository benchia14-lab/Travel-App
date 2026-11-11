import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { TripsPage } from './pages/TripsPage';
import { TripPage } from './pages/TripPage';
import { PrintPage } from './pages/PrintPage';
import { SharePage } from './pages/SharePage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TripsPage />} />
            <Route path="trip/:id" element={<TripPage />} />
            <Route path="trip/:id/print" element={<PrintPage />} />
            <Route path="trip/:id/share" element={<SharePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<TripsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
