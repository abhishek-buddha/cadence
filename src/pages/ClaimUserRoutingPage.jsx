import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import EmptyState from '../components/EmptyState';
import { Route as RouteIcon, UserCog } from 'lucide-react';

const ROLE_LABELS = { agent: 'Agent', supervisor: 'Supervisor' };
const SPECIALIZATION_LABELS = {
  claim_manager: 'Claim Manager',
  denial_handling: 'Denial Handling',
  followup: 'Followup',
};

const AVAILABILITY_CONFIG = {
  available: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Available' },
  busy: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'Busy in call' },
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

export default function ClaimUserRoutingPage() {
  const agents = useQuery(api.callAgents.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const isLoading = agents === undefined;

  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });

  const activeAgents = (agents ?? []).filter((a) => a.status === 'active');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Claim User Routing</h1>
        <p className="text-sm text-muted mt-1">
          List view only — who's available to take over once a payer rep is on the line.
        </p>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Username</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Insurance</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Claim Types Handling</th>
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="shimmer rounded h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : activeAgents.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={UserCog}
                    title="No active users"
                    description="Add users in User Management (top right) and mark them active to see them here."
                  />
                </td>
              </tr>
            ) : (
              activeAgents.map((agent) => {
                const insuranceNames = (agent.insuranceContactIds ?? []).map((id) => insuranceMap[id] ?? '--');
                const specLabels = (agent.specializations ?? []).map((s) => SPECIALIZATION_LABELS[s] ?? s);
                return (
                  <tr key={agent._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-gray-900 font-medium whitespace-nowrap">{agent.username}</td>
                    <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{ROLE_LABELS[agent.role] ?? agent.role}</td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {insuranceNames.length > 0 ? insuranceNames.join(', ') : <span className="text-muted/50 italic">--</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {specLabels.length > 0 ? specLabels.join(', ') : <span className="text-muted/50 italic">--</span>}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap"><AvailabilityBadge value={agent.availability} /></td>
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
          This view has no case drill-down by design — it's a routing roster only. Manage users
          (add/edit/deactivate) from User Management, top right.
        </p>
      </div>
    </div>
  );
}
