import { useLocation } from 'react-router-dom';
import { PhoneCall } from 'lucide-react';
import CallHistory from './CallHistory';
import SessionsPage from './SessionsPage';

// Sub-navigation lives in the sidebar (Call Audit > Call History / Live Sessions) —
// no in-page tabs here, just render whichever one the current route points to.
// The section label sits as a small eyebrow above the child page's own title
// instead of a full duplicate heading.
export default function CallAuditPage() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/call-audit/live');

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-accent font-semibold mb-3">
        <PhoneCall className="w-3.5 h-3.5" />
        <span>Call Audit</span>
      </div>

      {isLive ? <SessionsPage /> : <CallHistory />}
    </div>
  );
}
