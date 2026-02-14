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
} from 'lucide-react';

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

  return (
    <aside className="w-64 bg-white border-r border-border flex flex-col relative shrink-0">
      {/* Accent line */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-accent/20 via-cyan/10 to-transparent" />

      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight text-gray-900">
              Cadence
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
              Claims AI
            </p>
          </div>
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
                  ? 'bg-accent/8 text-accent'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
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
                ? 'bg-accent/8 text-accent'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
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
