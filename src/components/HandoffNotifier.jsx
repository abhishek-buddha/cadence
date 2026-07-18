// HandoffNotifier — app-wide broadcast toast for incoming AI→human handoffs.
//
// Mounted once in Layout. Subscribes to api.handoff.listAwaitingHandoff (the
// same reactive query the Live Calls page uses), so a toast appears the moment
// a call is assigned for handoff. Clicking it routes to /live.
// Reactively clears itself when the list empties (someone accepted / call
// ended). Suppressed while already on /live to avoid redundancy.

import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PhoneIncoming, ArrowRight } from 'lucide-react';

export default function HandoffNotifier() {
  const navigate = useNavigate();
  const location = useLocation();
  const awaiting = useQuery(api.handoff.listAwaitingHandoff);

  const list = awaiting ?? [];
  if (list.length === 0) return null;
  if (location.pathname === '/live' || location.pathname === '/call-audit/live') return null;

  const first = list[0];
  const payer = first.insuranceCompany || 'A payer';
  const extra = list.length > 1 ? ` (+${list.length - 1} more)` : '';
  const assigned = first.assignedAgentName || 'assigned agent';

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-[slideUp_0.2s_ease-out]">
      <button
        onClick={() => navigate('/live')}
        className="w-full text-left rounded-xl border border-accent/40 bg-white shadow-lg shadow-accent/10 p-4 flex items-start gap-3 hover:border-accent/60 transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 animate-pulse">
          <PhoneIncoming className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">Insurance rep on the line</p>
          <p className="text-sm text-gray-600 truncate">
            {payer} is waiting for {assigned}{extra}
          </p>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
            Take the call <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </button>
    </div>
  );
}
