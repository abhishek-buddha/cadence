import { useMemo, useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { List, ChevronRight, Play, Loader2 } from 'lucide-react';
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

// Derive a display label + detail line from a raw claim or dental case entity.
function formatItem(entity, idx) {
  if (!entity) return { label: `Item ${idx + 1}`, detail: '' };
  const isClaim = 'claimNumber' in entity;
  if (isClaim) {
    const amount = entity.amount != null ? `$${Number(entity.amount).toFixed(2)}` : '';
    return {
      label: entity.claimNumber || `Claim ${idx + 1}`,
      detail: [amount, entity.dateOfService ? `DOS ${entity.dateOfService}` : ''].filter(Boolean).join(' · '),
    };
  }
  const cdts = (entity.cdtCodes ?? []).join(', ') || '--';
  return {
    label: entity.caseNumber || `EV Case ${idx + 1}`,
    detail: [`CDT: ${cdts}`, entity.proposedDateOfService ? `DOS ${entity.proposedDateOfService}` : ''].filter(Boolean).join(' · '),
  };
}

export default function SessionDetailPanel({ session }) {
  const executeSession = useAction(api.callSessions?.executeSession);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  async function handleStartSession() {
    if (!session?._id || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      await executeSession({ sessionId: session._id });
    } catch (err) {
      setStartError(err.message || 'Failed to start session');
    } finally {
      setStarting(false);
    }
  }

  // Use the already-deployed getWithItems query (returns { session, insurance, items })
  // where each item = { ref, entity, result, lastCall }
  const withItems = useQuery(
    api.callSessions?.getWithItems,
    session?._id ? { id: session._id } : 'skip'
  );

  // Find the active call for this session (getActiveCall is now deployed)
  const activeCall = useQuery(
    api.callSessions?.getActiveCall,
    session?._id ? { sessionId: session._id } : 'skip'
  );

  if (!session) {
    return (
      <div className="bg-white border border-border rounded-xl px-5 py-8 text-center shadow-sm">
        <p className="text-sm text-muted/60">Select a session to view its details.</p>
      </div>
    );
  }

  const insurance = withItems?.insurance ?? null;
  const rawItems = withItems?.items ?? [];

  const itemList = useMemo(() =>
    rawItems.map((item, idx) => {
      const { label, detail } = formatItem(item.entity, idx);
      const outcome = item.lastCall?.outcome ?? null;
      const missingFields = item.lastCall?.missingFields ?? [];
      return { key: item.ref ?? idx, label, detail, outcome, missingFields };
    }),
    [rawItems]
  );

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
            {(session.status === 'queued' || session.status === 'paused') && (
              <button
                onClick={handleStartSession}
                disabled={starting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {starting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {starting ? 'Starting...' : 'Start Session'}
              </button>
            )}
            <StatusBadge status={session.status || 'unknown'} />
            {session.aggregateOutcome && (
              <OutcomeBadge outcome={session.aggregateOutcome} missingFields={session.missingFields} />
            )}
          </div>
        </div>
        <ProgressBar current={completedCount} total={itemList.length} />
        {startError && (
          <p className="text-xs text-danger mt-2">{startError}</p>
        )}
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
          {withItems === undefined ? (
            <p className="text-sm text-muted text-center py-8">Loading...</p>
          ) : itemList.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No items in this session.</p>
          ) : (
            itemList.map((item, idx) => (
              <div key={item.key} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className="w-6 h-6 rounded-full bg-surface text-xs font-data text-muted flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{item.label}</p>
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
