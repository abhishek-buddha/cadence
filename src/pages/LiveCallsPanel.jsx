import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Radio, PhoneCall } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

const ACTIVE_STATUSES = ['initiating', 'ringing', 'in_progress'];

function useElapsed(startIso) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startIso) return;
    const start = new Date(startIso).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ActiveCallRow({ call }) {
  const navigate = useNavigate();
  const elapsed = useElapsed(call.startedAt);
  const caseLabel = call.claimNumber ?? call.dentalCaseNumber ?? '--';
  const target = call.claimId ? `/claims/${call.claimId}` : call.dentalCaseId ? `/eligibility/${call.dentalCaseId}` : null;

  return (
    <tr
      onClick={() => target && navigate(target)}
      className={target ? 'cursor-pointer hover:bg-gray-50/80 transition-colors' : ''}
    >
      <td className="px-4 py-3 text-sm font-data text-accent whitespace-nowrap">{caseLabel}</td>
      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{call.insuranceCompany ?? '--'}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={call.status} />
      </td>
      <td className="px-4 py-3 text-sm font-data text-gray-900 text-right whitespace-nowrap">
        <span className="status-dot-pulse inline-block w-1.5 h-1.5 rounded-full bg-success mr-2" />
        {elapsed}
      </td>
    </tr>
  );
}

export default function LiveCallsPanel() {
  const allCalls = useQuery(api.calls.listRecent, { limit: 100 });
  const isLoading = allCalls === undefined;
  const activeCalls = (allCalls ?? []).filter((c) => ACTIVE_STATUSES.includes(c.status));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Live Sessions</h1>
          <p className="text-sm text-muted mt-1">Calls currently in progress</p>
        </div>
        {!isLoading && activeCalls.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-3 py-1.5 rounded-full">
            <Radio className="w-3.5 h-3.5" />
            {activeCalls.length} active
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm p-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 shimmer rounded-lg" />
          ))}
        </div>
      ) : activeCalls.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={PhoneCall}
            title="No active calls"
            description="Calls in progress right now will show up here in real time."
          />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold">Claim / Case</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold">Insurance</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold">Status</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold">Elapsed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {activeCalls.map((call) => (
                <ActiveCallRow key={call._id} call={call} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
