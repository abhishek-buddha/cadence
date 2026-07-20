// ClaimUserRoutingDrawer — admin-only agent-availability panel.
//
// Used to be a routed page (/claim-routing) with its own tab; now it's a
// slide-in overlay from the left, opened from any admin screen via the
// Sidebar trigger, so admins can check who's available without leaving
// whatever they're working on. Read-only monitoring only — no accept/decline
// actions live here (that's the operator's own Queue screen).

import { Fragment, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { X, ChevronDown, ChevronRight, UserCog } from 'lucide-react';
import EmptyState from './EmptyState';
import HandoffContextCard from './HandoffContextCard';
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
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium px-2 py-0.5 text-xs whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
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

export default function ClaimUserRoutingDrawer({ open, onClose }) {
  const users = useQuery(api.users?.listRoutingAgents, open ? {} : 'skip');
  const insuranceContacts = useQuery(api.insuranceContacts.list, open ? {} : 'skip');
  const userGroups = useQuery(api.userGroups.list, open ? {} : 'skip');
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  if (!open) return null;

  const isLoading = users === undefined;
  const activeUsers = users ?? [];
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });
  const groupMap = {};
  (userGroups ?? []).forEach((g) => { groupMap[g._id] = g; });

  function resolvedInsuranceIds(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.insuranceContactIds ?? []) : (user.insuranceContactIds ?? []);
  }
  function resolvedSpecializations(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.specializations ?? []) : (user.specializations ?? []);
  }

  function toggleExpanded(userId) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  return (
    <>
      <div
        className="fixed top-14 right-0 bottom-0 left-0 bg-black/20 z-40 animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed top-14 bottom-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display font-bold text-lg text-gray-900">Claim User Routing</h2>
            <p className="text-xs text-muted mt-0.5">
              {!isLoading && `${activeUsers.length} active user${activeUsers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 shimmer rounded-lg" />
              ))}
            </div>
          ) : activeUsers.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title="No active users"
              description="Active Cadence users will appear here when they are available for routing."
            />
          ) : (
            <div className="divide-y divide-border/50">
              {activeUsers.map((user) => {
                const isExpanded = expandedRows.has(user._id);
                const ExpanderIcon = isExpanded ? ChevronDown : ChevronRight;
                const insuranceNames = resolvedInsuranceIds(user).map((id) => insuranceMap[id]).filter(Boolean);
                const specLabels = resolvedSpecializations(user).map((s) => SPECIALIZATION_LABELS[s] ?? s);

                return (
                  <Fragment key={user._id}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(user._id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-gray-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ExpanderIcon className="w-4 h-4 text-muted shrink-0" />
                        <span className="font-medium text-gray-900 truncate">{displayName(user)}</span>
                      </div>
                      <AvailabilityBadge value={user.availability ?? 'offline'} />
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4 bg-surface/40 space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pt-1">
                          <div>
                            <span className="text-xs uppercase tracking-wider text-muted font-medium block mb-0.5">Role</span>
                            {ROLE_LABELS[user.role] ?? user.role ?? '--'}
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider text-muted font-medium block mb-0.5">Payer</span>
                            {user.activeCall?.insuranceCompany || routeValue(insuranceNames.join(', '), 'All payers')}
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs uppercase tracking-wider text-muted font-medium block mb-0.5">Specialization</span>
                            {routeValue(specLabels.join(', '), '--')}
                          </div>
                        </div>
                        {user.activeCall && <HandoffContextCard call={user.activeCall} embedded />}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <p className="text-xs text-muted">
            Calls are assigned to the first available agent in order. Accepting calls happens from the agent's own login.
          </p>
        </div>
      </div>
    </>
  );
}
