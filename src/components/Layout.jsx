import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import HandoffNotifier from './HandoffNotifier';
import { Database, UserCog, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function HeaderIconLink({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors shadow-sm ${
          isActive
            ? 'border-accent/40 bg-accent/5 text-accent'
            : 'border-border-light bg-white text-gray-600 hover:border-accent/40 hover:text-gray-900'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

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

function UserMenu({ onLogout }) {
  const auth = useAuth();
  const label = auth?.name || auth?.email || 'Signed in';

  return (
    <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-border">
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
  );
}

export default function Layout({ onLogout }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
  });

  function handleToggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebarCollapsed', String(next)); } catch {}
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={handleToggleSidebar} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-end px-6 lg:px-8 gap-3 relative z-20">
          <HeaderIconLink to="/users" icon={UserCog} label="User Management" />
          <HeaderIconLink to="/master-data" icon={Database} label="Master Data" />
          <UserMenu onLogout={onLogout} />
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto grid-bg">
          <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* App-wide broadcast toast for incoming AI→human handoffs */}
      <HandoffNotifier />
    </div>
  );
}
