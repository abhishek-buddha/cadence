import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  PhoneCall,
  LayoutDashboard,
  CalendarClock,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Wallet,
  PhoneIncoming,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import HandoffNotifier from './HandoffNotifier';
import { getPageTitle } from '../utils/pageTitles';

// Same module set as the admin Sidebar, minus Call Audit / Reports / Master
// Data / User Management / Claim User Routing — those stay admin-only (Claim
// User Routing is now an admin-only drawer, not a routed page at all — see
// ClaimUserRoutingDrawer). "My Queue" (call handling) and "My Dashboard"
// (personal stats) replace the admin Dashboard entry, since those are
// operator-specific per the personal-dashboard requirement.
const NAV_ENTRIES = [
  { to: '/', icon: PhoneCall, label: 'My Queue', end: true },
  { to: '/dashboard', icon: LayoutDashboard, label: 'My Dashboard' },
  { to: '/appointments', icon: CalendarClock, label: 'Appointments' },
  { to: '/benefit-verification', icon: ShieldCheck, label: 'Benefit Verification' },
  { to: '/eligibility-verification', icon: Activity, label: 'Eligibility Verification' },
  { to: '/prior-authorization', icon: ClipboardCheck, label: 'Prior Authorization' },
  { to: '/claims', icon: FileText, label: 'Claim Management' },
  { to: '/patient-balance-reminder', icon: Wallet, label: 'Patient Balance Reminder' },
  { to: '/inbound-billing', icon: PhoneIncoming, label: 'Inbound Billing' },
];

const ROLE_LABELS = { admin: 'Admin', operator: 'Operator' };

function getInitials(emailOrName) {
  if (!emailOrName) return '?';
  const trimmed = emailOrName.trim();
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ').filter(Boolean);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function OperatorSidebar() {
  return (
    <aside className="font-ui bg-white border-r border-border flex flex-col relative shrink-0 w-64">
      <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-accent/20 via-cyan/10 to-transparent" />

      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight text-gray-900">Cadence</h1>
            <p className="font-display text-[10px] uppercase tracking-[0.2em] text-muted font-medium">Claims AI</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        <p className="px-3 pt-2 pb-2 text-[10px] uppercase tracking-[0.15em] text-muted/60 font-semibold">
          Navigation
        </p>
        {NAV_ENTRIES.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 relative ${
                isActive ? 'bg-accent-dim text-accent font-semibold' : 'font-medium text-gray-500 hover:text-gray-800 hover:bg-panel-light'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 mt-auto border-t border-border">
        <div className="px-3 py-2">
          <p className="text-xs text-muted/40 font-data">v0.1.0</p>
        </div>
      </div>
    </aside>
  );
}

export default function OperatorLayout({ onLogout }) {
  const auth = useAuth();
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname, 'My Queue');
  const label = auth?.name || auth?.email || 'Signed in';

  return (
    <div className="flex h-screen overflow-hidden">
      <OperatorSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 lg:px-8 gap-3 relative z-20">
          <h1 className="font-display font-bold text-[16px] text-gray-900 truncate">{pageTitle}</h1>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-display font-semibold text-accent shrink-0">
              {getInitials(label)}
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted">{ROLE_LABELS[auth?.role] ?? auth?.role ?? '--'}</p>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto grid-bg">
          <div className="h-full flex flex-col p-4 lg:p-6 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <HandoffNotifier />
    </div>
  );
}
