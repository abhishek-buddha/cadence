import { useEffect, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import EmptyState from '../components/EmptyState';
import { Check, Loader2, PhoneCall, Route as RouteIcon, UserCog } from 'lucide-react';
import { useSoftphone } from '../hooks/useSoftphone';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  operator: 'Operator',
  viewer: 'Viewer',
};

const ROLE_SPECIALIZATIONS = {
  admin: ['Claim Management', 'Escalations'],
  manager: ['Denial Handling', 'Followup'],
  operator: ['Claim Followup', 'Live Handoff'],
  viewer: ['Read Only'],
};

const AVAILABILITY_CONFIG = {
  available: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Available' },
  assigned: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent', label: 'Assigned' },
  in_call: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'In call' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-400', label: 'Offline' },
};

function AvailabilityBadge({ value }) {
  const cfg = AVAILABILITY_CONFIG[value] ?? AVAILABILITY_CONFIG.disabled;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium px-2 py-0.5 text-xs ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function displayName(user) {
  return user.routingName || user.name || user.email || 'Unknown user';
}

function subjectLabel(call) {
  if (!call) return '--';
  if (call.claimNumber) return `Claim ${call.claimNumber}`;
  if (call.dentalCaseNumber) return `Case ${call.dentalCaseNumber}`;
  return 'Assigned handoff';
}

export default function ClaimUserRoutingPage() {
  const users = useQuery(api.users?.listRoutingAgents);
  const acceptHandoff = useMutation(api.handoff.acceptHandoff);
  const redirectPayer = useAction(api.handoff.redirectPayerToConference);
  const markConnected = useMutation(api.handoff.markConnectedFromClient);
  const softphone = useSoftphone();
  const [acceptingId, setAcceptingId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    softphone.ensureDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = users === undefined;
  const activeUsers = users ?? [];

  async function handleAccept(user) {
    const call = user.activeCall;
    if (!call || user.availability !== 'assigned') return;

    setAcceptingId(user._id);
    setNotice(null);
    try {
      const res = await acceptHandoff({ callId: call._id, agentUserId: user._id });
      if (!res?.ok) {
        setNotice(res?.reason === 'already_taken' ? 'Already taken by another agent' : 'Could not accept call');
        return;
      }

      const joined = await softphone.connect(call._id);
      if (!joined?.ok) {
        setNotice(`Could not connect browser phone${joined?.error ? `: ${joined.error}` : ''}`);
        return;
      }

      const routed = await redirectPayer({ callId: call._id });
      if (!routed?.ok) {
        softphone.disconnect();
        setNotice(`Could not bridge the call${routed?.error ? `: ${routed.error}` : ''}`);
        return;
      }

      await markConnected({ callId: call._id });
    } catch (error) {
      setNotice(error?.message || 'Could not accept call');
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
          Claim User Routing
        </h1>
        <p className="text-sm text-muted mt-1">
          Live assignment view for payer handoffs and agent availability.
        </p>
      </div>

      {notice && (
        <div className="bg-warn/10 border border-warn/20 rounded-lg px-4 py-3 text-sm text-warn">
          {notice}
        </div>
      )}

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Username</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Insurance</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Claim Types Handling</th>
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Availability</th>
              <th className="text-right px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : activeUsers.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={UserCog}
                    title="No active users"
                    description="Active Cadence users will appear here when they are available for routing."
                  />
                </td>
              </tr>
            ) : (
              activeUsers.map((user) => {
                const specializations = ROLE_SPECIALIZATIONS[user.role] ?? ['Claim Followup'];
                const canAccept = user.availability === 'assigned' && user.activeCall;
                const isAccepting = acceptingId === user._id;

                return (
                  <tr key={user._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-gray-900 font-medium whitespace-nowrap">
                      {displayName(user)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                      {ROLE_LABELS[user.role] ?? user.role ?? '--'}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {user.activeCall?.insuranceCompany || (
                        <span className="text-muted/50 italic">All providers</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {user.activeCall ? subjectLabel(user.activeCall) : specializations.join(', ')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <AvailabilityBadge value={user.availability ?? 'offline'} />
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {canAccept ? (
                        <button
                          onClick={() => handleAccept(user)}
                          disabled={isAccepting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 transition-colors"
                        >
                          {isAccepting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Accept
                        </button>
                      ) : user.availability === 'in_call' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                          <PhoneCall className="w-3.5 h-3.5" />
                          Busy
                        </span>
                      ) : (
                        <span className="text-xs text-muted/60">--</span>
                      )}
                    </td>
                  </tr>
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
          make that agent unavailable until the handoff ends.
        </p>
      </div>
    </div>
  );
}
