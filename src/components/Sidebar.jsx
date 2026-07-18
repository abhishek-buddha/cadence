import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  PhoneCall,
  Settings,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  Radio,
  Route,
  ChevronDown,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/claims', icon: FileText, label: 'Claim Management' },
  { to: '/claim-routing', icon: Route, label: 'Claim User Routing', newTab: true },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
];

const callAuditGroup = {
  icon: PhoneCall,
  label: 'Call Audit',
  paths: ['/call-audit', '/calls', '/live'],
  children: [
    { to: '/call-audit/history', icon: PhoneCall, label: 'Call History' },
    { to: '/call-audit/live', icon: Radio, label: 'Live Sessions' },
  ],
};

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const [callAuditOpen, setCallAuditOpen] = useState(() =>
    callAuditGroup.paths.some((path) => location.pathname.startsWith(path))
  );
  const isCallAuditActive = callAuditGroup.paths.some((path) =>
    location.pathname.startsWith(path)
  );

  const renderNavLink = (item) => {
    const { to, icon: ItemIcon, label, end, newTab } = item;
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noreferrer' : undefined}
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

  const renderCallAuditGroup = () => {
    const GroupIcon = callAuditGroup.icon;
    const shouldShowChildren = !collapsed && callAuditOpen;

    return (
      <div>
        <button
          type="button"
          onClick={() => setCallAuditOpen((open) => !open)}
          title={collapsed ? callAuditGroup.label : undefined}
          className={`w-full flex items-center ${
            collapsed ? 'justify-center' : 'gap-3'
          } px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
            isCallAuditActive
              ? 'bg-accent/8 text-accent'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          {isCallAuditActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent" />
          )}
          <GroupIcon className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{callAuditGroup.label}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted transition-transform ${
                  callAuditOpen ? 'rotate-180' : ''
                }`}
              />
            </>
          )}
        </button>

        {shouldShowChildren && (
          <div className="mt-1 ml-7 space-y-0.5">
            {callAuditGroup.children.map(({ to, icon: ChildIcon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-accent bg-accent/5'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`
                }
              >
                <ChildIcon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
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
        {navItems.slice(0, 3).map(renderNavLink)}
        {renderCallAuditGroup()}
        {navItems.slice(3).map(renderNavLink)}
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
