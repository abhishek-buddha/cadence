import { useLocation } from 'react-router-dom';
import CallHistory from './CallHistory';
import SessionsPage from './SessionsPage';

// Sub-navigation lives in the sidebar (Call Audit > Call History / Live Sessions) —
// no in-page tabs here, just render whichever one the current route points to.
export default function CallAuditPage() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/call-audit/live');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Call Audit</h1>
        <p className="text-sm text-muted mt-1">Call history and live session monitoring</p>
      </div>

      {isLive ? <SessionsPage /> : <CallHistory />}
    </div>
  );
}
