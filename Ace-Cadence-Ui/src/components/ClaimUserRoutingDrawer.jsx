// ClaimUserRoutingDrawer — admin-only agent-availability panel.
//
// NOT YET MIGRATED: the original computed live agent availability from
// Convex's reactive `calls` + `users` queries (who's assigned/in-call/
// wrap-up right now). The new backend has the same data (call-handling-svc
// `calls.handoff_state`/`assigned_agent_user_id`, user-management-svc
// `users`) but the aggregation + live-refresh logic hasn't been ported yet.
// Renders a safe placeholder instead of crashing or showing stale UI.

import { X, UserCog } from 'lucide-react';

export default function ClaimUserRoutingDrawer({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-gray-900">Claim User Routing</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-gray-900 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <UserCog className="w-8 h-8 text-muted/40 mb-3" />
          <p className="text-sm font-medium text-gray-900 mb-1">Not yet available</p>
          <p className="text-xs text-muted">
            Live agent-availability routing hasn't been ported to the new backend yet.
          </p>
        </div>
      </div>
    </div>
  );
}
