import { X, UserCog, PhoneCall, CheckCircle2, Clock3 } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const BADGE = {
  available: 'bg-success/10 text-success',
  assigned: 'bg-accent/10 text-accent',
  in_call: 'bg-warn/10 text-warn',
  wrap_up: 'bg-gray-100 text-gray-600',
};

function AvailabilityIcon({ value }) {
  if (value === 'available') return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (value === 'wrap_up') return <Clock3 className="w-4 h-4 text-gray-500" />;
  return <PhoneCall className="w-4 h-4 text-accent" />;
}

function label(value) {
  return String(value || 'unknown').replace(/_/g, ' ');
}

export default function ClaimUserRoutingDrawer({ open, onClose }) {
  const agents = useQuery(api.handoff?.listRoutingAgents, open ? {} : 'skip') ?? [];
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4 text-accent" />
            <h2 className="font-display font-semibold text-gray-900">Claim User Routing</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-gray-900 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {agents.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">No active operators found.</p>
          ) : (
            agents.map((row) => (
              <div key={row.user._id} className="border border-border rounded-lg p-3 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{row.user.name || row.user.email}</p>
                    <p className="text-xs text-muted truncate">{row.user.email}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${BADGE[row.availability] || 'bg-gray-100 text-gray-600'}`}>
                    <AvailabilityIcon value={row.availability} />
                    {label(row.availability)}
                  </span>
                </div>
                {row.activeCall && (
                  <p className="mt-2 text-xs text-gray-600 truncate">
                    {row.activeCall.insuranceCompany || 'Payer'} ? {row.activeCall.claimNumber || row.activeCall.status || 'active call'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
