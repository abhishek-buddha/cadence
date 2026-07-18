import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import EmptyState from '../components/EmptyState';
import { Route as RouteIcon, UserCog } from 'lucide-react';

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
  active: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Available' },
  disabled: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-400', label: 'Offline' },
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
  return user.name || user.email || 'Unknown user';
}

export default function ClaimUserRoutingPage() {
  const users = useQuery(api.users?.list);
  const isLoading = users === undefined;
  const activeUsers = (users ?? []).filter((user) => user.status !== 'disabled');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
          Claim User Routing
        </h1>
        <p className="text-sm text-muted mt-1">
          List view only - who's available to take over once a payer rep is on the line.
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
                const specializations = ROLE_SPECIALIZATIONS[user.role] ?? ['Claim Followup'];

                return (
                  <tr key={user._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-gray-900 font-medium whitespace-nowrap">
                      {displayName(user)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                      {ROLE_LABELS[user.role] ?? user.role ?? '--'}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      <span className="text-muted/50 italic">All providers</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {specializations.join(', ')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <AvailabilityBadge value={user.status ?? 'active'} />
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
          This roster is backed by the existing Cadence user records and is shown as a routing
          reference only.
        </p>
      </div>
    </div>
  );
}
