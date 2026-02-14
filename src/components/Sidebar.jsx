import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Stethoscope,
  PhoneCall,
  Settings,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { useProviderFilter } from '../context/ProviderFilterContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/claims', icon: FileText, label: 'Claims' },
  { to: '/patients', icon: Users, label: 'Patients' },
  { to: '/insurance', icon: Building2, label: 'Insurance' },
  { to: '/providers', icon: Stethoscope, label: 'Providers' },
  { to: '/calls', icon: PhoneCall, label: 'Call History' },
];

export default function Sidebar() {
  const location = useLocation();
  const { selectedProviderId, setSelectedProviderId, providers } = useProviderFilter();

  return (
    <aside className="w-64 bg-panel border-r border-border flex flex-col relative shrink-0">
      {/* Accent line */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-accent/30 via-cyan/20 to-transparent" />

      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight text-white">
              Cadence
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
              Claims AI
            </p>
          </div>
        </div>
      </div>

      {/* System status indicator */}
      <div className="mx-4 mb-4 px-3 py-2 rounded-lg bg-surface/50 border border-border">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success status-dot-pulse" />
          <span className="text-xs text-muted">System Online</span>
        </div>
      </div>

      {/* Hospital / Provider Filter */}
      <div className="mx-4 mb-4">
        <p className="px-1 pb-1.5 text-[10px] uppercase tracking-[0.15em] text-muted/60 font-semibold">
          Hospital
        </p>
        <div className="relative">
          <select
            value={selectedProviderId ?? ''}
            onChange={(e) => setSelectedProviderId(e.target.value || null)}
            className="w-full bg-surface border border-border-light rounded-lg pl-3 pr-7 py-2 text-sm text-white appearance-none cursor-pointer focus:border-accent focus:ring-1 focus:ring-accent outline-none truncate"
          >
            <option value="">All Hospitals</option>
            {providers.map((p) => (
              <option key={p._id} value={p._id}>
                {p.practiceName}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        <p className="px-3 pt-2 pb-2 text-[10px] uppercase tracking-[0.15em] text-muted/60 font-semibold">
          Navigation
        </p>
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
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

      {/* Bottom section */}
      <div className="p-3 mt-auto border-t border-border">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
            }`
          }
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </NavLink>

        <div className="mt-3 px-3 py-2">
          <p className="text-xs text-muted/40 font-data">v0.1.0</p>
        </div>
      </div>
    </aside>
  );
}
