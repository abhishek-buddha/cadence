import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { List, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import OutcomeBadge from './OutcomeBadge';
import LiveCallMonitor from './LiveCallMonitor';

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted uppercase tracking-wider font-medium">Progress</span>
        <span className="text-xs font-data text-gray-900">{current} / {total}</span>
      </div>
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function SessionDetailPanel({ session }) {
  const items = useQuery(
    api.callSessions?.listItems,
    session?._id ? { sessionId: session._id } : 'skip'
  );
  const activeCall = useQuery(
    api.callSessions?.getActiveCall,
    session?._id ? { sessionId: session._id } : 'skip'
  );
  const insurance = useQuery(
    api.insuranceContacts.getById,
    session?.insuranceContactId ? { id: session.insuranceContactId } : 'skip'
  );

  if (!session) {
    return (
      <div className="bg-white border border-border rounded-xl px-5 py-8 text-center shadow-sm">
        <p className="text-sm text-muted/60">Select a session to view its details.</p>
      </div>
    );
  }

  const itemList = items ?? [];
  const completedCount = itemList.filter((i) => i.outcome && i.outcome !== 'pending').length;

  return (
    <div className="space-y-5">
      {/* Session header */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-gray-900 mb-1">
              Session {session._id?.slice(-6).toUpperCase()}
            </h3>
            <p className="text-xs text-muted">
              {insurance?.name || 'Unknown Payer'} · {itemList.length} item{itemList.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={session.status || 'unknown'} />
            {session.outcome && (
              <OutcomeBadge outcome={session.outcome} missingFields={session.missingFields} />
            )}
          </div>
        </div>
        <ProgressBar current={completedCount} total={itemList.length} />
      </div>

      {/* Active live call */}
      {activeCall && (
        <LiveCallMonitor call={activeCall} insurance={insurance} onComplete={() => {}} />
      )}

      {/* Items list */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
          <List className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-display font-semibold text-gray-900">Items</h3>
        </div>
        <div className="divide-y divide-border/50">
          {itemList.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No items in this session.</p>
          ) : (
            itemList.map((item, idx) => (
              <div key={item._id || idx} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className="w-6 h-6 rounded-full bg-surface text-xs font-data text-muted flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {item.label || item.patientName || `Item ${idx + 1}`}
                  </p>
                  {item.detail && (
                    <p className="text-xs text-muted truncate mt-0.5">{item.detail}</p>
                  )}
                </div>
                {item.outcome && <OutcomeBadge outcome={item.outcome} missingFields={item.missingFields} />}
                <ChevronRight className="w-4 h-4 text-muted/40 shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
