import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PhoneIncoming, X } from 'lucide-react';

export default function HandoffNotifier() {
  const calls = useQuery(api.handoff?.listAwaitingHandoff) ?? [];
  const [dismissed, setDismissed] = useState({});
  const call = calls.find((row) => !dismissed[row._id]);
  if (!call) return null;

  return (
    <div className="fixed right-4 top-20 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-accent/30 bg-white shadow-xl shadow-gray-300/50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
          <PhoneIncoming className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-gray-900">Insurance rep on the line</p>
          <p className="text-sm text-gray-600 truncate">{call.insuranceCompany || 'Payer'} is waiting for an agent</p>
          <Link to="/live" className="inline-flex items-center gap-1 mt-2 text-sm text-accent font-medium hover:text-accent-hover">
            Take the call <span aria-hidden>?</span>
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDismissed((prev) => ({ ...prev, [call._id]: true }))}
          className="p-1 rounded-md text-muted hover:text-gray-900 hover:bg-gray-50"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
