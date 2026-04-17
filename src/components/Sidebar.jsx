import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Stethoscope,
  PhoneCall,
  Settings,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  PhoneForwarded,
  ShieldCheck,
  UserCog,
  KeyRound,
  Webhook,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/claims', icon: FileText, label: 'Claims' },
  { to: '/patients', icon: Users, label: 'Patients' },
  { to: '/insurance', icon: Building2, label: 'Insurance' },
  { to: '/providers', icon: Stethoscope, label: 'Providers' },
  { to: '/calls', icon: PhoneCall, label: 'Call History' },
  { to: '/eligibility', icon: Activity, label: 'Eligibility' },
  { to: '/sessions', icon: Users, label: 'Sessions' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/transfers', icon: PhoneForwarded, label: 'Transfers' },
];

const adminItems = [
  { to: '/audit', icon: ShieldCheck, label: 'Audit Log', roles: ['admin', 'manager'] },
  { to: '/users', icon: UserCog, label: 'Users', roles: ['admin'] },
  { to: '/api-keys', icon: KeyRound, label: 'API Keys', roles: ['admin'] },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks', roles: ['admin', 'manager'] },
];

export default function Sidebar({ collapsed, onToggle }) {
  const auth = useAuth?.() ?? {};
  const role = auth?.role ?? auth?.user?.role ?? null;
  const visibleAdminItems = adminItems.filter((item) => item.roles.includes(role));

  const renderNavLink = (item) => {
    const { to, icon: ItemIcon, label, end } = item;
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
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
            <ItemIcon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      className={`bg-white border-r border-border flex flex-col relative shrink-0 transition-[width] duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Accent line */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-accent/20 via-cyan/10 to-transparent" />

      {/* Logo */}
      <div className={`p-4 pb-3 ${collapsed ? 'px-3' : 'p-6 pb-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight text-gray-900">
                Cadence
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
                Claims AI
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pt-2 pb-2 text-[10px] uppercase tracking-[0.15em] text-muted/60 font-semibold">
            Navigation
          </p>
        )}
        {collapsed && <div className="pt-2" />}
        {navItems.map(renderNavLink)}

        {visibleAdminItems.length > 0 && (
          <>
            {/* Divider */}
            <div className="my-2 mx-3 border-t border-border/60" />
            {!collapsed && (
              <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-[0.15em] text-muted/60 font-semibold">
                Admin
              </p>
            )}
            {visibleAdminItems.map(renderNavLink)}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="p-2 mt-auto border-t border-border space-y-1">
        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <div className="flex items-center gap-3 w-full">
              <PanelLeftClose className="w-4 h-4" />
              <span className="text-xs">Collapse</span>
            </div>
          )}
        </button>

        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-accent/8 text-accent'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`
          }
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>

        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-xs text-muted/40 font-data">v0.1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
