import { Route } from 'lucide-react';

// Static reference data — this module has no backing schema/queries yet.
// Structure matches the RCM wireframes (knowledge folder/rcm_wireframes.pptx, slide 5).
const ROUTING_ROWS = [
  {
    username: 'A. Reyes',
    role: 'Agent',
    insurance: 'Aetna, Cigna',
    provider: 'Riverside',
    claimTypes: 'Enquiry, Status check',
    availability: 'available',
  },
  {
    username: 'K. Nolan',
    role: 'Supervisor',
    insurance: 'All payers',
    provider: 'All clients',
    claimTypes: 'Denial check',
    availability: 'busy',
  },
  {
    username: 'M. Owusu',
    role: 'Agent',
    insurance: 'Medicare',
    provider: 'Riverside North',
    claimTypes: 'Status check',
    availability: 'available',
  },
];

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
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Claim User Routing</h1>
        <p className="text-sm text-muted mt-1">
          List view only — reference layout, not yet wired to live assignment data.
        </p>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Username</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Insurance</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Provider</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Claim Types Handling</th>
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {ROUTING_ROWS.map((row) => (
              <tr key={row.username} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-5 py-3.5 text-gray-900 font-medium whitespace-nowrap">{row.username}</td>
                <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{row.role}</td>
                <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{row.insurance}</td>
                <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{row.provider}</td>
                <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{row.claimTypes}</td>
                <td className="px-5 py-3.5 whitespace-nowrap"><AvailabilityBadge value={row.availability} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted bg-surface border border-border rounded-lg p-3">
        <Route className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          This view has no case drill-down by design (per the reference wireframe) — it's a routing
          roster only. Wiring this to real agent/queue data is future scope.
        </p>
      </div>
    </div>
  );
}
