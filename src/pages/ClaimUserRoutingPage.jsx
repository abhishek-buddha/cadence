import { Fragment, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import EmptyState from '../components/EmptyState';
import { ChevronDown, ChevronRight, Route as RouteIcon, UserCog } from 'lucide-react';
import HandoffContextCard from '../components/HandoffContextCard';
import { SPECIALIZATION_LABELS } from '../constants/specializations';

const ROLE_LABELS = {
  admin: 'Admin',
  operator: 'Operator',
};

const AVAILABILITY_CONFIG = {
  available: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Available' },
  assigned: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent', label: 'Assigned' },
  in_call: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'In call' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-400', label: 'Offline' },
};

function AvailabilityBadge({ value }) {
  const cfg = AVAILABILITY_CONFIG[value] ?? AVAILABILITY_CONFIG.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium px-2 py-0.5 text-xs ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function displayName(user) {
  return user.name || user.email || user.routingName || 'Unknown user';
}

function routeValue(value, fallback) {
  return value || <span className="text-muted/50 italic">{fallback}</span>;
}

function subjectLabel(call) {
  if (!call) return '--';
  if (call.claimNumber) return `Claim ${call.claimNumber}`;
  if (call.dentalCaseNumber) return `Case ${call.dentalCaseNumber}`;
  return 'Assigned handoff';
}

export default function ClaimUserRoutingPage() {
  const users = useQuery(api.users?.listRoutingAgents);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const userGroups = useQuery(api.userGroups.list);
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const isLoading = users === undefined;
  const activeUsers = users ?? [];
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });
  const groupMap = {};
  (userGroups ?? []).forEach((g) => { groupMap[g._id] = g; });

  // A user assigned to a group has their Payer/Specialization scope resolved
  // from the group instead of their own (mutually exclusive) fields.
  function resolvedInsuranceIds(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.insuranceContactIds ?? []) : (user.insuranceContactIds ?? []);
  }
  function resolvedSpecializations(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.specializations ?? []) : (user.specializations ?? []);
  }

  function toggleExpanded(userId) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
          Claim User Routing
        </h1>
        <p className="text-sm text-muted mt-1">
          Read-only view of agent availability — who's on a call and who's free.
        </p>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Username</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Payer</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Specialization</th>
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : activeUsers.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={UserCog}
                    title="No active users"
                    description="Active Cadence users will appear here when they are available for routing."
                  />
                </td>
              </tr>
            ) : (
              activeUsers.map((user) => {
                const insuranceNames = resolvedInsuranceIds(user).map((id) => insuranceMap[id]).filter(Boolean);
                const specLabels = resolvedSpecializations(user).map((s) => SPECIALIZATION_LABELS[s] ?? s);
                const hasCallDetails = Boolean(user.activeCall);
                const isExpanded = hasCallDetails && expandedRows.has(user._id);
                const ExpanderIcon = isExpanded ? ChevronDown : ChevronRight;

                return (
                  <Fragment key={user._id}>
                    <tr className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-5 py-3.5 text-gray-900 font-medium whitespace-nowrap">
                        {displayName(user)}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                        {ROLE_LABELS[user.role] ?? user.role ?? '--'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">
                        {user.activeCall?.insuranceCompany || routeValue(insuranceNames.join(', '), 'All payers')}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">
                        {hasCallDetails ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(user._id)}
                            className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left font-medium text-accent hover:bg-accent/10"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Hide' : 'Show'} claim details for ${subjectLabel(user.activeCall)}`}
                          >
                            <ExpanderIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{subjectLabel(user.activeCall)}</span>
                          </button>
                        ) : (
                          routeValue(specLabels.join(', '), '--')
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <AvailabilityBadge value={user.availability ?? 'offline'} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface/60">
                        <td colSpan={5} className="px-5 py-4">
                          <HandoffContextCard call={user.activeCall} embedded />
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

      <div className="flex items-start gap-2 text-xs text-muted bg-surface border border-border rounded-lg p-3">
        <RouteIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Calls are assigned to the first available agent in order. Assigned and connected calls
          make that agent unavailable until the handoff ends. Accepting calls happens from the
          agent's own login, not from this admin view.
        </p>
      </div>
    </div>
  );
}
