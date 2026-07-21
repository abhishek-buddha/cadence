// Operator post-call workspace.
// ---------------------------------------------------------------------------
// Shown on the operator's queue screen while / after a payer call is handed to
// them. Two parts:
//   1. The handed-off ("this call") claim with its disposition controls.
//   2. An accordion of OTHER still-open claims for the SAME payer — each row
//      expands to the full claim detail + its own disposition controls, so the
//      operator can knock out several claims for one payer in a single session.
//      Marking a claim complete/denied drops it from the list reactively.
// Driven by api.claimFollowups.listRelatedForCall.

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  ChevronDown,
  Layers,
  ClipboardCheck,
  CheckCircle2,
  RefreshCw,
  CalendarClock,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ClaimDetailBlock from './ClaimDetailBlock';
import ClaimDispositionControls from './ClaimDispositionControls';

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-accent/10 text-accent',
  appealing: 'bg-warn/10 text-warn',
  denied: 'bg-danger/10 text-danger',
  paid: 'bg-success/10 text-success',
  write_off: 'bg-gray-100 text-gray-500',
};

const PRIORITY_STYLES = {
  high: 'bg-danger/10 text-danger',
  medium: 'bg-warn/10 text-warn',
  low: 'bg-success/10 text-success',
};

const DISPOSITION_BADGE = {
  complete: { label: 'Complete', icon: CheckCircle2, cls: 'bg-success/10 text-success' },
  retry: { label: 'Retry', icon: RefreshCw, cls: 'bg-warn/10 text-warn' },
  reschedule: { label: 'Reschedule', icon: CalendarClock, cls: 'bg-accent/10 text-accent' },
  denied: { label: 'Denied', icon: XCircle, cls: 'bg-danger/10 text-danger' },
};

function Badge({ children, className }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function prettyStatus(s) {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function money(amount) {
  if (amount == null) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function RelatedClaimRow({ claim, operatorName }) {
  const [open, setOpen] = useState(false);
  const disp = claim.followUpDisposition ? DISPOSITION_BADGE[claim.followUpDisposition] : null;
  const DispIcon = disp?.icon;

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-panel-light/60 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-sm text-gray-900">
              Claim {claim.claimNumber}
            </span>
            {claim.status && (
              <Badge className={STATUS_STYLES[claim.status] ?? 'bg-gray-100 text-gray-600'}>
                {prettyStatus(claim.status)}
              </Badge>
            )}
            {claim.priority && (
              <Badge className={PRIORITY_STYLES[claim.priority] ?? 'bg-gray-100 text-gray-600'}>
                {prettyStatus(claim.priority)}
              </Badge>
            )}
            {disp && (
              <Badge className={disp.cls}>
                <span className="inline-flex items-center gap-1">
                  {DispIcon && <DispIcon className="w-3 h-3" />} {disp.label}
                </span>
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted truncate">
            {[claim.patientName, money(claim.amount), claim.dateOfService && `DOS ${claim.dateOfService}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4 bg-panel-light/30">
          <ClaimDetailBlock claim={claim} />
          <ClaimDispositionControls claim={claim} operatorName={operatorName} />
        </div>
      )}
    </div>
  );
}

export default function PostCallWorkspace({ call }) {
  const auth = useAuth();
  const operatorName = auth?.name || auth?.email || 'Operator';
  const data = useQuery(
    api.claimFollowups.listRelatedForCall,
    call?._id ? { callId: call._id } : 'skip'
  );

  // Not a claim-based call (e.g. dental case / generic) — nothing to group.
  if (call && !call.claimId) return null;
  if (data === undefined) {
    return <div className="h-32 shimmer rounded-xl" />;
  }
  if (!data?.currentClaim) return null;

  const { currentClaim, relatedClaims, payerName, processedCount } = data;

  return (
    <div className="space-y-4">
      {/* Current (handed-off) claim disposition */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-display font-semibold text-gray-900">
              Disposition — Claim {currentClaim.claimNumber}
            </h3>
          </div>
          {currentClaim.status && (
            <Badge className={STATUS_STYLES[currentClaim.status] ?? 'bg-gray-100 text-gray-600'}>
              {prettyStatus(currentClaim.status)}
            </Badge>
          )}
        </div>
        <ClaimDispositionControls claim={currentClaim} operatorName={operatorName} />
      </div>

      {/* Same-payer sibling claims */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-accent shrink-0" />
            <h3 className="text-sm font-display font-semibold text-gray-900 truncate">
              Other {payerName || 'payer'} claims to process
            </h3>
            <Badge className="bg-accent/10 text-accent">{relatedClaims.length}</Badge>
          </div>
          {processedCount > 0 && (
            <span className="text-xs text-muted whitespace-nowrap">{processedCount} already processed</span>
          )}
        </div>

        {relatedClaims.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-success/40 mx-auto mb-3" />
            <p className="text-sm text-muted">
              No other open claims for this payer. You're all caught up.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2.5">
            <p className="text-xs text-muted mb-1">
              While you have {payerName || 'the payer'} on the line, work these open claims too. Click a claim to
              review its details and set an outcome — verified claims drop off automatically.
            </p>
            {relatedClaims.map((claim) => (
              <RelatedClaimRow key={claim._id} claim={claim} operatorName={operatorName} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
