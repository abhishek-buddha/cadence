import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProviderFilterProvider } from './context/ProviderFilterContext';
import { AuthProvider } from './context/AuthContext';
import { createSession, logout as apiLogout } from './api/auth';
import Layout from './components/Layout';
import OperatorLayout from './components/OperatorLayout';
import AccessCodePage from './pages/AccessCodePage';
import LoginSelectPage from './pages/LoginSelectPage';
import NotYetMigrated from './pages/NotYetMigrated';

// Converted to the new REST/WebSocket backend (see Ace-Cadence-Ui/README.md).
import PatientsPage from './pages/PatientsPage';
import InsuranceDirectory from './pages/InsuranceDirectory';
import ProvidersPage from './pages/ProvidersPage';
import MasterDataPage from './pages/MasterDataPage';

// Static — no backend wiring in the pre-rewrite app either, work as-is.
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

  async function handleLogin(user) {
    // Mint a real session via login-svc — falls back to local-only state if
    // it's unreachable (e.g. backend not deployed yet in dev) so the demo
    // flow still works, same tolerance as AccessCodePage's PIN check.
    try {
      const session = await createSession(user);
      sessionStorage.setItem('cadence_session_token', session.session_token);
    } catch {
      sessionStorage.removeItem('cadence_session_token');
    }
    sessionStorage.setItem('cadence_current_user', JSON.stringify(user));
    setCurrentUser(user);
  }

  function handleLogout() {
    const token = sessionStorage.getItem('cadence_session_token');
    if (token) apiLogout(token).catch(() => {});
    sessionStorage.removeItem('cadence_auth');
    sessionStorage.removeItem('cadence_current_user');
    sessionStorage.removeItem('cadence_session_token');
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
                  <Route index element={<NotYetMigrated label="My Queue" />} />
                  <Route path="dashboard" element={<NotYetMigrated label="My Dashboard" />} />
                  <Route path="appointments" element={<AppointmentsPage />} />
                  <Route path="appointments/scheduling/:id" element={<AppointmentSchedulingDetailPage />} />
                  <Route path="appointments/reminder/:id" element={<AppointmentReminderDetailPage />} />
                  <Route path="benefit-verification" element={<BenefitVerificationPage />} />
                  <Route path="benefit-verification/:id" element={<BenefitVerificationDetailPage />} />
                  <Route path="eligibility-verification" element={<EligibilityVerificationPage />} />
                  <Route path="eligibility-verification/:id" element={<EligibilityVerificationDetailPage />} />
                  <Route path="prior-authorization" element={<PriorAuthorizationPage />} />
                  <Route path="prior-authorization/:id" element={<PriorAuthorizationDetailPage />} />
                  <Route path="claims" element={<NotYetMigrated label="Claim Management" />} />
                  <Route path="claims/:id" element={<NotYetMigrated label="Claim detail" />} />
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
                  <Route index element={<NotYetMigrated label="Dashboard" />} />
                  <Route path="claims" element={<NotYetMigrated label="Claim Management" />} />
                  <Route path="claims/:id" element={<NotYetMigrated label="Claim detail" />} />

                  <Route path="patients" element={<PatientsPage />} />
                  <Route path="insurance" element={<InsuranceDirectory />} />
                  <Route path="providers" element={<ProvidersPage />} />
                  <Route path="master-data" element={<MasterDataPage />} />
                  <Route path="call-audit" element={<Navigate to="/call-audit/history" replace />} />
                  <Route path="call-audit/history" element={<NotYetMigrated label="Call History" />} />
                  <Route path="call-audit/live" element={<NotYetMigrated label="Live Sessions" />} />
                  <Route path="calls" element={<NotYetMigrated label="Call History" />} />
                  <Route path="live" element={<NotYetMigrated label="Live Calls" />} />
                  <Route path="settings" element={<NotYetMigrated label="Settings" />} />

                  <Route path="eligibility" element={<NotYetMigrated label="Dental Eligibility Verification" />} />
                  <Route path="eligibility/:id" element={<NotYetMigrated label="Eligibility case detail" />} />
                  <Route path="sessions" element={<NotYetMigrated label="Sessions" />} />
                  <Route path="reports" element={<NotYetMigrated label="Reports" />} />
                  <Route path="audit" element={<NotYetMigrated label="Audit Log" />} />
                  <Route path="users" element={<NotYetMigrated label="User Management" />} />
                  <Route path="transfers" element={<NotYetMigrated label="Transfer Destinations" />} />

                  {/* Static placeholder modules — list + case view, no backend wiring by design */}
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
