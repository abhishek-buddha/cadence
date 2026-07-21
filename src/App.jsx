import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProviderFilterProvider } from './context/ProviderFilterContext';
import { AuthProvider } from './context/AuthContext';
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
import EligibilityPage from './pages/EligibilityPage';
import EvCaseDetailPage from './pages/EvCaseDetailPage';
import SessionsPage from './pages/SessionsPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import UsersPage from './pages/UsersPage';
import ApiKeysPage from './pages/ApiKeysPage';
import WebhooksPage from './pages/WebhooksPage';
import TransferDestinationsPage from './pages/TransferDestinationsPage';

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
    <AuthProvider>
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

              <Route path="eligibility" element={<EligibilityPage />} />
              <Route path="eligibility/:id" element={<EvCaseDetailPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="api-keys" element={<ApiKeysPage />} />
              <Route path="webhooks" element={<WebhooksPage />} />
              <Route path="transfers" element={<TransferDestinationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProviderFilterProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
