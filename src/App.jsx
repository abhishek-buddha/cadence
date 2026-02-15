import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProviderFilterProvider } from './context/ProviderFilterContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ClaimsPage from './pages/ClaimsPage';
import ClaimDetailPage from './pages/ClaimDetailPage';
import PatientsPage from './pages/PatientsPage';
import InsuranceDirectory from './pages/InsuranceDirectory';
import ProvidersPage from './pages/ProvidersPage';
import CallHistory from './pages/CallHistory';
import SettingsPage from './pages/SettingsPage';
import AccessCodePage from './pages/AccessCodePage';

export default function App() {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem('cadence_auth') === '1'
  );

  function handleAccessGranted() {
    sessionStorage.setItem('cadence_auth', '1');
    setAuthenticated(true);
  }

  if (!authenticated) {
    return <AccessCodePage onSuccess={handleAccessGranted} />;
  }

  return (
    <BrowserRouter>
      <ProviderFilterProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="claims" element={<ClaimsPage />} />
            <Route path="claims/:id" element={<ClaimDetailPage />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="insurance" element={<InsuranceDirectory />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="calls" element={<CallHistory />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProviderFilterProvider>
    </BrowserRouter>
  );
}
