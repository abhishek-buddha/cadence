// Read-only pill for a claim's operator-recorded follow-up disposition
// (complete / retry / reschedule / denied) — set via the operator's post-call
// workspace (convex/claimFollowups.ts, src/components/operator/*). Shared by
// every place that displays a claim's outcome after the fact: the post-call
// workspace's related-claims list, Call History, and the claim detail page.

import { CheckCircle2, RefreshCw, CalendarClock, XCircle } from 'lucide-react';

const DISPOSITION_CONFIG = {
  complete: { label: 'Complete', icon: CheckCircle2, cls: 'bg-success/10 text-success' },
  retry: { label: 'Retry', icon: RefreshCw, cls: 'bg-warn/10 text-warn' },
  reschedule: { label: 'Reschedule', icon: CalendarClock, cls: 'bg-accent/10 text-accent' },
  denied: { label: 'Denied', icon: XCircle, cls: 'bg-danger/10 text-danger' },
};

export default function DispositionBadge({ disposition, className = '' }) {
  const cfg = DISPOSITION_CONFIG[disposition];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cfg.cls} ${className}`}
    >
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}
