// HandoffNotifier — broadcast toast for an incoming AI→human handoff,
// scoped to whichever specific agent the call is assigned to.
//
// Mounted once in each layout (admin Layout.jsx, OperatorLayout.jsx).
// Subscribes to api.handoff.listAwaitingHandoff (the same reactive query the
// Live Calls page uses) but only renders a toast when the call is assigned to
// the CURRENT signed-in user — no real backend auth exists in this app, so
// "who am I" comes from AuthContext (set at login), not the server.
// Reactively clears itself when that assignment resolves (accepted / ended).
// Suppressed while already on the page the toast would route to.

import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PhoneIncoming, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function HandoffNotifier() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const awaiting = useQuery(api.handoff.listAwaitingHandoff);

  const mine = (awaiting ?? []).filter((c) => c.assignedAgentUserId === auth?.userId);
  if (mine.length === 0) return null;

  const targetPath = auth?.role === 'operator' ? '/' : '/live';
  if (location.pathname === targetPath || location.pathname === '/call-audit/live') return null;

  const first = mine[0];
  const payer = first.insuranceCompany || 'A payer';
  const extra = mine.length > 1 ? ` (+${mine.length - 1} more)` : '';

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-[slideUp_0.2s_ease-out]">
      <button
        onClick={() => navigate(targetPath)}
        className="w-full text-left rounded-xl border border-accent/40 bg-white shadow-lg shadow-accent/10 p-4 flex items-start gap-3 hover:border-accent/60 transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 animate-pulse">
          <PhoneIncoming className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">Insurance rep on the line</p>
          <p className="text-sm text-gray-600 truncate">
            {payer} is waiting for you{extra}
          </p>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
            Take the call <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </button>
    </div>
  );
}
