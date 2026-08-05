import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PhoneCall, CalendarCheck, Timer, Radio } from 'lucide-react';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';

const HANDOFF_STATE_CONFIG = {
  accepting: { label: 'Connecting', cls: 'bg-warn/10 text-warn' },
  connected: { label: 'Connected', cls: 'bg-success/10 text-success' },
  handoff_ended: { label: 'Ended', cls: 'bg-gray-100 text-gray-500' },
  handoff_failed: { label: 'Failed', cls: 'bg-danger/10 text-danger' },
};

function HandoffStateBadge({ state }) {
  const cfg = HANDOFF_STATE_CONFIG[state] ?? { label: state ?? 'Unknown', cls: 'bg-gray-100 text-gray-500' };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
}

function formatHandleTime(seconds) {
  if (seconds == null) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatWhen(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function OperatorDashboardPage() {
  const auth = useAuth();
  const stats = useQuery(api.operatorStats.getStats, auth?.userId ? { userId: auth.userId } : 'skip');
  const isLoading = stats === undefined;

  return (
    <div className="space-y-4 animate-fade-in">
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 shimmer rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            icon={Radio}
            label="Status"
            value={stats.isCurrentlyOnCall ? 'On a call' : 'Available'}
            subValue={stats.isCurrentlyOnCall ? 'Currently handling a handoff' : 'Ready for the next call'}
            accent={stats.isCurrentlyOnCall}
          />
          <StatCard
            icon={CalendarCheck}
            label="Calls Handled Today"
            value={stats.handledToday.toLocaleString()}
            subValue={`${stats.totalHandled.toLocaleString()} total all-time`}
          />
          <StatCard
            icon={Timer}
            label="Avg Handle Time"
            value={formatHandleTime(stats.avgHandleTimeSeconds)}
            subValue="Per accepted call"
          />
          <StatCard
            icon={PhoneCall}
            label="Total Handoffs"
            value={stats.totalHandled.toLocaleString()}
            subValue="Accepted or connected"
          />
        </div>
      )}

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-display font-semibold text-gray-900">Recent Calls</h2>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        ) : stats.recent.length === 0 ? (
          <div className="p-10 text-center">
            <PhoneCall className="w-8 h-8 text-muted/30 mx-auto mb-3" />
            <p className="text-sm text-muted">No calls handled yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {stats.recent.map((c) => (
              <div key={c.callId} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.insuranceCompany || 'Payer'}</p>
                  <p className="text-xs text-muted truncate">{c.subject}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted font-data whitespace-nowrap">{formatWhen(c.handoffAcceptedAt)}</span>
                  <HandoffStateBadge state={c.handoffState} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
