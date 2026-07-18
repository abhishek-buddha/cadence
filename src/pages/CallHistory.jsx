import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PhoneCall, ChevronDown, ChevronRight, Clock, FileText, Mic } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import OutcomeBadge from '../components/OutcomeBadge';
import EmptyState from '../components/EmptyState';
import { useProviderFilter } from '../context/ProviderFilterContext';

const OUTCOME_OPTIONS = [
  { value: 'successful', label: 'Successful' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
  { value: 'transferred_to_human', label: 'Transferred' },
];

function formatDuration(seconds) {
  if (seconds == null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function callDuration(call) {
  if (call.duration != null && call.duration > 0) return call.duration;
  if (call.startedAt && call.completedAt) {
    return Math.max(0, Math.round((new Date(call.completedAt).getTime() - new Date(call.startedAt).getTime()) / 1000));
  }
  return null;
}

function convexSiteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const cloud = import.meta.env.VITE_CONVEX_URL || '';
  return cloud.replace('.convex.cloud', '.convex.site').replace(/\/$/, '');
}

function recordingPlaybackUrl(callId) {
  return `${convexSiteUrl()}/twilio-recording-media?callId=${encodeURIComponent(callId)}`;
}

function formatDate(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CallRow({ call }) {
  const [expanded, setExpanded] = useState(false);
  const persistedDuration = callDuration(call);

  const isDentalCall = !!call.dentalCaseId && !call.claimId;

  // Fetch related data only when expanded — guard claimId/dentalCaseId to avoid Convex validation errors
  const claim = useQuery(api.claims.getById, (expanded && call.claimId) ? { id: call.claimId } : 'skip');
  const dentalCase = useQuery(api.dentalCases?.getById, (expanded && call.dentalCaseId) ? { id: call.dentalCaseId } : 'skip');
  const insurance = useQuery(
    api.insuranceContacts.getById,
    expanded ? { id: call.insuranceContactId } : 'skip'
  );
  const callResult = useQuery(api.callResults.getByCall, (expanded && !isDentalCall) ? { callId: call._id } : 'skip');
  const evResult = useQuery(api.evResults?.getByCall, (expanded && isDentalCall) ? { callId: call._id } : 'skip');

  // For the table row — safe guards so undefined IDs never reach Convex
  const claimPreview = useQuery(api.claims.getById, call.claimId ? { id: call.claimId } : 'skip');
  const dentalCasePreview = useQuery(api.dentalCases?.getById, (call.dentalCaseId && !call.claimId) ? { id: call.dentalCaseId } : 'skip');
  const insurancePreview = useQuery(api.insuranceContacts.getById, call.insuranceContactId ? { id: call.insuranceContactId } : 'skip');

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50/80 transition-colors text-left"
      >
        <span className="text-muted">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="px-4 py-3 text-sm text-gray-600 min-w-[160px]">
          {formatDate(call.startedAt)}
        </span>
        <span className="px-4 py-3 text-sm font-data text-accent min-w-[120px]">
          {claimPreview?.claimNumber ?? dentalCasePreview?.caseNumber ?? (call.claimId || call.dentalCaseId ? '...' : '--')}
        </span>
        <span className="px-4 py-3 text-sm text-gray-600 flex-1 truncate">
          {insurancePreview?.name ?? '...'}
        </span>
        <span className="min-w-[140px] flex justify-start">
          <OutcomeBadge outcome={call.outcome} missingFields={call.missingFields} />
        </span>
        <span className="px-4 py-3 text-sm font-data text-gray-600 min-w-[70px] text-right">
          {formatDuration(persistedDuration)}
        </span>
        <span className="min-w-[90px] flex justify-center">
          {call.recordingUrl ? (
            <span className="inline-flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              <Mic className="w-3 h-3" />
              Recording
            </span>
          ) : (
            <span className="text-xs text-muted/40">--</span>
          )}
        </span>
        <span className="min-w-[110px] flex justify-end">
          <StatusBadge status={call.status} />
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pl-12 animate-fade-in">
          <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
            {/* Claim and Insurance Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1">
                  {isDentalCall ? 'EV Case' : 'Claim'}
                </h4>
                <p className="text-sm text-gray-900 font-data">
                  {isDentalCall ? (dentalCase?.caseNumber ?? '--') : (claim?.claimNumber ?? '--')}
                </p>
                {!isDentalCall && claim && (
                  <p className="text-xs text-muted mt-0.5">
                    DOS: {claim.dateOfService} | Status: {claim.status}
                  </p>
                )}
                {isDentalCall && dentalCase && (
                  <p className="text-xs text-muted mt-0.5">
                    DOS: {dentalCase.proposedDateOfService} | Status: {dentalCase.status}
                  </p>
                )}
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1">Insurance</h4>
                <p className="text-sm text-gray-900">{insurance?.name ?? '--'}</p>
                {insurance?.phone && (
                  <p className="text-xs text-muted font-data mt-0.5">{insurance.phone}</p>
                )}
              </div>
            </div>

            {/* Transcript */}
            {call.recordingUrl && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  Recording
                  {persistedDuration != null && (
                    <span className="font-data text-muted normal-case tracking-normal">
                      {formatDuration(persistedDuration)}
                    </span>
                  )}
                </h4>
                <audio
                  controls
                  preload="metadata"
                  src={recordingPlaybackUrl(call._id)}
                  className="h-9 w-full max-w-md"
                />
              </div>
            )}

            {/* Transcript */}
            {call.transcript && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  Transcript
                </h4>
                <div className="bg-white border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                    {call.transcript}
                  </p>
                </div>
              </div>
            )}

            {/* Extracted Results */}
            {callResult && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
                  Extracted Results
                </h4>
                <div className="bg-white border border-border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {callResult.claimStatus && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Claim Status</span>
                        <span className="text-xs text-gray-900 font-medium">{callResult.claimStatus}</span>
                      </div>
                    )}
                    {callResult.paidAmount != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Paid Amount</span>
                        <span className="text-xs text-success font-data">
                          ${(callResult.paidAmount / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {callResult.paidDate && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Paid Date</span>
                        <span className="text-xs text-gray-900 font-data">{callResult.paidDate}</span>
                      </div>
                    )}
                    {callResult.referenceNumber && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Reference #</span>
                        <span className="text-xs text-gray-900 font-data">{callResult.referenceNumber}</span>
                      </div>
                    )}
                    {callResult.repName && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Rep Name</span>
                        <span className="text-xs text-gray-900">{callResult.repName}</span>
                      </div>
                    )}
                    {callResult.denialCode && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Denial Code</span>
                        <span className="text-xs text-danger font-data">{callResult.denialCode}</span>
                      </div>
                    )}
                    {callResult.denialReason && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Denial Reason</span>
                        <span className="text-xs text-gray-600 text-right max-w-[60%]">{callResult.denialReason}</span>
                      </div>
                    )}
                    {callResult.nextSteps && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Next Steps</span>
                        <span className="text-xs text-gray-600 text-right max-w-[60%]">{callResult.nextSteps}</span>
                      </div>
                    )}
                    {callResult.confidence != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Confidence</span>
                        <span className="text-xs text-accent font-data">{Math.round(callResult.confidence * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* EV Results (dental calls) */}
            {isDentalCall && evResult && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5">EV Results</h4>
                <div className="bg-white border border-border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {evResult.isActive != null && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Coverage</span>
                        <span className={`text-xs font-medium ${evResult.isActive ? 'text-success' : 'text-danger'}`}>
                          {evResult.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    )}
                    {evResult.deductibleAnnualCents != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Deductible</span>
                        <span className="text-xs text-gray-900 font-data">
                          ${((evResult.deductibleMetCents || 0) / 100).toFixed(0)} / ${(evResult.deductibleAnnualCents / 100).toFixed(0)}
                        </span>
                      </div>
                    )}
                    {evResult.annualMaximumCents != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Annual Max</span>
                        <span className="text-xs text-gray-900 font-data">${(evResult.annualMaximumCents / 100).toFixed(0)}</span>
                      </div>
                    )}
                    {evResult.coinsurancePct != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Coinsurance</span>
                        <span className="text-xs text-gray-900 font-data">{evResult.coinsurancePct}%</span>
                      </div>
                    )}
                    {evResult.networkStatus && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Network</span>
                        <span className="text-xs text-gray-900">{evResult.networkStatus.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    {evResult.referenceNumber && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Reference #</span>
                        <span className="text-xs text-gray-900 font-data">{evResult.referenceNumber}</span>
                      </div>
                    )}
                    {evResult.nextSteps && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Next Steps</span>
                        <span className="text-xs text-gray-600 text-right max-w-[60%]">{evResult.nextSteps}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* No transcript or results */}
            {!call.transcript && !callResult && !evResult && (
              <p className="text-sm text-muted italic">No transcript or extracted data available for this call.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CallHistory() {
  const { selectedProviderId } = useProviderFilter();
  const allCalls = useQuery(api.calls.listRecent, { limit: 50 });
  const allClaims = useQuery(api.claims.list);
  const [statusFilter, setStatusFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState([]); // empty = all
  const [outcomeMenuOpen, setOutcomeMenuOpen] = useState(false);

  const isLoading = allCalls === undefined;

  // Build set of claim IDs belonging to the selected provider
  const providerClaimIds = selectedProviderId && allClaims
    ? new Set(allClaims.filter((c) => c.providerId === selectedProviderId).map((c) => c._id))
    : null;

  // Filter calls by provider (through claims) and status
  const calls = selectedProviderId
    ? (allCalls ?? []).filter((c) => providerClaimIds?.has(c.claimId))
    : allCalls;

  const filteredCalls = calls
    ? calls
        .filter((c) => statusFilter === 'all' || c.status === statusFilter)
        .filter((c) => outcomeFilter.length === 0 || outcomeFilter.includes(c.outcome))
    : [];

  const toggleOutcome = (value) => {
    setOutcomeFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const inputClass =
    'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Call History</h1>
          <p className="text-sm text-muted mt-1">All voice agent calls</p>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-muted" />
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${inputClass} custom-select appearance-none pr-8 w-44 cursor-pointer`}
            >
              <option value="all">All Statuses</option>
              <option value="initiating">Initiating</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOutcomeMenuOpen((o) => !o)}
              className={`${inputClass} appearance-none pr-8 w-48 cursor-pointer text-left`}
            >
              {outcomeFilter.length === 0
                ? 'All Outcomes'
                : `${outcomeFilter.length} selected`}
            </button>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            {outcomeMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-border rounded-lg shadow-lg z-10 p-2">
                {OUTCOME_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={outcomeFilter.includes(opt.value)}
                      onChange={() => toggleOutcome(opt.value)}
                      className="rounded border-border-light text-accent focus:ring-accent"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
                {outcomeFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOutcomeFilter([])}
                    className="w-full text-left px-2 py-1.5 mt-1 text-xs text-muted hover:text-gray-700 border-t border-border"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Call count summary */}
      {!isLoading && calls.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">
            Showing <span className="text-gray-900 font-medium">{filteredCalls.length}</span>
            {statusFilter !== 'all' && ` ${statusFilter}`} call{filteredCalls.length !== 1 ? 's' : ''}
            {statusFilter !== 'all' && (
              <span className="text-muted"> of {calls.length} total</span>
            )}
          </span>
        </div>
      )}

      {/* Call List */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-8 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          {calls.length === 0 ? (
            <EmptyState
              icon={PhoneCall}
              title="No calls yet"
              description="Call history will appear here once voice agents start making insurance follow-up calls."
            />
          ) : (
            <EmptyState
              icon={PhoneCall}
              title="No matching calls"
              description={`No calls found with status "${statusFilter}". Try a different filter.`}
              action={
                <button
                  onClick={() => setStatusFilter('all')}
                  className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors"
                >
                  Show All Calls
                </button>
              }
            />
          )}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-border">
            <span className="w-4" /> {/* Chevron spacer */}
            <span className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold min-w-[160px]">Date</span>
            <span className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold min-w-[120px]">Claim #</span>
            <span className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold flex-1">Insurance</span>
            <span className="min-w-[140px] text-left text-xs uppercase tracking-wider text-muted font-semibold">Outcome</span>
            <span className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold min-w-[70px]">Duration</span>
            <span className="min-w-[90px] text-center text-xs uppercase tracking-wider text-muted font-semibold">Recording</span>
            <span className="min-w-[110px] text-right text-xs uppercase tracking-wider text-muted font-semibold pr-4">Status</span>
          </div>

          {/* Call rows */}
          <div className="divide-y divide-border/30">
            {filteredCalls.map((call) => (
              <CallRow key={call._id} call={call} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
