import { useLocation } from 'react-router-dom';
import CallHistory from './CallHistory';
import LiveCallsPage from './LiveCallsPage';

export default function CallAuditPage() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/call-audit/live');

  return isLive ? <LiveCallsPage /> : <CallHistory />;
}
