import { useLocation, useNavigate } from 'react-router-dom';
import { History, Radio } from 'lucide-react';
import CallHistory from './CallHistory';
import SessionsPage from './SessionsPage';

const TABS = [
  { key: 'history', to: '/call-audit/history', icon: History, label: 'Call History' },
  { key: 'live', to: '/call-audit/live', icon: Radio, label: 'Live Sessions' },
];

export default function CallAuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeKey = location.pathname.startsWith('/call-audit/live') ? 'live' : 'history';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Call Audit</h1>
        <p className="text-sm text-muted mt-1">Call history and live session monitoring</p>
      </div>

      {/* Sub-tabs */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="border-b border-border flex items-center gap-1 px-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeKey === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => navigate(tab.to)}
                className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive ? 'text-accent' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeKey === 'history' ? <CallHistory /> : <SessionsPage />}
        </div>
      </div>
    </div>
  );
}
