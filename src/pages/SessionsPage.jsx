import { useState, useMemo, Fragment } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Users, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import OutcomeBadge from '../components/OutcomeBadge';
import EmptyState from '../components/EmptyState';
import CreateSessionModal from '../components/CreateSessionModal';
import SessionDetailPanel from '../components/SessionDetailPanel';

function formatDate(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ShimmerRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="shimmer rounded h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export default function SessionsPage() {
  const sessions = useQuery(api.callSessions?.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const isLoading = sessions === undefined;

  const insuranceMap = useMemo(() => {
    const map = {};
    (insuranceContacts ?? []).forEach((c) => { map[c._id] = c.name; });
    return map;
  }, [insuranceContacts]);

  const expandedSession = (sessions ?? []).find((s) => s._id === expandedId) || null;

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Sessions</h1>
          <p className="text-sm text-muted mt-1">
            {isLoading
              ? 'Loading...'
              : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} - multi-patient calls grouped by payer`}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="pl-4 pr-2 py-3.5 w-8"></th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Session #</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Payer</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Use Case</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Items</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Status</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Aggregate Outcome</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <ShimmerRow key={i} />)
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon={Users}
                    title="No sessions yet"
                    description="Group multiple patients into a single call to save time on hold."
                    action={
                      <button
                        onClick={() => setCreateOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        New Session
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              sessions.map((session) => {
                const isExpanded = expandedId === session._id;
                return (
                  <Fragment key={session._id}>
                    <tr
                      onClick={() => toggleExpand(session._id)}
                      className="table-row-hover cursor-pointer hover:bg-gray-50"
                    >
                      <td className="pl-4 pr-2 py-3.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted" />
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-data text-accent whitespace-nowrap">
                        {session._id?.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 whitespace-nowrap">
                        {insuranceMap[session.insuranceContactId] || '---'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                        {(session.useCase || '').replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3.5 text-center font-data text-gray-900 whitespace-nowrap">
                        {session.itemRefs?.length ?? '--'}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <StatusBadge status={session.status || 'unknown'} />
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {session.aggregateOutcome ? (
                          <OutcomeBadge
                            outcome={session.aggregateOutcome}
                            missingFields={session.missingFields}
                          />
                        ) : (
                          <span className="text-xs text-muted/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-600 font-data text-right whitespace-nowrap">
                        {formatDate(session.createdAt || session._creationTime)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface/40">
                        <td colSpan={8} className="px-6 py-4">
                          <SessionDetailPanel session={expandedSession} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateSessionModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
