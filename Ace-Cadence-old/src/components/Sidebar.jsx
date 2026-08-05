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
  ChevronDown,
  CalendarClock,
  ShieldCheck,
  ClipboardCheck,
  Wallet,
  PhoneIncoming,
} from 'lucide-react';

const callAuditGroup = {
  icon: PhoneCall,
  label: 'Call Audit',
  paths: ['/call-audit', '/calls', '/live'],
  children: [
    { to: '/call-audit/history', icon: PhoneCall, label: 'Call History' },
    { to: '/call-audit/live', icon: Radio, label: 'Live Sessions' },
  ],
};

// Ordered top-to-bottom exactly as the product nav specifies. The Call Audit
// entry is a special expandable group handled separately in the render loop.
const navEntries = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/appointments', icon: CalendarClock, label: 'Appointments' },
  { to: '/benefit-verification', icon: ShieldCheck, label: 'Benefit Verification' },
  { to: '/eligibility-verification', icon: Activity, label: 'Eligibility Verification' },
  { to: '/prior-authorization', icon: ClipboardCheck, label: 'Prior Authorization' },
  { to: '/claims', icon: FileText, label: 'Claim Management' },
  { to: '/patient-balance-reminder', icon: Wallet, label: 'Patient Balance Reminder' },
  { to: '/inbound-billing', icon: PhoneIncoming, label: 'Inbound Billing' },
  { group: true },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
];

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
          `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative ${
            isActive
              ? 'bg-accent-dim text-accent font-semibold'
              : 'font-medium text-gray-500 hover:text-gray-800 hover:bg-panel-light'
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
          } px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative ${
            isCallAuditActive
              ? 'bg-accent-dim text-accent font-semibold'
              : 'font-medium text-gray-500 hover:text-gray-800 hover:bg-panel-light'
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
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'text-accent bg-accent-dim font-semibold'
                      : 'font-medium text-gray-500 hover:text-gray-800 hover:bg-panel-light'
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
      className={`font-ui bg-white border-r border-border flex flex-col relative shrink-0 transition-[width] duration-300 ease-in-out ${
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
              <p className="font-display text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
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
        {navEntries.map((item) => (item.group ? <div key="call-audit-group">{renderCallAuditGroup()}</div> : renderNavLink(item)))}
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
            `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
              isActive
                ? 'bg-accent-dim text-accent font-semibold'
                : 'font-medium text-gray-500 hover:text-gray-800 hover:bg-panel-light'
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
