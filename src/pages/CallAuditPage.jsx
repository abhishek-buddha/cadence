import { useLocation } from 'react-router-dom';
import CallHistory from './CallHistory';
import LiveCallsPanel from './LiveCallsPanel';

// Sub-navigation lives in the sidebar (Call Audit > Call History / Live Sessions) —
// no header or tabs here at all, the sidebar already labels this section.
export default function CallAuditPage() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/call-audit/live');

  return isLive ? <LiveCallsPanel /> : <CallHistory />;
}
