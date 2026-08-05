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
import LiveCallsPage from './pages/LiveCallsPage';
import SettingsPage from './pages/SettingsPage';
import AccessCodePage from './pages/AccessCodePage';
import LoginSelectPage from './pages/LoginSelectPage';
import OperatorLayout from './components/OperatorLayout';
import OperatorQueuePage from './pages/OperatorQueuePage';
import OperatorDashboardPage from './pages/OperatorDashboardPage';
import EligibilityPage from './pages/EligibilityPage';
import EvCaseDetailPage from './pages/EvCaseDetailPage';
import SessionsPage from './pages/SessionsPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import UsersPage from './pages/UsersPage';
// import ApiKeysPage from './pages/ApiKeysPage';
// import WebhooksPage from './pages/WebhooksPage';
import TransferDestinationsPage from './pages/TransferDestinationsPage';
import MasterDataPage from './pages/MasterDataPage';
import CallAuditPage from './pages/CallAuditPage';
import AppointmentsPage from './pages/AppointmentsPage';
import AppointmentSchedulingDetailPage from './pages/AppointmentSchedulingDetailPage';
import AppointmentReminderDetailPage from './pages/AppointmentReminderDetailPage';
import BenefitVerificationPage from './pages/BenefitVerificationPage';
import BenefitVerificationDetailPage from './pages/BenefitVerificationDetailPage';
import EligibilityVerificationPage from './pages/EligibilityVerificationPage';
import EligibilityVerificationDetailPage from './pages/EligibilityVerificationDetailPage';
import PriorAuthorizationPage from './pages/PriorAuthorizationPage';
import PriorAuthorizationDetailPage from './pages/PriorAuthorizationDetailPage';
import PatientBalanceReminderPage from './pages/PatientBalanceReminderPage';
import PatientBalanceReminderDetailPage from './pages/PatientBalanceReminderDetailPage';
import InboundBillingPage from './pages/InboundBillingPage';
import InboundBillingDetailPage from './pages/InboundBillingDetailPage';

function loadStoredUser() {
  try {
    const raw = sessionStorage.getItem('cadence_current_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem('cadence_auth') === '1'
  );
  const [currentUser, setCurrentUser] = useState(loadStoredUser);

  function handleAccessGranted() {
    sessionStorage.setItem('cadence_auth', '1');
    setAuthenticated(true);
  }

  function handleLogin(user) {
    sessionStorage.setItem('cadence_current_user', JSON.stringify(user));
    setCurrentUser(user);
  }

  function handleLogout() {
    sessionStorage.removeItem('cadence_auth');
    sessionStorage.removeItem('cadence_current_user');
    setCurrentUser(null);
    setAuthenticated(false);
  }

  return (
    <AuthProvider value={currentUser ?? undefined}>
      <BrowserRouter>
        <ProviderFilterProvider>
          <Routes>
            {!authenticated ? (
              <Route path="*" element={<AccessCodePage onSuccess={handleAccessGranted} />} />
            ) : !currentUser ? (
              <Route path="*" element={<LoginSelectPage onSuccess={handleLogin} />} />
            ) : currentUser.role === 'operator' ? (
              <>
                <Route path="/" element={<OperatorLayout onLogout={handleLogout} />}>
                  <Route index element={<OperatorQueuePage />} />
                  <Route path="dashboard" element={<OperatorDashboardPage />} />
                  <Route path="appointments" element={<AppointmentsPage />} />
                  <Route path="appointments/scheduling/:id" element={<AppointmentSchedulingDetailPage />} />
                  <Route path="appointments/reminder/:id" element={<AppointmentReminderDetailPage />} />
                  <Route path="benefit-verification" element={<BenefitVerificationPage />} />
                  <Route path="benefit-verification/:id" element={<BenefitVerificationDetailPage />} />
                  <Route path="eligibility-verification" element={<EligibilityVerificationPage />} />
                  <Route path="eligibility-verification/:id" element={<EligibilityVerificationDetailPage />} />
                  <Route path="prior-authorization" element={<PriorAuthorizationPage />} />
                  <Route path="prior-authorization/:id" element={<PriorAuthorizationDetailPage />} />
                  <Route path="claims" element={<ClaimsPage />} />
                  <Route path="claims/:id" element={<ClaimDetailPage />} />
                  <Route path="patient-balance-reminder" element={<PatientBalanceReminderPage />} />
                  <Route path="patient-balance-reminder/:id" element={<PatientBalanceReminderDetailPage />} />
                  <Route path="inbound-billing" element={<InboundBillingPage />} />
                  <Route path="inbound-billing/:id" element={<InboundBillingDetailPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route path="/" element={<Layout onLogout={handleLogout} />}>
                  <Route index element={<Dashboard />} />
                  <Route path="claims" element={<ClaimsPage />} />
                  <Route path="claims/:id" element={<ClaimDetailPage />} />

                  <Route path="patients" element={<PatientsPage />} />
                  <Route path="insurance" element={<InsuranceDirectory />} />
                  <Route path="providers" element={<ProvidersPage />} />
                  <Route path="master-data" element={<MasterDataPage />} />
                  <Route path="call-audit" element={<Navigate to="/call-audit/history" replace />} />
                  <Route path="call-audit/history" element={<CallAuditPage />} />
                  <Route path="call-audit/live" element={<CallAuditPage />} />
                  <Route path="calls" element={<CallHistory />} />
                  <Route path="live" element={<LiveCallsPage />} />
                  <Route path="settings" element={<SettingsPage />} />

                  <Route path="eligibility" element={<EligibilityPage />} />
                  <Route path="eligibility/:id" element={<EvCaseDetailPage />} />
                  <Route path="sessions" element={<SessionsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="users" element={<UsersPage />} />
                  {/* Admin integration pages are intentionally hidden for now.
                  <Route path="api-keys" element={<ApiKeysPage />} />
                  <Route path="webhooks" element={<WebhooksPage />} />
                  */}
                  <Route path="transfers" element={<TransferDestinationsPage />} />

                  {/* Static placeholder modules — list + case view, not yet wired to Convex */}
                  <Route path="appointments" element={<AppointmentsPage />} />
                  <Route path="appointments/scheduling/:id" element={<AppointmentSchedulingDetailPage />} />
                  <Route path="appointments/reminder/:id" element={<AppointmentReminderDetailPage />} />
                  <Route path="benefit-verification" element={<BenefitVerificationPage />} />
                  <Route path="benefit-verification/:id" element={<BenefitVerificationDetailPage />} />
                  <Route path="eligibility-verification" element={<EligibilityVerificationPage />} />
                  <Route path="eligibility-verification/:id" element={<EligibilityVerificationDetailPage />} />
                  <Route path="prior-authorization" element={<PriorAuthorizationPage />} />
                  <Route path="prior-authorization/:id" element={<PriorAuthorizationDetailPage />} />
                  <Route path="patient-balance-reminder" element={<PatientBalanceReminderPage />} />
                  <Route path="patient-balance-reminder/:id" element={<PatientBalanceReminderDetailPage />} />
                  <Route path="inbound-billing" element={<InboundBillingPage />} />
                  <Route path="inbound-billing/:id" element={<InboundBillingDetailPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
        </ProviderFilterProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
