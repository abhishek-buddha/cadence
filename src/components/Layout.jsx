import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { UserCog, Database } from 'lucide-react';

function HeaderIconLink(props) {
  const { to, icon: Icon, label } = props;
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
          isActive
            ? 'bg-accent/8 text-accent border-accent/20'
            : 'text-gray-500 border-border-light hover:text-gray-800 hover:bg-gray-50'
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  );
}

export default function Layout() {
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
        <header className="shrink-0 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-end px-6 lg:px-8 gap-4 relative z-20">
          {/* User Management / Master Data */}
          <div className="flex items-center gap-2">
            <HeaderIconLink to="/user-management" icon={UserCog} label="User Management" />
            <HeaderIconLink to="/master-data" icon={Database} label="Master Data" />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto grid-bg">
          <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
