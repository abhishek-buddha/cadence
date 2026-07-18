import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import HandoffNotifier from './HandoffNotifier';
import { Building2, ChevronDown, Check, Database, UserCog } from 'lucide-react';
import { useProviderFilter } from '../context/ProviderFilterContext';

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

function HospitalDropdown() {
  const { selectedProviderId, setSelectedProviderId, providers, selectedProvider } = useProviderFilter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const options = [
    { id: null, label: 'All Providers' },
    ...providers.map((p) => ({ id: p._id, label: p.practiceName })),
  ];

  const selectedLabel = selectedProvider ? selectedProvider.practiceName : 'All Providers';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white border border-border-light rounded-lg pl-3 pr-2.5 py-1.5 text-sm text-gray-700 cursor-pointer hover:border-accent/40 focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors min-w-[180px] shadow-sm"
      >
        <span className="flex-1 text-left truncate">{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-full w-max bg-white border border-border-light rounded-lg shadow-xl shadow-gray-200/60 py-1 z-50 animate-fade-in">
          {options.map((opt) => {
            const isActive = opt.id === selectedProviderId;
            return (
              <button
                key={opt.id ?? '__all'}
                onClick={() => {
                  setSelectedProviderId(opt.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  isActive
                    ? 'bg-accent/5 text-accent'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                <span className="flex-1 whitespace-nowrap">{opt.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
        <header className="shrink-0 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-end px-6 lg:px-8 gap-3 relative z-20">
          <HeaderIconLink to="/users" icon={UserCog} label="User Management" />
          <HeaderIconLink to="/master-data" icon={Database} label="Master Data" />

          {/* Hospital selector */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider font-medium">
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Provider</span>
            </div>
            <HospitalDropdown />
          </div>
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
